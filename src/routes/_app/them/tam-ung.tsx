// UI16 (phần tạm ứng) — Tạm ứng (Đợt 4B, bước 4.14; PRD §9.3; Q37, Q38, A05, K21). Mọi người đề nghị và xem phiếu của
// mình; tổng trong tháng không quá lương cứng; chỉ Linh duyệt; Nhung, Linh bấm "Đã chi". Tạm ứng không phải chi phí,
// trừ vào lương. Nút hiện theo quyền; server và DB kiểm lại.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import { formatVND } from '~/lib/money'
import { type ChipTone, REQUEST_TONE } from '~/lib/status-tone'
import { formatDateTimeShort, formatYearMonth } from '~/lib/time'
import type { AdvancesData, AdvanceView } from '~/server/payroll/advances'

export const Route = createFileRoute('/_app/them/tam-ung')({
  head: () => ({ meta: [{ title: 'Tạm ứng · LINDY OS' }] }),
  component: Page,
})

type Filter = 'pending' | 'approved' | 'paid' | 'all'

const STATUS: Record<AdvanceView['status'], { label: string; tone: ChipTone }> = {
  requested: { label: 'Chờ Linh duyệt', tone: REQUEST_TONE.requested },
  approved: { label: 'Đã duyệt, chờ chi', tone: REQUEST_TONE.approved },
  paid: { label: 'Đã chi', tone: REQUEST_TONE.paid },
  rejected: { label: 'Từ chối', tone: REQUEST_TONE.rejected },
  cancelled: { label: 'Đã huỷ', tone: REQUEST_TONE.cancelled },
}

function Page() {
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['money', 'advances', filter],
    queryFn: () => api<AdvancesData>(`/api/advances?filter=${filter}`),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  const open = d?.items.find((i) => i.id === openId) ?? null
  const staffView = d && !d.can.approve && !d.can.pay

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-1 px-4">
        <ScreenHeader
          className="-mx-4"
          title="Tạm ứng"
          back={{ to: '/them', label: 'Về Thêm' }}
          actions={
            d?.can.request ? (
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                Đề nghị
              </Button>
            ) : null
          }
        />
        <p className="caption m-0 text-ink-muted">
          Tối đa bằng lương cứng mỗi tháng. Chỉ Linh duyệt; trừ vào lương.
        </p>
      </div>
      {d?.limit ? (
        <div className="px-4">
          <section className="lo-card flex flex-col gap-1">
            <span className="overline text-ink-muted">Tháng {formatYearMonth(d.limit.month)} của bạn</span>
            {d.limit.baseSalary == null ? (
              <span className="body text-ink-muted">
                Chưa có lương cứng tháng này. Báo Linh nhập chính sách lương.
              </span>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="body">Còn ứng được</span>
                  <Money value={d.limit.available} />
                </div>
                <span className="caption text-ink-muted">
                  Lương cứng {formatVND(d.limit.baseSalary)} · đã đề nghị, đã ứng {formatVND(d.limit.used)}
                  {d.limit.provisionalPay != null
                    ? ` · lương tạm tính ${formatVND(d.limit.provisionalPay)}`
                    : ''}
                </span>
              </>
            )}
          </section>
        </div>
      ) : null}
      {!staffView ? (
        <div className="px-4">
          <SegmentedControl
            ariaLabel="Lọc tạm ứng"
            options={[
              { value: 'pending', label: `Chờ duyệt${d?.counts.pending ? ` (${d.counts.pending})` : ''}` },
              { value: 'approved', label: `Chờ chi${d?.counts.approved ? ` (${d.counts.approved})` : ''}` },
              { value: 'paid', label: 'Đã chi' },
              { value: 'all', label: 'Tất cả' },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
          />
        </div>
      ) : null}
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {d && d.items.length === 0 ? (
        <p className="body m-0 px-4 text-ink-muted">Chưa có đề nghị nào.</p>
      ) : null}
      <div className="border-t border-line">
        {d?.items.map((a) => (
          <button
            key={a.id}
            type="button"
            className="lo-row lo-row-action w-full border-0 bg-transparent text-left"
            onClick={() => setOpenId(a.id)}
          >
            <span className="lo-row-main">
              <span className="body lo-row-title">
                {a.mine ? '' : `${a.name} · `}
                {a.reason}
              </span>
              <span className="lo-row-meta caption">
                {formatDateTimeShort(a.requestedAt)}
                {a.payrollMonth ? ` · trừ lương tháng ${formatYearMonth(a.payrollMonth)}` : ''}
              </span>
            </span>
            <span className="lo-row-side">
              <Money value={a.amount} />
              <StatusChip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusChip>
            </span>
          </button>
        ))}
      </div>
      {d?.limit ? <CreateSheet open={creating} onClose={() => setCreating(false)} limit={d.limit} /> : null}
      {open ? <DetailSheet a={open} onClose={() => setOpenId(null)} /> : null}
    </section>
  )
}

function CreateSheet(props: {
  open: boolean
  onClose: () => void
  limit: NonNullable<AdvancesData['limit']>
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef('')
  const over = (amount ?? 0) > props.limit.available

  async function save() {
    setBusy(true)
    setError(null)
    if (!key.current) key.current = crypto.randomUUID()
    try {
      const a = await api<AdvanceView>('/api/advances', {
        body: { createRequestId: key.current, amount: amount ?? 0, reason },
      })
      key.current = ''
      setAmount(null)
      setReason('')
      await qc.invalidateQueries({ queryKey: ['money', 'advances'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(
        a.status === 'approved' ? 'Đã lưu tạm ứng (đã duyệt).' : 'Đã gửi đề nghị tạm ứng, chờ Linh duyệt.',
      )
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={props.open}
      title="Đề nghị tạm ứng"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          loading={busy}
          disabled={!amount || !reason.trim() || over}
          onClick={() => void save()}
        >
          Gửi đề nghị
        </Button>
      }
    >
      <MoneyInput
        label="Số tiền"
        value={amount}
        onValueChange={setAmount}
        error={over ? `Tháng này còn ứng được ${formatVND(props.limit.available)}.` : undefined}
        hint={over ? undefined : `Còn ứng được ${formatVND(props.limit.available)}.`}
      />
      <TextField
        label="Lý do"
        placeholder="Đóng tiền nhà, việc gia đình…"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      {props.limit.provisionalPay != null ? (
        <p className="caption m-0 text-ink-muted">
          Lương tạm tính tháng này: {formatVND(props.limit.provisionalPay)}. Ứng nhiều hơn số đã làm được thì
          Linh quyết.
        </p>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}

type Act = 'approve' | 'reject' | 'cancel' | 'pay'
const ACT: Record<Act, { title: string; button: string; done: string; danger?: boolean }> = {
  approve: { title: 'Duyệt tạm ứng?', button: 'Duyệt', done: 'Đã duyệt.' },
  reject: { title: 'Từ chối tạm ứng?', button: 'Từ chối', done: 'Đã từ chối.', danger: true },
  cancel: { title: 'Huỷ đề nghị tạm ứng?', button: 'Huỷ đề nghị', done: 'Đã huỷ.', danger: true },
  pay: { title: 'Ghi đã chi tạm ứng?', button: 'Đã chi', done: 'Đã ghi chi tạm ứng.' },
}

function DetailSheet(props: { a: AdvanceView; onClose: () => void }) {
  const { a } = props
  const qc = useQueryClient()
  const toast = useToast()
  const [act, setAct] = useState<Act | null>(null)
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(x: Act) {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/advances/${a.id}/${x}`, {
        body: { version: a.version, note: note.trim() || null, method: x === 'pay' ? method : null },
      })
      await qc.invalidateQueries({ queryKey: ['money'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      void qc.invalidateQueries({ queryKey: ['payroll'] })
      toast(ACT[x].done)
      setAct(null)
      props.onClose()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await qc.invalidateQueries({ queryKey: ['money'] })
        setError('Đề nghị vừa được người khác cập nhật. Đã tải bản mới, xem lại rồi thao tác.')
      } else setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const c = a.can
  return (
    <Sheet open title={`Tạm ứng ${formatVND(a.amount)}`} onClose={props.onClose}>
      <div className="flex flex-wrap gap-1">
        <StatusChip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusChip>
      </div>
      <p className="body m-0">{a.reason}</p>
      <div className="caption flex flex-col gap-0.5 text-ink-muted">
        <span>
          Đề nghị: {a.name} · {formatDateTimeShort(a.requestedAt)} · tháng {formatYearMonth(a.requestMonth)}
        </span>
        {a.decidedByName && a.decidedAt ? (
          <span>
            {a.status === 'rejected' ? 'Từ chối' : 'Duyệt'}: {a.decidedByName} ·{' '}
            {formatDateTimeShort(a.decidedAt)}
            {a.decideNote ? ` · ${a.decideNote}` : ''}
          </span>
        ) : null}
        {a.paidByName && a.paidAt ? (
          <span>
            Đã chi: {a.paidByName} · {formatDateTimeShort(a.paidAt)} · {a.paidAccountName}
            {a.payrollMonth ? ` · trừ lương tháng ${formatYearMonth(a.payrollMonth)}` : ''}
          </span>
        ) : null}
        {a.status === 'cancelled' ? (
          <span>
            Huỷ ({a.cancelledByName}){a.decideNote ? `: ${a.decideNote}` : ''}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {c.approve ? (
          <Button variant="primary" onClick={() => setAct('approve')}>
            Duyệt
          </Button>
        ) : null}
        {c.pay ? (
          <Button variant="primary" onClick={() => setAct('pay')}>
            Đã chi
          </Button>
        ) : null}
        {c.reject ? (
          <Button variant="danger" onClick={() => setAct('reject')}>
            Từ chối
          </Button>
        ) : null}
        {c.cancel ? (
          <Button variant="quiet" onClick={() => setAct('cancel')}>
            Huỷ đề nghị
          </Button>
        ) : null}
      </div>
      {error && !act ? <Note tone="danger">{error}</Note> : null}
      <ConfirmDialog
        open={!!act}
        title={act ? ACT[act].title : ''}
        confirmLabel={act ? ACT[act].button : ''}
        danger={act ? ACT[act].danger : false}
        busy={busy}
        onConfirm={() => act && void run(act)}
        onCancel={() => setAct(null)}
      >
        <p className="body m-0 text-ink-muted">
          {a.name} · {formatVND(a.amount)} · {a.reason}
        </p>
        {act === 'pay' ? (
          <SegmentedControl
            ariaLabel="Chi từ"
            options={[
              { value: 'cash', label: 'Tiền mặt' },
              { value: 'transfer', label: 'Chuyển khoản' },
            ]}
            value={method}
            onChange={(v) => setMethod(v as 'cash' | 'transfer')}
          />
        ) : null}
        {act === 'reject' || act === 'cancel' ? (
          <TextArea
            label={act === 'reject' || a.status === 'approved' ? 'Lý do (bắt buộc)' : 'Lý do'}
            value={note}
            maxLength={300}
            onChange={(ev) => setNote(ev.target.value)}
          />
        ) : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </Sheet>
  )
}
