// Bảng lương (Đợt 4B, bước 4.12, 4.15–4.17; PRD §9, UI10; D04, Q34, Q39, Q40, K20, K22; test 9–14, 23, 25, 41).
// Số liệu do DB tính (app.payroll_view: tháng đã khoá → phiếu đã chụp; chưa khoá → tính tạm). Linh, Nhung xem cả quán
// (mỗi lần mở có audit, Q40); thợ chỉ phiếu của mình (Q39). Linh khoá từ ngày nháp, thêm thưởng/khấu trừ, trả lương.
import { addMonths, isYearMonth, monthRange } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, notFound } from '../http/errors'
import { type StaffGap, staffGaps } from '../staff/service'

const n = (v: unknown) => Number(v ?? 0)
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

type ViewRow = {
  userId: string
  locked: boolean
  payMethod: 'cash' | 'transfer'
  daysInMonth: number
  leaveAllowance: number
  standardDays: number
  absentDays: number
  pendingDays: number
  closedDays: number
  baseSalary: string
  attendanceAdjustment: string
  commissionBps: number
  commissionBase: string
  commission: string
  managerKpi: boolean
  shopRevenue: string
  kpiBps: number
  kpiBonus: string
  bonus: string
  deduction: string
  hourlyLeaveMinutes: number
  hourlyLeaveDeduction: string
  carryIn: string
  grossPay: string
  advances: string
  carriedOut: string
  payable: string
  paid: string
}

function lineOf(r: ViewRow, name: string) {
  const payable = n(r.payable)
  const paid = n(r.paid)
  return {
    userId: r.userId,
    name,
    payMethod: r.payMethod,
    daysInMonth: r.daysInMonth,
    leaveAllowance: r.leaveAllowance,
    standardDays: r.standardDays,
    absentDays: r.absentDays,
    pendingDays: r.pendingDays,
    closedDays: r.closedDays,
    baseSalary: n(r.baseSalary),
    attendanceAdjustment: n(r.attendanceAdjustment),
    commissionBps: r.commissionBps,
    commissionBase: n(r.commissionBase),
    commission: n(r.commission),
    managerKpi: r.managerKpi,
    shopRevenue: r.managerKpi ? n(r.shopRevenue) : null,
    kpiBps: r.kpiBps,
    kpiBonus: n(r.kpiBonus),
    bonus: n(r.bonus),
    deduction: n(r.deduction),
    hourlyLeaveMinutes: r.hourlyLeaveMinutes ?? 0,
    hourlyLeaveDeduction: n(r.hourlyLeaveDeduction),
    carryIn: n(r.carryIn),
    grossPay: n(r.grossPay),
    advances: n(r.advances),
    carriedOut: n(r.carriedOut),
    payable,
    paid,
    remaining: payable - paid,
  }
}

export type PayLine = ReturnType<typeof lineOf>

async function settingsOf(tx: Tx, branchId: string) {
  const [s] = await tx<{ startMonth: string | null; draftDay: number; payDay: number; today: string }[]>`
    select (select start_month::text from payroll_settings where branch_id = ${branchId}) as start_month,
           coalesce((select draft_day from payroll_settings where branch_id = ${branchId}), 5) as draft_day,
           coalesce((select pay_day from payroll_settings where branch_id = ${branchId}), 10) as pay_day,
           app.branch_today(${branchId})::text as today`
  return s!
}

async function viewRows(tx: Tx, branchId: string, first: string) {
  const rows = await tx<ViewRow[]>`
    select p.*, coalesce(h.hourly_leave_minutes, 0) as hourly_leave_minutes,
           coalesce(h.hourly_leave_deduction, 0) as hourly_leave_deduction
    from app.payroll_view(${branchId}, ${first}::date) p
    left join app.payroll_hourly(${branchId}, ${first}::date) h on h.user_id = p.user_id`
  const who = new Map(
    (
      await tx<{ userId: string; displayName: string }[]>`
        select user_id, display_name from app.staff_people(${branchId})`
    ).map((p) => [p.userId, p.displayName]),
  )
  return rows
    .map((r) => lineOf(r, who.get(r.userId) ?? '—'))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

function requireRead(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  const all = hasPerm(auth, branch.id, 'payroll.read_all_branch')
  if (!all && !hasPerm(auth, branch.id, 'payroll.read_own')) throw forbidden('Không có quyền xem lương.')
  return { branch, all }
}

/** Ngày được khoá (ngày nháp) và ngày trả của bảng lương tháng ym */
function datesOf(ym: string, draftDay: number, payDay: number) {
  const next = addMonths(ym, 1)
  const pad = (d: number) => String(d).padStart(2, '0')
  return { draftDate: `${next}-${pad(draftDay)}`, payDate: `${next}-${pad(payDay)}` }
}

export type PayrollStatus = 'before_start' | 'provisional' | 'closing' | 'draft' | 'locked'

/** Bảng lương một tháng (UI10). Thợ: chỉ dòng của mình. */
export async function payrollMonth(auth: Auth, input: { branchId?: string; month?: string }) {
  const { branch, all } = requireRead(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const s = await settingsOf(tx, branch.id)
    const ym = input.month && isYearMonth(input.month) ? input.month : s.today.slice(0, 7)
    const { first, last } = monthRange(ym)
    const { draftDate, payDate } = datesOf(ym, s.draftDay, s.payDay)
    const [lk] = await tx<{ locked: boolean; prevLocked: boolean }[]>`
      select app.payroll_month_locked(${branch.id}, ${first}::date) as locked,
             app.payroll_month_locked(${branch.id}, (${first}::date - interval '1 month')::date) as prev_locked`
    const locked = !!lk?.locked
    const status: PayrollStatus =
      !s.startMonth || first < s.startMonth
        ? 'before_start'
        : locked
          ? 'locked'
          : last >= s.today
            ? 'provisional'
            : s.today >= draftDate
              ? 'draft'
              : 'closing'
    const lines = status === 'before_start' ? [] : await viewRows(tx, branch.id, first)
    const pendingDays = lines.reduce((a, l) => a + l.pendingDays, 0)
    // Cảnh báo trước khi khoá (Linh, Nhung): tạm ứng đã duyệt chưa chi, đơn chưa xác nhận của tháng
    let warnings = { advancesUnpaid: 0, ordersOpen: 0, missingPolicy: [] as string[] }
    if (all && status !== 'before_start' && !locked) {
      const [w] = await tx<{ advances: string; orders: string; missing: string[] | null }[]>`
        select (select count(*) from employee_advances where branch_id = ${branch.id} and status = 'approved'
                  and request_month = ${first}::date) as advances,
               (select count(*) from orders where branch_id = ${branch.id}
                  and status in ('in_progress', 'awaiting_confirmation')
                  and service_date between ${first}::date and ${last}::date) as orders,
               (select array_agg(u.display_name order by u.display_name)
                from staff_profiles sp join users u on u.id = sp.user_id
                where sp.branch_id = ${branch.id} and sp.start_date <= ${last}::date
                  and (sp.end_date is null or sp.end_date >= ${first}::date)
                  and app._base_salary(${branch.id}, sp.user_id, ${first}::date) is null) as missing`
      warnings = { advancesUnpaid: n(w?.advances), ordersOpen: n(w?.orders), missingPolicy: w?.missing ?? [] }
    }
    // Q40: mọi lần xem bảng lương toàn quán ghi audit
    if (all && lines.length > 0) {
      await tx`
        insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
        values (${auth.userId}, ${branch.id}, 'payroll.viewed_branch', 'branch', ${branch.id},
                ${tx.json({ month: ym })})`
    }
    const canLock =
      hasPerm(auth, branch.id, 'payroll.approve_lock') &&
      status === 'draft' &&
      pendingDays === 0 &&
      warnings.missingPolicy.length === 0 &&
      (first === s.startMonth || !!lk?.prevLocked)
    return {
      month: ym,
      today: s.today,
      startMonth: s.startMonth,
      status,
      draftDate,
      payDate,
      all,
      lines,
      pendingDays,
      warnings,
      totals: {
        grossPay: lines.reduce((a, l) => a + l.grossPay, 0),
        advances: lines.reduce((a, l) => a + l.advances, 0),
        payable: lines.reduce((a, l) => a + l.payable, 0),
        paid: lines.reduce((a, l) => a + l.paid, 0),
        remaining: lines.reduce((a, l) => a + l.remaining, 0),
      },
      can: {
        lock: canLock,
        edit: hasPerm(auth, branch.id, 'payroll.edit') && !locked && status !== 'before_start',
        pay: hasPerm(auth, branch.id, 'payroll.pay') && locked,
      },
    }
  })
}

export type PayrollMonth = Awaited<ReturnType<typeof payrollMonth>>

/** Phiếu lương một người: đủ tham số, hoa hồng theo đơn, điều chỉnh, tạm ứng, đã trả. */
export async function payslip(auth: Auth, input: { branchId?: string; month: string; userId: string }) {
  const { branch, all } = requireRead(auth, input.branchId)
  if (!isUuid(input.userId) || !isYearMonth(input.month)) throw notFound('Không tìm thấy phiếu lương.')
  if (!all && input.userId !== auth.userId) throw forbidden('Chỉ xem được lương của mình.')
  return withUser(auth.userId, async (tx) => {
    const { first } = monthRange(input.month)
    const line = (await viewRows(tx, branch.id, first)).find((l) => l.userId === input.userId)
    if (!line) throw notFound('Không có phiếu lương của người này trong tháng.')
    // Hoa hồng theo đơn (RLS: thợ chỉ dòng của mình); dòng của tháng khác dời sang là điều chỉnh (D04, Q34)
    const orders = await tx<
      {
        orderId: string
        code: number
        serviceDate: string
        naturalMonth: string
        base: string
        refund: boolean
      }[]
    >`
      select e.order_id, o.code, o.service_date::text, e.natural_month::text, sum(e.commission_base) as base,
             bool_or(e.source_type = 'refund') as refund
      from payroll_revenue_entries e join orders o on o.id = e.order_id
      where e.branch_id = ${branch.id} and e.payroll_month = ${first}::date and e.staff_user_id = ${input.userId}
      group by e.order_id, o.code, o.service_date, e.natural_month
      having sum(e.commission_base) <> 0
      order by o.service_date, o.code`
    const adjustments = await tx<
      {
        id: string
        kind: 'bonus' | 'deduction' | 'carry'
        amount: string
        reason: string
        sourceMonth: string | null
        createdByName: string | null
        voidedAt: Date | null
      }[]
    >`
      select a.id, a.kind, a.amount, a.reason, a.source_month::text, u.display_name as created_by_name, a.voided_at
      from payroll_adjustments a left join users u on u.id = a.created_by
      where a.branch_id = ${branch.id} and a.payroll_month = ${first}::date and a.user_id = ${input.userId}
      order by a.created_at`
    const advances = await tx<{ id: string; amount: string; reason: string; paidAt: Date }[]>`
      select id, amount, reason, paid_at from employee_advances
      where branch_id = ${branch.id} and payroll_month = ${first}::date and user_id = ${input.userId}
        and status = 'paid'
      order by paid_at`
    const payouts = await tx<{ id: string; amount: string; accountName: string; paidAt: Date }[]>`
      select p.id, p.amount, m.name as account_name, p.paid_at
      from payroll_payouts p join money_accounts m on m.id = p.money_account_id
      where p.branch_id = ${branch.id} and p.payroll_month = ${first}::date and p.user_id = ${input.userId}
      order by p.paid_at`
    const [lk] = await tx<{ locked: boolean }[]>`
      select app.payroll_month_locked(${branch.id}, ${first}::date) as locked`
    const locked = !!lk?.locked
    return {
      month: input.month,
      locked,
      line,
      orders: orders.map((o) => ({
        orderId: o.orderId,
        code: o.code,
        serviceDate: o.serviceDate,
        // Dòng của tháng khác (đơn xác nhận muộn, sửa, hoàn sau khi khoá)
        moved: o.naturalMonth !== first,
        refund: o.refund,
        base: n(o.base),
      })),
      adjustments: adjustments.map((a) => ({
        id: a.id,
        kind: a.kind,
        amount: n(a.amount),
        reason: a.reason,
        sourceMonth: a.sourceMonth,
        createdByName: a.createdByName,
        voided: !!a.voidedAt,
      })),
      advances: advances.map((a) => ({
        id: a.id,
        amount: n(a.amount),
        reason: a.reason,
        paidAt: new Date(a.paidAt).toISOString(),
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        amount: n(p.amount),
        accountName: p.accountName,
        paidAt: new Date(p.paidAt).toISOString(),
      })),
      can: {
        adjust: hasPerm(auth, branch.id, 'payroll.edit') && !locked,
        pay: hasPerm(auth, branch.id, 'payroll.pay') && locked && line.remaining > 0,
      },
    }
  })
}

export type Payslip = Awaited<ReturnType<typeof payslip>>

export async function lockMonth(auth: Auth, input: { branchId?: string; month: string }) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'payroll.approve_lock')) throw forbidden('Chỉ chủ quán khoá bảng lương.')
  const { first } = monthRange(input.month)
  await withUser(auth.userId, async (tx) => {
    const [lk] = await tx<{ locked: boolean }[]>`
      select app.payroll_month_locked(${branch.id}, ${first}::date) as locked`
    if (lk?.locked) throw conflict('Bảng lương tháng này đã khoá.')
    await tx`select app.payroll_lock(${branch.id}, ${first}::date)`
  })
  return payrollMonth(auth, { branchId: branch.id, month: input.month })
}

export async function addAdjustment(
  auth: Auth,
  input: {
    branchId?: string
    month: string
    userId: string
    kind: 'bonus' | 'deduction'
    amount: number
    reason: string
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'payroll.edit')) throw forbidden('Chỉ chủ quán thêm thưởng, khấu trừ.')
  const { first } = monthRange(input.month)
  await withUser(
    auth.userId,
    (tx) => tx`select app.payroll_adjustment_add(${branch.id}, ${input.userId}, ${first}::date, ${input.kind},
                                                 ${input.amount}, ${input.reason.trim()})`,
  )
  return payslip(auth, { branchId: branch.id, month: input.month, userId: input.userId })
}

export async function voidAdjustment(auth: Auth, id: string, input: { reason?: string | null }) {
  if (!isUuid(id)) throw notFound('Không tìm thấy khoản điều chỉnh.')
  const [a] = await withUser(auth.userId, async (tx) => {
    await tx`select app.payroll_adjustment_void(${id}, ${input.reason ?? null})`
    return tx<{ branchId: string; userId: string; month: string }[]>`
      select branch_id, user_id, to_char(payroll_month, 'YYYY-MM') as month from payroll_adjustments where id = ${id}`
  })
  if (!a) throw notFound('Không tìm thấy khoản điều chỉnh.')
  return payslip(auth, { branchId: a.branchId, month: a.month, userId: a.userId })
}

export async function payOut(
  auth: Auth,
  input: {
    branchId?: string
    month: string
    userId: string
    amount: number
    method: 'cash' | 'transfer'
    idempotencyKey: string
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'payroll.pay')) throw forbidden('Chỉ chủ quán trả lương.')
  const { first } = monthRange(input.month)
  await withUser(
    auth.userId,
    (tx) => tx`select app.payroll_pay(${branch.id}, ${input.userId}, ${first}::date, ${input.amount},
                                      ${input.method}, ${input.idempotencyKey})`,
  )
  return payslip(auth, { branchId: branch.id, month: input.month, userId: input.userId })
}

// ---------------------------------------------------------------- Tổng quan, báo cáo

/** Lương tạm tính tháng này của chính mình (Q39); null khi chưa bắt đầu tính lương trên app hoặc chưa có hồ sơ. */
export async function myPayNow(tx: Tx, auth: Auth, branchId: string) {
  if (!hasPerm(auth, branchId, 'payroll.read_own')) return null
  const s = await settingsOf(tx, branchId)
  const first = `${s.today.slice(0, 7)}-01`
  if (!s.startMonth || first < s.startMonth) return null
  const [r] = await tx<{ grossPay: string; advances: string; commission: string }[]>`
    select gross_pay, advances, commission from app.payroll_view(${branchId}, ${first}::date)
    where user_id = ${auth.userId}`
  return r
    ? {
        month: s.today.slice(0, 7),
        grossPay: n(r.grossPay),
        advances: n(r.advances),
        commission: n(r.commission),
      }
    : null
}

/**
 * Cần xử lý: tạm ứng chờ duyệt (Linh), chờ chi (Nhung, Linh); bảng lương chờ khoá (Linh, từ ngày nháp); lương chưa trả;
 * người thiếu hồ sơ / chính sách lương (Linh, người sửa được, S39).
 */
export async function payrollAttention(tx: Tx, auth: Auth, branchId: string) {
  const approve = hasPerm(auth, branchId, 'advance.approve')
  const manage = hasPerm(auth, branchId, 'cashbook.manage')
  const lock = hasPerm(auth, branchId, 'payroll.approve_lock')
  const pay = hasPerm(auth, branchId, 'payroll.pay')
  const edit = hasPerm(auth, branchId, 'payroll.edit')
  const out = {
    advancesToApprove: 0,
    advancesToPay: 0,
    payrollToLock: null as string | null,
    payrollUnpaid: 0,
    staffMissing: [] as { userId: string; name: string; gap: StaffGap }[],
  }
  if (edit) out.staffMissing = await staffGaps(tx, branchId)
  if (!approve && !manage && !lock && !pay) return out
  const [c] = await tx<{ requested: string; approved: string; unpaid: string }[]>`
    select (select count(*) from employee_advances where branch_id = ${branchId} and status = 'requested') as requested,
           (select count(*) from employee_advances where branch_id = ${branchId} and status = 'approved') as approved,
           (select count(*) from payroll_lines l where l.branch_id = ${branchId}
              and l.payable > coalesce((select sum(p.amount) from payroll_payouts p where p.branch_id = l.branch_id
                                        and p.payroll_month = l.month and p.user_id = l.user_id), 0)) as unpaid`
  out.advancesToApprove = approve ? n(c?.requested) : 0
  out.advancesToPay = manage ? n(c?.approved) : 0
  out.payrollUnpaid = pay ? n(c?.unpaid) : 0
  if (lock) {
    const s = await settingsOf(tx, branchId)
    if (s.startMonth) {
      const [m] = await tx<{ month: string | null }[]>`
        select to_char(min(g)::date, 'YYYY-MM') as month
        from generate_series(${s.startMonth}::date, ${s.today}::date, interval '1 month') g
        where not app.payroll_month_locked(${branchId}, g::date)`
      if (m?.month && s.today >= datesOf(m.month, s.draftDay, s.payDay).draftDate) out.payrollToLock = m.month
    }
  }
  return out
}

/** Báo cáo tháng (PRD §11): lương phải trả, đã trả, tạm ứng, KPI quản lý — Linh, Nhung. */
export async function payrollSummary(tx: Tx, auth: Auth, branchId: string, month: string) {
  if (!hasPerm(auth, branchId, 'payroll.read_all_branch')) return null
  const s = await settingsOf(tx, branchId)
  const { first } = monthRange(month)
  if (!s.startMonth || first < s.startMonth) return null
  const lines = await viewRows(tx, branchId, first)
  const [lk] = await tx<
    { locked: boolean }[]
  >`select app.payroll_month_locked(${branchId}, ${first}::date) as locked`
  return {
    locked: !!lk?.locked,
    people: lines.length,
    grossPay: lines.reduce((a, l) => a + l.grossPay, 0),
    commission: lines.reduce((a, l) => a + l.commission, 0),
    kpiBonus: lines.reduce((a, l) => a + l.kpiBonus, 0),
    advances: lines.reduce((a, l) => a + l.advances, 0),
    paid: lines.reduce((a, l) => a + l.paid, 0),
    remaining: lines.reduce((a, l) => a + l.remaining, 0),
  }
}
