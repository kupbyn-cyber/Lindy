// UI10 — Lương (Đợt 4B, bước 4.15–4.17; PRD §9.4). Linh, Nhung: bảng lương cả quán theo tháng (Nhung chỉ xem); Linh
// khoá từ ngày nháp khi đã duyệt hết công (K20), thêm thưởng / khấu trừ, trả lương. Thợ: phiếu lương của mình (Q39).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { MonthNav } from '~/components/cong/parts'
import { Payslip } from '~/components/luong/Payslip'
import {
  Button,
  type ChipTone,
  ConfirmDialog,
  Money,
  Note,
  Sheet,
  StatusChip,
  SummaryCard,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useMe } from '~/lib/me'
import { formatVND } from '~/lib/money'
import { formatIsoDate, formatYearMonth, isYearMonth, toLocalDate } from '~/lib/time'
import type { PayrollMonth, PayrollStatus } from '~/server/payroll/service'

type Search = { m?: string }

export const Route = createFileRoute('/_app/them/luong')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    m: typeof s.m === 'string' && isYearMonth(s.m) ? s.m : undefined,
  }),
  head: () => ({ meta: [{ title: 'Lương · LINDY OS' }] }),
  component: Page,
})

const STATUS: Record<PayrollStatus, { label: string; tone: ChipTone }> = {
  before_start: { label: 'Làm trên Sheets', tone: 'neutral' },
  provisional: { label: 'Tạm tính', tone: 'accent' },
  closing: { label: 'Chờ ngày nháp', tone: 'neutral' },
  draft: { label: 'Bản nháp, chờ khoá', tone: 'warning' },
  locked: { label: 'Đã khoá', tone: 'success' },
}

function Page() {
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const month = search.m ?? toLocalDate(new Date()).slice(0, 7)
  const q = useQuery({
    queryKey: ['payroll', 'month', month],
    queryFn: () => api<PayrollMonth>(`/api/payroll?month=${month}`),
    placeholderData: (prev) => prev,
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const d = q.data
  const open = d?.lines.find((l) => l.userId === openId) ?? null

  async function lock() {
    setBusy(true)
    setError(null)
    try {
      const next = await api<PayrollMonth>('/api/payroll/lock', { body: { month } })
      qc.setQueryData(['payroll', 'month', month], next)
      void qc.invalidateQueries({ queryKey: ['payroll'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(`Đã khoá bảng lương tháng ${formatYearMonth(month)}.`)
      setConfirm(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 px-4 pt-1 pb-4">
      <div className="flex flex-col gap-1">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Lương</h1>
      </div>
      <MonthNav month={month} onChange={(m) => void navigate({ search: { m }, replace: true })} />
      {q.isError ? <Note tone="danger">{errorText(q.error)}</Note> : null}
      {!d ? <p className="body m-0 text-ink-muted">Đang tải…</p> : null}
      {d ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusChip>
            {d.status !== 'before_start' && d.status !== 'locked' ? (
              <span className="caption text-ink-muted">
                Bản nháp từ {formatIsoDate(d.draftDate)} · trả lương ngày {formatIsoDate(d.payDate)}
              </span>
            ) : null}
          </div>
          {d.status === 'before_start' ? (
            <Note>
              {d.startMonth
                ? `Tháng này làm lương trên Sheets. App tính lương từ tháng ${formatYearMonth(d.startMonth)}.`
                : 'Chưa chọn tháng bắt đầu tính lương trên app (Linh chọn ở Thêm → Nhân viên).'}
            </Note>
          ) : null}

          {d.all && d.lines.length ? (
            <>
              <SummaryCard
                label={d.status === 'locked' ? 'Lương phải trả' : 'Lương phải trả (tạm tính)'}
                value={d.totals.grossPay}
                rows={[
                  { label: 'Tạm ứng đã chi', value: d.totals.advances },
                  { label: 'Đã trả', value: d.totals.paid },
                  {
                    label: 'Còn phải trả',
                    value: d.totals.remaining,
                    tone: d.totals.remaining > 0 ? 'negative' : undefined,
                  },
                ]}
                footnote={`${d.lines.length} người`}
              />
              {d.status !== 'locked' && d.pendingDays ? (
                <Note tone="warning">
                  Còn {d.pendingDays} ngày công chưa duyệt (tạm coi là đi làm). Duyệt hết ở{' '}
                  <Link to="/lich/cham-cong" search={{ tab: 'bang', m: month }} className="text-accent">
                    Chấm công
                  </Link>{' '}
                  rồi mới khoá được.
                </Note>
              ) : null}
              {d.warnings.ordersOpen ? (
                <Note tone="warning">
                  {d.warnings.ordersOpen} đơn của tháng chưa xác nhận. Xác nhận sau khi khoá thì hoa hồng tính
                  vào tháng đang mở.
                </Note>
              ) : null}
              {d.warnings.missingPolicy.length ? (
                <Note tone="warning">
                  Chưa có chính sách lương của {d.warnings.missingPolicy.join(', ')} (có hồ sơ trong tháng).
                  Nhập ở{' '}
                  <Link to="/them/nhan-vien" className="text-accent">
                    Thêm → Nhân viên
                  </Link>{' '}
                  rồi mới khoá được.
                </Note>
              ) : null}
              {d.warnings.advancesUnpaid ? (
                <Note tone="warning">
                  {d.warnings.advancesUnpaid} tạm ứng đã duyệt chưa chi. Chi sau khi khoá thì trừ vào lương
                  tháng đang mở.
                </Note>
              ) : null}
              {d.can.lock ? (
                <Button block variant="primary" onClick={() => setConfirm(true)}>
                  Khoá bảng lương tháng {formatYearMonth(month)}
                </Button>
              ) : null}
              {error && !confirm ? <Note tone="danger">{error}</Note> : null}
              <div className="-mx-4 border-t border-line">
                {d.lines.map((l) => (
                  <button
                    key={l.userId}
                    type="button"
                    className="lo-row lo-row-action w-full border-0 bg-transparent text-left"
                    onClick={() => setOpenId(l.userId)}
                  >
                    <span className="lo-row-main">
                      <span className="body lo-row-title">{l.name}</span>
                      <span className="lo-row-meta caption">
                        Vắng {l.absentDays}/{l.leaveAllowance} · hoa hồng {formatVND(l.commission)}
                        {l.kpiBonus ? ` · KPI ${formatVND(l.kpiBonus)}` : ''}
                        {l.advances ? ` · tạm ứng ${formatVND(l.advances)}` : ''}
                      </span>
                    </span>
                    <span className="lo-row-side">
                      <Money value={l.grossPay} tone={l.grossPay < 0 ? 'negative' : undefined} />
                      {d.status === 'locked' ? (
                        l.remaining > 0 ? (
                          <StatusChip tone="warning">Còn {formatVND(l.remaining)}</StatusChip>
                        ) : (
                          <StatusChip tone="success">Đã trả đủ</StatusChip>
                        )
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
              {!d.can.edit && !d.can.pay && d.status !== 'before_start' ? (
                <p className="caption m-0 text-ink-muted">Chỉ xem. Linh sửa, khoá và trả lương.</p>
              ) : null}
            </>
          ) : null}

          {!d.all && d.status !== 'before_start' ? (
            d.lines[0] ? (
              <Payslip month={month} userId={me.userId} />
            ) : (
              <Note>Chưa có phiếu lương tháng này (chưa có hồ sơ hoặc chính sách lương).</Note>
            )
          ) : null}
          {d.all && d.status !== 'before_start' && d.lines.length === 0 ? (
            <Note>Chưa có ai có hồ sơ và chính sách lương trong tháng này (Thêm → Nhân viên).</Note>
          ) : null}
        </>
      ) : null}

      {open && d ? (
        <Sheet
          open
          title={`${open.name} · lương tháng ${formatYearMonth(month)}`}
          onClose={() => setOpenId(null)}
        >
          <Payslip month={month} userId={open.userId} />
        </Sheet>
      ) : null}
      {d ? (
        <ConfirmDialog
          open={confirm}
          title={`Khoá bảng lương tháng ${formatYearMonth(month)}?`}
          confirmLabel="Khoá bảng lương"
          danger
          busy={busy}
          onConfirm={() => void lock()}
          onCancel={() => setConfirm(false)}
        >
          <p className="body m-0">
            {d.lines.length} người · lương phải trả {formatVND(d.totals.grossPay)} · còn phải trả{' '}
            {formatVND(d.totals.payable)}.
          </p>
          <p className="caption m-0 text-ink-muted">
            Khoá xong phiếu lương cố định; công, ngày nghỉ, chính sách tháng này không sửa được. Sai lệch phát
            hiện sau ghi vào tháng đang mở. Tạm ứng nhiều hơn lương tự trừ vào tháng sau.
          </p>
          {error ? <Note tone="danger">{error}</Note> : null}
        </ConfirmDialog>
      ) : null}
    </section>
  )
}
