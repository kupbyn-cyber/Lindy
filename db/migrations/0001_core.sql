-- 0001 — Lõi: tổ chức, cơ sở, người dùng, phiên, quyền, audit log, RLS.
-- Kế hoạch mục 7.1–7.2. Chạy bằng lindy_owner. app_user/app_worker không có DELETE, TRUNCATE ở bất kỳ bảng nào.

grant usage on schema public to app_user, app_worker;

create schema app;
grant usage on schema app to app_user, app_worker;
-- Hàm mới không tự cấp EXECUTE cho PUBLIC; cấp từng hàm bên dưới.
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

-- Chặn sửa/xoá cho bảng chỉ thêm (audit) [P20]
create function app.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Bảng % chỉ được thêm, không được sửa hay xoá.', tg_table_name
    using errcode = '42501';
end $$;

-- ---------------------------------------------------------------- Tổ chức, cơ sở

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name text not null check (char_length(name) between 1 and 200),
  short_label text not null check (char_length(short_label) between 1 and 40),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  currency text not null default 'VND' check (currency = 'VND'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Người dùng

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  display_name text not null check (char_length(display_name) between 1 and 100),
  phone text check (phone ~ '^0[0-9]{9,10}$'),
  email text check (char_length(email) <= 200 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create unique index users_phone_uq on users(phone) where phone is not null;
create unique index users_email_uq on users(email) where email is not null;

-- Mật khẩu tách bảng riêng, app_user không đọc được [P5]
create table user_credentials (
  user_id uuid primary key references users(id),
  password_hash text not null,
  must_change_password boolean not null default true,
  password_changed_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- hạn trượt
  absolute_expires_at timestamptz not null, -- hạn tuyệt đối [P1]
  revoked_at timestamptz,
  revoke_reason text,
  user_agent text check (char_length(user_agent) <= 300)
);
create index sessions_user_active_idx on sessions(user_id) where revoked_at is null;

create table login_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_identifier_idx on login_attempts(identifier, created_at desc);
create index login_attempts_ip_idx on login_attempts(ip, created_at desc);

-- ---------------------------------------------------------------- Vai trò, quyền

create table permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_0-9]+$'),
  description text not null
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null check (code ~ '^[a-z_]+$'),
  name text not null,
  unique (organization_id, code)
);

create table role_permissions (
  role_id uuid not null references roles(id),
  permission_code text not null references permissions(code),
  primary key (role_id, permission_code)
);

-- Thu quyền là đánh dấu revoked_at, giữ lịch sử
create table user_branch_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  branch_id uuid not null references branches(id),
  role_id uuid not null references roles(id),
  granted_at timestamptz not null default now(),
  granted_by_label text not null,
  revoked_at timestamptz,
  revoked_by_label text
);
create unique index user_branch_roles_active_uq on user_branch_roles(user_id, branch_id, role_id)
  where revoked_at is null;

-- ---------------------------------------------------------------- Audit log (chỉ thêm)

create table audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references users(id),
  actor_label text,
  branch_id uuid references branches(id),
  action text not null check (char_length(action) <= 100),
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  check (actor_user_id is not null or actor_label is not null)
);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function app.forbid_mutation();
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------- Hàm quyền dùng trong policy

-- Danh tính lấy từ biến giao dịch do withUser đặt. Bảo vệ trước lỗi code, không trước SQL injection [P13].
create function app.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function app.has_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1
    from user_branch_roles ubr
    join users u on u.id = ubr.user_id
    where ubr.user_id = app.uid()
      and ubr.branch_id = p_branch
      and ubr.revoked_at is null
      and u.is_active
  )
$$;

create function app.has_perm(p_branch uuid, p_perm text) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1
    from user_branch_roles ubr
    join users u on u.id = ubr.user_id
    join role_permissions rp on rp.role_id = ubr.role_id
    where ubr.user_id = app.uid()
      and ubr.branch_id = p_branch
      and ubr.revoked_at is null
      and u.is_active
      and rp.permission_code = p_perm
  )
$$;

-- Người dùng p_user có chung ít nhất một cơ sở với người đang thao tác (để hiện tên người tạo, người sửa)
create function app.shares_branch(p_user uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1
    from user_branch_roles mine
    join user_branch_roles theirs on theirs.branch_id = mine.branch_id
    where mine.user_id = app.uid() and mine.revoked_at is null
      and theirs.user_id = p_user
  )
$$;

grant execute on function app.uid() to app_user, app_worker;
grant execute on function app.has_branch(uuid) to app_user, app_worker;
grant execute on function app.has_perm(uuid, text) to app_user, app_worker;
grant execute on function app.shares_branch(uuid) to app_user;

-- ---------------------------------------------------------------- Quyền bảng và RLS

alter table organizations enable row level security;
alter table branches enable row level security;
alter table users enable row level security;
alter table user_credentials enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table user_branch_roles enable row level security;
alter table audit_logs enable row level security;

-- Danh mục quyền, vai trò: dữ liệu tham chiếu, không nhạy cảm
grant select on permissions, roles, role_permissions to app_user, app_worker;

-- organizations, branches
grant select on organizations, branches to app_user, app_worker;
create policy org_user_read on organizations for select to app_user
  using (exists (select 1 from branches b where b.organization_id = organizations.id and app.has_branch(b.id)));
create policy org_worker on organizations for select to app_worker using (true);
create policy branch_user_read on branches for select to app_user using (app.has_branch(id));
create policy branch_worker on branches for select to app_worker using (true);

-- users: app_user chỉ thấy cột hiển thị của người cùng cơ sở
grant select (id, organization_id, display_name, is_active) on users to app_user;
grant select, insert, update on users to app_worker;
create policy users_user_read on users for select to app_user
  using (id = app.uid() or app.shares_branch(id));
create policy users_worker on users for all to app_worker using (true) with check (true);

-- Thông tin đăng nhập, phiên: chỉ worker [P5]
grant select, insert, update on user_credentials, sessions to app_worker;
grant select, insert on login_attempts to app_worker;
create policy cred_worker on user_credentials for all to app_worker using (true) with check (true);
create policy sessions_worker on sessions for all to app_worker using (true) with check (true);
create policy login_attempts_worker on login_attempts for all to app_worker using (true) with check (true);

-- Gán vai trò: người dùng chỉ thấy của mình
grant select on user_branch_roles to app_user, app_worker;
create policy ubr_user_read on user_branch_roles for select to app_user using (user_id = app.uid());
create policy ubr_worker on user_branch_roles for select to app_worker using (true);

-- Audit: chỉ thêm; người dùng chỉ ghi được dưới tên mình, trong cơ sở mình
grant insert on audit_logs to app_user, app_worker;
create policy audit_user_insert on audit_logs for insert to app_user
  with check (actor_user_id = app.uid() and (branch_id is null or app.has_branch(branch_id)));
create policy audit_worker_insert on audit_logs for insert to app_worker with check (true);
