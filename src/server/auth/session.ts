// Phiên đăng nhập: token ngẫu nhiên trong cookie HttpOnly, DB chỉ lưu sha256 của token.
// Hạn trượt 30 ngày, hạn tuyệt đối 90 ngày [P1]. Mỗi request đọc lại từ DB, không lưu quyền trong cookie.
import { createHash, randomBytes } from 'node:crypto'
import { type Tx, withWorker } from '../db/client'
import { env } from '../env'

export const SLIDING_DAYS = 30
export const ABSOLUTE_DAYS = 90
const DAY = 24 * 60 * 60 * 1000

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function isSecureRequest(request: Request) {
  // Chạy sau proxy HTTPS của hosting: APP_ORIGIN là https thì luôn coi là HTTPS (cookie Secure, __Host-) [P18].
  if (env('APP_ORIGIN')?.startsWith('https://')) return true
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  return proto === 'https'
}

export function cookieName(secure: boolean) {
  return secure ? '__Host-lindy_sid' : 'lindy_sid'
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  const name = cookieName(isSecureRequest(request))
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) {
      const v = part.slice(eq + 1)
      return /^[A-Za-z0-9_-]{20,100}$/.test(v) ? v : null
    }
  }
  return null
}

export function sessionCookie(request: Request, token: string) {
  const secure = isSecureRequest(request)
  const attrs = [
    `${cookieName(secure)}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SLIDING_DAYS * 86400}`,
  ]
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookie(request: Request) {
  const secure = isSecureRequest(request)
  return `${cookieName(secure)}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
}

export async function createSession(tx: Tx, userId: string, userAgent: string | null) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const [row] = await tx<{ id: string }[]>`
    insert into sessions (user_id, token_hash, expires_at, absolute_expires_at, user_agent)
    values (${userId}, ${hashToken(token)}, ${new Date(now + SLIDING_DAYS * DAY)},
            ${new Date(now + ABSOLUTE_DAYS * DAY)}, ${userAgent?.slice(0, 300) ?? null})
    returning id`
  return { token, sessionId: row!.id }
}

/** roleName: tên vai trò để hiện (Thêm); quyền luôn đọc từ perms */
export type BranchAccess = {
  id: string
  name: string
  shortLabel: string
  roleName?: string
  perms: string[]
}
export type SessionInfo = {
  sessionId: string
  userId: string
  displayName: string
  mustChangePassword: boolean
  branches: BranchAccess[]
}

/** Kiểm phiên: chưa thu hồi, chưa hết hạn trượt và tuyệt đối, tài khoản còn hoạt động. Trượt hạn khi dùng. */
export async function loadSession(token: string): Promise<SessionInfo | null> {
  return withWorker(async (tx) => {
    const [s] = await tx<
      {
        sessionId: string
        userId: string
        displayName: string
        mustChangePassword: boolean
        lastSeenAt: Date
      }[]
    >`
      select s.id as session_id, u.id as user_id, u.display_name, c.must_change_password, s.last_seen_at
      from sessions s
      join users u on u.id = s.user_id
      join user_credentials c on c.user_id = u.id
      where s.token_hash = ${hashToken(token)}
        and s.revoked_at is null
        and s.expires_at > now()
        and s.absolute_expires_at > now()
        and u.is_active`
    if (!s) return null

    // Trượt hạn tối đa mỗi giờ một lần, không vượt hạn tuyệt đối.
    if (Date.now() - new Date(s.lastSeenAt).getTime() > 60 * 60 * 1000) {
      await tx`
        update sessions
        set last_seen_at = now(),
            expires_at = least(now() + make_interval(days => ${SLIDING_DAYS}), absolute_expires_at)
        where id = ${s.sessionId}`
    }

    const rows = await tx<
      { branchId: string; name: string; shortLabel: string; roleName: string; perm: string }[]
    >`
      select b.id as branch_id, b.name, b.short_label, r.name as role_name, rp.permission_code as perm
      from user_branch_roles ubr
      join branches b on b.id = ubr.branch_id
      join roles r on r.id = ubr.role_id
      join role_permissions rp on rp.role_id = ubr.role_id
      where ubr.user_id = ${s.userId} and ubr.revoked_at is null
      order by b.name`
    const map = new Map<string, BranchAccess>()
    for (const r of rows) {
      let b = map.get(r.branchId)
      if (!b) {
        b = { id: r.branchId, name: r.name, shortLabel: r.shortLabel, roleName: r.roleName, perms: [] }
        map.set(r.branchId, b)
      }
      if (!b.perms.includes(r.perm)) b.perms.push(r.perm)
    }
    return {
      sessionId: s.sessionId,
      userId: s.userId,
      displayName: s.displayName,
      mustChangePassword: s.mustChangePassword,
      branches: [...map.values()],
    }
  })
}

/** Thu hồi phiên và tắt đăng ký push gắn với phiên đó. Phát sự kiện để SSE đóng kết nối. */
export async function revokeSessions(
  tx: Tx,
  where: { sessionId?: string; userId?: string; exceptSessionId?: string },
  reason: string,
) {
  const rows = await tx<{ id: string; userId: string }[]>`
    update sessions set revoked_at = now(), revoke_reason = ${reason}
    where revoked_at is null
      and (${where.sessionId ?? null}::uuid is null or id = ${where.sessionId ?? null}::uuid)
      and (${where.userId ?? null}::uuid is null or user_id = ${where.userId ?? null}::uuid)
      and (${where.exceptSessionId ?? null}::uuid is null or id <> ${where.exceptSessionId ?? null}::uuid)
    returning id, user_id`
  if (rows.length === 0) return 0
  const ids = rows.map((r) => r.id)
  await tx`
    update push_subscriptions set disabled_at = now(), disabled_reason = ${`session_${reason}`}
    where disabled_at is null and session_id = any(${ids}::uuid[])`
  const userIds = [...new Set(rows.map((r) => r.userId))]
  await tx`select pg_notify('lindy_events', ${JSON.stringify({ kind: 'sessions_revoked', sessionIds: ids, userIds })})`
  return rows.length
}
