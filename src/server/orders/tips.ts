// Tip giữ hộ (Đợt 3B-2, bước 3.15; Q14, Q15). Từ S27 app bỏ tip: khách tip chuyển riêng cho nhân viên, app không ghi tip
// mới (DB thu quyền gọi app.record_tip, app.void_tip — migration 0026). Tip đã ghi trước đó (nếu còn chưa trả) vẫn
// xem được và Nhung, Linh (cashbook.manage) trả nốt cho thợ ở Chốt quỹ (app.pay_tips); trả hết thì phần này tự ẩn.
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden } from '../http/errors'

const n = (v: unknown) => Number(v ?? 0)

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
