-- 0006 — Danh mục dịch vụ và combo (PRD §6.8; C06–C09, C12, C14). Dùng chung cả tổ chức.
-- Đọc: người dùng thuộc tổ chức. Ghi: chỉ qua hàm kiểm catalog.manage (bước 2.22); dữ liệu ban đầu do seedBase nạp.
-- Tiền là số nguyên VND. Bảo hành suy từ has_hardening: có cứng móng 7 ngày, không có 3 ngày (C12).

-- Tổ chức của người đang thao tác (tài khoản còn hoạt động)
create function app.user_org() returns uuid
language sql stable security definer set search_path = pg_catalog, public as $$
  select organization_id from users where id = app.uid() and is_active
$$;
grant execute on function app.user_org() to app_user, app_worker;

-- Có quyền p_perm ở ít nhất một cơ sở
create function app.has_perm_any(p_perm text) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1
    from user_branch_roles ubr
    join users u on u.id = ubr.user_id
    join role_permissions rp on rp.role_id = ubr.role_id
    where ubr.user_id = app.uid() and ubr.revoked_at is null and u.is_active and rp.permission_code = p_perm
  )
$$;
grant execute on function app.has_perm_any(text) to app_user, app_worker;

create table services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null check (code ~ '^[A-Z0-9]{2,12}$'),
  category text not null check (char_length(btrim(category)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  price_mode text not null check (price_mode in ('list', 'custom')),
  unit text not null check (unit in ('lần', 'ngón', 'hình', 'cái')),
  price_min bigint not null check (price_min > 0 and price_min <= 10000000),
  price_max bigint not null check (price_max >= price_min and price_max <= 10000000),
  has_hardening boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  unique (organization_id, code),
  check (price_mode = 'custom' or price_min = price_max)
);

create table combos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null check (code ~ '^[A-Z0-9]{2,12}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  group_name text not null check (char_length(btrim(group_name)) between 1 and 40),
  price bigint not null check (price > 0 and price <= 10000000),   -- bán đúng giá niêm yết (C07)
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  unique (organization_id, code)
);

create table combo_items (
  combo_id uuid not null references combos(id),
  service_id uuid not null references services(id),
  position int not null,
  primary key (combo_id, service_id)
);

-- Lịch sử giá: chỉ thêm (P35)
create table catalog_price_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  item_type text not null check (item_type in ('service', 'combo')),
  item_id uuid not null,
  old_min bigint,
  old_max bigint,
  new_min bigint not null,
  new_max bigint not null,
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);
create trigger catalog_price_history_no_update before update or delete on catalog_price_history
  for each row execute function app.forbid_mutation();
create trigger catalog_price_history_no_truncate before truncate on catalog_price_history
  for each statement execute function app.forbid_mutation();

-- Combo có cứng móng khi có dịch vụ thành phần cứng móng (combo 139k → bảo hành 7 ngày)
create view combo_hardening with (security_invoker = true) as
  select c.id as combo_id,
         coalesce(bool_or(s.has_hardening), false) as has_hardening
  from combos c
  left join combo_items ci on ci.combo_id = c.id
  left join services s on s.id = ci.service_id
  group by c.id;

alter table services enable row level security;
alter table combos enable row level security;
alter table combo_items enable row level security;
alter table catalog_price_history enable row level security;

grant select on services, combos, combo_items, combo_hardening to app_user, app_worker;
create policy services_read on services for select to app_user using (organization_id = app.user_org());
create policy services_worker on services for select to app_worker using (true);
create policy combos_read on combos for select to app_user using (organization_id = app.user_org());
create policy combos_worker on combos for select to app_worker using (true);
create policy combo_items_read on combo_items for select to app_user
  using (exists (select 1 from combos c where c.id = combo_id and c.organization_id = app.user_org()));
create policy combo_items_worker on combo_items for select to app_worker using (true);

grant select on catalog_price_history to app_user;
create policy price_history_read on catalog_price_history for select to app_user
  using (organization_id = app.user_org() and app.has_perm_any('catalog.manage'));
