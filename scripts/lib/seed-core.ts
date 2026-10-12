// Dữ liệu nền: tổ chức, cơ sở, quyền, vai trò, tài khoản mẫu (kế hoạch 7.4). Chạy bằng lindy_owner.
// Chạy lại không nhân đôi.
import { randomBytes } from 'node:crypto'
import type postgres from 'postgres'
import { hashPassword } from '../../src/server/auth/password'
import { PERMISSIONS, ROLES } from '../../src/server/authz/catalog'

type Sql = postgres.Sql

export type SeedUser = { key: string; displayName: string; email: string; role: string; branch: string }

export const SAMPLE_USERS: SeedUser[] = [
  { key: 'linh', displayName: 'Linh', email: 'linh@lindy.test', role: 'owner', branch: 'HTK' },
  { key: 'nhung', displayName: 'Nhung', email: 'nhung@lindy.test', role: 'manager', branch: 'HTK' },
  { key: 'chin', displayName: 'Chin', email: 'chin@lindy.test', role: 'staff_booking_plus', branch: 'HTK' },
  { key: 'trang', displayName: 'Trang', email: 'trang@lindy.test', role: 'staff', branch: 'HTK' },
]

// Chỉ dùng trong DB test: cơ sở thứ hai để kiểm chặn khác cơ sở [P12].
export const TEST_ONLY_USERS: SeedUser[] = [
  { key: 'mai', displayName: 'Mai', email: 'mai@lindy.test', role: 'staff_booking_plus', branch: 'CS2' },
]

export async function seedCore(
  sql: Sql,
  opts: { withSecondBranch?: boolean; passwords?: Record<string, string> } = {},
) {
  const [org] = await sql<{ id: string }[]>`
    insert into organizations (name)
    select 'Lindy Nailash Studio' where not exists (select 1 from organizations)
    returning id`
  const orgId = org?.id ?? (await sql<{ id: string }[]>`select id from organizations limit 1`)[0]!.id

  const branchIds: Record<string, string> = {}
  const branchDefs = [{ code: 'HTK', name: 'CS 31/49 Huỳnh Thúc Kháng', short: 'CS 31/49 HTK' }]
  if (opts.withSecondBranch) branchDefs.push({ code: 'CS2', name: 'Cơ sở thử nghiệm 2', short: 'CS2' })
  for (const b of branchDefs) {
    const [row] = await sql<{ id: string }[]>`
      insert into branches (organization_id, code, name, short_label)
      values (${orgId}, ${b.code}, ${b.name}, ${b.short})
      on conflict (code) do update set name = excluded.name
      returning id`
    branchIds[b.code] = row!.id
  }

  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await sql`insert into permissions (code, description) values (${code}, ${description})
              on conflict (code) do update set description = excluded.description`
  }

  const roleIds: Record<string, string> = {}
  for (const [code, role] of Object.entries(ROLES)) {
    const [row] = await sql<{ id: string }[]>`
      insert into roles (organization_id, code, name) values (${orgId}, ${code}, ${role.name})
      on conflict (organization_id, code) do update set name = excluded.name
      returning id`
    roleIds[code] = row!.id
    for (const p of role.permissions) {
      await sql`insert into role_permissions (role_id, permission_code) values (${row!.id}, ${p})
                on conflict do nothing`
    }
  }

  const users = opts.withSecondBranch ? [...SAMPLE_USERS, ...TEST_ONLY_USERS] : SAMPLE_USERS
  const created: Record<string, { id: string; password?: string }> = {}
  for (const u of users) {
    const [existing] = await sql<{ id: string }[]>`select id from users where email = ${u.email}`
    if (existing) {
      created[u.key] = { id: existing.id }
      continue
    }
    const password = opts.passwords?.[u.key] ?? randomBytes(9).toString('base64url')
    const [row] = await sql<{ id: string }[]>`
      insert into users (organization_id, display_name, email) values (${orgId}, ${u.displayName}, ${u.email})
      returning id`
    // Tài khoản mẫu ở local không bắt đổi mật khẩu; tài khoản thật tạo bằng CLI thì có.
    await sql`insert into user_credentials (user_id, password_hash, must_change_password)
              values (${row!.id}, ${await hashPassword(password)}, false)`
    await sql`insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
              values (${row!.id}, ${branchIds[u.branch]!}, ${roleIds[u.role]!}, 'seed')`
    created[u.key] = { id: row!.id, password }
  }

  return { orgId, branchIds, roleIds, users: created }
}
