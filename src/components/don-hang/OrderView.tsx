// Chi tiết và xác nhận đơn (UI05, bước 2.14): dòng đơn, chia thợ, giảm giá, khoản thu, hạn bảo hành, lịch sử thao tác.
// Nút hiện theo quyền; server vẫn kiểm lại. Nhãn "vượt khoảng", "nhập tay", "giảm chờ duyệt" để Nhung xem khi xác nhận [P28].
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  StatusChip,
  TextArea,
  useToast,
} from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import { formatVND } from '~/lib/money'
import { DISCOUNT_LABEL } from '~/lib/order-math'
import {
  LEVEL_NOTE,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  type OrderDetail,
  PAYMENT_LABEL,
  PAYMENT_TONE,
} from '~/lib/orders'
import { formatDateTimeShort, formatIsoDate } from '~/lib/time'

type Dialog =
  | null
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'payment' }
  | { kind: 'void'; paymentId: string; amount: number }
  | { kind: 'approve' }

export function OrderView(props: { order: OrderDetail; onEdit: () => void }) {
  const d = props.order
  const c = d.can
  const qc = useQueryClient()
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [payKey, setPayKey] = useState('')

  const open = (x: Dialog) => {
    setText('')
    setError(null)
    if (x?.kind === 'payment') {
      setAmount(d.dueAmount)
      setMethod('cash')
      // Mã thu tiền sinh khi mở; bấm lưu hai lần chỉ ra một khoản thu (test 17)
      setPayKey(crypto.randomUUID())
    }
    setDialog(x)
  }

  async function run() {
    if (!dialog) return
    setBusy(true)
    setError(null)
    try {
      let next: OrderDetail
      let done = ''
      switch (dialog.kind) {
        case 'confirm':
          next = await api(`/api/orders/${d.id}/confirm`, { body: { version: d.version } })
          done = `Đã xác nhận bill ${d.codeLabel}.`
          break
        case 'approve':
          next = await api(`/api/orders/${d.id}/approve-discounts`, { body: { version: d.version } })
          done = 'Đã duyệt giảm giá.'
          break
        case 'cancel':
          next = await api(`/api/orders/${d.id}/cancel`, { body: { version: d.version, reason: text } })
          done = `Đã huỷ đơn ${d.codeLabel}.`
          break
        case 'payment':
          next = await api(`/api/orders/${d.id}/payments`, {
            body: { idempotencyKey: payKey, amount: amount ?? 0, method },
          })
          done = `Đã ghi thu ${formatVND(amount ?? 0)}.`
          break
        case 'void':
          next = await api(`/api/payments/${dialog.paymentId}/void`, { body: { reason: text } })
          done = 'Đã huỷ khoản thu.'
          break
      }
      qc.setQueryData(['orders', 'detail', d.id], next)
      await qc.invalidateQueries({ queryKey: ['orders', 'list'] })
      if (d.appointment) await qc.invalidateQueries({ queryKey: ['appointments'] })
      toast(done)
      // Xác nhận xong mà còn phải thu → mở luôn ô ghi tiền (Nhung xác nhận bill và ghi thanh toán)
      if (dialog.kind === 'confirm' && next.dueAmount > 0 && next.can.recordPayment) {
        setAmount(next.dueAmount)
        setMethod('cash')
        setPayKey(crypto.randomUUID())
        setDialog({ kind: 'payment' })
      } else {
        setDialog(null)
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data) {
        qc.setQueryData(['orders', 'detail', d.id], e.data as OrderDetail)
        setError('Đơn vừa được người khác sửa. Đã tải bản mới nhất, xem lại rồi thao tác.')
      } else setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function markDone() {
    setBusy(true)
    try {
      const next = await api<OrderDetail>(`/api/orders/${d.id}/done`, { body: { version: d.version } })
      qc.setQueryData(['orders', 'detail', d.id], next)
      await qc.invalidateQueries({ queryKey: ['orders', 'list'] })
      toast(`Đã bấm Làm xong đơn ${d.codeLabel}.`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function markReviewed() {
    try {
      const next = await api<OrderDetail>(`/api/orders/${d.id}/review`, { body: {} })
      qc.setQueryData(['orders', 'detail', d.id], next)
      await qc.invalidateQueries({ queryKey: ['orders', 'list'] })
      toast('Đã đánh dấu xem lại.')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const levelNote = LEVEL_NOTE[d.requiredLevel]
  const discountsOnLine = (pos: number) => d.discounts.filter((x) => x.scope === pos)

  return (
    <section className="flex flex-col gap-3">
      <div className="px-4">
        <div className="flex flex-wrap items-center gap-1">
          <StatusChip tone={ORDER_STATUS_TONE[d.status]}>{ORDER_STATUS_LABEL[d.status]}</StatusChip>
          {d.status === 'confirmed' || d.status === 'awaiting_confirmation' ? (
            <StatusChip tone={PAYMENT_TONE[d.paymentStatus]}>{PAYMENT_LABEL[d.paymentStatus]}</StatusChip>
          ) : null}
          {d.hasOutOfRange ? <StatusChip tone="warning">Vượt khoảng giá</StatusChip> : null}
          {d.hasCustomLines ? <StatusChip tone="warning">Có dòng nhập tay</StatusChip> : null}
          {levelNote && !d.approval?.valid && d.status !== 'cancelled' ? (
            <StatusChip tone="warning">Giảm chờ duyệt</StatusChip>
          ) : null}
          {d.needsOwnerReview && !d.reviewedByName ? (
            <StatusChip tone="accent">Cần xem lại</StatusChip>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line bg-surface-raised">
        <Info label="Khách">
          {d.customer ? (
            <>
              {d.customer.name}
              {d.customer.phone ? (
                <a href={`tel:${d.customer.phone}`} className="ml-2 text-accent">
                  {d.customer.phone}
                </a>
              ) : null}
            </>
          ) : (
            'Khách lẻ'
          )}
        </Info>
        <Info label="Ngày làm">{formatIsoDate(d.serviceDate)}</Info>
        {d.appointment ? (
          <Info label="Từ lịch">
            <Link to="/lich/$id" params={{ id: d.appointment.id }} className="text-accent">
              {d.appointment.startTime} {formatIsoDate(d.appointment.date)}
            </Link>
          </Info>
        ) : null}
        {d.warrantyUntil ? <Info label="Bảo hành">đến {formatIsoDate(d.warrantyUntil)}</Info> : null}
      </div>

      <div className="border-t border-line">
        {d.items.length === 0 ? (
          <p className="body m-0 px-4 py-2 text-ink-muted">Đơn chưa có dịch vụ.</p>
        ) : null}
        {d.items.map((it) => (
          <div
            key={it.position}
            className="flex flex-col gap-1 border-b border-line bg-surface-raised px-4 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="body min-w-0 break-words">
                {it.name}
                {it.quantity > 1 ? ` × ${it.quantity} ${it.unit}` : ''}
              </span>
              <Money value={it.netAmount} />
            </div>
            <span className="caption text-ink-muted">
              {it.staff.length > 0
                ? it.staff
                    .map((s) =>
                      it.staff.length > 1 ? `${s.name} ${formatVND(s.allocatedNetAmount)}` : s.name,
                    )
                    .join(' · ')
                : (it.unallocatedReason ?? 'Chưa chọn thợ')}
              {it.discountAmount > 0 ? ` · gốc ${formatVND(it.grossAmount)}` : ''}
            </span>
            {it.outOfRange ? (
              <span className="caption text-warning">
                Vượt khoảng {formatVND(it.listMin)}–{formatVND(it.listMax)}
              </span>
            ) : null}
            {it.type === 'custom' ? <span className="caption text-warning">Dịch vụ nhập tay</span> : null}
            {discountsOnLine(it.position).map((x) => (
              <span key={`${x.kind}-${x.amount}`} className="caption text-ink-muted">
                {x.kind === 'below_list'
                  ? `Giá thấp hơn: ${x.reason}`
                  : x.kind === 'manual'
                    ? x.reason
                    : DISCOUNT_LABEL[x.kind]}
                {' · '}−{formatVND(x.amount)}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="mx-4 lo-card flex flex-col gap-1">
        {d.discounts
          .filter((x) => x.scope === 'order')
          .map((x) => (
            <div key={`${x.kind}-${x.amount}`} className="flex justify-between gap-2">
              <span className="body text-ink-muted">
                {x.kind === 'manual' ? `Giảm: ${x.reason}` : DISCOUNT_LABEL[x.kind]} (cả bill)
              </span>
              <Money value={-x.amount} tone="negative" />
            </div>
          ))}
        {d.discountAmount > 0 ? (
          <div className="flex justify-between">
            <span className="body text-ink-muted">Tổng giá gốc</span>
            <Money value={d.grossAmount} tone="muted" />
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <span className="body-strong">Thành tiền</span>
          <Money value={d.netAmount} className="body-strong" />
        </div>
        {d.paidAmount > 0 ? (
          <div className="flex justify-between">
            <span className="body text-ink-muted">Đã thu</span>
            <Money value={d.paidAmount} />
          </div>
        ) : null}
        {d.status !== 'cancelled' && d.status !== 'in_progress' ? (
          <div className="flex justify-between">
            <span className="body text-ink-muted">Còn phải thu</span>
            <Money value={d.dueAmount} tone={d.dueAmount > 0 ? 'negative' : undefined} />
          </div>
        ) : null}
        {levelNote ? (
          <Note tone={d.approval?.valid ? 'info' : 'warning'}>
            {d.approval?.valid ? `Giảm giá đã được ${d.approval.byName} duyệt.` : levelNote}
          </Note>
        ) : null}
      </div>

      {d.payments.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="overline m-0 px-4 text-ink-muted">Tiền thu</h2>
          <div className="border-t border-line">
            {d.payments.map((p) => (
              <div key={p.id} className="lo-row">
                <span className="lo-row-main">
                  <span className={p.voided ? 'body text-ink-muted line-through' : 'body'}>
                    {p.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'} · {p.accountName}
                  </span>
                  <span className="lo-row-meta caption">
                    {formatDateTimeShort(p.receivedAt)} · {p.recordedByName}
                    {p.voided ? ` · đã huỷ: ${p.voidReason}` : ''}
                  </span>
                </span>
                <span className="lo-row-side">
                  <Money value={p.amount} tone={p.voided ? 'muted' : undefined} />
                  {!p.voided && c.voidPayment ? (
                    <button
                      type="button"
                      className="caption border-0 bg-transparent p-0 text-danger"
                      onClick={() => open({ kind: 'void', paymentId: p.id, amount: p.amount })}
                    >
                      Huỷ khoản này
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 px-4">
        {c.done ? (
          <>
            {d.doneProblems.map((p) => (
              <Note key={p} tone="warning">
                {p}
              </Note>
            ))}
            <Button
              variant="primary"
              block
              loading={busy && !dialog}
              disabled={d.doneProblems.length > 0}
              onClick={() => void markDone()}
            >
              Làm xong
            </Button>
          </>
        ) : null}
        {c.confirmBlocked ? <Note tone="warning">{c.confirmBlocked}</Note> : null}
        {c.approveDiscount && !c.confirm ? (
          <Button variant="primary" block onClick={() => open({ kind: 'approve' })}>
            Duyệt giảm giá
          </Button>
        ) : null}
        {c.confirm ? (
          <Button variant="primary" block onClick={() => open({ kind: 'confirm' })}>
            Xác nhận bill
          </Button>
        ) : null}
        {c.recordPayment && d.dueAmount > 0 ? (
          <Button
            variant={c.confirm ? 'secondary' : 'primary'}
            block
            onClick={() => open({ kind: 'payment' })}
          >
            Ghi tiền thu
          </Button>
        ) : null}
        {c.markReviewed ? (
          <Button block onClick={() => void markReviewed()}>
            Đã xem lại
          </Button>
        ) : null}
        {c.edit ? (
          <Button block onClick={props.onEdit}>
            Sửa đơn
          </Button>
        ) : null}
        {c.cancel ? (
          <Button block variant="danger" onClick={() => open({ kind: 'cancel' })}>
            Huỷ đơn
          </Button>
        ) : null}
      </div>

      <div className="border-t border-line bg-surface-raised">
        <Info label="Người tạo">
          {d.createdByName} <span className="text-ink-muted">· {formatDateTimeShort(d.createdAt)}</span>
        </Info>
        {d.doneByName && d.doneAt ? (
          <Info label="Làm xong">
            {d.doneByName} <span className="text-ink-muted">· {formatDateTimeShort(d.doneAt)}</span>
          </Info>
        ) : null}
        {d.confirmedByName && d.confirmedAt ? (
          <Info label="Xác nhận">
            {d.confirmedByName} <span className="text-ink-muted">· {formatDateTimeShort(d.confirmedAt)}</span>
          </Info>
        ) : null}
        {d.status === 'cancelled' ? (
          <Info label="Lý do huỷ">
            {d.cancelReason} <span className="text-ink-muted">({d.cancelledByName})</span>
          </Info>
        ) : null}
        {d.reviewedByName ? <Info label="Đã xem lại">{d.reviewedByName}</Info> : null}
      </div>

      <ConfirmDialog
        open={!!dialog}
        title={
          dialog?.kind === 'confirm'
            ? `Xác nhận bill ${d.codeLabel}?`
            : dialog?.kind === 'approve'
              ? 'Duyệt mức giảm giá này?'
              : dialog?.kind === 'cancel'
                ? `Huỷ đơn ${d.codeLabel}?`
                : dialog?.kind === 'payment'
                  ? 'Ghi tiền thu'
                  : 'Huỷ khoản thu?'
        }
        confirmLabel={
          dialog?.kind === 'confirm'
            ? 'Xác nhận'
            : dialog?.kind === 'approve'
              ? 'Duyệt'
              : dialog?.kind === 'cancel'
                ? 'Huỷ đơn'
                : dialog?.kind === 'payment'
                  ? 'Lưu'
                  : 'Huỷ khoản thu'
        }
        danger={dialog?.kind === 'cancel' || dialog?.kind === 'void'}
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setDialog(null)}
      >
        {dialog?.kind === 'confirm' ? (
          <p className="body m-0 text-ink-muted">
            Thành tiền {formatVND(d.netAmount)}. Đơn vào doanh thu ngày {formatIsoDate(d.serviceDate)}.
            {levelNote && !d.approval?.valid ? ' Xác nhận là đồng ý mức giảm giá trên đơn.' : ''}
          </p>
        ) : null}
        {dialog?.kind === 'cancel' || dialog?.kind === 'void' ? (
          <TextArea
            label="Lý do (bắt buộc)"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
          />
        ) : null}
        {dialog?.kind === 'void' ? (
          <p className="body m-0 text-ink-muted">
            Khoản {formatVND(dialog.amount)} sẽ không tính vào tiền đã thu.
          </p>
        ) : null}
        {dialog?.kind === 'payment' ? (
          <>
            <p className="body m-0 text-ink-muted">Còn phải thu {formatVND(d.dueAmount)}.</p>
            <SegmentedControl
              ariaLabel="Hình thức"
              className="w-full"
              options={[
                { value: 'cash', label: 'Tiền mặt' },
                { value: 'transfer', label: 'Chuyển khoản' },
              ]}
              value={method}
              onChange={(v) => setMethod(v as 'cash' | 'transfer')}
            />
            <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
          </>
        ) : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </section>
  )
}

function Info(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line px-4 py-2">
      <span className="label w-24 flex-none pt-0.5 text-ink-muted">{props.label}</span>
      <span className="body min-w-0 flex-1 break-words">{props.children}</span>
    </div>
  )
}
