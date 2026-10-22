// Cần xem lại của Linh (PRD §5.2, UI02; K15, K17, K18, P31, P49; Đợt 3B-2 bước 3.21; S43 bỏ Q04). Gom mọi việc Linh
// cần xem lại vào một trang: đơn Nhung sửa / huỷ, phiếu ưu đãi do người khác lập, phiếu hoàn do Nhung lập,
// cọc xử lý khác gợi ý, phiếu chi Nhung tự duyệt, lần chốt quỹ lệch tiền. Chỉ người có review_queue.read.
import { formatIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden } from '../http/errors'

const n = (v: unknown) => Number(v ?? 0)
const code = (c: number) => `#${String(c).padStart(4, '0')}`

export type ReviewItem = {
  kind: 'order' | 'ticket' | 'refund' | 'deposit' | 'expense' | 'day_close'
  /** Id để đánh dấu đã xem (đơn, phiếu xử lý, phiếu hoàn, khoản cọc, phiếu chi, bản chốt) */
  id: string
  title: string
  detail: string
  amount: number | null
  at: string
  link: { to: 'order' | 'appointment' | 'expenses' | 'day_close'; id?: string }
}

export async function reviewCount(tx: Tx, branchId: string) {
  const [c] = await tx<{ n: string }[]>`
    select
      (select count(*) from orders where branch_id = ${branchId} and needs_owner_review and reviewed_at is null)
      + (select count(*) from order_service_tickets where branch_id = ${branchId} and needs_owner_review
           and reviewed_at is null and voided_at is null)
      + (select count(*) from order_refunds where branch_id = ${branchId} and needs_owner_review and reviewed_at is null)
      + (select count(*) from appointment_deposits where branch_id = ${branchId} and needs_owner_review
           and reviewed_at is null)
      + (select count(*) from expense_requests where branch_id = ${branchId} and needs_owner_review
           and reviewed_at is null)
      + (select count(*) from cash_day_closes where branch_id = ${branchId} and needs_owner_review
           and reviewed_at is null) as n`
  return n(c?.n)
}

export async function reviewQueue(auth: Auth, input: { branchId?: string } = {}) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'review_queue.read'))
    throw forbidden('Chỉ chủ quán xem danh sách Cần xem lại.')
  return withUser(auth.userId, async (tx) => {
    const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branch.id}`
    const tz = b?.timezone ?? 'Asia/Ho_Chi_Minh'
    const when = (d: Date) => `${toLocalTime(d, tz)} ${formatIsoDate(toLocalDate(d, tz)).slice(0, 5)}`
    const items: ReviewItem[] = []

    const orders = await tx<
      {
        id: string
        code: number
        status: string
        netAmount: string
        who: string | null
        adjusted: boolean
        at: Date
      }[]
    >`
      select o.id, o.code, o.status, o.net_amount,
             coalesce(ua.display_name, uc.display_name, ux.display_name) as who, o.adjusted_by is not null as adjusted,
             coalesce(o.cancelled_at, o.adjusted_at, o.confirmed_at, o.updated_at) as at
      from orders o
      left join users uc on uc.id = o.confirmed_by
      left join users ua on ua.id = o.adjusted_by
      left join users ux on ux.id = o.cancelled_by
      where o.branch_id = ${branch.id} and o.needs_owner_review and o.reviewed_at is null
      order by at desc limit 100`
    for (const o of orders)
      items.push({
        kind: 'order',
        id: o.id,
        title: `Đơn ${code(o.code)}`,
        detail:
          o.status === 'cancelled'
            ? `${o.who ?? ''} huỷ đơn đã xác nhận`
            : o.adjusted
              ? `${o.who ?? ''} sửa đơn đã xác nhận có phần của mình`
              : `${o.who ?? ''} tự xác nhận đơn có phần của mình`,
        amount: n(o.netAmount),
        at: when(o.at),
        link: { to: 'order', id: o.id },
      })

    const tickets = await tx<
      { id: string; orderId: string; code: number; percent: number; who: string | null; at: Date }[]
    >`
      select t.id, t.order_id, o.code, t.compensation_percent as percent, u.display_name as who, t.created_at as at
      from order_service_tickets t join orders o on o.id = t.order_id left join users u on u.id = t.created_by
      where t.branch_id = ${branch.id} and t.needs_owner_review and t.reviewed_at is null and t.voided_at is null
      order by t.created_at desc limit 100`
    for (const t of tickets)
      items.push({
        kind: 'ticket',
        id: t.id,
        title: `Phiếu ưu đãi ${t.percent}% · đơn ${code(t.code)}`,
        detail: `${t.who ?? ''} lập ưu đãi bù khiếu nại (quán chịu)`,
        amount: null,
        at: when(t.at),
        link: { to: 'order', id: t.orderId },
      })

    const refunds = await tx<
      {
        id: string
        orderId: string
        code: number
        amount: string
        reason: string
        who: string | null
        at: Date
      }[]
    >`
      select r.id, r.order_id, o.code, r.amount, r.reason, u.display_name as who, r.refunded_at as at
      from order_refunds r join orders o on o.id = r.order_id left join users u on u.id = r.refunded_by
      where r.branch_id = ${branch.id} and r.needs_owner_review and r.reviewed_at is null
      order by r.refunded_at desc limit 100`
    for (const r of refunds)
      items.push({
        kind: 'refund',
        id: r.id,
        title: `Hoàn tiền đơn ${code(r.code)}`,
        detail: `${r.who ?? ''}: ${r.reason}`,
        amount: n(r.amount),
        at: when(r.at),
        link: { to: 'order', id: r.orderId },
      })

    const deposits = await tx<
      {
        id: string
        apptId: string
        name: string
        status: string
        suggested: string | null
        resolvedAmount: string
        reason: string | null
        who: string | null
        at: Date
      }[]
    >`
      select d.id, d.appointment_id as appt_id, a.customer_display_name as name, d.status,
             d.suggested_action as suggested, d.resolved_amount, d.resolve_reason as reason, u.display_name as who,
             d.resolved_at as at
      from appointment_deposits d join appointments a on a.id = d.appointment_id left join users u on u.id = d.resolved_by
      where d.branch_id = ${branch.id} and d.needs_owner_review and d.reviewed_at is null
      order by d.resolved_at desc limit 100`
    for (const d of deposits)
      items.push({
        kind: 'deposit',
        id: d.id,
        title: `${d.status === 'refunded' ? 'Hoàn cọc' : 'Giữ cọc'} · ${d.name}`,
        detail: `${d.who ?? ''} làm khác gợi ý (${d.suggested === 'refund' ? 'nên hoàn' : 'nên giữ'}): ${d.reason ?? ''}`,
        amount: n(d.resolvedAmount),
        at: when(d.at),
        link: { to: 'appointment', id: d.apptId },
      })

    const expenses = await tx<
      { id: string; category: string; note: string; amount: string; who: string | null; at: Date }[]
    >`
      select e.id, c.name as category, e.note, e.amount, u.display_name as who, e.approved_at as at
      from expense_requests e join expense_categories c on c.code = e.category_code
      left join users u on u.id = e.approved_by
      where e.branch_id = ${branch.id} and e.needs_owner_review and e.reviewed_at is null
      order by e.approved_at desc limit 100`
    for (const e of expenses)
      items.push({
        kind: 'expense',
        id: e.id,
        title: `Phiếu chi ${e.category}`,
        detail: `${e.who ?? ''} tự duyệt phiếu của mình: ${e.note}`,
        amount: n(e.amount),
        at: when(e.at),
        link: { to: 'expenses' },
      })

    const closes = await tx<
      { id: string; date: string; difference: string; reason: string | null; who: string | null; at: Date }[]
    >`
      select c.id, c.business_date::text as date, c.difference, c.reason, u.display_name as who, c.closed_at as at
      from cash_day_closes c left join users u on u.id = c.closed_by
      where c.branch_id = ${branch.id} and c.needs_owner_review and c.reviewed_at is null
      order by c.business_date desc limit 100`
    for (const c of closes)
      items.push({
        kind: 'day_close',
        id: c.id,
        title: `Chốt quỹ ${formatIsoDate(c.date)}: ${n(c.difference) > 0 ? 'thừa' : 'thiếu'}`,
        detail: `${c.who ?? ''}: ${c.reason ?? ''}`,
        amount: Math.abs(n(c.difference)),
        at: when(c.at),
        link: { to: 'day_close' },
      })

    return { items, total: items.length }
  })
}
