// Khối "Cọc" của một lịch hẹn: cần cọc không, số gợi ý, các khoản cọc, trạng thái để hiện nhãn (K16).
// Dùng trong chi tiết lịch (appointments/service) và các thao tác cọc (deposits/service).
import type { Auth } from '../auth/context'
import type { Tx } from '../db/client'
import { type DepositCan, type DepositStatus, depositCan } from './policy'

const n = (v: unknown) => Number(v ?? 0)

export type DepositView = {
  id: string
  amount: number
  method: 'cash' | 'transfer'
  accountName: string
  note: string | null
  status: DepositStatus
  recordedByName: string | null
  recordedAt: string
  confirmedByName: string | null
  confirmedAt: string | null
  applied: number
  remaining: number
  resolvedAmount: number | null
  resolvedByName: string | null
  resolvedAt: string | null
  resolveReason: string | null
  suggestedAction: 'refund' | 'forfeit' | null
  voidReason: string | null
  needsOwnerReview: boolean
  version: number
  can: DepositCan
}

/** missing: cần cọc mà chưa ghi (K16) · pending: có cọc chờ xác nhận · held: đang giữ cọc · done: đã trừ, hoàn, giữ hết */
export type DepositState = 'missing' | 'pending' | 'held' | 'done'

export type DepositBlock = {
  perGuest: number
  suggested: number
  state: DepositState
  pendingAmount: number
  heldAmount: number
  /** Gợi ý khi lịch đã kết thúc (C03): hoàn hay giữ phần cọc còn lại */
  suggestion: 'refund' | 'forfeit' | null
  refundNoticeHours: number
  items: DepositView[]
  can: { record: boolean }
}

const OPEN_APPT = ['pending', 'confirmed', 'arrived', 'in_progress']

export function depositState(
  required: boolean,
  apptStatus: string,
  pending: number,
  held: number,
  anyDeposit: boolean,
): DepositState | null {
  if (!required) return null
  if (pending > 0) return 'pending'
  if (held > 0) return 'held'
  if (!anyDeposit && OPEN_APPT.includes(apptStatus)) return 'missing'
  return anyDeposit ? 'done' : null
}

export async function depositBlock(
  tx: Tx,
  auth: Auth,
  a: {
    id: string
    branchId: string
    status: string
    guestCount: number
    depositRequired: boolean
    depositPerGuest: number | string | null
    depositSeasonId: string | null
  },
): Promise<DepositBlock | null> {
  if (!a.depositRequired) return null
  const perms = auth.branches.find((b) => b.id === a.branchId)?.perms ?? []
  const rows = await tx<
    {
      id: string
      amount: string
      method: 'cash' | 'transfer'
      accountName: string
      note: string | null
      status: DepositStatus
      recordedBy: string
      recordedByName: string | null
      recordedAt: Date
      confirmedByName: string | null
      confirmedAt: Date | null
      applied: string
      resolvedAmount: string | null
      resolvedByName: string | null
      resolvedAt: Date | null
      resolveReason: string | null
      suggestedAction: 'refund' | 'forfeit' | null
      voidReason: string | null
      needsOwnerReview: boolean
      reviewedAt: Date | null
      version: number
    }[]
  >`
    select d.id, d.amount, d.method, m.name as account_name, d.note, d.status, d.recorded_by,
           ur.display_name as recorded_by_name, d.recorded_at, uc.display_name as confirmed_by_name, d.confirmed_at,
           app.deposit_applied(d.id) as applied, d.resolved_amount, us.display_name as resolved_by_name, d.resolved_at,
           d.resolve_reason, d.suggested_action, d.void_reason, d.needs_owner_review, d.reviewed_at, d.version
    from appointment_deposits d
    join money_accounts m on m.id = d.money_account_id
    left join users ur on ur.id = d.recorded_by
    left join users uc on uc.id = d.confirmed_by
    left join users us on us.id = d.resolved_by
    where d.appointment_id = ${a.id}
    order by d.recorded_at`
  const [sg] = await tx<{ suggestion: 'refund' | 'forfeit' | null; hours: number | null }[]>`
    select app.deposit_suggestion(${a.id}) as suggestion,
           (select refund_notice_hours from deposit_seasons where id = ${a.depositSeasonId}) as hours`
  const items = rows.map((r): DepositView => {
    const applied = n(r.applied)
    const remaining = r.status === 'confirmed' ? n(r.amount) - applied - n(r.resolvedAmount) : 0
    const needsReview = r.needsOwnerReview && !r.reviewedAt
    return {
      id: r.id,
      amount: n(r.amount),
      method: r.method,
      accountName: r.accountName,
      note: r.note,
      status: r.status,
      recordedByName: r.recordedByName,
      recordedAt: new Date(r.recordedAt).toISOString(),
      confirmedByName: r.confirmedByName,
      confirmedAt: r.confirmedAt ? new Date(r.confirmedAt).toISOString() : null,
      applied,
      remaining,
      resolvedAmount: r.resolvedAmount == null ? null : n(r.resolvedAmount),
      resolvedByName: r.resolvedByName,
      resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
      resolveReason: r.resolveReason,
      suggestedAction: r.suggestedAction,
      voidReason: r.voidReason,
      needsOwnerReview: needsReview,
      version: r.version,
      can: depositCan(
        perms,
        auth.userId,
        { status: r.status, recordedBy: r.recordedBy, remaining, applied, needsReview },
        a.status,
      ),
    }
  })
  const pendingAmount = items.filter((i) => i.status === 'recorded').reduce((s, i) => s + i.amount, 0)
  const heldAmount = items.reduce((s, i) => s + i.remaining, 0)
  const perGuest = n(a.depositPerGuest)
  return {
    perGuest,
    suggested: perGuest * a.guestCount,
    state: depositState(
      true,
      a.status,
      pendingAmount,
      heldAmount,
      items.some((i) => i.status !== 'voided'),
    )!,
    pendingAmount,
    heldAmount,
    suggestion: sg?.suggestion ?? null,
    refundNoticeHours: sg?.hours ?? 12,
    items,
    can: { record: perms.includes('deposits.record') && OPEN_APPT.includes(a.status) },
  }
}
