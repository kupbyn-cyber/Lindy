// Phiếu hoàn tiền (Đợt 3B-2, bước 3.16; PRD §6.3, test 5; K18). Nhung, Linh (order.refund) hoàn cho đơn đã xác nhận,
// không quá số đã thu − đã hoàn, có lý do; tiền ra khỏi tài khoản theo hình thức hoàn; doanh thu thuần của đơn và phần
// từng thợ giảm theo tỷ lệ (DB tính). Nhung lập → Cần xem lại của Linh. Bút toán, kiểm số do hàm app.refund_order.
import type { Auth } from '../auth/context'
import { hasPerm } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, notFound } from '../http/errors'
import { detailOf, loadRow } from './service'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

export async function refundOrder(
  auth: Auth,
  orderId: string,
  input: { idempotencyKey: string; amount: number; method: 'cash' | 'transfer'; reason: string },
) {
  if (!isUuid(orderId)) throw notFound('Không tìm thấy đơn.')
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, orderId)
    if (!hasPerm(auth, row.branchId, 'order.refund')) throw forbidden('Chỉ Nhung, Linh hoàn tiền.')
    await tx`
      select app.refund_order(${orderId}::uuid, ${input.amount}::bigint, ${input.method}::text,
                              ${input.reason.trim()}::text, ${input.idempotencyKey}::uuid)`
    return detailOf(tx, auth, await loadRow(tx, orderId))
  })
}

export async function reviewRefund(auth: Auth, refundId: string) {
  if (!isUuid(refundId)) throw notFound('Không tìm thấy phiếu hoàn.')
  return withUser(auth.userId, async (tx) => {
    const [r] = await tx<{ orderId: string; branchId: string }[]>`
      select order_id, branch_id from order_refunds where id = ${refundId}`
    if (!r) throw notFound('Không tìm thấy phiếu hoàn.')
    if (!hasPerm(auth, r.branchId, 'review_queue.read')) throw forbidden('Chỉ chủ quán đánh dấu đã xem lại.')
    await tx`update order_refunds set reviewed_by = ${auth.userId}, reviewed_at = now() where id = ${refundId}`
    return detailOf(tx, auth, await loadRow(tx, r.orderId))
  })
}
