// Lấy danh tính từ phiên cho mỗi request. Không tin danh tính hay vai trò do máy gửi lên.
import { forbidden, notFound, unauthorized } from '../http/errors'
import { loadSession, readSessionToken, type SessionInfo } from './session'

export type Auth = SessionInfo

export async function getAuth(request: Request): Promise<Auth | null> {
  const token = readSessionToken(request)
  if (!token) return null
  return loadSession(token)
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
