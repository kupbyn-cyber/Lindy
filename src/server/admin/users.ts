// Quản trị tài khoản (bước 0.13). Chạy bằng lindy_owner qua CLI; chưa có màn hình.
// Khoá, đặt lại mật khẩu, thu quyền → thu hồi mọi phiên, tắt push, SSE đóng kết nối [P1]. Mỗi lệnh ghi audit [P20].
import { randomBytes } from 'node:crypto'
import type postgres from 'postgres'
import { normalizeLoginPhone } from '~/lib/phone'
import { hashPassword } from '../auth/password'
import { revokeSessions } from '../auth/session'
import type { Tx } from '../db/client'

type Sql = postgres.Sql | postgres.TransactionSql

export function tempPassword() {
  // 12 ký tự dễ đọc, không lẫn 0/O, 1/l
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(12)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

async function audit(
  sql: Sql,
  actor: string,
  action: string,
  userId: string,
  details: Record<string, unknown> = {},
) {
  await sql`
    insert into audit_logs (actor_label, action, entity_type, entity_id, details)
    values (${actor}, ${action}, 'user', ${userId}, ${sql.json(details as postgres.JSONValue)})`
}

export async function findUser(sql: Sql, who: string) {
  const id = who.includes('@') ? who.toLowerCase() : (normalizeLoginPhone(who) ?? who)
  const [u] = await sql<{ id: string; displayName: string; isActive: boolean }[]>`
    select id, display_name, is_active from users where email = ${id} or phone = ${id}`
  if (!u) throw new Error(`Không tìm thấy tài khoản ${who}.`)
  return u
}

async function roleAndBranch(sql: Sql, role: string, branchCode: string) {
  const [r] = await sql<{ id: string }[]>`select id from roles where code = ${role}`
  if (!r) throw new Error(`Không có vai trò ${role}. Có: owner, manager, staff_booking_plus, staff.`)
  const [b] = await sql<{ id: string }[]>`select id from branches where code = ${branchCode}`
  if (!b) throw new Error(`Không có cơ sở ${branchCode}.`)
  return { roleId: r.id, branchId: b.id }
}

async function cutAccess(sql: Sql, userId: string, reason: string) {
  await revokeSessions(sql as Tx, { userId }, reason)
  await sql`
    update push_subscriptions set disabled_at = now(), disabled_reason = ${reason}
    where user_id = ${userId} and disabled_at is null`
}

export async function createUser(
  sql: Sql,
  actor: string,
  input: { name: string; phone?: string; email?: string; role: string; branch: string },
) {
  const phone = input.phone ? normalizeLoginPhone(input.phone) : null
  if (input.phone && !phone) throw new Error('SĐT đăng nhập không hợp lệ.')
  const email = input.email?.trim().toLowerCase() || null
  if (!phone && !email) throw new Error('Cần SĐT hoặc email để đăng nhập.')
  const { roleId, branchId } = await roleAndBranch(sql, input.role, input.branch)
  const [org] = await sql<
    { organizationId: string }[]
  >`select organization_id from branches where id = ${branchId}`
  const password = tempPassword()
  const [u] = await sql<{ id: string }[]>`
    insert into users (organization_id, display_name, phone, email)
    values (${org!.organizationId}, ${input.name}, ${phone}, ${email}) returning id`
  await sql`insert into user_credentials (user_id, password_hash, must_change_password)
            values (${u!.id}, ${await hashPassword(password)}, true)`
  await sql`insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
            values (${u!.id}, ${branchId}, ${roleId}, ${actor})`
  await audit(sql, actor, 'admin.user_created', u!.id, { role: input.role, branch: input.branch })
  return { userId: u!.id, password }
}

export async function resetPassword(sql: Sql, actor: string, who: string) {
  const u = await findUser(sql, who)
  const password = tempPassword()
  await sql`update user_credentials
            set password_hash = ${await hashPassword(password)}, must_change_password = true, password_changed_at = now()
            where user_id = ${u.id}`
  await cutAccess(sql, u.id, 'password_reset')
  await audit(sql, actor, 'admin.password_reset', u.id)
  return { userId: u.id, password }
}

export async function grantRole(sql: Sql, actor: string, who: string, role: string, branch: string) {
  const u = await findUser(sql, who)
  const { roleId, branchId } = await roleAndBranch(sql, role, branch)
  await sql`insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
            values (${u.id}, ${branchId}, ${roleId}, ${actor}) on conflict do nothing`
  // Đổi quyền → bắt đăng nhập lại để nạp quyền mới, chống cố định phiên.
  await cutAccess(sql, u.id, 'role_changed')
  await audit(sql, actor, 'admin.role_granted', u.id, { role, branch })
}

/** Thu quyền ở một cơ sở (mọi vai trò ở cơ sở đó). */
export async function revokeBranch(sql: Sql, actor: string, who: string, branch: string) {
  const u = await findUser(sql, who)
  const [b] = await sql<{ id: string }[]>`select id from branches where code = ${branch}`
  if (!b) throw new Error(`Không có cơ sở ${branch}.`)
  const rows = await sql`
    update user_branch_roles set revoked_at = now(), revoked_by_label = ${actor}
    where user_id = ${u.id} and branch_id = ${b.id} and revoked_at is null returning id`
  await cutAccess(sql, u.id, 'access_revoked')
  await audit(sql, actor, 'admin.branch_revoked', u.id, { branch, roles: rows.length })
  return rows.length
}

export async function lockUser(sql: Sql, actor: string, who: string) {
  const u = await findUser(sql, who)
  await sql`update users set is_active = false, updated_at = now() where id = ${u.id}`
  await cutAccess(sql, u.id, 'locked')
  await audit(sql, actor, 'admin.user_locked', u.id)
}

export async function unlockUser(sql: Sql, actor: string, who: string) {
  const u = await findUser(sql, who)
  await sql`update users set is_active = true, updated_at = now() where id = ${u.id}`
  await audit(sql, actor, 'admin.user_unlocked', u.id)
}

export async function listUsers(sql: Sql) {
  return sql<{ displayName: string; login: string; isActive: boolean; roles: string | null }[]>`
    select u.display_name, coalesce(u.phone, u.email) as login, u.is_active,
           string_agg(r.code || '@' || b.code, ', ' order by b.code) filter (where ubr.revoked_at is null) as roles
    from users u
    left join user_branch_roles ubr on ubr.user_id = u.id
    left join roles r on r.id = ubr.role_id
    left join branches b on b.id = ubr.branch_id
    group by u.id order by u.display_name`
}
