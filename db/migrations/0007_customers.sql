-- 0007 — Khách hàng (CRM tối giản, D10-B; PRD §10). Hồ sơ dùng chung mọi cơ sở trong tổ chức (test 26).
-- Chỉ có tên, SĐT (không bắt buộc, không unique — Q06), lịch sử đơn. Không ngày sinh, ảnh, VIP (invariant 10).
-- Tạo: người có quyền tạo đơn hoặc tạo lịch. Sửa tên/SĐT: customers.edit. Không xoá.

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone text check (char_length(phone) <= 20 and phone ~ '^\+?[0-9]{8,15}$'),
  search_norm text not null default '' check (char_length(search_norm) <= 300),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index customers_phone_idx on customers(organization_id, phone) where phone is not null;
create index customers_search_idx on customers(organization_id, search_norm text_pattern_ops);

create table customer_audit_events (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id),
  organization_id uuid not null references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,
  before_json jsonb,
  after_json jsonb,
  occurred_at timestamptz not null default now()
);
create index customer_audit_customer_idx on customer_audit_events(customer_id, id);
create trigger customer_audit_no_update before update or delete on customer_audit_events
  for each row execute function app.forbid_mutation();
create trigger customer_audit_no_truncate before truncate on customer_audit_events
  for each statement execute function app.forbid_mutation();

alter table appointments add constraint appointments_customer_fk foreign key (customer_id) references customers(id);

-- ---------------------------------------------------------------- Kiểm trước khi ghi

create function app.customers_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
begin
  if current_user = 'app_user' and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if current_user = 'app_user' then
      if new.created_by is distinct from v_uid then
        raise exception 'Người tạo phải là người đang đăng nhập.' using errcode = '42501';
      end if;
      if new.organization_id is distinct from app.user_org() then
        raise exception 'Không tạo được khách ở tổ chức khác.' using errcode = '42501';
      end if;
      if not (app.has_perm_any('order.create_draft') or app.has_perm_any('appointments.create')) then
        raise exception 'Không có quyền tạo khách.' using errcode = '42501';
      end if;
    end if;
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    return new;
  end if;

  if new.id <> old.id or new.organization_id <> old.organization_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Không được đổi mã, tổ chức hoặc người tạo hồ sơ khách.' using errcode = '42501';
  end if;
  if current_user = 'app_user' and not app.has_perm_any('customers.edit') then
    raise exception 'Chỉ Nhung, Linh sửa được thông tin khách.' using errcode = '42501';
  end if;
  new.updated_by := coalesce(v_uid, new.updated_by);
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create trigger customers_guard before insert or update on customers
  for each row execute function app.customers_guard();

create function app.customers_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into customer_audit_events (customer_id, organization_id, actor_user_id, action, before_json, after_json)
  values (new.id, new.organization_id, new.updated_by,
          case when tg_op = 'INSERT' then 'created' else 'updated' end,
          case when tg_op = 'UPDATE' then jsonb_build_object('name', old.name, 'phone', old.phone) end,
          jsonb_build_object('name', new.name, 'phone', new.phone));
  return null;
end $$;

create trigger customers_after after insert or update on customers
  for each row execute function app.customers_after();

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table customers enable row level security;
alter table customer_audit_events enable row level security;

grant select, insert, update on customers to app_user;
grant select on customers to app_worker;
create policy customers_read on customers for select to app_user using (organization_id = app.user_org());
create policy customers_insert on customers for insert to app_user
  with check (organization_id = app.user_org() and created_by = app.uid());
create policy customers_update on customers for update to app_user
  using (organization_id = app.user_org()) with check (organization_id = app.user_org());
create policy customers_worker on customers for select to app_worker using (true);

grant select on customer_audit_events to app_user;
create policy customer_audit_read on customer_audit_events for select to app_user
  using (organization_id = app.user_org() and app.has_perm_any('customers.edit'));
