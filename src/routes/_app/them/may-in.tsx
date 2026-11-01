// Máy in bill (Đợt 7, S36–S38) — Linh: thông tin in trên bill, khổ giấy; trạm in (MacBook ở quán) dùng mã kết nối để
// lấy lệnh in; tạo / thu hồi mã, xem trạm in còn kết nối không; in thử.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Note,
  SegmentedControl,
  Sheet,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { LABEL_TONE } from '~/lib/status-tone'
import { formatDateTimeShort } from '~/lib/time'
import type { createStation, PrintJobView, printSetup } from '~/server/print/service'

export const Route = createFileRoute('/_app/them/may-in')({
  head: () => ({ meta: [{ title: 'Máy in bill · LINDY OS' }] }),
  component: Page,
})

type Setup = Awaited<ReturnType<typeof printSetup>>
type Created = Awaited<ReturnType<typeof createStation>>

function Page() {
  const can = useCan()
  const allowed = can('print.manage')
  const q = useQuery({
    queryKey: ['print', 'setup'],
    queryFn: () => api<Setup>('/api/print'),
    enabled: allowed,
    refetchInterval: 15_000,
  })
  if (!allowed) {
    return (
      <div className="px-4 pt-2">
        <Note tone="danger">Chỉ chủ quán cài đặt máy in bill.</Note>
      </div>
    )
  }
  return (
    <section className="flex flex-col gap-4 pt-1">
      <div className="flex flex-col gap-1 px-4">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Máy in bill</h1>
        <p className="body m-0 text-ink-muted">
          Nhân viên bấm In bill trên điện thoại; MacBook trạm in ở quầy lấy bill từ app và in ra máy in của
          quán.
        </p>
      </div>
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {q.data ? (
        <>
          <Stations s={q.data} />
          <BillInfo s={q.data} />
        </>
      ) : null}
    </section>
  )
}

function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="overline m-0 px-4 text-ink-muted">{props.title}</h2>
      <div className="mx-4 lo-card flex flex-col gap-3">{props.children}</div>
    </section>
  )
}

// ---------------------------------------------------------------- Trạm in

/** Trạm in hỏi app mỗi 2 giây: lần cuối trong 1 phút coi là đang kết nối */
const online = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 60_000

function Stations(props: { s: Setup }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [revoke, setRevoke] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const active = props.s.stations.filter((x) => !x.revokedAt)

  async function doRevoke() {
    if (!revoke) return
    setBusy(true)
    try {
      qc.setQueryData(
        ['print', 'setup'],
        await api<Setup>('/api/print/revoke', { body: { stationId: revoke.id } }),
      )
      toast('Đã thu hồi mã kết nối.')
      setRevoke(null)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function testPrint() {
    setTesting(true)
    try {
      let job = await api<PrintJobView>('/api/print/test', { body: { idempotencyKey: crypto.randomUUID() } })
      const until = Date.now() + 30_000
      while ((job.status === 'queued' || job.status === 'printing') && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 1500))
        job = await api<PrintJobView>(`/api/print/jobs/${job.id}`)
      }
      if (job.status === 'printed') toast('Đã in thử.')
      else if (job.status === 'queued' || job.status === 'printing')
        toast('Trạm in chưa phản hồi. Kiểm tra MacBook đang bật và có mạng.', 'error')
      else toast(`Chưa in được: ${job.error ?? 'máy in báo lỗi'}`, 'error')
      void qc.invalidateQueries({ queryKey: ['print', 'setup'] })
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card title="Trạm in">
      {active.length === 0 ? (
        <p className="body m-0 text-ink-muted">
          Chưa có trạm in. Bấm Tạo mã kết nối, rồi chạy dòng lệnh trên MacBook ở quầy.
        </p>
      ) : null}
      {props.s.stations.map((st) => (
        <div key={st.id} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className={st.revokedAt ? 'body text-ink-muted line-through' : 'body-strong'}>
              {st.name}
            </span>
            <span className="caption text-ink-muted">
              {st.revokedAt
                ? `Đã thu hồi ${formatDateTimeShort(st.revokedAt)}`
                : st.lastSeenAt
                  ? `Lần cuối kết nối ${formatDateTimeShort(st.lastSeenAt)}`
                  : 'Chưa kết nối lần nào'}
            </span>
          </span>
          {st.revokedAt ? null : (
            <span className="flex items-center gap-2">
              <StatusChip tone={online(st.lastSeenAt) ? LABEL_TONE.stationOnline : LABEL_TONE.stationOffline}>
                {online(st.lastSeenAt) ? 'Đang kết nối' : 'Mất kết nối'}
              </StatusChip>
              <button
                type="button"
                className="label min-h-[44px] border-0 bg-transparent p-0 text-danger"
                onClick={() => setRevoke({ id: st.id, name: st.name })}
              >
                Thu hồi
              </button>
            </span>
          )}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setCreating(true)}>Tạo mã kết nối</Button>
        <Button
          variant="primary"
          disabled={active.length === 0}
          loading={testing}
          loadingText="Đang in…"
          onClick={() => void testPrint()}
        >
          In thử
        </Button>
      </div>
      {creating ? <CreateStation onClose={() => setCreating(false)} /> : null}
      <ConfirmDialog
        open={!!revoke}
        title={`Thu hồi mã của ${revoke?.name ?? ''}?`}
        confirmLabel="Thu hồi"
        danger
        busy={busy}
        onConfirm={() => void doRevoke()}
        onCancel={() => setRevoke(null)}
      >
        <p className="body m-0 text-ink-muted">
          Máy dùng mã này không lấy được bill nữa. Muốn dùng lại thì tạo mã mới.
        </p>
      </ConfirmDialog>
    </Card>
  )
}

function CreateStation(props: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('MacBook quầy')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const command = created
    ? `curl -fsSL ${origin}/tram-in/cai-dat.sh | bash -s -- ${origin} ${created.token} tcp://IP_MAY_IN:9100`
    : ''

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const r = await api<Created>('/api/print/stations', { body: { name } })
      qc.setQueryData(['print', 'setup'], r.setup)
      setCreated(r)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      toast('Đã chép dòng lệnh.')
    } catch {
      toast('Không chép được. Nhấn giữ dòng lệnh để chép.', 'error')
    }
  }

  return (
    <Sheet
      open
      title="Tạo mã kết nối trạm in"
      onClose={props.onClose}
      footer={
        created ? (
          <Button block variant="primary" onClick={() => void copy()}>
            Chép dòng lệnh
          </Button>
        ) : (
          <Button
            block
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void create()}
          >
            Tạo mã
          </Button>
        )
      }
    >
      {created ? (
        <>
          <Note tone="warning">
            Mã chỉ hiện một lần. Chép dòng lệnh bên dưới rồi chạy trên MacBook trạm in.
          </Note>
          <code className="caption block break-all rounded-[var(--radius-md)] bg-surface-sunken p-3 select-all">
            {command}
          </code>
          <ol className="body m-0 flex flex-col gap-1 pl-5 text-ink-muted">
            <li>
              MacBook cần Node.js 22 (macOS 11: tải file đuôi .pkg ở nodejs.org/dist/latest-v22.x), cùng WiFi
              với máy in.
            </li>
            <li>
              Thay <b>IP_MAY_IN</b> bằng IP máy in (in trang tự kiểm tra của máy in để xem). Máy in cắm USB:{' '}
              <b>cups://Tên_máy_in</b>; bluetooth: <b>file:///dev/cu.Tên</b>.
            </li>
            <li>Mở Terminal trên MacBook, dán dòng lệnh, bấm Enter.</li>
            <li>Giữ MacBook cắm sạc, mở nắp. Quay lại đây bấm In thử.</li>
          </ol>
        </>
      ) : (
        <>
          <TextField
            label="Tên trạm in"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          {error ? <Note tone="danger">{error}</Note> : null}
        </>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------- Thông tin trên bill

function BillInfo(props: { s: Setup }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [info, setInfo] = useState(props.s.settings.infoLines)
  const [thanks, setThanks] = useState(props.s.settings.thanks)
  const [width, setWidth] = useState<384 | 576>(props.s.settings.paperWidth)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(
        ['print', 'setup'],
        await api<Setup>('/api/print/settings', { body: { infoLines: info, thanks, paperWidth: width } }),
      )
      toast('Đã lưu thông tin trên bill.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Thông tin trên bill">
      <p className="caption m-0 text-ink-muted">
        Bill in: LINDY NAIL STUDIO, các dòng dưới đây, mã đơn, giờ, tên khách, thợ, dịch vụ, tổng tiền, đã
        thu, bảo hành, lời cảm ơn. Không in số điện thoại.
      </p>
      <TextArea
        label="Dòng dưới tên quán (địa chỉ…), mỗi dòng một ý"
        value={info}
        maxLength={300}
        onChange={(e) => setInfo(e.target.value)}
      />
      <TextArea
        label="Lời cảm ơn cuối bill"
        value={thanks}
        maxLength={200}
        onChange={(e) => setThanks(e.target.value)}
      />
      <SegmentedControl
        ariaLabel="Khổ giấy"
        className="w-full"
        options={[
          { value: '576', label: 'Khổ 80mm' },
          { value: '384', label: 'Khổ 58mm' },
        ]}
        value={String(width)}
        onChange={(v) => setWidth(v === '384' ? 384 : 576)}
      />
      {error ? <Note tone="danger">{error}</Note> : null}
      <Button variant="primary" block loading={busy} onClick={() => void save()}>
        Lưu
      </Button>
    </Card>
  )
}
