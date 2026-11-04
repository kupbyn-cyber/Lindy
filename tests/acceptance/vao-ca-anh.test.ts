// Nghiệm thu vào ca bằng ảnh có giờ (S59–S61; kế hoạch docs/plans/2026-11-04-vao-ca-chup-anh.md mục 2, 6.4.1):
// có ảnh → tự duyệt Đi làm; không ảnh → chờ duyệt; ngày đóng cửa, nghỉ cả ngày đã duyệt, tháng đã khoá → không tự duyệt;
// ảnh hỏng, quá 150KB → lỗi; Nhung/Linh quyết lại thì mất nhãn tự duyệt; quyền xem ảnh; xoá ảnh sau 35 ngày giữ dòng
// công; bản sao lưu không gồm ảnh. Chạy trên cơ sở thử riêng "CSANH".
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, monthRange, toLocalDate } from '../../src/lib/time'
import { addClosedDays, removeClosedDay } from '../../src/server/attendance/closed-days'
import { createLeave } from '../../src/server/attendance/leave'
import { checkInWithPhoto, getCheckInPhoto, purgeOldCheckInPhotos } from '../../src/server/attendance/photo'
import { checkIn, dayBoard, decideDay, myMonth, myToday } from '../../src/server/attendance/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { backupDump, resetBackupLimit } from '../../src/server/export/backup'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { saveProfile } from '../../src/server/staff/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
const startDate = addDays(today, -90)
let cs = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CSANH', 'Zz cơ sở thử vào ca có ảnh', 'CSANH') returning id`
  cs = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs})`
  await owner`insert into payroll_settings (branch_id) values (${cs})`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
    ['mai', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'] as const)
    await saveProfile(S.linh!.auth, {
      branchId: cs,
      userId: seed().users[k]!.id,
      startDate,
      endDate: null,
      payMethod: 'cash',
    })
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs}`
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

/** Ảnh JPEG giả: đúng byte đầu, đủ cỡ (DB và API chỉ kiểm byte đầu, cỡ) */
function jpeg(size = 2048, seedByte = 1) {
  const b = new Uint8Array(size).fill(seedByte)
  b.set([0xff, 0xd8, 0xff, 0xe0])
  return b
}
const png = () => {
  const b = new Uint8Array(1024)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return b
}

let trangPhoto = ''

describe('S59 — vào ca có ảnh thì tự duyệt Đi làm', () => {
  it('Có ảnh → giờ DB ghi, Đi làm, nhãn tự duyệt, ảnh lưu đúng cỡ, có audit; Nhung thấy ở Duyệt công', async () => {
    const t = await checkInWithPhoto(auth('trang'), cs, jpeg(4096, 7))
    expect(t.day).toMatchObject({ status: 'worked', decided: 'worked', autoApproved: true })
    expect(t.day?.checkIn).toBeTruthy()
    expect(t.day?.photo?.purged).toBe(false)
    trangPhoto = t.day!.photo!.id
    const [p] = await owner<{ size: number; sha256: string; workDate: string; userId: string }[]>`
      select size, sha256, work_date::text, user_id from attendance_photos where id = ${trangPhoto}`
    expect(p).toMatchObject({ size: 4096, workDate: today, userId: uid('trang') })
    expect(p!.sha256).toHaveLength(64)
    const [a] = await owner<{ n: number }[]>`
      select count(*)::int as n from audit_logs
      where branch_id = ${cs} and action = 'attendance.auto_approved' and entity_id = ${uid('trang')}`
    expect(a!.n).toBe(1)
    const board = await dayBoard(auth('nhung'), { branchId: cs, date: today })
    const row = board.people.find((x) => x.userId === uid('trang'))
    expect(row).toMatchObject({
      status: 'worked',
      autoApproved: true,
      photo: { id: trangPhoto, purged: false },
    })
    // Không còn trong số "đã vào ca chờ duyệt"
    expect(board.checkedInPending).toBe(0)
  })

  it('Màn chụp lấy giờ máy chủ, tên người vào ca', async () => {
    const t = await myToday(auth('trang'), cs)
    expect(Math.abs(Date.parse(t.serverNow) - Date.now())).toBeLessThan(60_000)
    expect(t.timezone).toBe('Asia/Ho_Chi_Minh')
    expect(t.name).toBe(auth('trang').displayName)
  })

  it('Mỗi ngày một ảnh: vào ca lần hai → 422; bấm Vào ca không ảnh giữ giờ đầu, vẫn tự duyệt', async () => {
    const first = (await myToday(auth('trang'), cs)).day!.checkIn
    expect((await err(checkInWithPhoto(auth('trang'), cs, jpeg()))).status).toBe(422)
    const again = await checkIn(auth('trang'), cs)
    expect(again.day).toMatchObject({ checkIn: first, autoApproved: true })
  })

  it('Vào ca không ảnh → chờ duyệt như cũ; sau đó không bổ sung ảnh được', async () => {
    const t = await checkIn(auth('chin'), cs)
    expect(t.day).toMatchObject({ status: 'pending', decided: null, autoApproved: false, photo: null })
    expect((await err(checkInWithPhoto(auth('chin'), cs, jpeg()))).status).toBe(422)
    expect((await dayBoard(auth('nhung'), { branchId: cs, date: today })).checkedInPending).toBe(1)
  })

  it('Ảnh không phải JPEG, ảnh rỗng, ảnh > 150KB → 422 (API và SQL); không ghi giờ vào ca', async () => {
    expect((await err(checkInWithPhoto(auth('mai'), cs, png()))).status).toBe(422)
    expect((await err(checkInWithPhoto(auth('mai'), cs, new Uint8Array()))).status).toBe(422)
    expect((await err(checkInWithPhoto(auth('mai'), cs, jpeg(150 * 1024 + 1)))).status).toBe(422)
    await expectPgError(
      withUser(
        uid('mai'),
        (tx) => tx`select app.attendance_check_in_photo(${cs}, ${Buffer.from(png())}::bytea)`,
      ),
      'P0001',
    )
    await expectPgError(
      withUser(
        uid('mai'),
        (tx) => tx`select app.attendance_check_in_photo(${cs}, ${Buffer.from(jpeg(150 * 1024 + 1))}::bytea)`,
      ),
      'P0001',
    )
    expect((await myToday(auth('mai'), cs)).day?.checkIn).toBeNull()
  })
})

describe('S59 — trường hợp không tự duyệt', () => {
  it('Có nghỉ cả ngày đã duyệt → vẫn ghi giờ, ảnh; giữ Nghỉ, chờ Nhung/Linh quyết', async () => {
    await createLeave(auth('nhung'), {
      branchId: cs,
      createRequestId: rid(),
      fromDate: today,
      toDate: today,
      reason: 'Việc nhà',
    })
    const t = await checkInWithPhoto(auth('nhung'), cs, jpeg())
    expect(t.day).toMatchObject({ status: 'leave', decided: null, autoApproved: false })
    expect(t.day?.checkIn).toBeTruthy()
    expect(t.day?.photo).toBeTruthy()
  })

  it('Ngày quán đóng cửa → không tự duyệt', async () => {
    const d = await addClosedDays(auth('linh'), {
      branchId: cs,
      fromDate: today,
      toDate: today,
      reason: 'Thử',
    })
    const t = await checkInWithPhoto(auth('linh'), cs, jpeg())
    expect(t.day).toMatchObject({ status: 'closed', decided: null, autoApproved: false })
    await removeClosedDay(auth('linh'), d.days.find((x) => x.closedDate === today)!.id, cs)
  })
})

describe('S59 — Nhung, Linh quyết lại ngày tự duyệt', () => {
  it('Đổi sang Nghỉ không phép cần lý do; có lý do → mất nhãn tự duyệt, audit ghi wasAuto', async () => {
    const base = { branchId: cs, userId: uid('trang'), date: today, status: 'unexcused' as const }
    expect((await err(decideDay(auth('nhung'), base))).status).toBe(422)
    const b = await decideDay(auth('nhung'), { ...base, note: 'Ảnh không phải Trang' })
    expect(b.people.find((x) => x.userId === uid('trang'))).toMatchObject({
      status: 'unexcused',
      autoApproved: false,
      photo: { id: trangPhoto, purged: false },
    })
    const [a] = await owner<{ details: { wasAuto: boolean } }[]>`
      select details from audit_logs where branch_id = ${cs} and action = 'attendance.decided'
        and entity_id = ${uid('trang')} order by id desc limit 1`
    expect(a!.details.wasAuto).toBe(true)
    await decideDay(auth('nhung'), { ...base, status: 'worked', note: 'Nhầm, đúng là Trang' })
  })
})

describe('S60 — ai xem ảnh vào ca', () => {
  it('Chính mình, Nhung, Linh xem được; thợ khác → 404; SQL thợ khác 0 dòng', async () => {
    for (const k of ['trang', 'nhung', 'linh'] as const)
      expect((await getCheckInPhoto(auth(k), trangPhoto)).length).toBe(4096)
    expect((await err(getCheckInPhoto(auth('chin'), trangPhoto))).status).toBe(404)
    expect((await err(getCheckInPhoto(auth('chin'), 'khong-phai-uuid'))).status).toBe(404)
    const rows = await withUser(
      uid('chin'),
      (tx) => tx`select id from attendance_photos where branch_id = ${cs}`,
    )
    expect(rows).toHaveLength(0)
    const m = await myMonth(auth('chin'), { branchId: cs, month: today.slice(0, 7) })
    expect(m.days.some((d) => d.photo)).toBe(false)
  })

  it('App không ghi, sửa, xoá thẳng bảng ảnh; không gọi được hàm xoá ảnh (SQL)', async () => {
    await expectPgError(
      withUser(
        uid('chin'),
        (
          tx,
        ) => tx`insert into attendance_photos (attendance_day_id, branch_id, user_id, work_date, size, sha256, data)
                   select id, branch_id, user_id, work_date, 4, repeat('a', 64), '\xffd8ffe0'::bytea
                   from attendance_days where branch_id = ${cs} and user_id = ${uid('chin')}`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`update attendance_photos set data = null where id = ${trangPhoto}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`delete from attendance_photos where id = ${trangPhoto}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`select app.attendance_photo_purge()`),
      '42501',
    )
    await expectPgError(owner`delete from attendance_photos where id = ${trangPhoto}`, '42501')
  })
})

describe('S61 — ảnh tự xoá sau 35 ngày', () => {
  it('Ảnh ngày thứ 36 bị xoá dữ liệu, ngày thứ 35 còn; dòng công giữ nguyên; báo đã xoá', async () => {
    const d36 = addDays(today, -36)
    const d35 = addDays(today, -35)
    const ids: Record<string, string> = {}
    for (const d of [d36, d35]) {
      const [a] = await owner<{ id: string }[]>`
        insert into attendance_days (branch_id, user_id, work_date, check_in_at, status, decided_by, decided_at, auto_approved)
        values (${cs}, ${uid('mai')}, ${d}::date, ${`${d}T01:00:00Z`}::timestamptz, 'worked', ${uid('mai')}, now(), true)
        returning id`
      const [p] = await owner<{ id: string }[]>`
        insert into attendance_photos (attendance_day_id, branch_id, user_id, work_date, size, sha256, data, taken_at)
        values (${a!.id}, ${cs}, ${uid('mai')}, ${d}::date, 2048, repeat('a', 64), ${Buffer.from(jpeg())}::bytea,
                ${`${d}T01:00:00Z`}::timestamptz)
        returning id`
      ids[d] = p!.id
    }
    expect(await purgeOldCheckInPhotos({ force: true })).toBeGreaterThanOrEqual(1)
    const rows = await owner<{ id: string; hasData: boolean; purgedAt: Date | null }[]>`
      select id, data is not null as has_data, purged_at from attendance_photos where id in ${owner([ids[d36]!, ids[d35]!])}`
    expect(rows.find((r) => r.id === ids[d36])).toMatchObject({ hasData: false })
    expect(rows.find((r) => r.id === ids[d36])!.purgedAt).toBeTruthy()
    expect(rows.find((r) => r.id === ids[d35])).toMatchObject({ hasData: true, purgedAt: null })
    const [day] = await owner<{ status: string; checkInAt: Date | null; autoApproved: boolean }[]>`
      select status, check_in_at, auto_approved from attendance_days
      where branch_id = ${cs} and user_id = ${uid('mai')} and work_date = ${d36}::date`
    expect(day).toMatchObject({ status: 'worked', autoApproved: true })
    expect(day!.checkInAt).toBeTruthy()
    const e = await err(getCheckInPhoto(auth('mai'), ids[d36]!))
    expect(e.status).toBe(404)
    expect(e.message).toMatch(/35 ngày/)
    const m = await myMonth(auth('mai'), { branchId: cs, month: d36.slice(0, 7) })
    expect(m.days.find((x) => x.date === d36)).toMatchObject({
      status: 'worked',
      photo: { id: ids[d36], purged: true },
    })
    const [a] = await owner<{ n: number }[]>`
      select count(*)::int as n from audit_logs where action = 'attendance.photos_purged'`
    expect(a!.n).toBeGreaterThanOrEqual(1)
  })

  it('Việc nền tự giãn: vừa chạy thì chưa chạy lại trong một giờ', async () => {
    const now = Date.now()
    await purgeOldCheckInPhotos({ force: true, now })
    expect(await purgeOldCheckInPhotos({ now: now + 59 * 60_000 })).toBe(0)
  })
})

describe('Bản sao lưu Linh tải không gồm ảnh vào ca (S61)', () => {
  it('Có bảng công, không có bảng ảnh', async () => {
    resetBackupLimit()
    const { json } = await backupDump(auth('linh'), cs)
    const dump = JSON.parse(json) as { tables: Record<string, unknown[]> }
    expect(dump.tables.attendance_days).toBeDefined()
    expect(dump.tables.attendance_photos).toBeUndefined()
  })
})

describe('S59 — tháng đã khoá lương không tự duyệt', () => {
  it('Vào ca có ảnh trong tháng đã khoá → ghi giờ, ảnh, không tự duyệt', async () => {
    const { first } = monthRange(today.slice(0, 7))
    await owner`insert into payroll_periods (branch_id, month, locked_by) values (${cs}, ${first}::date, ${uid('linh')})`
    const t = await checkInWithPhoto(auth('mai'), cs, jpeg())
    expect(t.day).toMatchObject({ decided: null, autoApproved: false })
    expect(t.day?.photo).toBeTruthy()
  })
})
