-- 0019 — Nhập dữ liệu cũ từ Google Sheets (Đợt 5B, kế hoạch Đợt 5 mục 7.2; PRD §16, D14, Q42, test 29).
-- - Bảng riêng: không thành đơn, không phải thu, không hoa hồng, không vào sổ tiền, không vào lương. Mọi dòng mang nhãn
--   "không rõ dịch vụ / chưa biết đã thu tiền" (hiện ở giao diện).
-- - Mỗi dòng bảng tính, mỗi cột tiền của một thợ → một dòng. Dấu vân tay mỗi dòng: nhập lại cùng file không nhân đôi.
-- - Khách: khớp theo SĐT (một khách có SĐT đó) hoặc tạo hồ sơ mới khi có SĐT; chỉ có tên thì không tự gộp (test 16).
-- - Huỷ một lần nhập là đánh dấu, không xoá.

create table legacy_imports (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  file_name text not null check (char_length(file_name) between 1 and 200),
  label text check (char_length(label) <= 100),            -- tên tab, ghi chú
  mapping jsonb not null,                                   -- cách ghép cột đã dùng
  row_count int not null default 0,                         -- dòng đã nhập
  skipped_count int not null default 0,                     -- dòng lỗi, dòng đã nhập trước
  total_amount bigint not null default 0,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  check ((cancelled_at is null) = (cancelled_by is null))
);
create index legacy_imports_branch_idx on legacy_imports(branch_id, created_at desc);

create table legacy_sales (
  id bigint generated always as identity primary key,
  import_id uuid not null references legacy_imports(id),
  branch_id uuid not null references branches(id),
  sale_date date not null,
  row_no int not null,                                      -- dòng trong file gốc
  customer_name text check (char_length(customer_name) <= 100),
  phone text check (char_length(phone) <= 20),
  customer_id uuid references customers(id),
  note text check (char_length(note) <= 300),
  staff_user_id uuid references users(id),                  -- null: thợ không có tài khoản hoặc không rõ thợ
  staff_label text check (char_length(staff_label) <= 60),  -- tên cột thợ trong bảng tính
  amount bigint not null check (amount <> 0 and abs(amount) <= 1000000000),
  fingerprint text not null check (char_length(fingerprint) = 64),
  cancelled_at timestamptz
);
create unique index legacy_sales_fp_uq on legacy_sales(branch_id, fingerprint) where cancelled_at is null;
create index legacy_sales_date_idx on legacy_sales(branch_id, sale_date) where cancelled_at is null;
create index legacy_sales_customer_idx on legacy_sales(customer_id) where customer_id is not null and cancelled_at is null;

create trigger legacy_imports_no_delete before delete on legacy_imports
  for each row execute function app.forbid_mutation();
create trigger legacy_imports_no_truncate before truncate on legacy_imports
  for each statement execute function app.forbid_mutation();
create trigger legacy_sales_no_delete before delete on legacy_sales
  for each row execute function app.forbid_mutation();
create trigger legacy_sales_no_truncate before truncate on legacy_sales
  for each statement execute function app.forbid_mutation();

-- Linh (legacy.import). Dòng đã được app kiểm và ghép cột; DB kiểm lại ngày, thợ, khách, số tiền. Dòng trùng dấu vân
-- tay với lần nhập trước (chưa huỷ) thì bỏ qua. Không có dòng mới → báo lỗi, không tạo gì.
create function app.legacy_import(p_branch uuid, p_meta jsonb, p_customers jsonb, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_org uuid;
  v_today date;
  v_id uuid;
  v_map jsonb := '{}'::jsonb;
  v_cid uuid;
  v_n int;
  v_total bigint;
  c record;
begin
  if v_uid is null or not app.has_perm(p_branch, 'legacy.import') then
    raise exception 'Chỉ chủ quán nhập dữ liệu cũ.' using errcode = '42501';
  end if;
  select organization_id into v_org from branches where id = p_branch;
  v_today := app.branch_today(p_branch);
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(sale_date date, staff_user_id uuid, customer_id uuid, amount bigint)
    where r.sale_date is null or r.sale_date < date '2015-01-01' or r.sale_date > v_today
       or r.amount is null or r.amount = 0
       or (r.staff_user_id is not null and not app._staff_of_branch(p_branch, r.staff_user_id))
       or (r.customer_id is not null
           and not exists (select 1 from customers x where x.id = r.customer_id and x.organization_id = v_org))) then
    raise exception 'Dữ liệu không hợp lệ (ngày, thợ, khách hoặc số tiền). Kiểm tra lại rồi nhập.' using errcode = 'P0001';
  end if;
  -- Hai lần nhập song song cùng cơ sở phải chờ nhau
  perform pg_advisory_xact_lock(hashtextextended('legacy:' || p_branch::text, 0));

  insert into legacy_imports (branch_id, file_name, label, mapping, created_by)
  values (p_branch, left(coalesce(nullif(btrim(p_meta->>'file_name'), ''), 'khong-ten.csv'), 200),
          nullif(left(btrim(coalesce(p_meta->>'label', '')), 100), ''), coalesce(p_meta->'mapping', '{}'::jsonb), v_uid)
  returning id into v_id;

  -- Khách mới theo SĐT (đã có khách cùng SĐT do nhập song song thì dùng lại)
  for c in select * from jsonb_to_recordset(coalesce(p_customers, '[]'::jsonb))
             as x(key text, name text, phone text, search_norm text)
  loop
    select id into v_cid from customers where organization_id = v_org and phone = c.phone order by created_at limit 1;
    if v_cid is null then
      insert into customers (organization_id, name, phone, search_norm, created_by, updated_by)
      values (v_org, left(btrim(c.name), 100), c.phone, left(coalesce(c.search_norm, ''), 300), v_uid, v_uid)
      returning id into v_cid;
    end if;
    v_map := v_map || jsonb_build_object(c.key, v_cid);
    v_cid := null;
  end loop;

  insert into legacy_sales (import_id, branch_id, sale_date, row_no, customer_name, phone, customer_id, note,
                            staff_user_id, staff_label, amount, fingerprint)
  select v_id, p_branch, r.sale_date, r.row_no, nullif(left(btrim(coalesce(r.customer_name, '')), 100), ''),
         nullif(left(r.phone, 20), ''), coalesce(r.customer_id, (v_map->>r.customer_key)::uuid),
         nullif(left(btrim(coalesce(r.note, '')), 300), ''), r.staff_user_id,
         nullif(left(btrim(coalesce(r.staff_label, '')), 60), ''), r.amount, r.fingerprint
  from jsonb_to_recordset(p_rows) as r(sale_date date, row_no int, customer_name text, phone text, customer_id uuid,
                                       customer_key text, note text, staff_user_id uuid, staff_label text,
                                       amount bigint, fingerprint text)
  on conflict (branch_id, fingerprint) where cancelled_at is null do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Không có dòng mới để nhập: các dòng này đã nhập ở lần trước.' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_total from legacy_sales where import_id = v_id;
  update legacy_imports
  set row_count = v_n,
      skipped_count = jsonb_array_length(p_rows) - v_n + coalesce((p_meta->>'skipped')::int, 0),
      total_amount = v_total
  where id = v_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'legacy.imported', 'legacy_import', v_id::text,
          jsonb_build_object('file', p_meta->>'file_name', 'rows', v_n, 'total', v_total,
                             'customersCreated', jsonb_array_length(coalesce(p_customers, '[]'::jsonb))));
  return jsonb_build_object('importId', v_id, 'inserted', v_n, 'duplicates', jsonb_array_length(p_rows) - v_n,
                            'total', v_total);
end $$;

-- Huỷ một lần nhập: đánh dấu lần nhập và các dòng của nó; khách đã tạo giữ nguyên
create function app.legacy_import_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_row legacy_imports;
begin
  select * into v_row from legacy_imports where id = p_id for update;
  if not found or v_uid is null or not app.has_branch(v_row.branch_id) then
    raise exception 'Không tìm thấy lần nhập.' using errcode = '22P02';
  end if;
  if not app.has_perm(v_row.branch_id, 'legacy.import') then
    raise exception 'Chỉ chủ quán huỷ lần nhập.' using errcode = '42501';
  end if;
  if v_row.cancelled_at is not null then return; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cần ghi lý do huỷ lần nhập.' using errcode = 'P0001';
  end if;
  update legacy_imports set cancelled_by = v_uid, cancelled_at = now(), cancel_reason = btrim(p_reason)
  where id = p_id;
  update legacy_sales set cancelled_at = now() where import_id = p_id and cancelled_at is null;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, v_row.branch_id, 'legacy.cancelled', 'legacy_import', p_id::text,
          jsonb_build_object('reason', p_reason, 'rows', v_row.row_count));
end $$;

-- ---------------------------------------------------------------- Quyền bảng (chỉ đọc; ghi qua hàm)

alter table legacy_imports enable row level security;
alter table legacy_sales enable row level security;

-- Dữ liệu cũ là doanh thu toàn quán: Linh, Nhung (revenue.read_branch)
grant select on legacy_imports, legacy_sales to app_user;
create policy legacy_imports_read on legacy_imports for select to app_user
  using (app.has_perm(branch_id, 'revenue.read_branch'));
create policy legacy_sales_read on legacy_sales for select to app_user
  using (app.has_perm(branch_id, 'revenue.read_branch'));

grant execute on function app.legacy_import(uuid, jsonb, jsonb, jsonb) to app_user;
grant execute on function app.legacy_import_cancel(uuid, text) to app_user;
