// Chấm công (Đợt 4A, bước 4.5, 4.7, 4.8; PRD §8, UI08, UI09; A01, C05, Q27–Q29, Q35; test 23).
// Mỗi người 1 ca fulltime mỗi ngày = 1 công. Vào ca / Ra ca: giờ do DB ghi, chỉ chính mình, chỉ hôm nay. Nhung, Linh
// (attendance.approve) duyệt: đi làm / nghỉ có phép / nghỉ không phép; bổ sung công và đổi quyết định cần lý do.
// Trạng thái từng ngày tính trong DB (app.attendance_grid): ngày chưa duyệt không phải ngày vắng.
import { countDays, type DayStatus, type LeaveStatus } from '~/lib/attendance'
import { addDays, isIsoDate, isYearMonth, monthRange } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden } from '../http/errors'

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)

type GridRow = {
  userId: string
  workDate: string
  status: DayStatus
  checkInAt: Date | null
  checkOutAt: Date | null
  note: string | null
  decidedStatus: 'worked' | 'leave' | 'unexcused' | null
  leaveId: string | null
  closedReason: string | null
}

async function grid(tx: Tx, branchId: string, from: string, to: string) {
  return tx<GridRow[]>`
    select user_id, work_date::text, status, check_in_at, check_out_at, note, decided_status, leave_id, closed_reason
    from app.attendance_grid(${branchId}, ${from}::date, ${to}::date)`
}

const dayOf = (r: GridRow) => ({
  date: r.workDate,
  status: r.status,
  /** Quyết định của Nhung, Linh trên ngày này (null = chưa quyết; nghỉ đã duyệt qua đơn không tính) */
  decided: r.decidedStatus,
  checkIn: iso(r.checkInAt),
  checkOut: iso(r.checkOutAt),
  note: r.note,
  hasLeave: !!r.leaveId,
  closedReason: r.closedReason,
})

export type DayView = ReturnType<typeof dayOf>

async function todayOf(tx: Tx, branchId: string) {
  const [t] = await tx<{ today: string; lockedUntil: string | null }[]>`
    select app.branch_today(${branchId})::text as today, app.payroll_locked_until(${branchId})::text as locked_until`
  return { today: t!.today, lockedUntil: t!.lockedUntil }
}

async function names(tx: Tx, branchId: string) {
  const rows = await tx<{ userId: string; displayName: string }[]>`
    select user_id, display_name from app.staff_people(${branchId})`
  return new Map(rows.map((r) => [r.userId, r.displayName]))
}

// ---------------------------------------------------------------- Đơn nghỉ (đọc)

type LeaveRow = {
  id: string
  branchId: string
  userId: string
  userName: string | null
  fromDate: string
  toDate: string
  reason: string
  status: LeaveStatus
  requestedAt: Date
  decidedByName: string | null
  decidedAt: Date | null
  cancelledByName: string | null
  decideNote: string | null
  version: number
}

export const LEAVE_SELECT = (tx: Tx) => tx`
  select l.id, l.branch_id, l.user_id, u.display_name as user_name, l.from_date::text, l.to_date::text, l.reason,
         l.status, l.requested_at, ud.display_name as decided_by_name, l.decided_at,
         uc.display_name as cancelled_by_name, l.decide_note, l.version
  from leave_requests l
  left join users u on u.id = l.user_id
  left join users ud on ud.id = l.decided_by
  left join users uc on uc.id = l.cancelled_by`

export function leaveView(auth: Auth, r: LeaveRow) {
  const perms = auth.branches.find((b) => b.id === r.branchId)?.perms ?? []
  const approver = perms.includes('attendance.approve')
  const mine = r.userId === auth.userId
  const days = Math.round((Date.parse(r.toDate) - Date.parse(r.fromDate)) / 86_400_000) + 1
  return {
    id: r.id,
    userId: r.userId,
    name: r.userName,
    mine,
    fromDate: r.fromDate,
    toDate: r.toDate,
    days,
    reason: r.reason,
    status: r.status,
    requestedAt: new Date(r.requestedAt).toISOString(),
    decidedByName: r.decidedByName,
    decidedAt: iso(r.decidedAt),
    cancelledByName: r.cancelledByName,
    decideNote: r.decideNote,
    version: r.version,
    can: {
      approve: r.status === 'requested' && approver,
      reject: r.status === 'requested' && approver,
      cancel: (r.status === 'requested' && (mine || approver)) || (r.status === 'approved' && approver),
    },
  }
}

export type LeaveView = ReturnType<typeof leaveView>

// ---------------------------------------------------------------- Hôm nay của tôi (thẻ Tổng quan)

export async function myToday(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'attendance.own')) throw forbidden()
  return withUser(auth.userId, async (tx) => {
    const { today } = await todayOf(tx, branch.id)
    const [row] = (await grid(tx, branch.id, today, today)).filter((r) => r.userId === auth.userId)
    return {
      today,
      // Chưa có hồ sơ: không hiện thẻ Vào ca
      hasProfile: !!row,
      day: row ? dayOf(row) : null,
      canCheckIn: !!row && row.status !== 'out',
    }
  })
}

export type MyToday = Awaited<ReturnType<typeof myToday>>

export async function checkIn(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'attendance.own')) throw forbidden('Không có quyền chấm công.')
  await withUser(auth.userId, (tx) => tx`select app.attendance_check_in(${branch.id})`)
  return myToday(auth, branch.id)
}

export async function checkOut(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'attendance.own')) throw forbidden('Không có quyền chấm công.')
  await withUser(auth.userId, (tx) => tx`select app.attendance_check_out(${branch.id})`)
  return myToday(auth, branch.id)
}

// ---------------------------------------------------------------- Tháng của tôi

function monthOf(input: string | undefined, today: string) {
  const ym = input && isYearMonth(input) ? input : today.slice(0, 7)
  return { ym, ...monthRange(ym) }
}

export async function myMonth(auth: Auth, input: { branchId?: string; month?: string }) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'attendance.own')) throw forbidden()
  return withUser(auth.userId, async (tx) => {
    const { today, lockedUntil } = await todayOf(tx, branch.id)
    const m = monthOf(input.month, today)
    const days = (await grid(tx, branch.id, m.first, m.last))
      .filter((r) => r.userId === auth.userId)
      .map(dayOf)
    const [profile] = await tx<{ startDate: string; endDate: string | null }[]>`
      select start_date::text, end_date::text from staff_profiles
      where branch_id = ${branch.id} and user_id = ${auth.userId}`
    const [policy] = await tx<{ leaveDays: number }[]>`
      select leave_days from staff_policy_versions
      where branch_id = ${branch.id} and user_id = ${auth.userId} and effective_month <= ${m.first}::date
      order by effective_month desc limit 1`
    const leaves = await tx<LeaveRow[]>`
      ${LEAVE_SELECT(tx)}
      where l.branch_id = ${branch.id} and l.user_id = ${auth.userId}
        and (l.status = 'requested' or (l.from_date <= ${m.last}::date and l.to_date >= ${m.first}::date))
      order by l.from_date desc
      limit 50`
    return {
      month: m.ym,
      today,
      lockedUntil,
      profile: profile ?? null,
      leaveDays: policy?.leaveDays ?? null,
      days,
      counts: countDays(days),
      leaves: leaves.map((l) => leaveView(auth, l)),
    }
  })
}

// ---------------------------------------------------------------- Duyệt công theo ngày (Nhung, Linh)

export async function dayBoard(auth: Auth, input: { branchId?: string; date?: string }) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'attendance.approve')) throw forbidden('Chỉ Nhung, Linh duyệt công.')
  return withUser(auth.userId, async (tx) => {
    const { today, lockedUntil } = await todayOf(tx, branch.id)
    const date = input.date && isIsoDate(input.date) && input.date <= today ? input.date : today
    const who = await names(tx, branch.id)
    const rows = (await grid(tx, branch.id, date, date)).filter((r) => r.status !== 'out')
    const pendingLeaves = await tx<LeaveRow[]>`
      ${LEAVE_SELECT(tx)}
      where l.branch_id = ${branch.id} and l.status = 'requested'
      order by l.from_date
      limit 100`
    const people = rows
      .map((r) => ({ userId: r.userId, name: who.get(r.userId) ?? '—', ...dayOf(r) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    return {
      date,
      today,
      lockedUntil,
      locked: !!lockedUntil && date <= lockedUntil,
      people,
      checkedInPending: people.filter((p) => p.status === 'pending' && p.checkIn).length,
      pendingLeaves: pendingLeaves.map((l) => leaveView(auth, l)),
    }
  })
}

export type DayBoard = Awaited<ReturnType<typeof dayBoard>>

export async function decideDay(
  auth: Auth,
  input: {
    branchId?: string
    userId: string
    date: string
    status: 'worked' | 'leave' | 'unexcused'
    note?: string | null
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'attendance.approve')) throw forbidden('Chỉ Nhung, Linh duyệt công.')
  await withUser(
    auth.userId,
    (
      tx,
    ) => tx`select app.attendance_decide(${branch.id}, ${input.userId}, ${input.date}::date, ${input.status},
                                             ${input.note ?? null})`,
  )
  return dayBoard(auth, { branchId: branch.id, date: input.date })
}

export async function approveCheckedIn(auth: Auth, input: { branchId?: string; date: string }) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'attendance.approve')) throw forbidden('Chỉ Nhung, Linh duyệt công.')
  const [r] = await withUser(
    auth.userId,
    (tx) =>
      tx<{ n: number }[]>`select app.attendance_approve_checked_in(${branch.id}, ${input.date}::date) as n`,
  )
  return { approved: r?.n ?? 0, board: await dayBoard(auth, { branchId: branch.id, date: input.date }) }
}

// ---------------------------------------------------------------- Bảng công tháng (UI09)

export async function monthSheet(auth: Auth, input: { branchId?: string; month?: string }) {
  const branch = requireBranch(auth, input.branchId)
  const all =
    hasPerm(auth, branch.id, 'attendance.approve') || hasPerm(auth, branch.id, 'payroll.read_all_branch')
  if (!all && !hasPerm(auth, branch.id, 'attendance.own')) throw forbidden()
  return withUser(auth.userId, async (tx) => {
    const { today, lockedUntil } = await todayOf(tx, branch.id)
    const m = monthOf(input.month, today)
    const who = await names(tx, branch.id)
    // RLS: thợ chỉ thấy dòng của mình
    const rows = (await grid(tx, branch.id, m.first, m.last)).filter((r) => all || r.userId === auth.userId)
    const policies = await tx<{ userId: string; leaveDays: number }[]>`
      select distinct on (user_id) user_id, leave_days from staff_policy_versions
      where branch_id = ${branch.id} and effective_month <= ${m.first}::date
      order by user_id, effective_month desc`
    const byUser = new Map<string, DayView[]>()
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? []
      list.push(dayOf(r))
      byUser.set(r.userId, list)
    }
    const people = [...byUser.entries()]
      // Cả tháng ngoài thời gian làm việc thì không hiện
      .filter(([, days]) => days.some((d) => d.status !== 'out'))
      .map(([userId, days]) => ({
        userId,
        name: who.get(userId) ?? '—',
        leaveDays: policies.find((p) => p.userId === userId)?.leaveDays ?? null,
        days,
        counts: countDays(days),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    return { month: m.ym, first: m.first, last: m.last, today, lockedUntil, all, people }
  })
}

export type MonthSheet = Awaited<ReturnType<typeof monthSheet>>

// ---------------------------------------------------------------- Cần xử lý (Tổng quan)

/**
 * Nhung, Linh: số ngày công chưa duyệt trước hôm nay (từ tháng bắt đầu tính lương; chưa chọn tháng thì chỉ đếm ngày
 * đã vào ca mà chưa duyệt) và số đơn nghỉ chờ duyệt.
 */
export async function attendanceAttention(tx: Tx, auth: Auth, branchId: string) {
  if (!hasPerm(auth, branchId, 'attendance.approve')) return { pendingDays: 0, leavesPending: 0 }
  const [s] = await tx<{ startMonth: string | null; today: string; leaves: string }[]>`
    select (select start_month::text from payroll_settings where branch_id = ${branchId}) as start_month,
           app.branch_today(${branchId})::text as today,
           (select count(*) from leave_requests where branch_id = ${branchId} and status = 'requested') as leaves`
  const yesterday = addDays(s!.today, -1)
  let pendingDays = 0
  if (s!.startMonth) {
    if (s!.startMonth <= yesterday)
      pendingDays = (await grid(tx, branchId, s!.startMonth, yesterday)).filter(
        (r) => r.status === 'pending',
      ).length
  } else {
    const [c] = await tx<{ n: string }[]>`
      select count(*) as n from attendance_days
      where branch_id = ${branchId} and check_in_at is not null and status is null and work_date <= ${yesterday}::date`
    pendingDays = Number(c?.n ?? 0)
  }
  return { pendingDays, leavesPending: Number(s!.leaves ?? 0) }
}
