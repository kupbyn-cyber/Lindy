// Lấy danh tính từ phiên cho mỗi request. Không tin danh tính hay vai trò do máy gửi lên.
import { withWorker } from '../db/client'
import { forbidden, notFound, unauthorized } from '../http/errors'
import { loadAccess, loadSession, readSessionToken, type SessionInfo } from './session'

export type Auth = SessionInfo

export async function getAuth(request: Request): Promise<Auth | null> {
  const token = readSessionToken(request)
  if (!token) return null
  return loadSession(token)
}

/**
 * Danh tính cho request không đi qua phiên web (MCP): userId lấy từ token đã kiểm ở server, quyền đọc lại từ DB.
 * Tài khoản đã khoá hoặc còn cờ "phải đổi mật khẩu" → null (MCP không có màn đổi mật khẩu) [phản biện L9].
 */
export async function authForUser(userId: string, sessionLabel: string): Promise<Auth | null> {
  return withWorker(async (tx) => {
    const [u] = await tx<{ displayName: string; mustChangePassword: boolean }[]>`
      select u.display_name, c.must_change_password
      from users u join user_credentials c on c.user_id = u.id
      where u.id = ${userId} and u.is_active`
    if (!u || u.mustChangePassword) return null
    return {
      sessionId: sessionLabel,
      userId,
      displayName: u.displayName,
      mustChangePassword: false,
      branches: await loadAccess(tx, userId),
    }
  })
}

/**
 * Bắt buộc đăng nhập. Khi còn cờ "phải đổi mật khẩu", chỉ cho gọi đổi mật khẩu và đăng xuất [P16].
 */
export async function requireAuth(request: Request, opts: { allowMustChange?: boolean } = {}): Promise<Auth> {
  const auth = await getAuth(request)
  if (!auth) throw unauthorized()
  if (auth.mustChangePassword && !opts.allowMustChange) {
    throw forbidden('Cần đổi mật khẩu trước khi dùng app.')
  }
  return auth
}

export function hasPerm(auth: Auth, branchId: string, perm: string) {
  return auth.branches.some((b) => b.id === branchId && b.perms.includes(perm))
}

/** Cơ sở trong phạm vi của người dùng; ngoài phạm vi trả 404, không lộ là có tồn tại [P12]. */
export function requireBranch(auth: Auth, branchId: string | undefined | null) {
  const branch = branchId ? auth.branches.find((b) => b.id === branchId) : auth.branches[0]
  if (!branch) throw notFound('Không tìm thấy cơ sở.')
  return branch
}
