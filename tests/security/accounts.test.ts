// Quản lý tài khoản trên app (Thêm → Tài khoản): chỉ Chủ; không thao tác lên chính mình; thu hồi phiên khi đổi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createAccount,
  listAccounts,
  resetAccountPassword,
  revokeAccount,
  setAccountActive,
  setAccountRole,
} from '../../src/server/admin/accounts'
import { requireAuth } from '../../src/server/auth/context'
import { login } from '../../src/server/auth/login'
import { loadSession } from '../../src/server/auth/session'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
let ip = 0
beforeAll(async () => {
  for (const k of ['linh', 'nhung'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth

// Đổi lỗi giống lớp API (handle → errorResponse): lỗi PostgreSQL → 403/404/422.
async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    const mapped = fromDbError(e)
    if (mapped) return mapped
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

describe('Quản lý tài khoản', () => {
  it('Chủ tạo tài khoản: mật khẩu tạm đăng nhập được, bị bắt đổi mật khẩu', async () => {
    const res = await createAccount(auth('linh'), { name: 'Hoa', phone: '0912 000 111', role: 'staff' })
    expect(res.tempPassword.length).toBeGreaterThanOrEqual(12)
    const s = await login({
      identifier: '0912000111',
      password: res.tempPassword,
      ip: `10.7.0.${ip++}`,
      userAgent: null,
    })
    expect(s.mustChangePassword).toBe(true)
    const list = await listAccounts(auth('linh'))
    const hoa = list.find((u) => u.id === res.id)!
    expect(hoa.roleCode).toBe('staff')
    expect(hoa.mustChangePassword).toBe(true)
    // Trùng SĐT → báo rõ
    const dup = await err(createAccount(auth('linh'), { name: 'Hoa 2', phone: '0912000111', role: 'staff' }))
    expect(dup.status).toBe(422)
  })

  it('Quản lý (Nhung) không quản lý được tài khoản — chặn ở API và DB', async () => {
    expect((await err(listAccounts(auth('nhung')))).status).toBe(403)
    expect(
      (await err(createAccount(auth('nhung'), { name: 'X', phone: '0912000222', role: 'owner' }))).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        seed().users.nhung!.id,
        (tx) =>
          tx`select app.admin_create_user(${seed().branchIds.HTK!}::uuid, 'X', '0912000333', null, 'owner', 'h')`,
      ),
      '42501',
    )
  })

  it('Không thao tác được trên chính mình (tránh tự khoá)', async () => {
    const e = await err(setAccountActive(auth('linh'), seed().users.linh!.id, false))
    expect(e.status).toBe(422)
    const e2 = await err(setAccountRole(auth('linh'), seed().users.linh!.id, 'staff'))
    expect(e2.status).toBe(422)
  })

  it('Đặt lại mật khẩu, đổi vai trò, khoá, thu quyền → phiên cũ mất hiệu lực', async () => {
    const res = await createAccount(auth('linh'), { name: 'Lan', email: 'lan@lindy.test', role: 'staff' })
    await owner`update user_credentials set must_change_password = false where user_id = ${res.id}`
    const s1 = await login({
      identifier: 'lan@lindy.test',
      password: res.tempPassword,
      ip: `10.7.1.${ip++}`,
      userAgent: null,
    })

    const r = await resetAccountPassword(auth('linh'), res.id)
    expect(await loadSession(s1.token)).toBeNull()
    await owner`update user_credentials set must_change_password = false where user_id = ${res.id}`
    const s2 = await login({
      identifier: 'lan@lindy.test',
      password: r.tempPassword,
      ip: `10.7.1.${ip++}`,
      userAgent: null,
    })

    await setAccountRole(auth('linh'), res.id, 'staff_booking_plus')
    expect(await loadSession(s2.token)).toBeNull()
    const s3 = await login({
      identifier: 'lan@lindy.test',
      password: r.tempPassword,
      ip: `10.7.1.${ip++}`,
      userAgent: null,
    })
    const a3 = await loadSession(s3.token)
    expect(a3!.branches[0]!.perms).toContain('appointments.manage_all')

    await setAccountActive(auth('linh'), res.id, false)
    expect(await loadSession(s3.token)).toBeNull()
    const locked = await err(
      login({
        identifier: 'lan@lindy.test',
        password: r.tempPassword,
        ip: `10.7.1.${ip++}`,
        userAgent: null,
      }),
    )
    expect(locked.status).toBe(401)
    await setAccountActive(auth('linh'), res.id, true)

    const s4 = await login({
      identifier: 'lan@lindy.test',
      password: r.tempPassword,
      ip: `10.7.1.${ip++}`,
      userAgent: null,
    })
    await revokeAccount(auth('linh'), res.id)
    expect(await loadSession(s4.token)).toBeNull()
    const s5 = await login({
      identifier: 'lan@lindy.test',
      password: r.tempPassword,
      ip: `10.7.1.${ip++}`,
      userAgent: null,
    })
    const a5 = await requireAuth(
      new Request('http://localhost/', { headers: { cookie: `lindy_sid=${s5.token}` } }),
    )
    expect(a5.branches).toEqual([])

    const audit = await owner<{ action: string }[]>`
      select action from audit_logs where entity_id = ${res.id} order by id`
    expect(audit.map((x) => x.action)).toEqual([
      'admin.user_created',
      'admin.password_reset',
      'admin.role_set',
      'admin.user_locked',
      'admin.user_unlocked',
      'admin.branch_revoked',
    ])
  })

  it('Chủ ở cơ sở này không thao tác được người chỉ thuộc cơ sở khác', async () => {
    const e = await err(resetAccountPassword(auth('linh'), seed().users.mai!.id))
    expect(e.status).toBe(404)
  })
})
