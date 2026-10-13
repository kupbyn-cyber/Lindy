// Tip giữ hộ (Đợt 3B-2, bước 3.15; PRD §6.6; Q14, Q15). Chỉ ghi khi khách chuyển tip vào tài khoản quán; không doanh
// thu, không hoa hồng. Nhung, Linh (cashbook.manage) ghi tip cho đơn, chia theo phần tiền từng thợ (hoặc khách chỉ
// định), và cuối ngày trả tiền mặt cho thợ. Thợ xem tip của mình. Bút toán do hàm DB ghi (record_tip, pay_tips).
import { splitTip } from '~/lib/order-math'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { detailOf, loadRow } from './service'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)
const n = (v: unknown) => Number(v ?? 0)

/** Chia mặc định theo phần tiền thuần từng thợ trong bộ dòng hiện tại của đơn. */
export async function defaultTipSplit(tx: Tx, orderId: string, amount: number) {
  const shares = await tx<{ userId: string; amount: string }[]>`
    select a.staff_user_id as user_id, sum(a.allocated_net_amount) as amount
    from order_staff_allocations a join orders o on o.id = a.order_id and a.rev = o.content_rev
    where a.order_id = ${orderId} group by a.staff_user_id`
  return splitTip(
    amount,
    shares.map((s) => ({ userId: s.userId, amount: n(s.amount) })),
  )
}

/** Ghi tip trong cùng giao dịch (dùng khi ghi khoản thu chuyển khoản kèm tip). */
export async function recordTipTx(
  tx: Tx,
  orderId: string,
  key: string,
  tip: { amount: number; split?: { userId: string; amount: number }[] | null },
) {
  const split =
    tip.split && tip.split.length > 0
      ? tip.split.filter((s) => s.amount > 0)
      : await defaultTipSplit(tx, orderId, tip.amount)
  if (split.length === 0) throw invalid('Đơn chưa có thợ để chia tip. Chọn thợ nhận tip.')
  if (split.reduce((s, x) => s + x.amount, 0) !== tip.amount)
    throw invalid('Tổng tip chia cho thợ phải bằng số tip.')
  await tx`
    select app.record_tip(${orderId}::uuid, ${split.map((s) => s.userId)}::uuid[],
                          ${split.map((s) => String(s.amount))}::text[]::bigint[], ${key}::uuid)`
}

export async function recordTip(
  auth: Auth,
  orderId: string,
  input: { idempotencyKey: string; amount: number; split?: { userId: string; amount: number }[] | null },
) {
  if (!isUuid(orderId)) throw notFound('Không tìm thấy đơn.')
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, orderId)
    if (!hasPerm(auth, row.branchId, 'cashbook.manage')) throw forbidden('Chỉ Nhung, Linh ghi tip.')
    await recordTipTx(tx, orderId, input.idempotencyKey, input)
    return detailOf(tx, auth, await loadRow(tx, orderId))
  })
}

export async function voidTip(auth: Auth, tipId: string, reason: string) {
  if (!isUuid(tipId)) throw notFound('Không tìm thấy khoản tip.')
  return withUser(auth.userId, async (tx) => {
    const [t] = await tx<{ orderId: string; branchId: string }[]>`
      select order_id, branch_id from tip_holdings where id = ${tipId}`
    if (!t) throw notFound('Không tìm thấy khoản tip.')
    if (!hasPerm(auth, t.branchId, 'cashbook.manage')) throw forbidden('Chỉ Nhung, Linh huỷ được tip.')
    await tx`select app.void_tip(${tipId}::uuid, ${reason}::text)`
    return detailOf(tx, auth, await loadRow(tx, t.orderId))
  })
}

/** Tip đang giữ theo thợ (Nhung, Linh: mọi thợ; thợ: của mình) và các lần trả gần đây. */
export async function tipSummary(auth: Auth, input: { branchId?: string } = {}) {
  const branch = requireBranch(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const holding = await tx<{ staffUserId: string; name: string; amount: string; count: string }[]>`
      select t.staff_user_id, u.display_name as name, sum(t.amount) as amount, count(*) as count
      from tip_holdings t join users u on u.id = t.staff_user_id
      where t.branch_id = ${branch.id} and t.payout_id is null and t.voided_at is null
      group by t.staff_user_id, u.display_name order by u.display_name`
    const payouts = await tx<
      { id: string; name: string; amount: string; paidAt: Date; paidByName: string | null }[]
    >`
      select p.id, u.display_name as name, p.amount, p.paid_at, ub.display_name as paid_by_name
      from tip_payouts p join users u on u.id = p.staff_user_id left join users ub on ub.id = p.paid_by
      where p.branch_id = ${branch.id} order by p.paid_at desc limit 20`
    return {
      holding: holding.map((h) => ({
        staffUserId: h.staffUserId,
        name: h.name,
        amount: n(h.amount),
        count: n(h.count),
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        name: p.name,
        amount: n(p.amount),
        paidAt: new Date(p.paidAt).toISOString(),
        paidByName: p.paidByName,
      })),
      can: { pay: hasPerm(auth, branch.id, 'cashbook.manage') },
    }
  })
}

export async function payTips(
  auth: Auth,
  input: { branchId?: string; staffUserId: string; idempotencyKey: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.manage')) throw forbidden('Chỉ Nhung, Linh trả tip.')
  await withUser(auth.userId, async (tx) => {
    await tx`select app.pay_tips(${branch.id}::uuid, ${input.staffUserId}::uuid, ${input.idempotencyKey}::uuid)`
  })
  return tipSummary(auth, { branchId: branch.id })
}
