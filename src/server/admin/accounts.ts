// Quản lý tài khoản trên app (Thêm → Tài khoản), chỉ người có users.manage (Chủ).
// Mọi thao tác chạy dưới danh tính người dùng; hàm DB app.admin_* kiểm quyền lần nữa và ghi audit.
// Mật khẩu tạm sinh ở server, trả về đúng một lần để chủ quán đưa cho nhân viên; không ghi log.
import { z } from 'zod'
import { normalizeLoginPhone } from '~/lib/phone'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { hashPassword } from '../auth/password'
import { withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { tempPassword } from './users'

export const ROLE_OPTIONS = [
  { code: 'owner', label: 'Chủ' },
  { code: 'manager', label: 'Quản lý' },
  { code: 'staff_booking_plus', label: 'Thợ (quyền lịch mở rộng)' },
  { code: 'staff', label: 'Thợ' },
] as const
const ROLE_CODES = ROLE_OPTIONS.map((r) => r.code) as [string, ...string[]]

export type AccountRow = {
  id: string
  displayName: string
  phone: string | null
  email: string | null
  isActive: boolean
  mustChangePassword: boolean
  roleCode: string | null
  roleName: string | null
  lastLoginAt: string | null
  isMe: boolean
}

export const CreateAccountBody = z.strictObject({
  name: z.string().trim().min(1, 'Nhập tên.').max(100, 'Tên tối đa 100 ký tự.'),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
  role: z.enum(ROLE_CODES, 'Chọn vai trò.'),
})

export const RoleBody = z.strictObject({ role: z.enum(ROLE_CODES, 'Chọn vai trò.') })

function branchFor(auth: Auth) {
  const branch = requireBranch(auth, null)
  if (!hasPerm(auth, branch.id, 'users.manage')) throw forbidden('Chỉ chủ quán quản lý được tài khoản.')
  return branch
}

function checkId(id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound('Không tìm thấy tài khoản.')
}

export async function listAccounts(auth: Auth) {
  const branch = branchFor(auth)
  return withUser(
    auth.userId,
    (tx) => tx<AccountRow[]>`select * from app.admin_list_users(${branch.id}::uuid)`,
  )
}

export async function createAccount(auth: Auth, body: z.infer<typeof CreateAccountBody>) {
  const branch = branchFor(auth)
  const phone = body.phone ? normalizeLoginPhone(body.phone) : null
  if (body.phone && !phone) throw invalid('SĐT đăng nhập phải là số Việt Nam 10–11 chữ số.')
  const email = body.email ? body.email.toLowerCase() : null
  if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) throw invalid('Email không hợp lệ.')
  if (!phone && !email) throw invalid('Cần SĐT hoặc email để đăng nhập.')
  const password = tempPassword()
  const hash = await hashPassword(password)
  const [row] = await withUser(
    auth.userId,
    (tx) =>
      tx<{ id: string }[]>`
      select app.admin_create_user(${branch.id}::uuid, ${body.name}, ${phone}, ${email}, ${body.role}, ${hash}) as id`,
  )
  return { id: row!.id, tempPassword: password }
}

export async function resetAccountPassword(auth: Auth, userId: string) {
  const branch = branchFor(auth)
  checkId(userId)
  const password = tempPassword()
  const hash = await hashPassword(password)
  await withUser(
    auth.userId,
    (tx) => tx`select app.admin_reset_password(${branch.id}::uuid, ${userId}::uuid, ${hash})`,
  )
  return { tempPassword: password }
}

export async function setAccountRole(auth: Auth, userId: string, role: string) {
  const branch = branchFor(auth)
  checkId(userId)
  await withUser(
    auth.userId,
    (tx) => tx`select app.admin_set_role(${branch.id}::uuid, ${userId}::uuid, ${role})`,
  )
}

export async function revokeAccount(auth: Auth, userId: string) {
  const branch = branchFor(auth)
  checkId(userId)
  await withUser(auth.userId, (tx) => tx`select app.admin_revoke_access(${branch.id}::uuid, ${userId}::uuid)`)
}

export async function setAccountActive(auth: Auth, userId: string, active: boolean) {
  const branch = branchFor(auth)
  checkId(userId)
  await withUser(
    auth.userId,
    (tx) => tx`select app.admin_set_active(${branch.id}::uuid, ${userId}::uuid, ${active})`,
  )
}
