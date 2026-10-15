// Ghi tiền thu của đơn (bước 2.11). Chỉ Nhung, Linh (order.confirm). Tiền mặt → Tiền mặt cs …; chuyển khoản →
// Tài khoản cs …. Chống bấm hai lần bằng mã thu tiền; khoá dòng đơn khi kiểm tổng thu ≤ phải thu [P30].
// Không sửa khoản thu; nhập nhầm thì huỷ (có lý do) rồi ghi lại. Trả lại tiền cho khách: phiếu hoàn (refunds.ts).
// App không ghi tip (S27): khách tip chuyển riêng cho nhân viên.
import { formatVND } from '~/lib/money'
import type { Auth } from '../auth/context'
import { hasPerm } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { detailOf, loadRow } from './service'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

export async function recordPayment(
  auth: Auth,
  orderId: string,
  input: { idempotencyKey: string; amount: number; method: 'cash' | 'transfer' },
) {
  if (!isUuid(orderId)) throw notFound('Không tìm thấy đơn.')
  return withUser(auth.userId, async (tx) => {
    // Khoá dòng đơn: hai lần thu song song phải chờ nhau
    const [o] = await tx<{ id: string; branchId: string; status: string; netAmount: number }[]>`
      select id, branch_id, status, net_amount::int as net_amount from orders where id = ${orderId} for update`
    if (!o) throw notFound('Không tìm thấy đơn.')
    if (!hasPerm(auth, o.branchId, 'order.confirm')) throw forbidden('Chỉ Nhung, Linh ghi được tiền thu.')

    const [dup] = await tx<{ orderId: string; amount: number; method: string }[]>`
      select order_id, amount::int as amount, method from payments where idempotency_key = ${input.idempotencyKey}`
    if (dup) {
      if (dup.orderId !== orderId || dup.amount !== input.amount || dup.method !== input.method)
        throw invalid('Mã thu tiền đã dùng cho khoản khác. Tải lại trang.')
      return detailOf(tx, auth, await loadRow(tx, orderId))
    }

    if (o.status !== 'awaiting_confirmation' && o.status !== 'confirmed')
      throw invalid('Chỉ ghi tiền thu cho đơn đã bấm Làm xong.')
    const [p] = await tx<{ paid: number }[]>`
      select coalesce(sum(amount), 0)::int as paid from payments where order_id = ${orderId} and voided_at is null`
    const due = o.netAmount - (p?.paid ?? 0)
    if (input.amount > due)
      throw invalid(due <= 0 ? 'Đơn đã thu đủ.' : `Số thu lớn hơn số còn phải thu (${formatVND(due)}).`)

    const [account] = await tx<{ id: string }[]>`
      select id from money_accounts
      where branch_id = ${o.branchId} and is_active and type = ${input.method === 'cash' ? 'cash' : 'bank'}
      order by code limit 1`
    if (!account) throw invalid('Chưa có tài khoản nhận tiền cho hình thức này.')

    const [row] = await tx<{ id: string }[]>`
      insert into payments (order_id, branch_id, amount, method, money_account_id, recorded_by, idempotency_key)
      values (${orderId}, ${o.branchId}, ${input.amount}, ${input.method}, ${account.id}, ${auth.userId},
              ${input.idempotencyKey})
      on conflict (idempotency_key) do nothing
      returning id`
    if (row) {
      await tx`
        insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json)
        values (${orderId}, ${o.branchId}, ${auth.userId}, 'payment_recorded',
                ${tx.json({ paymentId: row.id, amount: input.amount, method: input.method })})`
    }
    return detailOf(tx, auth, await loadRow(tx, orderId))
  })
}

export async function voidPayment(auth: Auth, paymentId: string, reason: string) {
  if (!isUuid(paymentId)) throw notFound('Không tìm thấy khoản thu.')
  return withUser(auth.userId, async (tx) => {
    const [p] = await tx<
      { id: string; orderId: string; branchId: string; amount: number; voidedAt: Date | null }[]
    >`
      select id, order_id, branch_id, amount::int as amount, voided_at from payments where id = ${paymentId}`
    if (!p) throw notFound('Không tìm thấy khoản thu.')
    if (!hasPerm(auth, p.branchId, 'order.confirm')) throw forbidden('Chỉ Nhung, Linh huỷ được khoản thu.')
    if (p.voidedAt) throw invalid('Khoản thu này đã huỷ.')
    await tx`select id from orders where id = ${p.orderId} for update`
    await tx`update payments set void_reason = ${reason.trim()}, voided_at = now() where id = ${paymentId}`
    await tx`
      insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json, reason)
      values (${p.orderId}, ${p.branchId}, ${auth.userId}, 'payment_voided',
              ${tx.json({ paymentId, amount: p.amount })}, ${reason.trim()})`
    return detailOf(tx, auth, await loadRow(tx, p.orderId))
  })
}
