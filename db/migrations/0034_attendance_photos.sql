-- 0034 — S59–S61: vào ca bằng ảnh có giờ máy chủ, tự duyệt công, ảnh tự xoá sau 35 ngày.
-- - Một ảnh mỗi ngày công, JPEG ≤ 150KB (máy nén và đóng dấu giờ trước khi gửi), lưu trong DB như ảnh chứng từ.
-- - Vào ca có ảnh: ghi giờ, ghi ảnh, tự duyệt Đi làm trong cùng giao dịch. Không tự duyệt ngày quán đóng cửa, ngày có
--   nghỉ cả ngày đã duyệt, tháng đã khoá lương, ngày đã có quyết định: vẫn ghi giờ và ảnh, Nhung/Linh quyết như cũ.
-- - Ảnh quá 35 ngày tính từ ngày vào ca: xoá dữ liệu ảnh (data = null), giữ dòng để biết ngày đó từng có ảnh.
--   Ngoại lệ có chủ đích của quy tắc không xoá vĩnh viễn (S61); dòng công, giờ vào, trạng thái giữ nguyên.

-- Ngày công được tự duyệt khi vào ca có ảnh; Nhung/Linh quyết lại thì về false
alter table attendance_days add column auto_approved boolean not null default false;
alter table attendance_days add constraint attendance_days_auto_check check (not auto_approved or status = 'worked');

create table attendance_photos (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null unique references attendance_days(id),
  branch_id uuid not null references branches(id),
  user_id uuid not null references users(id),
  work_date date not null,
  size int not null check (size between 1 and 153600),
  sha256 text not null check (char_length(sha256) = 64),
  data bytea,
  taken_at timestamptz not null default now(),
  purged_at timestamptz,
  check ((data is null) = (purged_at is not null)),
  check (data is null or octet_length(data) = size),
  -- Kiểm byte đầu file là JPEG (không tin content-type máy gửi)
  check (data is null or substring(data from 1 for 3) = '\xffd8ff'::bytea)
);
create index attendance_photos_date_idx on attendance_photos(branch_id, work_date);
create index attendance_photos_keep_idx on attendance_photos(work_date) where purged_at is null;

create trigger attendance_photos_no_delete before delete on attendance_photos
  for each row execute function app.forbid_mutation();
create trigger attendance_photos_no_truncate before truncate on attendance_photos
  for each statement execute function app.forbid_mutation();

-- Vào ca có ảnh: chính mình, hôm nay theo giờ cơ sở, chưa vào ca hôm nay (mỗi ngày một ảnh, không bổ sung sau).
create function app.attendance_check_in_photo(p_branch uuid, p_data bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_today date;
  v_row attendance_days;
  v_until date;
  v_auto boolean;
begin
  if v_uid is null or not app.has_perm(p_branch, 'attendance.own') then
    raise exception 'Không có quyền chấm công.' using errcode = '42501';
  end if;
  v_today := app.branch_today(p_branch);
  if not exists (select 1 from staff_profiles where user_id = v_uid and branch_id = p_branch
                 and start_date <= v_today and (end_date is null or end_date >= v_today)) then
    raise exception 'Chưa có hồ sơ nhân viên hoặc hôm nay ngoài thời gian làm việc. Báo Linh kiểm hồ sơ.'
      using errcode = '42501';
  end if;
  if p_data is null or octet_length(p_data) = 0 then
    raise exception 'Chưa có ảnh vào ca.' using errcode = 'P0001';
  end if;
  if octet_length(p_data) > 153600 then
    raise exception 'Ảnh quá 150KB. Chụp lại.' using errcode = 'P0001';
  end if;
  if substring(p_data from 1 for 3) <> '\xffd8ff'::bytea then
    raise exception 'Chỉ nhận ảnh JPEG.' using errcode = 'P0001';
  end if;

  -- Gửi song song hai lần: dòng của hôm nay được khoá, lần sau thấy đã vào ca
  insert into attendance_days (branch_id, user_id, work_date) values (p_branch, v_uid, v_today)
  on conflict (branch_id, user_id, work_date) do nothing;
  select * into v_row from attendance_days
  where branch_id = p_branch and user_id = v_uid and work_date = v_today for update;
  if v_row.check_in_at is not null then
    raise exception 'Hôm nay đã vào ca lúc %.',
      to_char(v_row.check_in_at at time zone app.branch_tz(p_branch), 'HH24:MI') using errcode = 'P0001';
  end if;

  perform app._payroll_share_lock(p_branch);
  v_until := app.payroll_locked_until(p_branch);
  v_auto := v_row.status is null
    and (v_until is null or v_today > v_until)
    and not exists (select 1 from shop_closed_days where branch_id = p_branch and closed_date = v_today
                    and removed_at is null)
    and not exists (select 1 from leave_requests where branch_id = p_branch and user_id = v_uid
                    and status = 'approved' and start_time is null and v_today between from_date and to_date);

  update attendance_days set
    check_in_at = now(),
    status = case when v_auto then 'worked' else status end,
    decided_by = case when v_auto then v_uid else decided_by end,
    decided_at = case when v_auto then now() else decided_at end,
    auto_approved = v_auto
  where id = v_row.id;
  insert into attendance_photos (attendance_day_id, branch_id, user_id, work_date, size, sha256, data)
  values (v_row.id, p_branch, v_uid, v_today, octet_length(p_data), encode(sha256(p_data), 'hex'), p_data);
  if v_auto then
    insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
    values (v_uid, p_branch, 'attendance.auto_approved', 'user', v_uid::text,
            jsonb_build_object('date', v_today, 'after', 'worked', 'photo', true));
  end if;
  return jsonb_build_object('id', v_row.id, 'autoApproved', v_auto);
end $$;

-- Nhung, Linh quyết một ngày công (bản 0016) + mọi quyết định bỏ nhãn tự duyệt
create or replace function app.attendance_decide(p_branch uuid, p_user uuid, p_date date, p_status text, p_note text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_row attendance_days;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_uid is null or not app.has_perm(p_branch, 'attendance.approve') then
    raise exception 'Chỉ Nhung, Linh duyệt công.' using errcode = '42501';
  end if;
  if p_status not in ('worked', 'leave', 'unexcused') then
    raise exception 'Chọn Đi làm, Nghỉ có phép hoặc Nghỉ không phép.' using errcode = 'P0001';
  end if;
  if p_date is null or p_date > app.branch_today(p_branch) then
    raise exception 'Chưa tới ngày này. Ngày nghỉ sắp tới thì đăng ký nghỉ.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from staff_profiles where user_id = p_user and branch_id = p_branch
                 and start_date <= p_date and (end_date is null or end_date >= p_date)) then
    raise exception 'Ngày này người đó chưa vào làm hoặc đã nghỉ việc.' using errcode = 'P0001';
  end if;
  if exists (select 1 from shop_closed_days where branch_id = p_branch and closed_date = p_date and removed_at is null) then
    raise exception 'Ngày quán đóng cửa: không cần duyệt công.' using errcode = 'P0001';
  end if;
  perform app._require_open(p_branch, p_date);
  select * into v_row from attendance_days where branch_id = p_branch and user_id = p_user and work_date = p_date
  for update;
  if v_row.status is not null and v_row.status <> p_status and v_note is null then
    raise exception 'Đổi quyết định công cần ghi lý do.' using errcode = 'P0001';
  end if;
  if p_status = 'worked' and v_row.check_in_at is null and v_note is null then
    raise exception 'Bổ sung công (không có giờ vào ca) cần ghi lý do.' using errcode = 'P0001';
  end if;
  insert into attendance_days (branch_id, user_id, work_date, status, decided_by, decided_at, note)
  values (p_branch, p_user, p_date, p_status, v_uid, now(), v_note)
  on conflict (branch_id, user_id, work_date) do update
    set status = excluded.status, decided_by = excluded.decided_by, decided_at = excluded.decided_at,
        note = coalesce(excluded.note, attendance_days.note), auto_approved = false
  returning id into v_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, case when p_user = v_uid then 'attendance.self_decided' else 'attendance.decided' end,
          'user', p_user::text,
          jsonb_build_object('date', p_date, 'before', v_row.status, 'after', p_status, 'note', v_note,
                             'checkedIn', v_row.check_in_at is not null, 'wasAuto', coalesce(v_row.auto_approved, false)));
  return v_id;
end $$;

-- Việc nền (app_worker): xoá dữ liệu ảnh vào ca quá 35 ngày tính từ ngày vào ca (giữ trọn 35 ngày, sang ngày 36 xoá).
-- Mỗi lần tối đa 200 ảnh; chạy lại được, nhiều tiến trình cùng chạy không đụng nhau.
create function app.attendance_photo_purge() returns int
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_n int;
begin
  with old as (
    select p.id from attendance_photos p
    where p.purged_at is null and p.work_date < app.branch_today(p.branch_id) - 35
    order by p.work_date
    limit 200
    for update skip locked)
  update attendance_photos p set data = null, purged_at = now() from old where p.id = old.id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into audit_logs (actor_label, action, entity_type, details)
    values ('system', 'attendance.photos_purged', 'attendance_photo', jsonb_build_object('count', v_n, 'keepDays', 35));
  end if;
  return v_n;
end $$;

-- Xoá dữ liệu thử (S12): ảnh vào ca xoá cùng ngày công
create or replace function app.demo_wipe_tables() returns text[]
language sql immutable as $$
  select array[
    'notification_deliveries', 'notification_recipients', 'notification_events',
    'month_report_snapshots', 'payroll_payouts', 'payroll_lines', 'payroll_periods', 'payroll_revenue_entries',
    'payroll_adjustments', 'payroll_settings', 'employee_advances', 'staff_policy_versions', 'staff_profiles',
    'attendance_photos', 'attendance_days', 'leave_requests', 'attachments',
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

-- Bản sao lưu Linh tải (bản 0018) không gồm ảnh vào ca: ảnh tạm thời, tự xoá sau 35 ngày (S61)
create or replace function app.backup_dump() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_version text;
  r record;
begin
  if v_uid is not null then
    if not exists (select 1 from user_branch_roles ubr join users u on u.id = ubr.user_id
                   join role_permissions rp on rp.role_id = ubr.role_id
                   where ubr.user_id = v_uid and ubr.revoked_at is null and u.is_active
                     and rp.permission_code = 'data.export') then
      raise exception 'Chỉ chủ quán tải bản sao lưu.' using errcode = '42501';
    end if;
  elsif session_user = 'lindy_app' then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('user_credentials', 'sessions', 'login_attempts', 'push_subscriptions',
                            'notification_deliveries', 'schema_migrations', 'attendance_photos')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', r.relname) into v_rows;
    v_tables := v_tables || jsonb_build_object(r.relname, v_rows);
    v_counts := v_counts || jsonb_build_object(r.relname, jsonb_array_length(v_rows));
  end loop;
  select max(version) into v_version from schema_migrations;

  insert into audit_logs (actor_user_id, actor_label, action, entity_type, details)
  values (v_uid, case when v_uid is null then 'script' end, 'backup.downloaded', 'organization',
          jsonb_build_object('migration', v_version, 'tables', (select count(*) from jsonb_object_keys(v_counts))));

  return jsonb_build_object(
    'format', 'lindy-backup-1',
    'migration', v_version,
    'exportedAt', now(),
    'summary', jsonb_build_object(
      'counts', v_counts,
      'balances', coalesce((select jsonb_object_agg(money_account_id, s) from (
                    select money_account_id, sum(amount) as s from money_ledger_entries group by money_account_id) b),
                  '{}'::jsonb),
      'revenueByMonth', coalesce((select jsonb_object_agg(m, s) from (
                    select to_char(service_date, 'YYYY-MM') as m, sum(net_amount) as s from orders
                    where status = 'confirmed' group by 1) x), '{}'::jsonb)),
    'tables', v_tables);
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS

-- Ảnh vào ca: của mình; Linh, Nhung (duyệt công / xem lương toàn quán) thấy cả cơ sở (S60). App không ghi thẳng.
alter table attendance_photos enable row level security;
grant select on attendance_photos to app_user;
create policy attendance_photos_read on attendance_photos for select to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.attendance_reader(branch_id)));

grant execute on function app.attendance_check_in_photo(uuid, bytea) to app_user;
grant execute on function app.attendance_photo_purge() to app_worker;
