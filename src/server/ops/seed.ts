// Dữ liệu nền, chạy lại không nhân đôi: tổ chức, cơ sở, quyền, vai trò, cài đặt lịch, danh mục dịch vụ.
// Không tạo tài khoản. Dùng chung cho seed local và bước chuẩn bị DB trên hosting.
import type postgres from 'postgres'
import { PERMISSIONS, ROLES } from '../authz/catalog'
import { SEED_COMBOS, SEED_SERVICES } from './catalog-data'

type Sql = postgres.Sql | postgres.TransactionSql

export const MAIN_BRANCH = { code: 'HTK', name: 'CS 31/49 Huỳnh Thúc Kháng', short: 'CS 31/49 HTK' }

export async function seedBase(
  sql: Sql,
  opts: { extraBranches?: { code: string; name: string; short: string }[] } = {},
) {
  const [org] = await sql<{ id: string }[]>`
    insert into organizations (name)
    select 'Lindy Nailash Studio' where not exists (select 1 from organizations)
    returning id`
  const orgId = org?.id ?? (await sql<{ id: string }[]>`select id from organizations limit 1`)[0]!.id

  const branchIds: Record<string, string> = {}
  for (const b of [MAIN_BRANCH, ...(opts.extraBranches ?? [])]) {
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

  // Cài đặt lịch mặc định: 09:00–21:00 (Q25), 120 phút (B09), sức chứa để trống (B11).
  const [t] = await sql<{ exists: boolean }[]>`
    select to_regclass('public.branch_booking_settings') is not null as exists`
  if (t?.exists) {
    for (const id of Object.values(branchIds)) {
      await sql`
        insert into branch_booking_settings (branch_id, open_time, close_time, default_duration_min)
        values (${id}, '09:00', '21:00', 120)
        on conflict (branch_id) do nothing`
    }
  }

  if (await tableExists(sql, 'services')) await seedCatalog(sql, orgId)

  // Hai tài khoản tiền mỗi cơ sở (PRD §7.2): Tiền mặt cs HTK, Tài khoản cs HTK. Số dư, sổ quỹ ở Đợt 3.
  if (await tableExists(sql, 'money_accounts')) {
    for (const [code, id] of Object.entries(branchIds)) {
      await sql`
        insert into money_accounts (branch_id, code, name, type)
        values (${id}, 'cash', ${`Tiền mặt cs ${code}`}, 'cash'), (${id}, 'bank', ${`Tài khoản cs ${code}`}, 'bank')
        on conflict (branch_id, code) do nothing`
    }
  }

  // Cài đặt lương (nháp ngày 5, trả ngày 10; tháng bắt đầu Linh tự chọn) và mốc KPI quản lý bảng tháng 10/2026 (Q31)
  if (await tableExists(sql, 'payroll_settings')) {
    for (const id of Object.values(branchIds)) {
      await sql`insert into payroll_settings (branch_id) values (${id}) on conflict (branch_id) do nothing`
      await sql`
        insert into kpi_policy_versions (branch_id, effective_month, tier1_min, tier1_bps, tier2_min, tier2_bps)
        values (${id}, '2026-10-01', 85000000, 100, 102000000, 150)
        on conflict (branch_id, effective_month) do nothing`
    }
  }

  return { orgId, branchIds, roleIds }
}

async function tableExists(sql: Sql, name: string) {
  const [t] = await sql<{ exists: boolean }[]>`select to_regclass(${`public.${name}`}) is not null as exists`
  return !!t?.exists
}

/** Danh mục ban đầu (PRD §6.8): chỉ thêm mã chưa có, không ghi đè giá Linh đã sửa trong app. */
async function seedCatalog(sql: Sql, orgId: string) {
  // DB chưa chạy migration 0035 (giả lập bản cũ khi kiểm nâng cấp) thì chưa có hàng bán: bỏ qua món hàng bán
  const [col] = await sql<{ exists: boolean }[]>`
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'services' and column_name = 'is_retail') as exists`
  const hasRetail = !!col?.exists
  for (const s of SEED_SERVICES) {
    if (s.isRetail && !hasRetail) continue
    if (!hasRetail) {
      await sql`
        insert into services (organization_id, code, category, name, price_mode, unit, price_min, price_max,
                              has_hardening, sort_order)
        values (${orgId}, ${s.code}, ${s.category}, ${s.name}, ${s.priceMode}, ${s.unit}, ${s.priceMin},
                ${s.priceMax}, ${s.hasHardening}, ${s.sortOrder})
        on conflict (organization_id, code) do nothing`
      continue
    }
    if (s.isRetail) {
      // S64: Linh đã tự thêm món cùng tên (chưa xoá) thì gắn cờ hàng bán cho món đó, không thêm món trùng.
      // Chỉ chạy khi DB chưa có mã của món gốc (lần nâng cấp đầu); về sau Linh sửa gì cũng không bị ghi đè.
      const [own] = await sql<{ id: string }[]>`
        select id from services
        where organization_id = ${orgId} and code <> ${s.code} and lower(btrim(name)) = lower(${s.name})
          and deleted_at is null
          and not exists (select 1 from services x where x.organization_id = ${orgId} and x.code = ${s.code})
        order by created_at limit 1`
      if (own) {
        await sql`update services set is_retail = true where id = ${own.id}`
        continue
      }
    }
    await sql`
      insert into services (organization_id, code, category, name, price_mode, unit, price_min, price_max,
                            has_hardening, is_retail, sort_order)
      values (${orgId}, ${s.code}, ${s.category}, ${s.name}, ${s.priceMode}, ${s.unit}, ${s.priceMin},
              ${s.priceMax}, ${s.hasHardening}, ${s.isRetail}, ${s.sortOrder})
      on conflict (organization_id, code) do nothing`
  }
  for (const c of SEED_COMBOS) {
    const [row] = await sql<{ id: string }[]>`
      insert into combos (organization_id, code, name, group_name, price, sort_order)
      values (${orgId}, ${c.code}, ${c.name}, ${c.groupName}, ${c.price}, ${c.sortOrder})
      on conflict (organization_id, code) do nothing
      returning id`
    if (!row) continue
    for (const [i, code] of c.items.entries()) {
      await sql`
        insert into combo_items (combo_id, service_id, position)
        select ${row.id}, id, ${i + 1} from services where organization_id = ${orgId} and code = ${code}`
    }
  }
}
