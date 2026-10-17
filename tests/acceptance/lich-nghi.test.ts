// Người nghỉ trên đầu màn Lịch (S32): ai xem được lịch cơ sở thấy tên người nghỉ ngày đó (đã duyệt, chờ duyệt) để
// sắp lịch; không thấy lý do; đơn bị từ chối, đã huỷ không hiện; không lẫn cơ sở khác; RLS đơn nghỉ giữ nguyên.
// Chạy trên cơ sở thử riêng "CS10".
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, addMonths, toLocalDate } from '../../src/lib/time'
import { actOnLeave, createLeave, staffOff } from '../../src/server/attendance/leave'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { saveProfile } from '../../src/server/staff/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
const day = addDays(today, 3)
const other = addDays(today, 9)
let cs10 = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS10', 'Zz cơ sở thử người nghỉ', 'CS10') returning id`
  cs10 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs10})`
  await owner`insert into payroll_settings (branch_id) values (${cs10})`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs10}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const)
    await saveProfile(S.linh!.auth, {
      branchId: cs10,
      userId: seed().users[k]!.id,
      startDate: `${addMonths(today.slice(0, 7), -1)}-01`,
      endDate: null,
      payMethod: 'cash',
    })
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs10}`
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id
const leave = (k: SeedKey, from: string, to: string, reason: string) =>
  createLeave(auth(k), { branchId: cs10, createRequestId: rid(), fromDate: from, toDate: to, reason })

describe('S32 — người nghỉ trên màn Lịch', () => {
  it('thợ thấy tên người nghỉ (đã duyệt, chờ duyệt), không thấy lý do; từ chối, đã huỷ không hiện', async () => {
    await leave('trang', day, day, 'Việc riêng bí mật')
    const chin = await leave('chin', addDays(day, -1), addDays(day, 1), 'Về quê')
    await actOnLeave(auth('nhung'), chin.id, 'approve', { version: chin.version })
    // Nhung tự đăng ký → duyệt luôn; Linh huỷ có lý do → không hiện
    const nhung = await leave('nhung', day, day, 'Khám bệnh')
    await actOnLeave(auth('linh'), nhung.id, 'cancel', { version: nhung.version, note: 'Đổi ngày' })
    // Đơn bị từ chối → không hiện
    const t2 = await leave('trang', other, other, 'Đi chơi')
    await actOnLeave(auth('nhung'), t2.id, 'reject', { version: t2.version, note: 'Ngày đông khách' })

    const r = await staffOff(auth('trang'), { branchId: cs10, date: day })
    expect(r).toEqual({ date: day, off: ['Chin'], pending: ['Trang'] })
    expect(JSON.stringify(r)).not.toMatch(/bí mật|Về quê|Khám/)
    expect(await staffOff(auth('chin'), { branchId: cs10, date: other })).toEqual({
      date: other,
      off: [],
      pending: [],
    })
    // Ngày khác trong khoảng nghỉ của Chin
    expect((await staffOff(auth('linh'), { branchId: cs10, date: addDays(day, 1) })).off).toEqual(['Chin'])
  })

  it('không lẫn cơ sở khác; ngày sai → 422; RLS đơn nghỉ giữ nguyên (thợ vẫn không đọc được đơn người khác)', async () => {
    const htk = await staffOff(auth('trang'), { branchId: seed().branchIds.HTK!, date: day })
    expect([...htk.off, ...htk.pending]).not.toContain('Chin')
    try {
      await staffOff(auth('trang'), { branchId: cs10, date: '17/10/2026' })
      throw new Error('Mong lỗi nhưng chạy được.')
    } catch (e) {
      expect(e instanceof AppError && e.status).toBe(422)
    }
    const [n] = await withUser(
      uid('trang'),
      (tx) => tx<{ n: number }[]>`
        select count(*)::int as n from leave_requests where branch_id = ${cs10} and user_id = ${uid('chin')}`,
    )
    expect(n!.n).toBe(0)
    // Hàm DB chỉ trả tên, trạng thái
    const rows = await withUser(
      uid('trang'),
      (tx) => tx`select * from app.staff_off_on(${cs10}::uuid, ${day}::date)`,
    )
    expect(Object.keys(rows[0]!).sort()).toEqual(['displayName', 'status', 'userId'])
  })
})
