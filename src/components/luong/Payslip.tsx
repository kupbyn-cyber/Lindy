// Phiếu lương một người (Đợt 4B, UI10; PRD §9.1): đủ tham số để tự kiểm, hoa hồng theo đơn (dòng dời từ tháng khác ghi
// rõ — D04, Q34), thưởng thêm / khấu trừ (Linh, tháng chưa khoá), tạm ứng, đã trả, Trả lương (Linh, tháng đã khoá).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useRef, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  StatusChip,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { formatVND } from '~/lib/money'
import { LABEL_TONE } from '~/lib/status-tone'
import { formatDateTimeShort, formatIsoDate, formatYearMonth } from '~/lib/time'
import type { Payslip as Slip } from '~/server/payroll/service'

const pct = (bps: number) => `${(bps / 100).toLocaleString('vi-VN')}%`

function Row(props: { label: ReactNode; value: number; strong?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <span className={props.strong ? 'body-strong' : 'body'}>{props.label}</span>
        <Money
          value={props.value}
          sign={!props.strong && props.label !== 'Lương cứng' && props.value !== 0}
          tone={props.value < 0 ? 'negative' : undefined}
          className={props.strong ? 'body-strong' : undefined}
        />
      </div>
      {props.hint ? <span className="caption text-ink-muted">{props.hint}</span> : null}
    </div>
  )
}

export function Payslip(props: { month: string; userId: string }) {
  const qc = useQueryClient()
  const key = ['payroll', 'slip', props.month, props.userId]
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<Slip>(`/api/payroll?view=slip&month=${props.month}&userId=${props.userId}`),
  })
  const d = q.data
  if (q.isError) return <Note tone="danger">{errorText(q.error)}</Note>
  if (!d) return <p className="body m-0 text-ink-muted">Đang tải…</p>
  const l = d.line
  const set = (next: Slip) => {
    qc.setQueryData(key, next)
    void qc.invalidateQueries({ queryKey: ['payroll', 'month'] })
    void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="body-strong">
          {l.name} · tháng {formatYearMonth(d.month)}
        </span>
        <Button variant="quiet" onClick={() => window.print()}>
          In / PDF
        </Button>
      </div>
      <section className="lo-card flex flex-col gap-1">
        <span className="caption text-ink-muted">
          Tháng {l.daysInMonth} ngày · nghỉ được hưởng {l.leaveAllowance} · công chuẩn {l.standardDays} ·
          lương ngày {formatVND(Math.round(l.baseSalary / l.standardDays))}
        </span>
        <span className="caption text-ink-muted">
          Ngày vắng {l.absentDays}
          {l.closedDays ? ` · quán đóng cửa ${l.closedDays} (không tính nghỉ)` : ''}
          {l.pendingDays ? ` · ${l.pendingDays} ngày chưa duyệt (tạm coi là đi làm)` : ''}
        </span>
        <Row label="Lương cứng" value={l.baseSalary} />
        <Row
          label="Điều chỉnh theo ngày công"
          value={l.attendanceAdjustment}
          hint={`(${l.leaveAllowance} − ${l.absentDays}) × lương ngày`}
        />
        <Row
          label={`Hoa hồng ${pct(l.commissionBps)}`}
          value={l.commission}
          hint={`Cơ sở hoa hồng ${formatVND(l.commissionBase)}`}
        />
        {l.managerKpi ? (
          <Row
            label={`Thưởng KPI quản lý ${pct(l.kpiBps)}`}
            value={l.kpiBonus}
            hint={`Doanh thu tính KPI ${formatVND(l.shopRevenue ?? 0)} (không gồm hàng bán)`}
          />
        ) : null}
        {l.bonus ? <Row label="Thưởng thêm" value={l.bonus} /> : null}
        {l.hourlyLeaveMinutes ? (
          <Row
            label="Trừ nghỉ theo giờ"
            value={-l.hourlyLeaveDeduction}
            hint={`${l.hourlyLeaveMinutes} phút · lương cứng / công chuẩn / 12 giờ`}
          />
        ) : null}
        {l.deduction > l.hourlyLeaveDeduction ? (
          <Row label="Khấu trừ" value={-(l.deduction - l.hourlyLeaveDeduction)} />
        ) : null}
        {l.carryIn ? <Row label="Tạm ứng vượt lương tháng trước" value={-l.carryIn} /> : null}
        <div className="border-t border-line pt-1">
          <Row label="Lương phải trả" value={l.grossPay} strong />
        </div>
        {l.advances ? <Row label="Tạm ứng đã nhận" value={-l.advances} /> : null}
        {l.carriedOut ? (
          <Note tone="warning">
            Tạm ứng nhiều hơn lương {formatVND(l.carriedOut)}: trừ vào lương tháng sau.
          </Note>
        ) : null}
        {l.paid ? <Row label="Đã trả" value={-l.paid} /> : null}
        <div className="border-t border-line pt-1">
          <Row label={d.locked ? 'Còn phải trả' : 'Còn phải trả (tạm tính)'} value={l.remaining} strong />
        </div>
        <span className="caption text-ink-muted">
          {d.locked
            ? 'Bảng lương đã khoá.'
            : 'Chưa khoá: số tự cập nhật theo đơn đã xác nhận và công đã duyệt.'}{' '}
          Nhận lương: {l.payMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'}.
        </span>
      </section>

      {d.can.pay ? <PayButton d={d} onDone={set} /> : null}

      <section className="flex flex-col">
        <h3 className="overline m-0 text-ink-muted">Hoa hồng theo đơn</h3>
        {d.orders.length === 0 ? <p className="body m-0 text-ink-muted">Chưa có đơn đã xác nhận.</p> : null}
        {d.orders.map((o) => (
          <Link
            key={`${o.orderId}-${o.moved}`}
            to="/don-hang/$id"
            params={{ id: o.orderId }}
            className="lo-row lo-row-action -mx-4"
          >
            <span className="lo-row-main">
              <span className="body lo-row-title">
                #{String(o.code).padStart(4, '0')} · {formatIsoDate(o.serviceDate).slice(0, 5)}
              </span>
              {o.moved || o.refund ? (
                <span className="lo-row-meta caption">
                  {[o.moved ? 'dời từ tháng đã khoá' : '', o.refund ? 'có hoàn tiền' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}
            </span>
            <span className="lo-row-side">
              <Money value={o.base} size="sm" tone={o.base < 0 ? 'negative' : undefined} />
            </span>
          </Link>
        ))}
      </section>

      {d.adjustments.length || d.can.adjust ? <Adjustments d={d} onDone={set} /> : null}

      {d.advances.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="overline m-0 text-ink-muted">Tạm ứng trừ vào tháng này</h3>
          {d.advances.map((a) => (
            <div key={a.id} className="flex items-baseline justify-between gap-2">
              <span className="body">
                {formatDateTimeShort(a.paidAt)} · {a.reason}
              </span>
              <Money value={a.amount} size="sm" />
            </div>
          ))}
        </section>
      ) : null}

      {d.payouts.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="overline m-0 text-ink-muted">Đã trả lương</h3>
          {d.payouts.map((p) => (
            <div key={p.id} className="flex items-baseline justify-between gap-2">
              <span className="body">
                {formatDateTimeShort(p.paidAt)} · {p.accountName}
              </span>
              <Money value={p.amount} size="sm" />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}

function Adjustments(props: { d: Slip; onDone: (s: Slip) => void }) {
  const { d } = props
  const toast = useToast()
  const [kind, setKind] = useState<'bonus' | 'deduction'>('bonus')
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setBusy('add')
    setError(null)
    try {
      props.onDone(
        await api<Slip>('/api/payroll/adjust', {
          body: { month: d.month, userId: d.line.userId, kind, amount: amount ?? 0, reason },
        }),
      )
      toast(kind === 'bonus' ? 'Đã thêm thưởng.' : 'Đã thêm khấu trừ.')
      setAmount(null)
      setReason('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function voidOne(id: string) {
    setBusy(id)
    setError(null)
    try {
      props.onDone(await api<Slip>(`/api/payroll-adjustments/${id}/void`, { body: {} }))
      toast('Đã huỷ khoản điều chỉnh.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const label = { bonus: 'Thưởng thêm', deduction: 'Khấu trừ', carry: 'Tạm ứng vượt lương' } as const
  return (
    <section className="flex flex-col gap-2">
      <h3 className="overline m-0 text-ink-muted">Thưởng thêm, khấu trừ</h3>
      {d.adjustments.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="body">
              {label[a.kind]}
              {a.sourceMonth ? ` tháng ${formatYearMonth(a.sourceMonth)}` : ''}: {a.reason}
            </span>
            <span className="caption text-ink-muted">{a.createdByName}</span>
          </span>
          {a.voided ? (
            <StatusChip tone={LABEL_TONE.voided}>Đã huỷ</StatusChip>
          ) : (
            <Money value={a.kind === 'bonus' ? a.amount : -a.amount} size="sm" sign />
          )}
          {d.can.adjust && !a.voided && a.kind !== 'carry' ? (
            <Button variant="quiet" loading={busy === a.id} onClick={() => void voidOne(a.id)}>
              Huỷ
            </Button>
          ) : null}
        </div>
      ))}
      {d.can.adjust ? (
        <div className="no-print flex flex-col gap-2">
          <SegmentedControl
            ariaLabel="Loại điều chỉnh"
            options={[
              { value: 'bonus', label: 'Thưởng thêm' },
              { value: 'deduction', label: 'Khấu trừ' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as 'bonus' | 'deduction')}
          />
          <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
          <TextField
            label="Lý do"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button loading={busy === 'add'} disabled={!amount || !reason.trim()} onClick={() => void add()}>
            Thêm
          </Button>
        </div>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
    </section>
  )
}

function PayButton(props: { d: Slip; onDone: (s: Slip) => void }) {
  const { d } = props
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number | null>(d.line.remaining)
  const [method, setMethod] = useState<'cash' | 'transfer'>(d.line.payMethod)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyRef = useRef('')

  async function pay() {
    setBusy(true)
    setError(null)
    if (!keyRef.current) keyRef.current = crypto.randomUUID()
    try {
      props.onDone(
        await api<Slip>('/api/payroll/pay', {
          body: {
            month: d.month,
            userId: d.line.userId,
            amount: amount ?? 0,
            method,
            idempotencyKey: keyRef.current,
          },
        }),
      )
      keyRef.current = ''
      toast(`Đã ghi trả lương ${formatVND(amount ?? 0)} cho ${d.line.name}.`)
      setOpen(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        block
        variant="primary"
        onClick={() => {
          setAmount(d.line.remaining)
          setOpen(true)
        }}
      >
        Trả lương · còn {formatVND(d.line.remaining)}
      </Button>
      <ConfirmDialog
        open={open}
        title={`Trả lương tháng ${formatYearMonth(d.month)} cho ${d.line.name}?`}
        confirmLabel="Đã trả"
        busy={busy}
        onConfirm={() => void pay()}
        onCancel={() => setOpen(false)}
      >
        <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
        <SegmentedControl
          ariaLabel="Trả bằng"
          options={[
            { value: 'transfer', label: 'Chuyển khoản' },
            { value: 'cash', label: 'Tiền mặt' },
          ]}
          value={method}
          onChange={(v) => setMethod(v as 'cash' | 'transfer')}
        />
        <p className="caption m-0 text-ink-muted">
          Tiền ra khỏi {method === 'cash' ? 'Tiền mặt' : 'Tài khoản'} của quán.
        </p>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </>
  )
}
