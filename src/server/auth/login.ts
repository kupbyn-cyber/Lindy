// Đăng nhập và đổi mật khẩu (bước 0.12).
// Chống dò [P8]: theo tài khoản thì chậm dần sau 5 lần sai (không khoá cứng); theo IP thì khoá 15 phút sau 20 lần sai.
// Luôn chạy scrypt kể cả khi không có tài khoản; mọi trường hợp sai trả cùng một câu.
import { normalizeLoginPhone } from '~/lib/phone'
import { withWorker } from '../db/client'
import { invalid, tooMany, unauthorized } from '../http/errors'
import { checkPasswordPolicy, getDummyHash, hashPassword, verifyPassword } from './password'
import { createSession, revokeSessions } from './session'

export const LOGIN_FAIL_MESSAGE = 'SĐT/email hoặc mật khẩu không đúng.'
const WINDOW_MIN = 15
const IP_LIMIT = 20
const ID_FREE_FAILS = 5
const ID_MAX_DELAY_S = 30

export function normalizeIdentifier(raw: string): string | null {
  const s = raw.trim()
  if (s.length === 0 || s.length > 200) return null
  if (s.includes('@')) return s.toLowerCase()
  return normalizeLoginPhone(s)
}

/** Số giây phải chờ sau lần sai gần nhất: 0 với 5 lần sai đầu, rồi 1, 2, 4, … tối đa 30. */
export function delayAfterFailures(fails: number) {
  if (fails < ID_FREE_FAILS) return 0
  return Math.min(2 ** (fails - ID_FREE_FAILS), ID_MAX_DELAY_S)
}

export async function login(input: {
  identifier: string
  password: string
  ip: string
  userAgent: string | null
}) {
  const identifier =
    normalizeIdentifier(input.identifier) ?? `invalid:${input.identifier.slice(0, 50).toLowerCase()}`
  const ip = input.ip.slice(0, 100) || 'unknown'

  const pre = await withWorker(async (tx) => {
    const [ipRow] = await tx<{ n: number }[]>`
      select count(*)::int as n from login_attempts
      where ip = ${ip} and not success and created_at > now() - make_interval(mins => ${WINDOW_MIN})`
    if ((ipRow?.n ?? 0) >= IP_LIMIT) {
      throw tooMany(`Thử sai quá nhiều lần. Thử lại sau ${WINDOW_MIN} phút.`)
    }
    // Đếm lần sai liên tiếp của tài khoản kể từ lần đúng gần nhất, trong 15 phút.
    const [idRow] = await tx<{ n: number; last: Date | null }[]>`
      select count(*)::int as n, max(created_at) as last from login_attempts
      where identifier = ${identifier} and not success
        and created_at > now() - make_interval(mins => ${WINDOW_MIN})
        and created_at > coalesce((select max(created_at) from login_attempts
                                   where identifier = ${identifier} and success), '-infinity')`
    const wait = delayAfterFailures(idRow?.n ?? 0)
    if (wait > 0 && idRow?.last) {
      const remaining = Math.ceil((new Date(idRow.last).getTime() + wait * 1000 - Date.now()) / 1000)
      if (remaining > 0) throw tooMany(`Thử lại sau ${remaining} giây.`)
    }
    const [user] = await tx<{ id: string; passwordHash: string; mustChangePassword: boolean }[]>`
      select u.id, c.password_hash, c.must_change_password
      from users u join user_credentials c on c.user_id = u.id
      where u.is_active and (u.phone = ${identifier} or u.email = ${identifier})`
    return user
  })

  const ok = await verifyPassword(pre?.passwordHash ?? (await getDummyHash()), input.password)
  const success = ok && pre != null

  if (!success || !pre) {
    // Ghi lần sai rồi mới báo lỗi; ném lỗi trong giao dịch sẽ rollback mất bản ghi này.
    await withWorker(
      (tx) => tx`insert into login_attempts (identifier, ip, success) values (${identifier}, ${ip}, false)`,
    )
    throw unauthorized(LOGIN_FAIL_MESSAGE)
  }

  return withWorker(async (tx) => {
    await tx`insert into login_attempts (identifier, ip, success) values (${identifier}, ${ip}, true)`
    const session = await createSession(tx, pre.id, input.userAgent)
    await tx`
      insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
      values (${pre.id}, 'auth.login', 'session', ${session.sessionId}, ${tx.json({ ip })})`
    return { ...session, userId: pre.id, mustChangePassword: pre.mustChangePassword }
  })
}

export async function logout(sessionId: string, userId: string) {
  await withWorker(async (tx) => {
    await revokeSessions(tx, { sessionId }, 'logout')
    await tx`
      insert into audit_logs (actor_user_id, action, entity_type, entity_id)
      values (${userId}, 'auth.logout', 'session', ${sessionId})`
  })
}

/** Đổi mật khẩu: kiểm mật khẩu cũ, áp K04, thu hồi mọi phiên khác và push của các máy đó [P1]. */
export async function changePassword(input: {
  userId: string
  sessionId: string
  currentPassword: string
  newPassword: string
}) {
  const policy = checkPasswordPolicy(input.newPassword)
  if (policy) throw invalid(policy)
  if (input.newPassword === input.currentPassword) throw invalid('Mật khẩu mới phải khác mật khẩu cũ.')

  const current = await withWorker(async (tx) => {
    const [row] = await tx<{ passwordHash: string }[]>`
      select password_hash from user_credentials where user_id = ${input.userId}`
    return row
  })
  if (!current || !(await verifyPassword(current.passwordHash, input.currentPassword))) {
    throw invalid('Mật khẩu hiện tại không đúng.')
  }
  const hash = await hashPassword(input.newPassword)
  await withWorker(async (tx) => {
    await tx`
      update user_credentials
      set password_hash = ${hash}, must_change_password = false, password_changed_at = now()
      where user_id = ${input.userId}`
    await revokeSessions(tx, { userId: input.userId, exceptSessionId: input.sessionId }, 'password_changed')
    await tx`
      insert into audit_logs (actor_user_id, action, entity_type, entity_id)
      values (${input.userId}, 'auth.password_changed', 'user', ${input.userId})`
  })
}
