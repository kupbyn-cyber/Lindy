// Nghiệm thu nhân viên và chấm công (Đợt 4A, bước 4.2–4.9): PRD §18 test 40, 23 (phần công); Q27, Q28, Q29, Q35;
// K20 (ngày chưa duyệt không phải ngày vắng); test bảo mật S49–S54, S59 phần 4A (kế hoạch Đợt 4 mục 10.2).
// Chạy trên cơ sở thử riêng "CS5" để công, ngày đóng cửa không ảnh hưởng file test khác.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, addMonths, monthRange, toLocalDate } from '../../src/lib/time'
import { addClosedDays, listClosedDays, removeClosedDay } from '../../src/server/attendance/closed-days'
import { actOnLeave, createLeave } from '../../src/server/attendance/leave'
import {
  approveCheckedIn,
  checkIn,
  checkOut,
  dayBoard,
  decideDay,
  monthSheet,
  myMonth,
  myToday,
} from '../../src/server/attendance/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { overview } from '../../src/server/reports/service'
import { PolicyBody } from '../../src/server/staff/schema'
import { listPeople, savePolicy, saveProfile, saveSettings } from '../../src/server/staff/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
const yesterday = addDays(today, -1)
const thisMonth = today.slice(0, 7)
// Tháng khoá thử: cách tháng này 2 tháng, để "hôm qua" không bao giờ rơi vào tháng khoá
const lockedMonth = addMonths(thisMonth, -2)
const startDate = `${addMonths(thisMonth, -3)}-01`
let cs5 = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS5', 'Zz cơ sở thử chấm công', 'CS5') returning id`
  cs5 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs5})`
  await owner`insert into payroll_settings (branch_id) values (${cs5})`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs5}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs5}`
  await owner.end()
  await closeSql()
})
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

const profile = (k: SeedKey, start = startDate, end: string | null = null) =>
  saveProfile(auth('linh'), {
    branchId: cs5,
    userId: uid(k),
    startDate: start,
    endDate: end,
    payMethod: 'cash',
  })

describe('4.2–4.3 — hồ sơ, chính sách lương', () => {
  it('S54: Linh lưu hồ sơ; Nhung xem được, không sửa được (API, SQL); thợ không mở được màn Nhân viên', async () => {
    for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) await profile(k)
    const d = await listPeople(auth('nhung'), cs5)
    expect(d.can.edit).toBe(false)
    expect(d.people.find((p) => p.userId === uid('trang'))?.profile).toMatchObject({
      startDate,
      endDate: null,
      payMethod: 'cash',
    })
    expect(
      (
        await err(
          saveProfile(auth('nhung'), {
            branchId: cs5,
            userId: uid('trang'),
            startDate,
            endDate: null,
            payMethod: 'transfer',
          }),
        )
      ).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) =>
          tx`select app.staff_profile_save(${cs5}, ${uid('trang')}, ${startDate}::date, null, 'transfer')`,
      ),
      '42501',
    )
    expect((await err(listPeople(auth('trang'), cs5))).status).toBe(403)
  })

  it('PRD 40: hiệu lực hoa hồng ngày 15 → không lưu được (API, SQL); ngày 1 → được', async () => {
    const mid = `${addMonths(thisMonth, 1)}-15`
    const first = `${addMonths(thisMonth, 2)}-01`
    expect(() =>
      PolicyBody.parse({
        userId: uid('chin'),
        effectiveMonth: mid,
        baseSalary: 4_000_000,
        commissionBps: 2000,
        leaveDays: 3,
        managerKpi: false,
      }),
    ).toThrow(/ngày 1 của tháng/)
    await expectPgError(
      withUser(
        uid('linh'),
        (tx) =>
          tx`select app.staff_policy_save(${cs5}, ${uid('chin')}, ${mid}::date, 4000000, 2000, 3, false, null)`,
      ),
      'P0001',
    )
    const d = await savePolicy(auth('linh'), {
      branchId: cs5,
      userId: uid('chin'),
      effectiveMonth: first,
      baseSalary: 4_000_000,
      commissionBps: 2000,
      leaveDays: 3,
      managerKpi: false,
      reason: 'Đổi hoa hồng',
    })
    expect(d.people.find((p) => p.userId === uid('chin'))?.policies[0]).toMatchObject({
      effectiveMonth: first,
      commissionBps: 2000,
    })
  })

  it('Chính sách bảng tháng 10/2026 (Q31): lương tạm tính lấy bản có hiệu lực của tháng', async () => {
    const month = `${addMonths(thisMonth, -3)}-01`
    for (const [k, base, leave, kpi] of [
      ['linh', 3_500_000, 3, false],
      ['nhung', 7_000_000, 4, true],
      ['chin', 4_000_000, 3, false],
      ['trang', 3_500_000, 3, false],
    ] as const) {
      await savePolicy(auth('linh'), {
        branchId: cs5,
        userId: uid(k),
        effectiveMonth: month,
        baseSalary: base,
        commissionBps: 2500,
        leaveDays: leave,
        managerKpi: kpi,
      })
    }
    const d = await listPeople(auth('linh'), cs5)
    const chin = d.people.find((p) => p.userId === uid('chin'))!
    expect(chin.current).toMatchObject({ baseSalary: 4_000_000, commissionBps: 2500, leaveDays: 3 })
    expect(chin.policies).toHaveLength(2) // bản tháng sau chưa có hiệu lực
    expect(d.people.find((p) => p.userId === uid('nhung'))?.current?.managerKpi).toBe(true)
  })

  it('S53: thợ chỉ đọc chính sách, hồ sơ của mình; mốc KPI chỉ người xem lương toàn quán', async () => {
    const pol = await withUser(
      uid('trang'),
      (tx) => tx<{ userId: string }[]>`select user_id from staff_policy_versions where branch_id = ${cs5}`,
    )
    expect(new Set(pol.map((r) => r.userId))).toEqual(new Set([uid('trang')]))
    const prof = await withUser(
      uid('chin'),
      (tx) => tx<{ userId: string }[]>`select user_id from staff_profiles where branch_id = ${cs5}`,
    )
    expect(prof.map((r) => r.userId)).toEqual([uid('chin')])
    const all = await withUser(
      uid('nhung'),
      (tx) =>
        tx<{ n: number }[]>`select count(*)::int as n from staff_policy_versions where branch_id = ${cs5}`,
    )
    expect(all[0]!.n).toBeGreaterThanOrEqual(4)
    const kpi = await withUser(
      uid('chin'),
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from kpi_policy_versions`,
    )
    expect(kpi[0]!.n).toBe(0)
  })
})

describe('4.5 — Vào ca / Ra ca', () => {
  it('S50: chưa có hồ sơ hoặc đã nghỉ việc → không vào ca được', async () => {
    // Linh chưa có hồ sơ ở CS5 sau khi đặt ngày nghỉ việc hôm qua
    await profile('linh', startDate, yesterday)
    expect((await err(checkIn(auth('linh'), cs5))).status).toBe(403)
    expect((await myToday(auth('linh'), cs5)).canCheckIn).toBe(false)
    await profile('linh', startDate, null)
  })

  it('Vào ca hai lần → một dòng, giữ giờ đầu; Ra ca hai lần giữ giờ đầu; giờ do DB ghi', async () => {
    const a = await checkIn(auth('trang'), cs5)
    expect(a.day?.checkIn).toBeTruthy()
    const b = await checkIn(auth('trang'), cs5)
    expect(b.day?.checkIn).toBe(a.day?.checkIn)
    expect((await err(checkOut(auth('chin'), cs5))).status).toBe(422) // chưa vào ca
    const c = await checkOut(auth('trang'), cs5)
    const d = await checkOut(auth('trang'), cs5)
    expect(d.day?.checkOut).toBe(c.day?.checkOut)
    const [n] = await owner<{ n: number }[]>`
      select count(*)::int as n from attendance_days where branch_id = ${cs5} and user_id = ${uid('trang')}`
    expect(n!.n).toBe(1)
  })

  it('S49, S52: không ghi thẳng bảng công, không vào ca hộ, không sửa giờ (SQL)', async () => {
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`insert into attendance_days (branch_id, user_id, work_date, check_in_at)
                   values (${cs5}, ${uid('chin')}, ${today}::date, now())`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) =>
          tx`update attendance_days set check_in_at = now() - interval '3 hours' where branch_id = ${cs5}`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`delete from attendance_days where branch_id = ${cs5}`),
      '42501',
    )
  })

  it('PRD 23 (phần công) / K20: quên vào ca → ngày "chưa duyệt", không phải ngày vắng', async () => {
    const m = await myMonth(auth('chin'), { branchId: cs5, month: thisMonth })
    const y = m.days.find((d) => d.date === yesterday)
    if (y) {
      expect(y.status).toBe('pending')
      expect(m.counts.absent).toBe(0)
      expect(m.counts.pending).toBeGreaterThan(0)
    }
    // Ngày trong tháng trước: cũng chưa duyệt, không vắng
    const prev = await myMonth(auth('chin'), { branchId: cs5, month: addMonths(thisMonth, -1) })
    expect(prev.counts.absent).toBe(0)
    expect(prev.counts.pending).toBe(prev.days.length)
    expect(prev.leaveDays).toBe(3)
  })
})

describe('4.6 — đăng ký nghỉ', () => {
  const d1 = addDays(today, 3)
  const d2 = addDays(today, 4)

  it('Thợ đăng ký → chờ duyệt; trùng ngày → 422; thợ tự duyệt → 403 (API, SQL) [S51]', async () => {
    const l = await createLeave(auth('trang'), {
      branchId: cs5,
      createRequestId: rid(),
      fromDate: d1,
      toDate: d2,
      reason: 'Về quê',
    })
    expect(l).toMatchObject({ status: 'requested', days: 2, can: { approve: false, cancel: true } })
    expect(
      (
        await err(
          createLeave(auth('trang'), {
            branchId: cs5,
            createRequestId: rid(),
            fromDate: d2,
            toDate: d2,
            reason: 'Trùng',
          }),
        )
      ).status,
    ).toBe(422)
    expect((await err(actOnLeave(auth('trang'), l.id, 'approve', { version: l.version }))).status).toBe(403)
    await expectPgError(
      withUser(uid('trang'), (tx) => tx`update leave_requests set status = 'approved' where id = ${l.id}`),
      '42501',
    )
    // Nhung duyệt → ngày đó là nghỉ có phép (kể cả ngày chưa tới)
    const a = await actOnLeave(auth('nhung'), l.id, 'approve', { version: l.version })
    expect(a).toMatchObject({ status: 'approved', decidedByName: 'Nhung' })
    const m = await myMonth(auth('trang'), { branchId: cs5, month: d1.slice(0, 7) })
    expect(m.days.find((d) => d.date === d1)?.status).toBe('leave')
    // S51: thợ huỷ nghỉ đã duyệt → 403; Nhung huỷ cần lý do
    expect((await err(actOnLeave(auth('trang'), l.id, 'cancel', { version: a.version }))).status).toBe(403)
    expect((await err(actOnLeave(auth('nhung'), l.id, 'cancel', { version: a.version }))).status).toBe(422)
  })

  it('Q27: Nhung đăng ký nghỉ cho mình → duyệt luôn, có audit tự duyệt', async () => {
    const l = await createLeave(auth('nhung'), {
      branchId: cs5,
      createRequestId: rid(),
      fromDate: d1,
      toDate: d1,
      reason: 'Việc nhà',
    })
    expect(l.status).toBe('approved')
    const [a] = await owner<{ action: string }[]>`
      select action from audit_logs where entity_type = 'leave_request' and entity_id = ${l.id}`
    expect(a?.action).toBe('leave.self_approved')
  })

  it('Bấm gửi hai lần cùng mã → một đơn', async () => {
    const key = rid()
    const body = {
      branchId: cs5,
      createRequestId: key,
      fromDate: addDays(today, 10),
      toDate: addDays(today, 10),
      reason: 'Khám',
    }
    const a = await createLeave(auth('chin'), body)
    const b = await createLeave(auth('chin'), body)
    expect(b.id).toBe(a.id)
    const c = await actOnLeave(auth('chin'), a.id, 'cancel', { version: a.version })
    expect(c.status).toBe('cancelled')
  })
})

describe('4.7 — duyệt công', () => {
  it('Nhung đánh nghỉ không phép; đổi quyết định cần lý do; bổ sung công không giờ vào ca cần lý do', async () => {
    const r = await decideDay(auth('nhung'), {
      branchId: cs5,
      userId: uid('chin'),
      date: yesterday,
      status: 'unexcused',
    })
    expect(r.people.find((p) => p.userId === uid('chin'))?.status).toBe('unexcused')
    expect(
      (
        await err(
          decideDay(auth('nhung'), { branchId: cs5, userId: uid('chin'), date: yesterday, status: 'worked' }),
        )
      ).status,
    ).toBe(422)
    const ok = await decideDay(auth('nhung'), {
      branchId: cs5,
      userId: uid('chin'),
      date: yesterday,
      status: 'worked',
      note: 'Quên vào ca, có mặt cả ngày',
    })
    expect(ok.people.find((p) => p.userId === uid('chin'))).toMatchObject({ status: 'worked' })
    const twoDays = addDays(today, -2)
    expect(
      (
        await err(
          decideDay(auth('nhung'), { branchId: cs5, userId: uid('trang'), date: twoDays, status: 'worked' }),
        )
      ).status,
    ).toBe(422)
    // Ngày chưa tới → 422
    expect(
      (
        await err(
          decideDay(auth('nhung'), {
            branchId: cs5,
            userId: uid('trang'),
            date: addDays(today, 1),
            status: 'unexcused',
          }),
        )
      ).status,
    ).toBe(422)
  })

  it('S52: thợ duyệt công (API, SQL) → 403', async () => {
    expect(
      (
        await err(
          decideDay(auth('chin'), {
            branchId: cs5,
            userId: uid('chin'),
            date: yesterday,
            status: 'worked',
            note: 'x',
          }),
        )
      ).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        uid('chin'),
        (tx) => tx`select app.attendance_decide(${cs5}, ${uid('chin')}, ${yesterday}::date, 'worked', 'x')`,
      ),
      '42501',
    )
    expect((await err(dayBoard(auth('trang'), { branchId: cs5 }))).status).toBe(403)
  })

  it('Q27: Nhung tự duyệt công của mình → audit; Duyệt tất cả người đã vào ca', async () => {
    await checkIn(auth('nhung'), cs5)
    await checkIn(auth('chin'), cs5)
    const before = await dayBoard(auth('nhung'), { branchId: cs5 })
    expect(before.checkedInPending).toBe(3) // Trang, Chin, Nhung
    const r = await approveCheckedIn(auth('nhung'), { branchId: cs5, date: today })
    expect(r.approved).toBe(3)
    expect(r.board.checkedInPending).toBe(0)
    expect(r.board.people.filter((p) => p.status === 'worked')).toHaveLength(3)
    const [a] = await owner<{ action: string }[]>`
      select action from audit_logs where branch_id = ${cs5} and action like 'attendance.%' order by id desc limit 1`
    expect(a?.action).toBe('attendance.self_decided')
  })
})

describe('4.4 — ngày quán đóng cửa (Q29)', () => {
  const c1 = addDays(today, 20)
  const c2 = addDays(today, 24)

  it('Linh thêm khoảng ngày; thêm trùng bỏ qua; Nhung thêm → 403 (API, SQL) [S54]', async () => {
    const d = await addClosedDays(auth('linh'), {
      branchId: cs5,
      fromDate: c1,
      toDate: c2,
      reason: 'Sửa quán',
    })
    expect(d.days.filter((x) => x.closedDate >= c1 && x.closedDate <= c2)).toHaveLength(5)
    const again = await addClosedDays(auth('linh'), {
      branchId: cs5,
      fromDate: c2,
      toDate: c2,
      reason: 'Sửa quán',
    })
    expect(again.days.filter((x) => x.closedDate === c2)).toHaveLength(1)
    expect(
      (await err(addClosedDays(auth('nhung'), { branchId: cs5, fromDate: c1, toDate: c1, reason: 'x' })))
        .status,
    ).toBe(403)
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`select app.closed_days_add(${cs5}, ${c1}::date, ${c1}::date, 'x')`),
      '42501',
    )
    expect((await listClosedDays(auth('trang'), cs5)).can.manage).toBe(false)
  })

  it('Ngày đóng cửa không phải ngày vắng; duyệt công ngày đóng cửa → 422; gỡ được', async () => {
    // Đóng cửa hôm qua: ngày của Trang (chưa duyệt) thành "đóng cửa"
    const d = await addClosedDays(auth('linh'), {
      branchId: cs5,
      fromDate: yesterday,
      toDate: yesterday,
      reason: 'Mất điện',
    })
    const m = await myMonth(auth('trang'), { branchId: cs5, month: yesterday.slice(0, 7) })
    expect(m.days.find((x) => x.date === yesterday)).toMatchObject({
      status: 'closed',
      closedReason: 'Mất điện',
    })
    expect(
      (
        await err(
          decideDay(auth('nhung'), {
            branchId: cs5,
            userId: uid('trang'),
            date: yesterday,
            status: 'unexcused',
          }),
        )
      ).status,
    ).toBe(422)
    const id = d.days.find((x) => x.closedDate === yesterday)!.id
    const after = await removeClosedDay(auth('linh'), id, cs5)
    expect(after.days.some((x) => x.closedDate === yesterday)).toBe(false)
  })
})

describe('4.8 — bảng công tháng', () => {
  it('Q35: ngày trước khi vào làm là ngày vắng; Nhung thấy mọi người, thợ chỉ mình', async () => {
    // Trang vào làm ngày 16 của tháng trước
    const prev = addMonths(thisMonth, -1)
    await profile('trang', `${prev}-16`)
    const s = await monthSheet(auth('nhung'), { branchId: cs5, month: prev })
    const t = s.people.find((p) => p.userId === uid('trang'))!
    expect(t.counts.out).toBe(15)
    expect(t.counts.absent).toBe(15)
    expect(t.leaveDays).toBe(3)
    expect(s.people.length).toBeGreaterThanOrEqual(4)
    const own = await monthSheet(auth('chin'), { branchId: cs5, month: prev })
    expect(own.people.map((p) => p.userId)).toEqual([uid('chin')])
    await profile('trang')
  })

  it('Ngày nghỉ được duyệt tính là ngày vắng; tổng đếm đúng', async () => {
    const prev = addMonths(thisMonth, -1)
    const { first, last } = monthRange(prev)
    // Chin: nghỉ có phép ngày 2, không phép ngày 3, đi làm mọi ngày còn lại
    await decideDay(auth('linh'), {
      branchId: cs5,
      userId: uid('chin'),
      date: addDays(first, 1),
      status: 'leave',
      note: 'Ốm',
    })
    await decideDay(auth('linh'), {
      branchId: cs5,
      userId: uid('chin'),
      date: addDays(first, 2),
      status: 'unexcused',
    })
    const s = await monthSheet(auth('linh'), { branchId: cs5, month: prev })
    const c = s.people.find((p) => p.userId === uid('chin'))!.counts
    expect(c).toMatchObject({ leave: 1, unexcused: 1, absent: 2 })
    expect(c.pending + c.worked + c.leave + c.unexcused + c.closed + c.out).toBe(Number(last.slice(8)))
  })
})

describe('4.9 — Cần xử lý trên Tổng quan', () => {
  it('Nhung thấy ngày công chưa duyệt, đơn nghỉ chờ duyệt; thợ không thấy', async () => {
    await createLeave(auth('chin'), {
      branchId: cs5,
      createRequestId: rid(),
      fromDate: addDays(today, 40),
      toDate: addDays(today, 40),
      reason: 'Đi đám cưới',
    })
    // Chưa chọn tháng bắt đầu: chỉ đếm ngày đã vào ca mà chưa duyệt → 0
    const o1 = await overview(auth('nhung'), { branchId: cs5, period: 'day' })
    expect(o1.attention.leavesPending).toBe(1)
    expect(o1.attention.pendingDays).toBe(0)
    // Chọn tháng bắt đầu = tháng trước: mọi ngày chưa duyệt từ đó đến hôm qua
    await saveSettings(auth('linh'), { branchId: cs5, startMonth: `${addMonths(thisMonth, -1)}-01` })
    const o2 = await overview(auth('nhung'), { branchId: cs5, period: 'day' })
    expect(o2.attention.pendingDays).toBeGreaterThan(0)
    const o3 = await overview(auth('trang'), { branchId: cs5, period: 'day' })
    expect(o3.attention).toMatchObject({ pendingDays: 0, leavesPending: 0 })
  })
})

describe('S53 — thợ chỉ đọc công, nghỉ của mình', () => {
  it('Bảng công, đơn nghỉ, lịch sử chấm công người khác: 0 dòng (SQL)', async () => {
    for (const table of ['attendance_days', 'leave_requests'] as const) {
      const rows = await withUser(uid('trang'), (tx) =>
        table === 'attendance_days'
          ? tx<{ userId: string }[]>`select user_id from attendance_days where branch_id = ${cs5}`
          : tx<{ userId: string }[]>`select user_id from leave_requests where branch_id = ${cs5}`,
      )
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.userId === uid('trang'))).toBe(true)
    }
    const grid = await withUser(
      uid('trang'),
      (tx) =>
        tx<
          { userId: string }[]
        >`select distinct user_id from app.attendance_grid(${cs5}, ${today}::date, ${today}::date)`,
    )
    expect(grid.map((r) => r.userId)).toEqual([uid('trang')])
  })
})

describe('S59 (phần 4A) — tháng đã khoá bảng lương', () => {
  it('Không sửa công, nghỉ, ngày đóng cửa, chính sách, ngày vào làm của tháng đã khoá', async () => {
    const { first } = monthRange(lockedMonth)
    await owner`insert into payroll_periods (branch_id, month, locked_by) values (${cs5}, ${first}::date, ${uid('linh')})`
    const day = addDays(first, 5)
    expect(
      (
        await err(
          decideDay(auth('nhung'), { branchId: cs5, userId: uid('chin'), date: day, status: 'unexcused' }),
        )
      ).status,
    ).toBe(422)
    expect(
      (await err(addClosedDays(auth('linh'), { branchId: cs5, fromDate: day, toDate: day, reason: 'x' })))
        .status,
    ).toBe(422)
    expect(
      (
        await err(
          savePolicy(auth('linh'), {
            branchId: cs5,
            userId: uid('chin'),
            effectiveMonth: first,
            baseSalary: 1,
            commissionBps: 0,
            leaveDays: 0,
            managerKpi: false,
          }),
        )
      ).status,
    ).toBe(422)
    expect((await err(profile('chin', addDays(startDate, 3)))).status).toBe(422)
    await expectPgError(
      withUser(
        uid('linh'),
        (
          tx,
        ) => tx`insert into leave_requests (branch_id, user_id, from_date, to_date, reason, create_request_id)
                   values (${cs5}, ${uid('linh')}, ${day}::date, ${day}::date, 'x', gen_random_uuid())`,
      ),
      'P0001',
    )
    await expectPgError(owner`delete from payroll_periods where branch_id = ${cs5}`, '42501')
    // Đã khoá thì không đổi tháng bắt đầu được
    expect((await err(saveSettings(auth('linh'), { branchId: cs5, startMonth: null }))).status).toBe(422)
  })
})
