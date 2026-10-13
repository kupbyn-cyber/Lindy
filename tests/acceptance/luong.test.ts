// Nghiệm thu lương (Đợt 4B, bước 4.11–4.18): PRD §18 test 1 (số tiền hoa hồng), 9, 10, 11, 12, 13, 14 (khoá lương),
// 23 (lương), 25, 34, 36, 38, 39, 41, 42, 53; ví dụ Q35; D04; K20, K21, K22; test bảo mật S55–S61 (kế hoạch Đợt 4
// mục 10.2). Chạy trên cơ sở thử riêng "CS6".
// Tháng ví dụ PRD: F = 07/2026, F2 = 05/2026 (31 ngày). Tháng khoá thử: M = hai tháng trước, M1 = tháng trước.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMonths, monthRange, toLocalDate } from '../../src/lib/time'
import { addClosedDays } from '../../src/server/attendance/closed-days'
import { createLeave } from '../../src/server/attendance/leave'
import { decideDay } from '../../src/server/attendance/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { recordPayment } from '../../src/server/orders/payments'
import { refundOrder } from '../../src/server/orders/refunds'
import { cancelOrder, confirmOrder, createOrder, getOrder, markDone } from '../../src/server/orders/service'
import { actOnAdvance, createAdvance, listAdvances } from '../../src/server/payroll/advances'
import {
  addAdjustment,
  lockMonth,
  payOut,
  payrollMonth,
  payslip,
  voidAdjustment,
} from '../../src/server/payroll/service'
import { monthReport, overview } from '../../src/server/reports/service'
import { savePolicy, saveProfile } from '../../src/server/staff/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
const thisMonth = today.slice(0, 7)
const M = addMonths(thisMonth, -2)
const M1 = addMonths(thisMonth, -1)
const F = '2026-07'
const F2 = '2026-05'
let cs6 = ''

const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id

async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    const db = fromDbError(e)
    if (db) return db
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

/** Ghi công đã duyệt cả tháng (đi làm), trừ các ngày khác đi; ngày null = để trống (chưa duyệt). */
async function fill(k: SeedKey, ym: string, overrides: Record<number, 'leave' | 'unexcused' | null> = {}) {
  const { first, last } = monthRange(ym)
  const skip = Object.keys(overrides).map(Number)
  await owner`
    insert into attendance_days (branch_id, user_id, work_date, status, decided_by, decided_at)
    select ${cs6}, ${uid(k)}, g::date, 'worked', ${uid('linh')}, now()
    from generate_series(${first}::date, ${last}::date, interval '1 day') g
    join staff_profiles sp on sp.branch_id = ${cs6} and sp.user_id = ${uid(k)} and sp.start_date <= g::date
    where not (extract(day from g)::int = any(${skip}::int[]))
    on conflict (branch_id, user_id, work_date) do update set status = excluded.status`
  for (const [day, st] of Object.entries(overrides)) {
    if (!st) continue
    await owner`
      insert into attendance_days (branch_id, user_id, work_date, status, decided_by, decided_at)
      values (${cs6}, ${uid(k)}, ${`${ym}-${day.padStart(2, '0')}`}::date, ${st}, ${uid('linh')}, now())
      on conflict (branch_id, user_id, work_date) do update set status = excluded.status`
  }
}

const slip = (k: SeedKey, month: string, as: SeedKey = 'linh') =>
  payslip(auth(as), { branchId: cs6, month, userId: uid(k) })

/** Đơn đã xác nhận ở CS6: mỗi dòng nhập tay một thợ */
async function confirmedOrder(serviceDate: string, lines: [SeedKey, number, ('custom' | 'surcharge')?][]) {
  const { order } = await createOrder(auth('nhung'), {
    branchId: cs6,
    createRequestId: rid(),
    customerId: null,
    serviceDate,
    items: lines.map(([k, amount, type], i) => ({
      type: type ?? 'custom',
      name: type === 'surcharge' ? 'Phụ thu' : `Dịch vụ ${i + 1}`,
      amount,
      staff: [{ userId: uid(k) }],
    })) as never,
    discounts: [],
  })
  const d = await markDone(auth('nhung'), order.id, order.version)
  return confirmOrder(auth('nhung'), d.id, d.version)
}

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS6', 'Zz cơ sở thử lương', 'CS6') returning id`
  cs6 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs6})`
  await owner`insert into payroll_settings (branch_id, start_month) values (${cs6}, ${`${M}-01`}::date)`
  await owner`
    insert into kpi_policy_versions (branch_id, effective_month, tier1_min, tier1_bps, tier2_min, tier2_bps)
    values (${cs6}, '2026-01-01', 85000000, 100, 102000000, 150)`
  await owner`
    insert into money_accounts (branch_id, code, name, type)
    values (${cs6}, 'cash', 'Tiền mặt CS6', 'cash'), (${cs6}, 'bank', 'Tài khoản CS6', 'bank')`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs6}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  // Bảng tháng 10/2026 (Q31): Linh 3,5tr; Nhung 7tr (KPI, nghỉ 4); Chin 4tr (vào làm 16/07); Trang 3,5tr; hoa hồng 25%
  for (const [k, base, leave, kpi, start, pay] of [
    ['linh', 3_500_000, 3, false, '2026-01-01', 'transfer'],
    ['nhung', 7_000_000, 4, true, '2026-01-01', 'transfer'],
    ['chin', 4_000_000, 3, false, '2026-07-16', 'transfer'],
    ['trang', 3_500_000, 3, false, '2026-01-01', 'cash'],
  ] as const) {
    await saveProfile(auth('linh'), {
      branchId: cs6,
      userId: uid(k),
      startDate: start,
      endDate: null,
      payMethod: pay,
    })
    await savePolicy(auth('linh'), {
      branchId: cs6,
      userId: uid(k),
      effectiveMonth: '2026-01-01',
      baseSalary: base,
      commissionBps: 2500,
      leaveDays: leave,
      managerKpi: kpi,
    })
  }
  // Tết thử: quán đóng 01–05/07
  await addClosedDays(auth('linh'), {
    branchId: cs6,
    fromDate: `${F}-01`,
    toDate: `${F}-05`,
    reason: 'Tết thử',
  })
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs6}`
  await owner.end()
  await closeSql()
})

describe('4.12 — công thức lương (PRD §9.1)', () => {
  it('PRD 9: tháng 31 ngày, nghỉ 2 ngày → +1 ngày lương chia 28', async () => {
    await fill('trang', F, { 10: 'leave', 11: 'unexcused' })
    const l = (await slip('trang', F)).line
    expect(l).toMatchObject({ daysInMonth: 31, standardDays: 28, absentDays: 2, closedDays: 5 })
    expect(l.attendanceAdjustment).toBe(125_000)
    expect(l.grossPay).toBe(3_625_000)
  })

  it('PRD 10: Nhung tháng 31 ngày nghỉ 4 → không đổi; chia 27', async () => {
    await fill('nhung', F, { 20: 'leave', 21: 'leave', 22: 'leave', 23: 'unexcused' })
    const l = (await slip('nhung', F)).line
    expect(l).toMatchObject({ standardDays: 27, absentDays: 4, attendanceAdjustment: 0 })
  })

  it('PRD 38: Tết đóng 5 ngày, không nghỉ thêm → không trừ lương, +3 ngày lương', async () => {
    await fill('linh', F)
    const l = (await slip('linh', F)).line
    expect(l).toMatchObject({
      absentDays: 0,
      closedDays: 5,
      attendanceAdjustment: 375_000,
      grossPay: 3_875_000,
    })
  })

  it('Q35: Chin lương 4.000.000đ vào làm 16/07, đi đủ 16 ngày → 2.285.714đ', async () => {
    await fill('chin', F)
    const l = (await slip('chin', F)).line
    expect(l.absentDays).toBe(15)
    expect(l.baseSalary + l.attendanceAdjustment).toBe(2_285_714)
  })

  it('PRD 39: hết 3 ngày nghỉ, nghỉ không phép thêm 1 ngày → −1 ngày lương', async () => {
    await fill('trang', F2, { 3: 'leave', 4: 'leave', 5: 'leave', 6: 'unexcused' })
    expect((await slip('trang', F2)).line.attendanceAdjustment).toBe(-125_000)
  })

  it('PRD 23 / K20: quên chấm công cả tháng (chưa duyệt) → không bị trừ lương', async () => {
    const l = (await slip('linh', F2)).line
    expect(l).toMatchObject({ pendingDays: 31, absentDays: 0, attendanceAdjustment: 375_000 })
  })

  it('PRD 11: doanh thu quán 84.999.999đ → KPI 0; 85.000.000đ → 1%; 102.000.000đ → 1,5%; người không KPI = 0', async () => {
    const [o] = await owner<{ id: string }[]>`
      insert into orders (branch_id, service_date, gross_amount, discount_amount, net_amount, created_by, updated_by,
                          create_request_id, create_request_hash)
      values (${cs6}, ${`${F}-20`}::date, 0, 0, 0, ${uid('linh')}, ${uid('linh')}, gen_random_uuid(), repeat('0', 64))
      returning id`
    const shop = (amount: number) => owner`
      insert into payroll_revenue_entries (branch_id, order_id, source_type, source_id, staff_user_id, natural_month,
                                           payroll_month, commission_base, shop_revenue)
      values (${cs6}, ${o!.id}, 'order', ${o!.id}, null, ${`${F}-01`}::date, ${`${F}-01`}::date, 0, ${amount})`
    await shop(84_999_999)
    expect((await slip('nhung', F)).line).toMatchObject({ shopRevenue: 84_999_999, kpiBps: 0, kpiBonus: 0 })
    await shop(1)
    expect((await slip('nhung', F)).line).toMatchObject({ kpiBps: 100, kpiBonus: 850_000 })
    await shop(17_000_000)
    expect((await slip('nhung', F)).line).toMatchObject({ kpiBps: 150, kpiBonus: 1_530_000 })
    expect((await slip('linh', F)).line).toMatchObject({ kpiBonus: 0, shopRevenue: null })
  })
})

describe('4.11–4.12 — hoa hồng theo đơn, sổ doanh thu tính lương', () => {
  it('PRD 1, §6.2: bill 348.000đ, Nhung 239.000đ, Chin 109.000đ → hoa hồng 59.750đ và 27.250đ', async () => {
    await confirmedOrder(today, [
      ['nhung', 239_000],
      ['chin', 109_000],
    ])
    expect((await slip('nhung', thisMonth)).line.commission).toBe(59_750)
    const c = await slip('chin', thisMonth)
    expect(c.line).toMatchObject({ commissionBase: 109_000, commission: 27_250 })
    expect(c.orders).toHaveLength(1)
  })

  it('PRD 34: phụ thu 50.000đ của Trang → hoa hồng +12.500đ, doanh thu KPI +50.000đ', async () => {
    const before = (await slip('nhung', thisMonth)).line.shopRevenue!
    await confirmedOrder(today, [
      ['trang', 100_000],
      ['trang', 50_000, 'surcharge'],
    ])
    expect((await slip('trang', thisMonth)).line.commission).toBe(37_500)
    expect((await slip('nhung', thisMonth)).line.shopRevenue).toBe(before + 150_000)
  })

  it('PRD 36, C04: doanh thu KPI = doanh thu thuần báo cáo tháng (không gồm cọc bỏ hẹn, tip)', async () => {
    const r = await monthReport(auth('linh'), { branchId: cs6, month: thisMonth })
    expect((await slip('nhung', thisMonth)).line.shopRevenue).toBe(r.revenue.net)
    expect(r.payroll).toMatchObject({ locked: false, people: 4 })
  })

  it('Hoàn hết rồi huỷ đơn đã xác nhận → sổ của đơn về 0; chạy lại đồng bộ không ghi thêm', async () => {
    const o = await confirmedOrder(today, [['chin', 200_000]])
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 200_000, method: 'cash' })
    await refundOrder(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 200_000,
      method: 'cash',
      reason: 'Hoàn',
    })
    const g = await getOrder(auth('nhung'), o.id)
    await cancelOrder(auth('nhung'), o.id, g.version, 'Huỷ thử')
    const sum = async () =>
      (
        await owner<{ n: number; base: string; shop: string }[]>`
          select count(*)::int as n, coalesce(sum(commission_base), 0) as base, coalesce(sum(shop_revenue), 0) as shop
          from payroll_revenue_entries where order_id = ${o.id}`
      )[0]!
    const a = await sum()
    expect([Number(a.base), Number(a.shop)]).toEqual([0, 0])
    await owner`select app._payroll_sync_order(${o.id})`
    expect((await sum()).n).toBe(a.n)
  })

  it('S55: app_user không ghi thẳng sổ doanh thu tính lương, phiếu lương, kỳ lương', async () => {
    const o = await owner<{ id: string }[]>`select order_id as id from payroll_revenue_entries limit 1`
    await expectPgError(
      withUser(
        uid('linh'),
        (
          tx,
        ) => tx`insert into payroll_revenue_entries (branch_id, order_id, source_type, source_id, natural_month,
                                                        payroll_month, commission_base, shop_revenue)
                   values (${cs6}, ${o[0]!.id}, 'order', ${o[0]!.id}, '2026-10-01', '2026-10-01', 0, 1)`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(
        uid('linh'),
        (tx) =>
          tx`insert into payroll_periods (branch_id, month, locked_by) values (${cs6}, '2020-01-01', ${uid('linh')})`,
      ),
      '42501',
    )
  })
})

describe('4.13 — tạm ứng (A05, K21)', () => {
  it('PRD 53: Chin (lương cứng 4.000.000đ) đề nghị ứng 4.500.000đ → bị chặn', async () => {
    const e = await err(
      createAdvance(auth('chin'), {
        branchId: cs6,
        createRequestId: rid(),
        amount: 4_500_000,
        reason: 'Ứng',
      }),
    )
    expect(e.status).toBe(422)
    expect(e.message).toMatch(/4\.000\.000đ/)
  })

  it('K21: tổng trong tháng ≤ lương cứng; PRD 42: Nhung, thợ duyệt → chặn (API, SQL); Linh duyệt, Nhung chi', async () => {
    const a = await createAdvance(auth('chin'), {
      branchId: cs6,
      createRequestId: rid(),
      amount: 3_000_000,
      reason: 'Ứng tiền nhà',
    })
    expect(a.status).toBe('requested')
    const over = await err(
      createAdvance(auth('chin'), {
        branchId: cs6,
        createRequestId: rid(),
        amount: 1_500_000,
        reason: 'Thêm',
      }),
    )
    expect(over.status).toBe(422)
    expect(over.message).toMatch(/còn ứng được 1\.000\.000đ/)
    const small = await createAdvance(auth('chin'), {
      branchId: cs6,
      createRequestId: rid(),
      amount: 1_000_000,
      reason: 'Thêm',
    })
    expect((await err(actOnAdvance(auth('nhung'), a.id, 'approve', { version: a.version }))).status).toBe(403)
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update employee_advances set status = 'approved' where id = ${a.id}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('chin'), (tx) => tx`update employee_advances set status = 'approved' where id = ${a.id}`),
      '42501',
    )
    const ok = await actOnAdvance(auth('linh'), a.id, 'approve', { version: a.version })
    expect(ok.status).toBe('approved')
    const paid = await actOnAdvance(auth('nhung'), a.id, 'pay', { version: ok.version, method: 'cash' })
    await actOnAdvance(auth('nhung'), a.id, 'pay', { version: ok.version, method: 'cash' })
    expect(paid).toMatchObject({ status: 'paid', payrollMonth: thisMonth, paidAccountName: 'Tiền mặt CS6' })
    const [n] = await owner<{ n: number; s: string }[]>`
      select count(*)::int as n, sum(amount) as s from money_ledger_entries where source_type = 'advance' and source_id = ${a.id}`
    expect([n!.n, Number(n!.s)]).toEqual([1, -3_000_000])
    expect((await slip('chin', thisMonth)).line.advances).toBe(3_000_000)
    // Người đề nghị huỷ phiếu chưa duyệt
    expect((await actOnAdvance(auth('chin'), small.id, 'cancel', { version: small.version })).status).toBe(
      'cancelled',
    )
    const list = await listAdvances(auth('chin'), { branchId: cs6 })
    expect(list.limit).toMatchObject({ baseSalary: 4_000_000, used: 3_000_000, available: 1_000_000 })
    expect(list.items.every((i) => i.mine)).toBe(true)
  })

  it('S58: hai đề nghị song song cộng lại vượt hạn mức → một bị chặn; Linh tự đề nghị → duyệt luôn', async () => {
    const r = await Promise.allSettled([
      createAdvance(auth('trang'), { branchId: cs6, createRequestId: rid(), amount: 2_500_000, reason: 'A' }),
      createAdvance(auth('trang'), { branchId: cs6, createRequestId: rid(), amount: 2_500_000, reason: 'B' }),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const l = await createAdvance(auth('linh'), {
      branchId: cs6,
      createRequestId: rid(),
      amount: 500_000,
      reason: 'Ứng',
    })
    expect(l.status).toBe('approved')
  })
})

describe('4.15 — bảng lương, quyền xem (PRD 12, Q39, Q40)', () => {
  it('Thợ chỉ đọc lương của mình (API, SQL) [S56]', async () => {
    const m = await payrollMonth(auth('trang'), { branchId: cs6, month: thisMonth })
    expect(m.lines.map((l) => l.userId)).toEqual([uid('trang')])
    expect((await err(slip('chin', thisMonth, 'trang'))).status).toBe(403)
    const rows = await withUser(
      uid('trang'),
      (tx) =>
        tx<{ userId: string }[]>`select user_id from app.payroll_view(${cs6}, ${`${thisMonth}-01`}::date)`,
    )
    expect(rows.map((r) => r.userId)).toEqual([uid('trang')])
    // Doanh thu toàn quán không lộ cho thợ (chỉ người xem lương toàn quán hoặc có thưởng KPI)
    const shop = await withUser(
      uid('trang'),
      (tx) => tx<{ shopRevenue: string }[]>`
        select shop_revenue from app.payroll_view(${cs6}, ${`${thisMonth}-01`}::date)`,
    )
    expect(Number(shop[0]!.shopRevenue)).toBe(0)
    const adv = await withUser(
      uid('trang'),
      (tx) => tx<{ userId: string }[]>`select user_id from employee_advances where branch_id = ${cs6}`,
    )
    expect(adv.every((r) => r.userId === uid('trang'))).toBe(true)
  })

  it('Nhung đọc toàn bộ (có audit) nhưng không sửa, khoá, trả', async () => {
    const m = await payrollMonth(auth('nhung'), { branchId: cs6, month: thisMonth })
    expect(m.lines).toHaveLength(4)
    expect(m.can).toEqual({ lock: false, edit: false, pay: false })
    const [a] = await owner<{ n: number }[]>`
      select count(*)::int as n from audit_logs where action = 'payroll.viewed_branch' and actor_user_id = ${uid('nhung')}
        and branch_id = ${cs6}`
    expect(a!.n).toBeGreaterThan(0)
    expect(
      (
        await err(
          addAdjustment(auth('nhung'), {
            branchId: cs6,
            month: thisMonth,
            userId: uid('trang'),
            kind: 'bonus',
            amount: 100_000,
            reason: 'x',
          }),
        )
      ).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) =>
          tx`select app.payroll_adjustment_add(${cs6}, ${uid('trang')}, ${`${thisMonth}-01`}::date, 'bonus', 1, 'x')`,
      ),
      '42501',
    )
  })

  it('Linh thêm thưởng thêm, huỷ được khi tháng chưa khoá', async () => {
    const s = await addAdjustment(auth('linh'), {
      branchId: cs6,
      month: thisMonth,
      userId: uid('trang'),
      kind: 'bonus',
      amount: 200_000,
      reason: 'Thưởng chăm chỉ',
    })
    expect(s.line.bonus).toBe(200_000)
    const v = await voidAdjustment(auth('linh'), s.adjustments[0]!.id, { reason: 'Nhầm' })
    expect(v.line.bonus).toBe(0)
  })
})

describe('4.16–4.17 — khoá bảng lương, trả lương', () => {
  let chinOrder = { id: '', version: 0 }
  let trangOrder = ''

  it('Chuẩn bị tháng M: công, đơn chờ xác nhận (D04), đơn đã thu (Q34), khấu trừ lớn (K22)', async () => {
    for (const k of ['linh', 'nhung', 'chin'] as const) await fill(k, M)
    await fill('trang', M, { 10: null }) // một ngày chưa duyệt
    for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) await fill(k, M1)
    const { order } = await createOrder(auth('nhung'), {
      branchId: cs6,
      createRequestId: rid(),
      customerId: null,
      serviceDate: `${M}-28`,
      items: [
        { type: 'custom', name: 'Đắp gel', amount: 500_000, staff: [{ userId: uid('chin') }] },
      ] as never,
      discounts: [],
    })
    const d = await markDone(auth('nhung'), order.id, order.version)
    chinOrder = { id: d.id, version: d.version }
    const t = await confirmedOrder(`${M}-15`, [['trang', 400_000]])
    await recordPayment(auth('nhung'), t.id, { idempotencyKey: rid(), amount: 400_000, method: 'cash' })
    trangOrder = t.id
    await addAdjustment(auth('linh'), {
      branchId: cs6,
      month: M,
      userId: uid('linh'),
      kind: 'deduction',
      amount: 10_000_000,
      reason: 'Khấu trừ thử',
    })
    const o = await overview(auth('linh'), { branchId: cs6, period: 'day' })
    expect(o.attention.payrollToLock).toBe(M)
  })

  it('S60, K20: Nhung khoá → 403 (API, SQL); còn ngày công chưa duyệt → không khoá được', async () => {
    expect((await err(lockMonth(auth('nhung'), { branchId: cs6, month: M }))).status).toBe(403)
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`select app.payroll_lock(${cs6}, ${`${M}-01`}::date)`),
      '42501',
    )
    const m = await payrollMonth(auth('linh'), { branchId: cs6, month: M })
    expect(m).toMatchObject({ status: 'draft', pendingDays: 1 })
    expect(m.can.lock).toBe(false)
    expect(m.warnings.ordersOpen).toBe(1)
    const e = await err(lockMonth(auth('linh'), { branchId: cs6, month: M }))
    expect(e.status).toBe(422)
    expect(e.message).toMatch(/1 ngày công chưa duyệt/)
  })

  it('Khoá tháng M: phiếu lương cố định; khấu trừ vượt lương chuyển sang tháng sau (K22); khoá lại → 409', async () => {
    await decideDay(auth('nhung'), {
      branchId: cs6,
      userId: uid('trang'),
      date: `${M}-10`,
      status: 'worked',
      note: 'Quên vào ca',
    })
    // P74: Mai có hồ sơ trong tháng nhưng chưa có chính sách lương → không khoá được, có cảnh báo
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${uid('mai')}, ${cs6}, id, 'test' from roles where code = 'staff'`
    await saveProfile(auth('linh'), {
      branchId: cs6,
      userId: uid('mai'),
      startDate: `${M}-01`,
      endDate: null,
      payMethod: 'cash',
    })
    const w = await payrollMonth(auth('linh'), { branchId: cs6, month: M })
    expect(w.warnings.missingPolicy).toEqual(['Mai'])
    expect(w.can.lock).toBe(false)
    const e = await err(lockMonth(auth('linh'), { branchId: cs6, month: M }))
    expect(e.message).toMatch(/chính sách lương của: Mai/)
    await savePolicy(auth('linh'), {
      branchId: cs6,
      userId: uid('mai'),
      effectiveMonth: `${M}-01`,
      baseSalary: 3_000_000,
      commissionBps: 2500,
      leaveDays: 3,
      managerKpi: false,
    })
    await fill('mai', M)
    await fill('mai', M1)
    const m = await lockMonth(auth('linh'), { branchId: cs6, month: M })
    expect(m.status).toBe('locked')
    expect(m.lines).toHaveLength(5)
    const linh = m.lines.find((l) => l.userId === uid('linh'))!
    expect(linh.grossPay).toBeLessThan(0)
    expect(linh).toMatchObject({ payable: 0, carriedOut: -linh.grossPay })
    expect((await slip('linh', M1)).line.carryIn).toBe(-linh.grossPay)
    expect((await err(lockMonth(auth('linh'), { branchId: cs6, month: M }))).status).toBe(409)
    const o = await overview(auth('linh'), { branchId: cs6, period: 'day' })
    expect(o.attention.payrollToLock).toBe(M1)
    expect(o.attention.payrollUnpaid).toBeGreaterThan(0)
  })

  it('Khoá lần lượt; tháng đang chạy chưa tới ngày nháp → không khoá được', async () => {
    await lockMonth(auth('linh'), { branchId: cs6, month: M1 })
    const e = await err(lockMonth(auth('linh'), { branchId: cs6, month: thisMonth }))
    expect(e.status).toBe(422)
    expect(e.message).toMatch(/mới khoá được/)
    expect(
      (await overview(auth('linh'), { branchId: cs6, period: 'day' })).attention.payrollToLock,
    ).toBeNull()
  })

  it('PRD 13, 40: đổi hoa hồng từ tháng sau không đổi bản lương đã khoá; đổi lùi vào tháng đã khoá → chặn', async () => {
    const before = (await slip('chin', M)).line
    await savePolicy(auth('linh'), {
      branchId: cs6,
      userId: uid('chin'),
      effectiveMonth: `${addMonths(thisMonth, 1)}-01`,
      baseSalary: 4_000_000,
      commissionBps: 2000,
      leaveDays: 3,
      managerKpi: false,
    })
    expect((await slip('chin', M)).line).toEqual(before)
    expect(
      (
        await err(
          savePolicy(auth('linh'), {
            branchId: cs6,
            userId: uid('chin'),
            effectiveMonth: `${M1}-01`,
            baseSalary: 1,
            commissionBps: 0,
            leaveDays: 0,
            managerKpi: false,
          }),
        )
      ).status,
    ).toBe(422)
  })

  it('D04: đơn tháng M xác nhận sau khi khoá → hoa hồng vào tháng đang mở; doanh thu báo cáo vẫn tháng M (Q02)', async () => {
    const lineBefore = (await slip('chin', M)).line
    const repBefore = (await monthReport(auth('linh'), { branchId: cs6, month: M })).revenue.net
    const nowBefore = (await slip('chin', thisMonth)).line.commission
    await confirmOrder(auth('nhung'), chinOrder.id, chinOrder.version)
    expect((await slip('chin', M)).line).toEqual(lineBefore)
    expect((await monthReport(auth('linh'), { branchId: cs6, month: M })).revenue.net).toBe(
      repBefore + 500_000,
    )
    const now = await slip('chin', thisMonth)
    expect(now.line.commission).toBe(nowBefore + 125_000)
    expect(now.orders.find((o) => o.orderId === chinOrder.id)).toMatchObject({ moved: true, base: 500_000 })
  })

  it('PRD 25, 41 (Q34): hoàn 100.000đ đơn tháng M sau khi khoá → tháng hoàn giảm; tháng M không đổi', async () => {
    const lineBefore = (await slip('trang', M)).line
    const repBefore = (await monthReport(auth('linh'), { branchId: cs6, month: M })).revenue.net
    const nowBase = (await slip('trang', thisMonth)).line.commissionBase
    const shopBefore = (await slip('nhung', thisMonth)).line.shopRevenue!
    const d = await refundOrder(auth('nhung'), trangOrder, {
      idempotencyKey: rid(),
      amount: 100_000,
      method: 'cash',
      reason: 'Khách không hài lòng',
    })
    expect(d.refunds[0]!.revenueDate).toBe(today)
    expect((await slip('trang', M)).line).toEqual(lineBefore)
    expect((await monthReport(auth('linh'), { branchId: cs6, month: M })).revenue.net).toBe(repBefore)
    expect((await slip('trang', thisMonth)).line.commissionBase).toBe(nowBase - 100_000)
    expect((await slip('nhung', thisMonth)).line.shopRevenue).toBe(shopBefore - 100_000)
  })

  it('PRD 14, S59: phiếu lương, kỳ đã khoá không sửa, không xoá; công, nghỉ, ngày đóng cửa, điều chỉnh tháng M bị chặn', async () => {
    await expectPgError(owner`delete from payroll_lines where branch_id = ${cs6}`, '42501')
    await expectPgError(owner`update payroll_periods set locked_at = now() where branch_id = ${cs6}`, '42501')
    const day = `${M}-12`
    expect(
      (
        await err(
          decideDay(auth('linh'), { branchId: cs6, userId: uid('chin'), date: day, status: 'unexcused' }),
        )
      ).status,
    ).toBe(422)
    expect(
      (await err(addClosedDays(auth('linh'), { branchId: cs6, fromDate: day, toDate: day, reason: 'x' })))
        .status,
    ).toBe(422)
    expect(
      (
        await err(
          createLeave(auth('trang'), {
            branchId: cs6,
            createRequestId: rid(),
            fromDate: day,
            toDate: day,
            reason: 'x',
          }),
        )
      ).status,
    ).toBe(422)
    expect(
      (
        await err(
          addAdjustment(auth('linh'), {
            branchId: cs6,
            month: M,
            userId: uid('trang'),
            kind: 'bonus',
            amount: 1,
            reason: 'x',
          }),
        )
      ).status,
    ).toBe(422)
  })

  it('4.17, S61: Linh trả lương theo phiếu đã khoá; bấm hai lần → một lần; trả vượt → 422; Nhung trả → 403', async () => {
    const t = (await slip('trang', M)).line
    expect(t.payable).toBeGreaterThan(0)
    const key = rid()
    const pay = (amount: number, k = key, as: SeedKey = 'linh') =>
      payOut(auth(as), {
        branchId: cs6,
        month: M,
        userId: uid('trang'),
        amount,
        method: 'cash',
        idempotencyKey: k,
      })
    expect((await err(pay(1000, rid(), 'nhung'))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) =>
          tx`select app.payroll_pay(${cs6}, ${uid('trang')}, ${`${M}-01`}::date, 1000, 'cash', gen_random_uuid())`,
      ),
      '42501',
    )
    const half = Math.floor(t.payable / 2)
    await pay(half)
    const s = await pay(half)
    expect(s.payouts).toHaveLength(1)
    expect(s.line).toMatchObject({ paid: half, remaining: t.payable - half })
    expect((await err(pay(t.payable, rid()))).status).toBe(422)
    const done = await pay(t.payable - half, rid())
    expect(done.line.remaining).toBe(0)
    expect(done.can.pay).toBe(false)
    const [l] = await owner<{ n: number; s: string }[]>`
      select count(*)::int as n, sum(e.amount) as s from money_ledger_entries e
      join payroll_payouts p on e.source_type = 'payroll_payout' and p.id = e.source_id
      where p.branch_id = ${cs6} and p.user_id = ${uid('trang')}`
    expect([l!.n, Number(l!.s)]).toEqual([2, -t.payable])
  })

  it('Tổng quan: thợ thấy lương tạm tính tháng này của mình (Q39)', async () => {
    const o = await overview(auth('trang'), { branchId: cs6, period: 'day' })
    expect(o.myPay?.month).toBe(thisMonth)
    expect(o.myPay?.grossPay).toBe((await slip('trang', thisMonth, 'trang')).line.grossPay)
    expect(o.attention).toMatchObject({ advancesToApprove: 0, payrollToLock: null, payrollUnpaid: 0 })
  })
})
