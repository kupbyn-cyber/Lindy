// S65 — chip dịch vụ của form lịch: cơ sở mới có 7 chip mặc định; chỉ booking_settings.manage (Linh) sửa, có audit;
// thợ gọi hàm bị chặn, sửa thẳng DB không đổi được dòng (policy); DB chặn quá 20 chip, chip dài, chip có "+";
// thêm cột có CHECK gọi hàm vẫn lưu được giờ mở cửa dưới app_user. Chạy trên cơ sở thử riêng "CS12".
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ServiceChipsBody } from '../../src/server/appointments/schema'
import { getSettings, updateServiceChips, updateSettings } from '../../src/server/appointments/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const DEFAULT = ['Tay', 'Chân', 'Gel', 'Móng giả', 'Design', 'Mi', 'Chăm sóc']
let cs12 = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS12', 'Zz cơ sở thử chip dịch vụ', 'CS12') returning id`
  cs12 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs12})`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs12}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'trang'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs12}`
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id
const chipsInDb = async () => {
  const [r] = await owner<{ serviceChips: string[] }[]>`
    select service_chips from branch_booking_settings where branch_id = ${cs12}`
  return r!.serviceChips
}

describe('S65 — chip dịch vụ', () => {
  it('cơ sở mới có 7 chip mặc định; thợ đọc được qua cài đặt lịch', async () => {
    expect((await getSettings(auth('trang'), cs12)).serviceChips).toEqual(DEFAULT)
  })

  it('Linh sửa được: bỏ trùng, giữ thứ tự, có audit; trả về chip mới kèm mùa cọc', async () => {
    const res = await updateServiceChips(auth('linh'), {
      branchId: cs12,
      chips: [' Úp móng ', 'Tay', 'tay', 'Chân'],
    })
    expect(res.serviceChips).toEqual(['Úp móng', 'Tay', 'Chân'])
    expect(res).toHaveProperty('depositSeason')
    expect(await chipsInDb()).toEqual(['Úp móng', 'Tay', 'Chân'])
    const [a] = await owner<{ details: { before: string[]; after: string[] } }[]>`
      select details from audit_logs
      where branch_id = ${cs12} and action = 'booking_settings.service_chips_updated'
      order by id desc limit 1`
    expect(a!.details).toEqual({ before: DEFAULT, after: ['Úp móng', 'Tay', 'Chân'] })
  })

  it('thợ gọi hàm bị chặn 403; sửa thẳng DB không đổi được dòng', async () => {
    const before = await chipsInDb()
    try {
      await updateServiceChips(auth('trang'), { branchId: cs12, chips: ['Hack'] })
      expect.unreachable()
    } catch (e) {
      expect(e instanceof AppError && e.status).toBe(403)
    }
    const n = await withUser(
      uid('trang'),
      (tx) => tx`update branch_booking_settings set service_chips = array['Hack'] where branch_id = ${cs12}`,
    )
    expect(n.count).toBe(0)
    expect(await chipsInDb()).toEqual(before)
  })

  it('chip có dấu + bị từ chối ở API và DB; DB chặn quá 20 chip, chip 31 ký tự', async () => {
    expect(ServiceChipsBody.safeParse({ chips: ['Tay + Chân'] }).success).toBe(false)
    try {
      await updateServiceChips(auth('linh'), { branchId: cs12, chips: ['Tay + Chân'] })
      expect.unreachable()
    } catch (e) {
      expect(e instanceof AppError && e.status).toBe(422)
    }
    await expectPgError(
      owner`update branch_booking_settings set service_chips = array['Tay + Chân'] where branch_id = ${cs12}`,
      '23514',
    )
    const many = Array.from({ length: 21 }, (_, i) => `Chip ${i}`)
    await expectPgError(
      owner`update branch_booking_settings set service_chips = ${many}::text[] where branch_id = ${cs12}`,
      '23514',
    )
    await expectPgError(
      owner`update branch_booking_settings set service_chips = ${['x'.repeat(31)]}::text[] where branch_id = ${cs12}`,
      '23514',
    )
  })

  it('sau migration Linh vẫn lưu giờ mở cửa dưới app_user (CHECK gọi hàm có quyền EXECUTE)', async () => {
    const s = await updateSettings(auth('linh'), {
      branchId: cs12,
      openTime: '09:00',
      closeTime: '21:00',
      defaultDurationMin: 90,
    })
    expect(s.defaultDurationMin).toBe(90)
    expect(s.serviceChips).toEqual(await chipsInDb())
  })
})
