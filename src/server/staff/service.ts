// Nhân viên (Đợt 4A, bước 4.2–4.3; PRD §8, §9.2; UI09): hồ sơ (ngày vào/nghỉ, cách nhận lương), chính sách lương
// theo tháng (lương cứng, % hoa hồng, ngày nghỉ được hưởng, thưởng KPI quản lý), mốc KPI, tháng bắt đầu tính lương.
// Linh (payroll.edit) sửa; Nhung (payroll.read_all_branch) chỉ xem. DB kiểm lại quyền, ngày 1 của tháng (test 40) và
// tháng đã khoá (test 13).
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden } from '../http/errors'

const n = (v: unknown) => Number(v ?? 0)

type PolicyRow = {
  userId: string
  effectiveMonth: string
  baseSalary: string
  commissionBps: number
  leaveDays: number
  managerKpi: boolean
  reason: string | null
  updatedAt: Date
}

const policyView = (p: PolicyRow) => ({
  effectiveMonth: p.effectiveMonth,
  baseSalary: n(p.baseSalary),
  commissionBps: p.commissionBps,
  leaveDays: p.leaveDays,
  managerKpi: p.managerKpi,
  reason: p.reason,
  updatedAt: new Date(p.updatedAt).toISOString(),
})

export type PolicyView = ReturnType<typeof policyView>

export async function listPeople(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  const readAll = hasPerm(auth, branch.id, 'payroll.read_all_branch')
  const edit = hasPerm(auth, branch.id, 'payroll.edit')
  if (!readAll && !edit) throw forbidden('Chỉ Linh, Nhung xem hồ sơ nhân viên.')
  return withUser(auth.userId, async (tx) => {
    const people = await tx<
      {
        userId: string
        displayName: string
        isActive: boolean
        roleCode: string | null
        roleName: string | null
      }[]
    >`select user_id, display_name, is_active, role_code, role_name from app.staff_people(${branch.id})`
    const profiles = await tx<
      { userId: string; startDate: string; endDate: string | null; payMethod: 'cash' | 'transfer' }[]
    >`
      select user_id, start_date::text, end_date::text, pay_method from staff_profiles where branch_id = ${branch.id}`
    const policies = await tx<PolicyRow[]>`
      select user_id, effective_month::text, base_salary, commission_bps, leave_days, manager_kpi, reason, updated_at
      from staff_policy_versions where branch_id = ${branch.id}
      order by effective_month desc`
    const kpi = await tx<
      { effectiveMonth: string; tier1Min: string; tier1Bps: number; tier2Min: string; tier2Bps: number }[]
    >`
      select effective_month::text, tier1_min, tier1_bps, tier2_min, tier2_bps
      from kpi_policy_versions where branch_id = ${branch.id} order by effective_month desc`
    const [s] = await tx<{ startMonth: string | null; today: string; lockedUntil: string | null }[]>`
      select (select start_month::text from payroll_settings where branch_id = ${branch.id}) as start_month,
             app.branch_today(${branch.id})::text as today,
             app.payroll_locked_until(${branch.id})::text as locked_until`
    const today = s!.today
    const month = `${today.slice(0, 7)}-01`
    return {
      today,
      lockedUntil: s!.lockedUntil,
      startMonth: s!.startMonth,
      people: people.map((p) => {
        const mine = policies.filter((x) => x.userId === p.userId)
        const current = mine.find((x) => x.effectiveMonth <= month) ?? null
        return {
          userId: p.userId,
          name: p.displayName,
          active: p.isActive,
          roleName: p.roleName,
          profile: profiles.find((x) => x.userId === p.userId) ?? null,
          current: current ? policyView(current) : null,
          policies: mine.map(policyView),
        }
      }),
      kpi: kpi.map((k) => ({
        effectiveMonth: k.effectiveMonth,
        tier1Min: n(k.tier1Min),
        tier1Bps: k.tier1Bps,
        tier2Min: n(k.tier2Min),
        tier2Bps: k.tier2Bps,
      })),
      can: { edit },
    }
  })
}

export type PeopleData = Awaited<ReturnType<typeof listPeople>>

export type StaffGap = 'profile' | 'policy'

/**
 * Tài khoản đang dùng app nhưng thiếu hồ sơ nhân viên, hoặc có hồ sơ (chưa nghỉ việc) mà chưa có chính sách lương của
 * tháng đang làm: chưa vào ca, đăng ký nghỉ, tính lương được. Để Linh thấy ở Tài khoản, Cần xử lý. Người gọi kiểm
 * quyền; RLS chỉ cho người xem bảng lương toàn quán đọc hồ sơ, chính sách của người khác.
 */
export async function staffGaps(tx: Tx, branchId: string) {
  return tx<{ userId: string; name: string; gap: StaffGap }[]>`
    select p.user_id, p.display_name as name, case when sp.user_id is null then 'profile' else 'policy' end as gap
    from app.staff_people(${branchId}) p
    cross join (select app.branch_today(${branchId}) as today) t
    left join staff_profiles sp on sp.user_id = p.user_id and sp.branch_id = ${branchId}
    where p.is_active
      and (sp.user_id is null
           or ((sp.end_date is null or sp.end_date >= t.today)
               and app._base_salary(${branchId}, p.user_id,
                                    date_trunc('month', greatest(sp.start_date, t.today))::date) is null))
    order by p.display_name`
}

function requireEdit(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'payroll.edit')) throw forbidden('Chỉ chủ quán sửa hồ sơ, chính sách lương.')
  return branch
}

export async function saveProfile(
  auth: Auth,
  input: {
    branchId?: string
    userId: string
    startDate: string
    endDate: string | null
    payMethod: 'cash' | 'transfer'
  },
) {
  const branch = requireEdit(auth, input.branchId)
  await withUser(auth.userId, async (tx) => {
    await tx`select app.staff_profile_save(${branch.id}, ${input.userId}, ${input.startDate}::date,
                                           ${input.endDate}::date, ${input.payMethod})`
  })
  return listPeople(auth, branch.id)
}

export async function savePolicy(
  auth: Auth,
  input: {
    branchId?: string
    userId: string
    effectiveMonth: string
    baseSalary: number
    commissionBps: number
    leaveDays: number
    managerKpi: boolean
    reason?: string | null
  },
) {
  const branch = requireEdit(auth, input.branchId)
  await withUser(auth.userId, async (tx) => {
    await tx`select app.staff_policy_save(${branch.id}, ${input.userId}, ${input.effectiveMonth}::date,
                                          ${input.baseSalary}, ${input.commissionBps}, ${input.leaveDays},
                                          ${input.managerKpi}, ${input.reason ?? null})`
  })
  return listPeople(auth, branch.id)
}

export async function saveKpi(
  auth: Auth,
  input: {
    branchId?: string
    effectiveMonth: string
    tier1Min: number
    tier1Bps: number
    tier2Min: number
    tier2Bps: number
  },
) {
  const branch = requireEdit(auth, input.branchId)
  await withUser(auth.userId, async (tx) => {
    await tx`select app.kpi_policy_save(${branch.id}, ${input.effectiveMonth}::date, ${input.tier1Min},
                                        ${input.tier1Bps}, ${input.tier2Min}, ${input.tier2Bps})`
  })
  return listPeople(auth, branch.id)
}

export async function saveSettings(auth: Auth, input: { branchId?: string; startMonth: string | null }) {
  const branch = requireEdit(auth, input.branchId)
  await withUser(auth.userId, async (tx) => {
    await tx`select app.payroll_settings_save(${branch.id}, ${input.startMonth}::date)`
  })
  return listPeople(auth, branch.id)
}
