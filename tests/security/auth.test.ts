// Bước 0.12–0.13: đăng nhập, phiên, đổi mật khẩu, quản trị tài khoản. Test S01, S02, S03, S09, S10, S18.
import { afterAll, describe, expect, it } from 'vitest'
import { createUser, lockUser, revokeBranch, unlockUser } from '../../src/server/admin/users'
import { requireAuth } from '../../src/server/auth/context'
import { changePassword, delayAfterFailures, LOGIN_FAIL_MESSAGE, login } from '../../src/server/auth/login'
import { checkPasswordPolicy } from '../../src/server/auth/password'
import { loadSession, sessionCookie } from '../../src/server/auth/session'
import { closeSql } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
afterAll(async () => {
  await owner.end()
  await closeSql()
})

const reqWith = (token: string) =>
  new Request('http://localhost/api/me', { headers: { cookie: `lindy_sid=${token}` } })

async function errOf(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

let ipCounter = 0
const freshIp = () => `10.0.0.${++ipCounter}`

describe('Đăng nhập', () => {
  it('đúng mật khẩu → tạo phiên; cookie HttpOnly, SameSite=Lax', async () => {
    const { users } = seed()
    const res = await login({
      identifier: 'LINH@lindy.test',
      password: users.linh!.password,
      ip: freshIp(),
      userAgent: 't',
    })
    const s = await loadSession(res.token)
    expect(s?.userId).toBe(users.linh!.id)
    const cookie = sessionCookie(new Request('http://localhost/'), res.token)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    const secure = sessionCookie(new Request('https://lindy.example/'), res.token)
    expect(secure.startsWith('__Host-lindy_sid=')).toBe(true)
    expect(secure).toContain('Secure')
  })

  it('S09 — sai mật khẩu và tài khoản không tồn tại trả cùng một câu', async () => {
    const { users } = seed()
    const a = await errOf(
      login({ identifier: users.chin!.email, password: 'sai-mat-khau', ip: freshIp(), userAgent: null }),
    )
    const b = await errOf(
      login({ identifier: 'khong-co@lindy.test', password: 'sai-mat-khau', ip: freshIp(), userAgent: null }),
    )
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(a.message).toBe(LOGIN_FAIL_MESSAGE)
    expect(b.message).toBe(LOGIN_FAIL_MESSAGE)
  })

  it('S09 — sai nhiều lần: chậm dần theo tài khoản, không khoá cứng', async () => {
    expect([0, 4, 5, 6, 7, 20].map(delayAfterFailures)).toEqual([0, 0, 1, 2, 4, 30])
    const { users } = seed()
    for (let i = 0; i < 5; i++) {
      const e = await errOf(
        login({ identifier: users.nhung!.email, password: `sai-${i}`, ip: freshIp(), userAgent: null }),
      )
      expect(e.status).toBe(401)
    }
    // Lần thứ 6 ngay sau đó: phải chờ 1 giây
    const wait = await errOf(
      login({
        identifier: users.nhung!.email,
        password: users.nhung!.password,
        ip: freshIp(),
        userAgent: null,
      }),
    )
    expect(wait.status).toBe(429)
    await new Promise((r) => setTimeout(r, 1100))
    // Chờ xong thì chủ tài khoản vẫn vào được
    const ok = await login({
      identifier: users.nhung!.email,
      password: users.nhung!.password,
      ip: freshIp(),
      userAgent: null,
    })
    expect(ok.userId).toBe(users.nhung!.id)
  })

  it('S09 — một IP sai 20 lần → khoá IP đó 15 phút', async () => {
    const ip = freshIp()
    for (let i = 0; i < 20; i++) {
      await errOf(login({ identifier: `x${i}@lindy.test`, password: 'sai', ip, userAgent: null }))
    }
    const e = await errOf(
      login({ identifier: 'linh@lindy.test', password: 'gi-cung-duoc', ip, userAgent: null }),
    )
    expect(e.status).toBe(429)
  })
})

describe('Mật khẩu (K04)', () => {
  it('S10 — ngắn hơn 8 ký tự hoặc phổ biến → từ chối', () => {
    expect(checkPasswordPolicy('abc123')).toMatch('8 ký tự')
    expect(checkPasswordPolicy('12345678')).toMatch('dễ đoán')
    expect(checkPasswordPolicy('Password')).toMatch('dễ đoán')
    expect(checkPasswordPolicy('aaaaaaaaaa')).toMatch('dễ đoán')
    expect(checkPasswordPolicy('Ngà-mực-2027')).toBeNull()
  })

  it('S02 — đổi mật khẩu trên máy A thu hồi phiên máy B; máy A vẫn dùng được', async () => {
    const { users } = seed()
    const created = await owner.begin((tx) =>
      createUser(tx, 'test', { name: 'Thử Đổi', email: 'doi-mk@lindy.test', role: 'staff', branch: 'HTK' }),
    )
    const a = await login({
      identifier: 'doi-mk@lindy.test',
      password: created.password,
      ip: freshIp(),
      userAgent: 'A',
    })
    const b = await login({
      identifier: 'doi-mk@lindy.test',
      password: created.password,
      ip: freshIp(),
      userAgent: 'B',
    })
    const bad = await errOf(
      changePassword({
        userId: a.userId,
        sessionId: a.sessionId,
        currentPassword: created.password,
        newPassword: '12345678',
      }),
    )
    expect(bad.status).toBe(422)
    await changePassword({
      userId: a.userId,
      sessionId: a.sessionId,
      currentPassword: created.password,
      newPassword: 'Mới-đủ-dài-1',
    })
    expect(await loadSession(a.token)).not.toBeNull()
    expect(await loadSession(b.token)).toBeNull()
    expect(users).toBeTruthy()
  })
})

describe('Phiên', () => {
  it('S03 — quá hạn tuyệt đối → không còn hiệu lực dù vẫn dùng đều', async () => {
    const { users } = seed()
    const s = await login({
      identifier: users.trang!.email,
      password: users.trang!.password,
      ip: freshIp(),
      userAgent: null,
    })
    expect(await loadSession(s.token)).not.toBeNull()
    await owner`update sessions set absolute_expires_at = now() - interval '1 second' where id = ${s.sessionId}`
    expect(await loadSession(s.token)).toBeNull()
  })

  it('S18 — còn cờ phải đổi mật khẩu → API thường 403, đổi mật khẩu thì được', async () => {
    const created = await owner.begin((tx) =>
      createUser(tx, 'test', { name: 'Mới Vào', email: 'moi-vao@lindy.test', role: 'staff', branch: 'HTK' }),
    )
    const s = await login({
      identifier: 'moi-vao@lindy.test',
      password: created.password,
      ip: freshIp(),
      userAgent: null,
    })
    const e = await errOf(requireAuth(reqWith(s.token)))
    expect(e.status).toBe(403)
    const auth = await requireAuth(reqWith(s.token), { allowMustChange: true })
    expect(auth.mustChangePassword).toBe(true)
  })

  it('S01 — khoá tài khoản → phiên mất hiệu lực ngay, push bị tắt', async () => {
    const created = await owner.begin((tx) =>
      createUser(tx, 'test', {
        name: 'Sắp Nghỉ',
        email: 'sap-nghi@lindy.test',
        role: 'staff',
        branch: 'HTK',
      }),
    )
    const s = await login({
      identifier: 'sap-nghi@lindy.test',
      password: created.password,
      ip: freshIp(),
      userAgent: null,
    })
    await owner`insert into push_subscriptions (user_id, session_id, endpoint, p256dh, auth)
                values (${s.userId}, ${s.sessionId}, 'https://fcm.googleapis.com/fcm/send/abc', 'p256dh-key-xxxxxxxx', 'auth-key-xx')`
    await owner.begin((tx) => lockUser(tx, 'test', 'sap-nghi@lindy.test'))
    expect(await loadSession(s.token)).toBeNull()
    const e = await errOf(requireAuth(reqWith(s.token)))
    expect(e.status).toBe(401)
    const [push] =
      await owner`select count(*)::int as n from push_subscriptions where user_id = ${s.userId} and disabled_at is null`
    expect(push!.n).toBe(0)
    // Mở khoá rồi vẫn phải đăng nhập lại
    await owner.begin((tx) => unlockUser(tx, 'test', 'sap-nghi@lindy.test'))
    expect(await loadSession(s.token)).toBeNull()
  })

  it('Thu quyền cơ sở → phiên bị thu hồi, đăng nhập lại không còn cơ sở đó', async () => {
    const created = await owner.begin((tx) =>
      createUser(tx, 'test', {
        name: 'Thu Quyền',
        email: 'thu-quyen@lindy.test',
        role: 'staff',
        branch: 'HTK',
      }),
    )
    await owner`update user_credentials set must_change_password = false where user_id = ${created.userId}`
    const s = await login({
      identifier: 'thu-quyen@lindy.test',
      password: created.password,
      ip: freshIp(),
      userAgent: null,
    })
    await owner.begin((tx) => revokeBranch(tx, 'test', 'thu-quyen@lindy.test', 'HTK'))
    expect(await loadSession(s.token)).toBeNull()
    const again = await login({
      identifier: 'thu-quyen@lindy.test',
      password: created.password,
      ip: freshIp(),
      userAgent: null,
    })
    const auth = await loadSession(again.token)
    expect(auth?.branches).toEqual([])
  })
})
