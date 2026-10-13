// Phiếu xử lý dịch vụ, bảo hành (PRD §6.7, §10, §13F; bước 2.18). Nhung, Linh lập từ đơn gốc đã xác nhận;
// DB tự tính còn/hết bảo hành. Lỗi kỹ thuật trong hạn → sửa miễn phí (không sinh doanh thu); khách đổi ý hoặc
// hết hạn → tính phí (tạo đơn mới); lỗi kỹ thuật mà khách không đồng ý sửa → ưu đãi 10–20% bill sau, quán chịu.
import type { Auth } from '../auth/context'
import { hasPerm } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { detailOf, loadRow } from './service'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

export type TicketInput = {
  issue: string
  cause: 'technical' | 'customer_change'
  outcome: 'free_fix' | 'charged' | 'compensation'
  repairedBy?: string | null
  compensationPercent?: number | null
  note?: string | null
}

export async function createTicket(auth: Auth, orderId: string, input: TicketInput) {
  return withUser(auth.userId, async (tx) => {
    const o = await loadRow(tx, orderId, true)
    if (!hasPerm(auth, o.branchId, 'order.confirm')) throw forbidden('Chỉ Nhung, Linh lập phiếu xử lý.')
    if (o.status !== 'confirmed') throw invalid('Chỉ lập phiếu xử lý cho đơn đã xác nhận.')
    const [w] = await tx<{ today: string }[]>`
      select (now() at time zone timezone)::date::text as today from branches where id = ${o.branchId}`
    const within = !!o.warrantyUntil && w!.today <= o.warrantyUntil
    if (input.outcome === 'free_fix' && !(input.cause === 'technical' && within))
      throw invalid(
        within
          ? 'Khách đổi ý thì tính phí, không sửa miễn phí.'
          : 'Đơn đã hết hạn bảo hành, sửa thì tính phí.',
      )
    if (input.outcome === 'compensation' && input.cause !== 'technical')
      throw invalid('Ưu đãi bù khiếu nại chỉ áp cho lỗi kỹ thuật.')
    if (input.outcome === 'compensation' && !o.customerId)
      throw invalid('Đơn khách lẻ không có hồ sơ khách để áp ưu đãi bill sau. Gắn khách cho đơn trước.')
    const [t] = await tx<{ id: string }[]>`
      insert into order_service_tickets (branch_id, order_id, issue, cause, outcome, repaired_by,
                                         compensation_percent, note, created_by)
      values (${o.branchId}, ${o.id}, ${input.issue.trim()}, ${input.cause}, ${input.outcome},
              ${input.outcome === 'free_fix' ? (input.repairedBy ?? null) : null},
              ${input.outcome === 'compensation' ? (input.compensationPercent ?? null) : null},
              ${input.note?.trim() || null}, ${auth.userId})
      returning id`
    await tx`
      insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json)
      values (${o.id}, ${o.branchId}, ${auth.userId}, 'ticket_created',
              ${tx.json({ ticketId: t!.id, cause: input.cause, outcome: input.outcome })})`
    return detailOf(tx, auth, await loadRow(tx, o.id))
  })
}

export async function voidTicket(auth: Auth, ticketId: string, reason: string) {
  if (!isUuid(ticketId)) throw notFound('Không tìm thấy phiếu.')
  return withUser(auth.userId, async (tx) => {
    const [t] = await tx<{ id: string; orderId: string; branchId: string; voidedAt: Date | null }[]>`
      select id, order_id, branch_id, voided_at from order_service_tickets where id = ${ticketId}`
    if (!t) throw notFound('Không tìm thấy phiếu.')
    if (!hasPerm(auth, t.branchId, 'order.confirm')) throw forbidden('Chỉ Nhung, Linh huỷ được phiếu xử lý.')
    if (t.voidedAt) throw invalid('Phiếu này đã huỷ.')
    const [used] = await tx`
      select 1 from orders o join order_discounts d on d.order_id = o.id and d.rev = o.content_rev
      where d.ticket_id = ${ticketId} and o.status <> 'cancelled' limit 1`
    if (used) throw invalid('Ưu đãi của phiếu đã áp vào đơn, không huỷ được phiếu.')
    await tx`update order_service_tickets set void_reason = ${reason.trim()}, voided_at = now() where id = ${ticketId}`
    await tx`
      insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json, reason)
      values (${t.orderId}, ${t.branchId}, ${auth.userId}, 'ticket_voided', ${tx.json({ ticketId })}, ${reason.trim()})`
    return detailOf(tx, auth, await loadRow(tx, t.orderId))
  })
}

/** Ưu đãi bù khiếu nại còn dùng được của khách, để thợ áp khi lập bill sau (kể cả không xem được đơn gốc). */
export async function customerCompensations(auth: Auth, customerId: string, excludeOrderId?: string | null) {
  if (!isUuid(customerId)) throw notFound('Không tìm thấy khách.')
  if (!auth.branches.some((b) => b.perms.includes('order.create_draft'))) throw forbidden()
  return withUser(auth.userId, async (tx) => {
    const rows = await tx<
      { ticketId: string; percent: number; createdAt: Date; orderCode: number; branchId: string }[]
    >`
      select ticket_id, percent, created_at, order_code, branch_id
      from app.customer_compensations(${customerId}, ${excludeOrderId && isUuid(excludeOrderId) ? excludeOrderId : null})`
    return rows.map((r) => ({
      ticketId: r.ticketId,
      percent: r.percent,
      createdAt: new Date(r.createdAt).toISOString(),
      orderCodeLabel: `#${String(r.orderCode).padStart(4, '0')}`,
      branchId: r.branchId,
    }))
  })
}
