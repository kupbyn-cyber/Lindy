-- 0028 — In bill qua trạm in (Đợt 7; S36–S38). Nhân viên bấm In bill → app lưu lệnh in kèm nội dung bill lúc bấm;
-- máy trạm in ở quán (MacBook) hỏi app mỗi vài giây bằng mã kết nối, lấy lệnh, in ra máy in trong mạng quán, báo kết quả.
-- Linh (print.manage) sửa thông tin in trên bill, tạo / thu hồi mã kết nối trạm in, in thử. Mã kết nối chỉ lưu dạng băm.
-- Lệnh in không xoá, chỉ đổi trạng thái; chờ quá 10 phút mà trạm chưa lấy thì hết hạn (không tự in muộn).

insert into permissions (code, description)
values ('print.manage', 'Máy in bill: thông tin trên bill, trạm in, in thử')
on conflict (code) do nothing;
insert into role_permissions (role_id, permission_code)
select id, 'print.manage' from roles where code = 'owner'
on conflict do nothing;

-- ---------------------------------------------------------------- Bảng

create table print_settings (
  branch_id uuid primary key references branches(id),
  -- Dòng in dưới tên quán (địa chỉ…), mỗi dòng một ý; không in SĐT (S37)
  info_lines text not null default '' check (char_length(info_lines) <= 300),
  thanks text not null default 'Cảm ơn bạn đã chọn LINDY.
Hẹn gặp lại bạn lần sau!' check (char_length(thanks) <= 200),
  -- Số điểm ngang của máy in: 576 = khổ 80mm, 384 = khổ 58mm
  paper_width int not null default 576 check (paper_width in (384, 576)),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table print_stations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references users(id),
  last_seen_at timestamptz
);
create index print_stations_branch_idx on print_stations(branch_id) where revoked_at is null;

create table print_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  order_id uuid references orders(id),
  kind text not null check (kind in ('bill', 'test')),
  payload jsonb not null check (pg_column_size(payload) <= 100000),
  requested_by uuid not null references users(id),
  requested_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  status text not null default 'queued' check (status in ('queued', 'printing', 'printed', 'failed', 'expired')),
  station_id uuid references print_stations(id),
  claimed_at timestamptz,
  finished_at timestamptz,
  error text check (char_length(error) <= 300),
  check ((kind = 'bill') = (order_id is not null))
);
create index print_jobs_queue_idx on print_jobs(branch_id, status, requested_at);
create index print_jobs_order_idx on print_jobs(order_id, status);
create trigger print_jobs_no_delete before delete on print_jobs
  for each row execute function app.forbid_mutation();
create trigger print_jobs_no_truncate before truncate on print_jobs
  for each statement execute function app.forbid_mutation();

alter table print_settings enable row level security;
alter table print_stations enable row level security;
alter table print_jobs enable row level security;

-- Thông tin trên bill: ai trong cơ sở cũng đọc (để dựng bill); sửa qua hàm
grant select on print_settings to app_user;
create policy print_settings_read on print_settings for select to app_user using (app.has_branch(branch_id));

-- Trạm in: chỉ Linh xem; không cấp cột token_hash
grant select (id, branch_id, name, created_at, revoked_at, last_seen_at) on print_stations to app_user;
create policy print_stations_read on print_stations for select to app_user
  using (app.has_perm(branch_id, 'print.manage'));

-- Lệnh in: người trong cơ sở xem trạng thái (không cấp cột nội dung bill)
grant select (id, branch_id, order_id, kind, requested_by, requested_at, status, station_id, claimed_at, finished_at,
              error) on print_jobs to app_user;
create policy print_jobs_read on print_jobs for select to app_user using (app.has_branch(branch_id));

-- ---------------------------------------------------------------- Hàm (người dùng)

create function app._require_print_manage(p_branch uuid) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if app.uid() is null or not app.has_perm(p_branch, 'print.manage') then
    raise exception 'Chỉ chủ quán cài đặt máy in bill.' using errcode = '42501';
  end if;
end $$;

create function app.print_settings_save(p_branch uuid, p_info text, p_thanks text, p_width int) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_old print_settings%rowtype;
begin
  perform app._require_print_manage(p_branch);
  select * into v_old from print_settings where branch_id = p_branch for update;
  insert into print_settings (branch_id, info_lines, thanks, paper_width, updated_by, updated_at)
  values (p_branch, btrim(coalesce(p_info, '')), btrim(coalesce(p_thanks, '')), p_width, app.uid(), now())
  on conflict (branch_id) do update
    set info_lines = excluded.info_lines, thanks = excluded.thanks, paper_width = excluded.paper_width,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (app.uid(), p_branch, 'print.settings_saved', 'branch', p_branch::text,
          jsonb_build_object('before', case when v_old.branch_id is null then null else jsonb_build_object(
                               'info', v_old.info_lines, 'thanks', v_old.thanks, 'width', v_old.paper_width) end,
                             'after', jsonb_build_object('info', btrim(coalesce(p_info, '')),
                                                         'thanks', btrim(coalesce(p_thanks, '')), 'width', p_width)));
end $$;

create function app.print_station_create(p_branch uuid, p_name text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_id uuid;
begin
  perform app._require_print_manage(p_branch);
  insert into print_stations (branch_id, name, token_hash, created_by)
  values (p_branch, btrim(p_name), p_token_hash, app.uid())
  returning id into v_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (app.uid(), p_branch, 'print.station_created', 'print_station', v_id::text,
          jsonb_build_object('name', btrim(p_name)));
  return v_id;
end $$;

create function app.print_station_revoke(p_station uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch from print_stations where id = p_station for update;
  if v_branch is null then
    raise exception 'Không tìm thấy trạm in.' using errcode = '22P02';
  end if;
  perform app._require_print_manage(v_branch);
  update print_stations set revoked_at = now(), revoked_by = app.uid()
  where id = p_station and revoked_at is null;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (app.uid(), v_branch, 'print.station_revoked', 'print_station', p_station::text, '{}'::jsonb);
end $$;

-- Tạo lệnh in. Bill: người xem được đơn (cả thợ trên đơn), đơn đã bấm Làm xong. In thử: chỉ Linh.
create function app.print_job_create(p_branch uuid, p_order uuid, p_kind text, p_payload jsonb, p_key uuid)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
  o orders;
begin
  if v_uid is null or not app.has_branch(p_branch) then
    raise exception 'Không có quyền in ở cơ sở này.' using errcode = '42501';
  end if;
  select id into v_id from print_jobs where idempotency_key = p_key;
  if v_id is not null then return v_id; end if;   -- bấm hai lần
  if p_kind = 'bill' then
    select * into o from orders where id = p_order;
    if o.id is null or o.branch_id <> p_branch or not app.order_visible(p_order) then
      raise exception 'Không tìm thấy đơn.' using errcode = '22P02';
    end if;
    if o.status not in ('awaiting_confirmation', 'confirmed') then
      raise exception 'Chỉ in bill cho đơn đã bấm Làm xong.' using errcode = 'P0001';
    end if;
  elsif p_kind = 'test' then
    perform app._require_print_manage(p_branch);
  else
    raise exception 'Loại lệnh in không hợp lệ.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from print_stations where branch_id = p_branch and revoked_at is null) then
    raise exception 'Chưa có trạm in. Linh cài ở Thêm → Máy in bill.' using errcode = 'P0001';
  end if;
  insert into print_jobs (branch_id, order_id, kind, payload, requested_by, idempotency_key)
  values (p_branch, case when p_kind = 'bill' then p_order end, p_kind, p_payload, v_uid, p_key)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- Hàm (trạm in, role app_worker)

-- Trạm in hỏi lệnh: kiểm mã kết nối (băm), ghi lần cuối kết nối, cho hết hạn lệnh chờ quá 10 phút, lấy lệnh cũ nhất
-- (khoá dòng, hai trạm không lấy trùng). Lệnh đang in quá 2 phút không báo kết quả thì coi là lỗi.
create function app.print_agent_next(p_token_hash text)
returns table (job_id uuid, kind text, payload jsonb, paper_width int)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  s print_stations;
  j print_jobs;
begin
  select * into s from print_stations where token_hash = p_token_hash and revoked_at is null;
  if s.id is null then
    raise exception 'Mã kết nối trạm in không đúng hoặc đã thu hồi.' using errcode = '42501';
  end if;
  update print_stations set last_seen_at = now() where id = s.id;
  update print_jobs set status = 'expired', finished_at = now(), error = 'Quá 10 phút trạm in chưa lấy lệnh.'
  where branch_id = s.branch_id and status = 'queued' and requested_at < now() - interval '10 minutes';
  update print_jobs set status = 'failed', finished_at = now(), error = 'Trạm in không báo kết quả.'
  where branch_id = s.branch_id and status = 'printing' and claimed_at < now() - interval '2 minutes';
  select * into j from print_jobs
  where branch_id = s.branch_id and status = 'queued'
  order by requested_at limit 1 for update skip locked;
  if j.id is null then return; end if;
  update print_jobs set status = 'printing', station_id = s.id, claimed_at = now() where id = j.id;
  return query
    select j.id, j.kind, j.payload, coalesce((select ps.paper_width from print_settings ps
                                              where ps.branch_id = s.branch_id), 576);
end $$;

create function app.print_agent_finish(p_token_hash text, p_job uuid, p_ok boolean, p_error text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  s print_stations;
begin
  select * into s from print_stations where token_hash = p_token_hash and revoked_at is null;
  if s.id is null then
    raise exception 'Mã kết nối trạm in không đúng hoặc đã thu hồi.' using errcode = '42501';
  end if;
  update print_stations set last_seen_at = now() where id = s.id;
  update print_jobs
  set status = case when p_ok then 'printed' else 'failed' end, finished_at = now(),
      error = case when p_ok then null else left(coalesce(nullif(btrim(p_error), ''), 'Máy in báo lỗi.'), 300) end
  where id = p_job and station_id = s.id and status = 'printing';
end $$;

grant execute on function app.print_settings_save(uuid, text, text, int) to app_user;
grant execute on function app.print_station_create(uuid, text, text) to app_user;
grant execute on function app.print_station_revoke(uuid) to app_user;
grant execute on function app.print_job_create(uuid, uuid, text, jsonb, uuid) to app_user;
grant execute on function app.print_agent_next(text) to app_worker;
grant execute on function app.print_agent_finish(text, uuid, boolean, text) to app_worker;

-- Xoá dữ liệu thử (S12): lệnh in tham chiếu đơn nên xoá cùng
create or replace function app.demo_wipe_tables() returns text[]
language sql immutable as $$
  select array[
    'notification_deliveries', 'notification_recipients', 'notification_events',
    'month_report_snapshots', 'payroll_payouts', 'payroll_lines', 'payroll_periods', 'payroll_revenue_entries',
    'payroll_adjustments', 'payroll_settings', 'employee_advances', 'staff_policy_versions', 'staff_profiles',
    'attendance_days', 'leave_requests', 'attachments',
    'cash_day_closes', 'cash_transfers', 'cash_vouchers', 'expense_requests', 'money_ledger_reconciliations',
    'money_ledger_entries', 'money_books',
    'tip_holdings', 'tip_payouts', 'order_refund_allocations', 'order_refunds', 'payments',
    'print_jobs',
    'order_discounts', 'order_service_tickets', 'order_items', 'order_staff_allocations', 'order_audit_events',
    'orders', 'order_counters',
    'appointment_deposits', 'appointment_audit_events', 'appointments', 'deposit_seasons',
    'legacy_sales', 'legacy_imports', 'customer_audit_events', 'customers'
  ]
$$;
