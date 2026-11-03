// S55: trừ lương theo phút, tách phép hưởng; duyệt, huỷ, trùng giờ và khoá tháng.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMonths, monthRange, toLocalDate } from '../../src/lib/time'
import { actOnLeave, createLeave, staffOff } from '../../src/server/attendance/leave'
import { decideDay, myMonth } from '../../src/server/attendance/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { lockMonth, payslip } from '../../src/server/payroll/service'
import { savePolicy, saveProfile } from '../../src/server/staff/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
const sessions: Partial<Record<SeedKey, Awaited<ReturnType<typeof sessionOf>>>> = {}
const month = addMonths(toLocalDate(new Date()).slice(0, 7), -1)
const date = (n: number) => `${month}-${String(n).padStart(2, '0')}`
let branchId = ''
const uid = (k: SeedKey) => seed().users[k]!.id
const auth = (k: SeedKey) => sessions[k]!.auth
const line = async () => (await payslip(auth('trang'), { branchId, month, userId: uid('trang') })).line
const hourly = (n: number, startTime = '14:00', endTime = '16:30', k: SeedKey = 'trang') =>
  createLeave(auth(k), {
    branchId,
    createRequestId: rid(),
    fromDate: date(n),
    toDate: date(n),
    startTime,
    endTime,
    reason: 'Việc riêng bí mật',
  })

beforeAll(async () => {
  const [org] = await owner`select id from organizations limit 1`
  const [b] = await owner`insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CSHOUR', 'Zz thử nghỉ giờ', 'CSHOUR') returning id`
  branchId = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${branchId})`
  await owner`insert into payroll_settings (branch_id, start_month, draft_day) values (${branchId}, ${date(1)}::date, 1)`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['trang', 'staff'],
  ] as const) {
    await owner`insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${uid(k)}, ${branchId}, id, 'test hourly' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'trang'] as const) sessions[k] = await sessionOf(k)
  for (const k of ['linh', 'nhung', 'trang'] as const) {
    await saveProfile(auth('linh'), {
      branchId,
      userId: uid(k),
      startDate: date(1),
      endDate: null,
      payMethod: 'cash',
    })
    await savePolicy(auth('linh'), {
      branchId,
      userId: uid(k),
      effectiveMonth: date(1),
      baseSalary: 3_600_000,
      commissionBps: 2500,
      leaveDays: 3,
      managerKpi: false,
    })
  }
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${branchId}`
  await owner.end()
  await closeSql()
})

describe('S55 — nghỉ theo giờ', () => {
  it('2,5 giờ trừ tiền riêng dù còn 3 ngày hưởng; Nhung duyệt; huỷ trả lại đúng tiền', async () => {
    const before = await line()
    const l = await hourly(3)
    expect(l).toMatchObject({ startTime: '14:00', endTime: '16:30', minutes: 150, status: 'requested' })
    expect((await line()).hourlyLeaveDeduction).toBe(0)
    const a = await actOnLeave(auth('nhung'), l.id, 'approve', { version: l.version })
    const after = await line()
    expect(after.absentDays).toBe(before.absentDays)
    expect(after.leaveAllowance).toBe(3)
    expect(after.hourlyLeaveMinutes).toBe(150)
    const amount = Math.round((3_600_000 / before.standardDays / 12) * 2.5)
    expect(after.hourlyLeaveDeduction).toBe(amount)
    expect(after.grossPay).toBe(before.grossPay - amount)
    const grid = await myMonth(auth('trang'), { branchId, month })
    expect(grid.days.find((d) => d.date === date(3))?.status).toBe('pending')
    const off = await staffOff(auth('nhung'), { branchId, date: date(3) })
    expect(off.off).toEqual(['Trang (14:00–16:30)'])
    expect(JSON.stringify(off)).not.toContain('bí mật')
    await actOnLeave(auth('nhung'), a.id, 'cancel', { version: a.version, note: 'Không nghỉ nữa' })
    expect((await line()).grossPay).toBe(before.grossPay)
  })

  it('chặn trùng giờ song song, cho phép tiếp giáp; không đăng ký cả ngày chồng lên giờ', async () => {
    const results = await Promise.allSettled([hourly(5), hourly(5, '15:00', '17:00')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const l = (
      results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof hourly>>
      >
    ).value
    await actOnLeave(auth('nhung'), l.id, 'reject', { version: l.version, note: 'Đổi khung giờ' })
    const first = await hourly(5, '09:00', '10:00')
    await hourly(5, '10:00', '10:30')
    await expect(
      createLeave(auth('trang'), {
        branchId,
        createRequestId: rid(),
        fromDate: date(5),
        toDate: date(5),
        reason: 'Cả ngày',
      }),
    ).rejects.toBeDefined()
    await expect(hourly(6, '08:00', '10:00')).rejects.toBeDefined()
    await expect(hourly(6, '17:00', '16:00')).rejects.toBeDefined()
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`update leave_requests set start_time = '11:00' where id = ${first.id}`,
      ),
      '42501',
    )
  })

  it('nghỉ giờ không bị trừ thêm khi ngày đã tính vắng nguyên ngày; không lộ lương khác', async () => {
    const l = await hourly(7)
    await actOnLeave(auth('nhung'), l.id, 'approve', { version: l.version })
    expect((await line()).hourlyLeaveMinutes).toBe(150)
    await decideDay(auth('nhung'), {
      branchId,
      userId: uid('trang'),
      date: date(7),
      status: 'leave',
      note: 'Nghỉ cả ngày',
    })
    expect((await line()).hourlyLeaveMinutes).toBe(0)
    await decideDay(auth('nhung'), {
      branchId,
      userId: uid('trang'),
      date: date(7),
      status: 'worked',
      note: 'Đi làm, nghỉ một phần',
    })
    expect((await line()).hourlyLeaveMinutes).toBe(150)
    const rows = await withUser(
      uid('trang'),
      (tx) => tx`select * from app.payroll_hourly(${branchId}, ${date(1)}::date)`,
    )
    expect(rows.every((r) => r.userId === uid('trang'))).toBe(true)
  })

  it('chụp khoản trừ giờ cùng phiếu lương; sau khoá không duyệt/huỷ được', async () => {
    const { first, last } = monthRange(month)
    for (const k of ['linh', 'nhung', 'trang'] as const) {
      await owner`insert into attendance_days (branch_id,user_id,work_date,status,decided_by,decided_at)
        select ${branchId},${uid(k)},g::date,'worked',${uid('linh')},now()
        from generate_series(${first}::date,${last}::date,interval '1 day') g
        on conflict (branch_id,user_id,work_date) do nothing`
    }
    const before = await line()
    await lockMonth(auth('linh'), { branchId, month })
    const after = await line()
    expect(after.hourlyLeaveDeduction).toBe(before.hourlyLeaveDeduction)
    expect(after.grossPay).toBe(before.grossPay)
    const [l] =
      await owner`select id,version from leave_requests where branch_id = ${branchId} and status = 'approved' limit 1`
    await expect(
      actOnLeave(auth('nhung'), l!.id, 'cancel', { version: l!.version, note: 'Không được đổi tháng khoá' }),
    ).rejects.toBeDefined()
    await expect(hourly(9)).rejects.toBeDefined()
  })
})
