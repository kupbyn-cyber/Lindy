// Thêm → Dữ liệu dùng thử (chỉ Chủ, S12): nạp gói thử khi app còn trống; "Xoá, bắt đầu dùng thật" xoá sạch dữ liệu
// nghiệp vụ, giữ tài khoản, danh mục, cài đặt. Xoá chỉ làm được một lần, phải gõ chữ xác nhận.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, ConfirmDialog, Note, ScreenHeader, TextField, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { formatDateTimeShort } from '~/lib/time'
import type { DemoState } from '~/server/ops/demo'

export const Route = createFileRoute('/_app/them/du-lieu-thu')({
  head: () => ({ meta: [{ title: 'Dữ liệu dùng thử · LINDY OS' }] }),
  component: DemoPage,
})

const CONFIRM = 'XOA DU LIEU THU'

type Status = {
  state: DemoState
  loadedAt: string | null
  liveAt: string | null
  counts: { appointments: number; orders: number; customers: number }
  summary?: { appointments: number; orders: number; profiles: number; expenses: number; unmatched: string[] }
}

function DemoPage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['demo'],
    queryFn: () => api<Status>('/api/demo'),
    enabled: can('users.manage'),
  })
  const [busy, setBusy] = useState<null | 'load' | 'wipe'>(null)
  const [error, setError] = useState<string | null>(null)
  // Hộp gõ chữ xác nhận: xoá để dùng thật, hoặc xoá dữ liệu cũ rồi nạp gói thử
  const [asking, setAsking] = useState<null | 'golive' | 'replace'>(null)
  const [typed, setTyped] = useState('')
  // Tài khoản không có mức lương mẫu (tên không khớp data/staff.csv) sau lần nạp vừa rồi (S39)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const ask = (mode: 'golive' | 'replace') => {
    setTyped('')
    setError(null)
    setAsking(mode)
  }

  if (!can('users.manage')) return <Note tone="warning">Chỉ chủ quán dùng được mục này.</Note>
  const s = q.data
  const empty = !!s && !s.counts.appointments && !s.counts.orders && !s.counts.customers

  async function load(replace: boolean) {
    setBusy('load')
    setError(null)
    try {
      const res = await api<Status>('/api/demo/load', {
        body: replace ? { replaceExisting: true, confirm: typed } : {},
      })
      qc.setQueryData(['demo'], res)
      await qc.invalidateQueries()
      setAsking(null)
      setUnmatched(res.summary?.unmatched ?? [])
      toast(
        res.summary
          ? `Đã nạp ${res.summary.appointments} lịch, ${res.summary.orders} đơn thử.`
          : 'Đã nạp dữ liệu thử.',
      )
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function wipe() {
    setBusy('wipe')
    setError(null)
    try {
      const res = await api<Status>('/api/demo/golive', { body: { confirm: typed } })
      qc.setQueryData(['demo'], res)
      await qc.invalidateQueries()
      setAsking(null)
      toast('Đã xoá dữ liệu thử. App bắt đầu dùng thật.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-3 px-4 pt-2">
      <ScreenHeader className="-mx-4" title="Dữ liệu dùng thử" back={{ to: '/them', label: 'Về Thêm' }} />
      {q.isError ? <Note tone="danger">{errorText(q.error)}</Note> : null}
      {s ? (
        <div className="lo-card flex flex-col gap-1">
          <span className="overline text-ink-muted">Trạng thái</span>
          <span className="body-strong">
            {s.state === 'live'
              ? 'Đang dùng thật'
              : s.state === 'loaded'
                ? 'Đang dùng thử (đã nạp gói thử)'
                : 'Chưa nạp gói thử'}
          </span>
          <span className="caption text-ink-muted">
            {s.counts.appointments} lịch · {s.counts.orders} đơn · {s.counts.customers} khách
            {s.loadedAt ? ` · nạp lúc ${formatDateTimeShort(s.loadedAt)}` : ''}
            {s.liveAt ? ` · dùng thật từ ${formatDateTimeShort(s.liveAt)}` : ''}
          </span>
        </div>
      ) : null}
      {unmatched.length ? (
        <Note tone="warning">
          Chưa có hồ sơ, mức lương thử cho: {unmatched.join(', ')} (tên không có trong danh sách mẫu). Nhập ở
          Thêm → Nhân viên, không thì người này chưa vào ca, đăng ký nghỉ, tính lương được.
        </Note>
      ) : null}

      {s && s.state === 'empty' ? (
        <div className="flex flex-col gap-2">
          <p className="body m-0">
            Gói thử gồm khoảng 2 tuần lịch (7 ngày trước đến 7 ngày sau), 40–60 đơn có thanh toán, sổ tiền,
            thu chi, chấm công, hồ sơ và mức lương nhân viên, một đề nghị tạm ứng. Dữ liệu gắn với tài khoản
            thật của từng người. Khách thử có SĐT 0900000 1xx.
          </p>
          {empty ? (
            <Button
              variant="primary"
              block
              loading={busy === 'load'}
              loadingText="Đang nạp…"
              onClick={() => void load(false)}
            >
              Nạp dữ liệu thử
            </Button>
          ) : (
            <>
              <Note tone="warning">
                App đang có dữ liệu thử tay trước đây. Muốn dùng gói thử thì xoá dữ liệu hiện có trước (giữ
                tài khoản, danh mục, cài đặt).
              </Note>
              <Button variant="primary" block loading={busy === 'load'} onClick={() => ask('replace')}>
                Xoá dữ liệu hiện có rồi nạp gói thử
              </Button>
            </>
          )}
        </div>
      ) : null}

      {s && s.state !== 'live' ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <h2 className="body-strong m-0">Xoá, bắt đầu dùng thật</h2>
          <p className="body m-0 text-ink-muted">
            Xoá sạch lịch, đơn, khách, sổ tiền, thu chi, chấm công, lương, tạm ứng, báo cáo, thông báo và hồ
            sơ, mức lương nhân viên. Giữ tài khoản, danh mục dịch vụ, combo, cài đặt. Sau đó Linh nhập hồ sơ
            nhân viên thật và mở sổ tiền thật. Chỉ làm được một lần, không hoàn tác.
          </p>
          <Button variant="danger" block onClick={() => ask('golive')}>
            Xoá, bắt đầu dùng thật
          </Button>
        </div>
      ) : null}

      {s?.state === 'live' ? (
        <Note>App đang dùng thật. Mục này đã khoá: không nạp dữ liệu thử, không xoá được nữa.</Note>
      ) : null}

      {error && !asking ? <Note tone="danger">{error}</Note> : null}

      <ConfirmDialog
        open={!!asking}
        title={
          asking === 'replace'
            ? 'Xoá dữ liệu hiện có rồi nạp gói thử?'
            : 'Xoá toàn bộ dữ liệu, bắt đầu dùng thật?'
        }
        confirmLabel={asking === 'replace' ? 'Xoá và nạp gói thử' : 'Xoá vĩnh viễn'}
        danger
        busy={busy !== null}
        onConfirm={() => void (asking === 'replace' ? load(true) : wipe())}
        onCancel={() => setAsking(null)}
      >
        <p className="body m-0 text-ink-muted">
          {asking === 'replace'
            ? 'Lịch, đơn, khách, sổ tiền, thu chi, chấm công, lương hiện có sẽ bị xoá, rồi app nạp gói thử. '
            : ''}
          Gõ <span className="body-strong select-all">{CONFIRM}</span> để xác nhận.
        </p>
        <TextField
          label="Chữ xác nhận"
          value={typed}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </section>
  )
}
