-- 0016 — Nhân viên và chấm công (Đợt 4A, kế hoạch Đợt 4 mục 7.1; PRD §8, §9.2; A01, C05, Q27–Q30, Q35, Q36).
-- - Hồ sơ (ngày vào/nghỉ, cách nhận lương) và chính sách lương theo tháng (luôn ngày 1, test 40) do Linh nhập.
-- - Mỗi người 1 ca fulltime mỗi ngày = 1 công. Ba lớp: Vào ca / Ra ca (giờ do DB ghi), nghỉ đã duyệt, công Nhung duyệt.
--   Quên chấm công không thành ngày vắng (test 23): ngày chưa duyệt chờ Nhung quyết.
-- - Ngày quán đóng cửa không phải ngày nghỉ (Q29). Ngày ngoài thời gian làm việc là ngày vắng (Q35).
-- - Tháng đã khoá bảng lương (Đợt 4B) thì công, nghỉ, ngày đóng cửa, chính sách của tháng đó không đổi được (test 13).
-- Mọi thao tác ghi đi qua hàm SECURITY DEFINER hoặc trigger kiểm quyền; app_user không có DELETE.

-- ---------------------------------------------------------------- Cài đặt lương, kỳ đã khoá

create table payroll_settings (
  branch_id uuid primary key references branches(id),
  start_month date check (start_month is null or extract(day from start_month) = 1),   -- tháng bắt đầu tính lương trên app
  draft_day int not null default 5 check (draft_day between 1 and 28),                 -- PRD §9.4: nháp ngày 05
  pay_day int not null default 10 check (pay_day between 1 and 28),                    -- Q41: trả ngày 10
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
insert into payroll_settings (branch_id) select id from branches;

-- Bậc thưởng KPI quản lý theo tháng hiệu lực (PRD §2.1): < 85tr 0; từ 85tr 1%; từ 102tr 1,5%; nhảy bậc trên toàn doanh thu
create table kpi_policy_versions (
  branch_id uuid not null references branches(id),
  effective_month date not null check (extract(day from effective_month) = 1),
  tier1_min bigint not null check (tier1_min between 1 and 100000000000),
  tier1_bps int not null check (tier1_bps between 0 and 10000),
  tier2_min bigint not null check (tier2_min between 1 and 100000000000),
  tier2_bps int not null check (tier2_bps between 0 and 10000),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (branch_id, effective_month),
  check (tier2_min > tier1_min)
);
insert into kpi_policy_versions (branch_id, effective_month, tier1_min, tier1_bps, tier2_min, tier2_bps)
select id, date '2026-10-01', 85000000, 100, 102000000, 150 from branches;   -- Q31: giữ bảng tháng 10/2026

-- Tháng đã khoá bảng lương (Đợt 4B ghi; khoá lần lượt từng tháng). Có dòng = đã khoá. Không sửa, không xoá (test 14).
create table payroll_periods (
  branch_id uuid not null references branches(id),
  month date not null check (extract(day from month) = 1),
  locked_by uuid not null references users(id),
  locked_at timestamptz not null default now(),
  primary key (branch_id, month)
);
create trigger payroll_periods_append_only before update or delete on payroll_periods
  for each row execute function app.forbid_mutation();
create trigger payroll_periods_no_truncate before truncate on payroll_periods
  for each statement execute function app.forbid_mutation();

-- Ngày cuối của tháng đã khoá gần nhất (null = chưa khoá tháng nào)
create function app.payroll_locked_until(p_branch uuid) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
  select (max(month) + interval '1 month' - interval '1 day')::date from payroll_periods where branch_id = p_branch
$$;

create function app._require_open(p_branch uuid, p_date date) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_until date := app.payroll_locked_until(p_branch);
begin
  if p_date is not null and v_until is not null and p_date <= v_until then
    raise exception 'Tháng %/% đã khoá bảng lương: không sửa được công, ngày nghỉ, ngày đóng cửa, chính sách của tháng này.',
      to_char(p_date, 'MM'), to_char(p_date, 'YYYY') using errcode = 'P0001';
  end if;
end $$;

-- Người đã từng có vai trò trong cơ sở (kể cả đã thu quyền) — đối tượng của hồ sơ, chính sách
create function app._staff_of_branch(p_branch uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from user_branch_roles where user_id = p_user and branch_id = p_branch)
$$;

-- ---------------------------------------------------------------- Hồ sơ, chính sách lương

create table staff_profiles (
  user_id uuid not null references users(id),
  branch_id uuid not null references branches(id),
  start_date date not null,
  end_date date,                                           -- null = đang làm
  pay_method text not null check (pay_method in ('cash', 'transfer')),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, branch_id),
  check (end_date is null or end_date >= start_date)
);

create table staff_policy_versions (
  user_id uuid not null references users(id),
  branch_id uuid not null references branches(id),
  effective_month date not null,
  base_salary bigint not null check (base_salary between 0 and 1000000000),
  commission_bps int not null check (commission_bps between 0 and 10000),   -- 2500 = 25%
  leave_days int not null check (leave_days between 0 and 15),             -- ngày nghỉ được hưởng/tháng
  manager_kpi boolean not null default false,                              -- có thưởng KPI quản lý
  reason text check (char_length(reason) <= 300),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, branch_id, effective_month),
  constraint staff_policy_month_first check (extract(day from effective_month) = 1)   -- Q36, test 40
);

create trigger staff_profiles_no_delete before delete on staff_profiles
  for each row execute function app.forbid_mutation();
create trigger staff_policy_versions_no_delete before delete on staff_policy_versions
  for each row execute function app.forbid_mutation();
create trigger kpi_policy_versions_no_delete before delete on kpi_policy_versions
  for each row execute function app.forbid_mutation();

-- Linh (payroll.edit): ngày vào làm, ngày nghỉ việc, cách nhận lương
create function app.staff_profile_save(p_branch uuid, p_user uuid, p_start date, p_end date, p_pay text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_old staff_profiles;
  v_inf date := 'infinity';
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.edit') then
    raise exception 'Chỉ chủ quán sửa hồ sơ nhân viên.' using errcode = '42501';
  end if;
  if not app._staff_of_branch(p_branch, p_user) then
    raise exception 'Người này không thuộc cơ sở.' using errcode = '22P02';
  end if;
  if p_start is null or (p_end is not null and p_end < p_start) then
    raise exception 'Ngày nghỉ việc phải từ ngày vào làm trở đi.' using errcode = 'P0001';
  end if;
  if p_pay not in ('cash', 'transfer') then
    raise exception 'Chọn cách nhận lương.' using errcode = 'P0001';
  end if;
  select * into v_old from staff_profiles where user_id = p_user and branch_id = p_branch for update;
  if found then
    -- Đổi ngày làm ảnh hưởng ngày vắng của tháng đã khoá → chặn
    if v_old.start_date <> p_start then
      perform app._require_open(p_branch, least(v_old.start_date, p_start));
    end if;
    if coalesce(v_old.end_date, v_inf) <> coalesce(p_end, v_inf)
       and least(coalesce(v_old.end_date, v_inf), coalesce(p_end, v_inf)) <> v_inf then
      perform app._require_open(p_branch, least(coalesce(v_old.end_date, v_inf), coalesce(p_end, v_inf)));
    end if;
    update staff_profiles set start_date = p_start, end_date = p_end, pay_method = p_pay, updated_by = v_uid,
                              updated_at = now()
    where user_id = p_user and branch_id = p_branch;
  else
    insert into staff_profiles (user_id, branch_id, start_date, end_date, pay_method, updated_by)
    values (p_user, p_branch, p_start, p_end, p_pay, v_uid);
  end if;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'staff.profile_saved', 'user', p_user::text,
          jsonb_build_object('before', case when v_old.user_id is null then null
                                            else jsonb_build_object('start', v_old.start_date, 'end', v_old.end_date,
                                                                    'payMethod', v_old.pay_method) end,
                             'after', jsonb_build_object('start', p_start, 'end', p_end, 'payMethod', p_pay)));
end $$;

-- Linh (payroll.edit): chính sách lương từ ngày 1 của tháng (Q36), không lùi vào tháng đã khoá (test 13, 40)
create function app.staff_policy_save(
  p_branch uuid, p_user uuid, p_month date, p_base bigint, p_bps int, p_leave int, p_kpi boolean, p_reason text
) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_old staff_policy_versions;
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.edit') then
    raise exception 'Chỉ chủ quán đổi chính sách lương.' using errcode = '42501';
  end if;
  if not app._staff_of_branch(p_branch, p_user) then
    raise exception 'Người này không thuộc cơ sở.' using errcode = '22P02';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Chính sách lương chỉ có hiệu lực từ ngày 1 của tháng.' using errcode = 'P0001';
  end if;
  perform app._require_open(p_branch, p_month);
  select * into v_old from staff_policy_versions
  where user_id = p_user and branch_id = p_branch and effective_month = p_month for update;
  insert into staff_policy_versions (user_id, branch_id, effective_month, base_salary, commission_bps, leave_days,
                                     manager_kpi, reason, updated_by)
  values (p_user, p_branch, p_month, p_base, p_bps, p_leave, coalesce(p_kpi, false),
          nullif(btrim(coalesce(p_reason, '')), ''), v_uid)
  on conflict (user_id, branch_id, effective_month) do update
    set base_salary = excluded.base_salary, commission_bps = excluded.commission_bps, leave_days = excluded.leave_days,
        manager_kpi = excluded.manager_kpi, reason = excluded.reason, updated_by = v_uid, updated_at = now();
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'staff.policy_saved', 'user', p_user::text,
          jsonb_build_object('month', p_month,
                             'before', case when v_old.user_id is null then null else
                               jsonb_build_object('base', v_old.base_salary, 'bps', v_old.commission_bps,
                                                  'leave', v_old.leave_days, 'kpi', v_old.manager_kpi) end,
                             'after', jsonb_build_object('base', p_base, 'bps', p_bps, 'leave', p_leave, 'kpi', p_kpi),
                             'reason', p_reason));
end $$;

create function app.kpi_policy_save(p_branch uuid, p_month date, p_t1 bigint, p_b1 int, p_t2 bigint, p_b2 int) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.edit') then
    raise exception 'Chỉ chủ quán đổi mốc thưởng KPI.' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Mốc KPI chỉ có hiệu lực từ ngày 1 của tháng.' using errcode = 'P0001';
  end if;
  if p_t2 <= p_t1 then
    raise exception 'Mốc bậc 2 phải lớn hơn mốc bậc 1.' using errcode = 'P0001';
  end if;
  perform app._require_open(p_branch, p_month);
  insert into kpi_policy_versions (branch_id, effective_month, tier1_min, tier1_bps, tier2_min, tier2_bps, updated_by)
  values (p_branch, p_month, p_t1, p_b1, p_t2, p_b2, v_uid)
  on conflict (branch_id, effective_month) do update
    set tier1_min = excluded.tier1_min, tier1_bps = excluded.tier1_bps, tier2_min = excluded.tier2_min,
        tier2_bps = excluded.tier2_bps, updated_by = v_uid, updated_at = now();
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'payroll.kpi_saved', 'branch', p_branch::text,
          jsonb_build_object('month', p_month, 'tier1', p_t1, 'tier1Bps', p_b1, 'tier2', p_t2, 'tier2Bps', p_b2));
end $$;

-- Tháng bắt đầu tính lương trên app: đổi được khi chưa khoá tháng nào
create function app.payroll_settings_save(p_branch uuid, p_start date) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.edit') then
    raise exception 'Chỉ chủ quán đổi cài đặt lương.' using errcode = '42501';
  end if;
  if p_start is not null and extract(day from p_start) <> 1 then
    raise exception 'Tháng bắt đầu tính lương là ngày 1 của tháng.' using errcode = 'P0001';
  end if;
  if exists (select 1 from payroll_periods where branch_id = p_branch) then
    raise exception 'Đã khoá bảng lương: không đổi tháng bắt đầu được.' using errcode = 'P0001';
  end if;
  insert into payroll_settings (branch_id, start_month, updated_by) values (p_branch, p_start, v_uid)
  on conflict (branch_id) do update set start_month = excluded.start_month, updated_by = v_uid, updated_at = now();
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'payroll.settings_saved', 'branch', p_branch::text, jsonb_build_object('startMonth', p_start));
end $$;

-- ---------------------------------------------------------------- Ngày quán đóng cửa (Q29)

create table shop_closed_days (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  closed_date date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  removed_by uuid references users(id),
  removed_at timestamptz,
  check ((removed_at is null) = (removed_by is null))
);
create unique index shop_closed_days_uq on shop_closed_days(branch_id, closed_date) where removed_at is null;
create trigger shop_closed_days_no_delete before delete on shop_closed_days
  for each row execute function app.forbid_mutation();

-- Linh (booking_settings.manage): thêm một ngày hoặc một khoảng ngày; ngày đã có thì bỏ qua
create function app.closed_days_add(p_branch uuid, p_from date, p_to date, p_reason text) returns int
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_n int;
begin
  if v_uid is null or not app.has_perm(p_branch, 'booking_settings.manage') then
    raise exception 'Chỉ chủ quán khai báo ngày đóng cửa.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Đến ngày phải từ ngày bắt đầu trở đi.' using errcode = 'P0001';
  end if;
  if p_to - p_from > 61 then
    raise exception 'Mỗi lần thêm tối đa 62 ngày.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do đóng cửa (ví dụ Tết, sửa chữa).' using errcode = 'P0001';
  end if;
  perform app._require_open(p_branch, p_from);
  insert into shop_closed_days (branch_id, closed_date, reason, created_by)
  select p_branch, g::date, btrim(p_reason), v_uid from generate_series(p_from, p_to, interval '1 day') g
  on conflict (branch_id, closed_date) where removed_at is null do nothing;
  get diagnostics v_n = row_count;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'closed_days.added', 'branch', p_branch::text,
          jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason, 'added', v_n));
  return v_n;
end $$;

create function app.closed_day_remove(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_row shop_closed_days;
begin
  select * into v_row from shop_closed_days where id = p_id for update;
  if not found or v_uid is null or not app.has_branch(v_row.branch_id) then
    raise exception 'Không tìm thấy ngày đóng cửa.' using errcode = '22P02';
  end if;
  if not app.has_perm(v_row.branch_id, 'booking_settings.manage') then
    raise exception 'Chỉ chủ quán sửa ngày đóng cửa.' using errcode = '42501';
  end if;
  if v_row.removed_at is not null then return; end if;
  perform app._require_open(v_row.branch_id, v_row.closed_date);
  update shop_closed_days set removed_by = v_uid, removed_at = now() where id = p_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, v_row.branch_id, 'closed_days.removed', 'branch', v_row.branch_id::text,
          jsonb_build_object('date', v_row.closed_date, 'reason', v_row.reason));
end $$;

-- ---------------------------------------------------------------- Chấm công

create table attendance_days (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  user_id uuid not null references users(id),
  work_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text check (status in ('worked', 'leave', 'unexcused')),   -- null = chưa duyệt
  decided_by uuid references users(id),
  decided_at timestamptz,
  note text check (char_length(note) <= 300),
  unique (branch_id, user_id, work_date),
  check (check_out_at is null or (check_in_at is not null and check_out_at >= check_in_at)),
  check ((status is null) = (decided_by is null))
);
create index attendance_days_date_idx on attendance_days(branch_id, work_date);
create trigger attendance_days_no_delete before delete on attendance_days
  for each row execute function app.forbid_mutation();

create function app.branch_today(p_branch uuid) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
  select (now() at time zone app.branch_tz(p_branch))::date
$$;

-- Vào ca: chính mình, hôm nay theo giờ cơ sở, khi đang trong thời gian làm việc. Bấm lại → giữ giờ đầu tiên.
create function app.attendance_check_in(p_branch uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_today date;
  v_id uuid;
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
  insert into attendance_days (branch_id, user_id, work_date, check_in_at)
  values (p_branch, v_uid, v_today, now())
  on conflict (branch_id, user_id, work_date)
    do update set check_in_at = coalesce(attendance_days.check_in_at, excluded.check_in_at)
  returning id into v_id;
  return v_id;
end $$;

-- Ra ca: sau khi vào ca hôm nay; bấm lại → giữ giờ đầu tiên
create function app.attendance_check_out(p_branch uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_row attendance_days;
begin
  if v_uid is null or not app.has_perm(p_branch, 'attendance.own') then
    raise exception 'Không có quyền chấm công.' using errcode = '42501';
  end if;
  select * into v_row from attendance_days
  where branch_id = p_branch and user_id = v_uid and work_date = app.branch_today(p_branch) for update;
  if not found or v_row.check_in_at is null then
    raise exception 'Chưa vào ca hôm nay.' using errcode = 'P0001';
  end if;
  if v_row.check_out_at is null then
    update attendance_days set check_out_at = now() where id = v_row.id;
  end if;
  return v_row.id;
end $$;

-- Nhung, Linh (attendance.approve) quyết một ngày công: đi làm / nghỉ có phép / nghỉ không phép.
-- Bổ sung công (không có giờ vào ca) và đổi quyết định cần lý do. Mọi lần quyết ghi audit (Q27: tự duyệt của mình).
create function app.attendance_decide(p_branch uuid, p_user uuid, p_date date, p_status text, p_note text) returns uuid
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
        note = coalesce(excluded.note, attendance_days.note)
  returning id into v_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, case when p_user = v_uid then 'attendance.self_decided' else 'attendance.decided' end,
          'user', p_user::text,
          jsonb_build_object('date', p_date, 'before', v_row.status, 'after', p_status, 'note', v_note,
                             'checkedIn', v_row.check_in_at is not null));
  return v_id;
end $$;

-- Duyệt nhanh: mọi người đã vào ca ngày này mà chưa duyệt → đi làm
create function app.attendance_approve_checked_in(p_branch uuid, p_date date) returns int
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_users uuid[];
begin
  if v_uid is null or not app.has_perm(p_branch, 'attendance.approve') then
    raise exception 'Chỉ Nhung, Linh duyệt công.' using errcode = '42501';
  end if;
  if p_date is null or p_date > app.branch_today(p_branch) then
    raise exception 'Chưa tới ngày này.' using errcode = 'P0001';
  end if;
  perform app._require_open(p_branch, p_date);
  with done as (
    update attendance_days a set status = 'worked', decided_by = v_uid, decided_at = now()
    where a.branch_id = p_branch and a.work_date = p_date and a.check_in_at is not null and a.status is null
      and exists (select 1 from staff_profiles sp where sp.user_id = a.user_id and sp.branch_id = p_branch
                  and sp.start_date <= p_date and (sp.end_date is null or sp.end_date >= p_date))
    returning a.user_id)
  select coalesce(array_agg(user_id), '{}') into v_users from done;
  if cardinality(v_users) > 0 then
    insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
    values (v_uid, p_branch, case when v_uid = any(v_users) then 'attendance.self_decided' else 'attendance.decided' end,
            'branch', p_branch::text,
            jsonb_build_object('date', p_date, 'after', 'worked', 'bulk', true, 'users', to_jsonb(v_users)));
  end if;
  return cardinality(v_users);
end $$;

-- ---------------------------------------------------------------- Đăng ký nghỉ

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  user_id uuid not null references users(id),
  from_date date not null,
  to_date date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_by uuid references users(id),
  decided_at timestamptz,
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  decide_note text check (char_length(decide_note) <= 300),
  create_request_id uuid not null,
  version int not null default 1,
  unique (user_id, create_request_id),
  check (to_date >= from_date and to_date - from_date <= 30),
  check (status <> 'rejected' or char_length(btrim(coalesce(decide_note, ''))) > 0)
);
create index leave_requests_branch_idx on leave_requests(branch_id, status, from_date);
create index leave_requests_user_idx on leave_requests(user_id, from_date);
create trigger leave_requests_no_delete before delete on leave_requests
  for each row execute function app.forbid_mutation();
create trigger leave_requests_no_truncate before truncate on leave_requests
  for each statement execute function app.forbid_mutation();

create function app.leave_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  v_approver boolean;
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not v_priv and (new.user_id is distinct from v_uid or not app.has_perm(new.branch_id, 'attendance.own')) then
      raise exception 'Không có quyền đăng ký nghỉ.' using errcode = '42501';
    end if;
    -- Gửi lại cùng mã (bấm hai lần): để ON CONFLICT bỏ qua, không báo trùng ngày với chính đơn đó
    if exists (select 1 from leave_requests where user_id = new.user_id and create_request_id = new.create_request_id) then
      return new;
    end if;
    if not exists (select 1 from staff_profiles where user_id = new.user_id and branch_id = new.branch_id) then
      raise exception 'Chưa có hồ sơ nhân viên. Báo Linh thêm ngày vào làm.' using errcode = 'P0001';
    end if;
    perform app._require_open(new.branch_id, new.from_date);
    -- Hai đơn song song cùng người phải chờ nhau để kiểm trùng ngày
    perform pg_advisory_xact_lock(hashtextextended('leave:' || new.branch_id::text || new.user_id::text, 0));
    if exists (select 1 from leave_requests l where l.branch_id = new.branch_id and l.user_id = new.user_id
               and l.status in ('requested', 'approved')
               and l.from_date <= new.to_date and new.from_date <= l.to_date) then
      raise exception 'Đã có đơn nghỉ trùng ngày.' using errcode = 'P0001';
    end if;
    new.status := 'requested';
    new.requested_at := now();
    new.decided_by := null; new.decided_at := null; new.decide_note := null;
    new.cancelled_by := null; new.cancelled_at := null;
    new.version := 1;
    -- Nhung, Linh đăng ký cho mình → duyệt luôn (Q27, có audit)
    if not v_priv and app.has_perm(new.branch_id, 'attendance.approve') then
      new.status := 'approved';
      new.decided_by := v_uid;
      new.decided_at := now();
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------
  if new.id <> old.id or new.branch_id <> old.branch_id or new.user_id <> old.user_id
     or new.from_date <> old.from_date or new.to_date <> old.to_date or new.reason <> old.reason
     or new.requested_at <> old.requested_at or new.create_request_id <> old.create_request_id then
    raise exception 'Đơn nghỉ không sửa được; huỷ rồi đăng ký lại.' using errcode = '42501';
  end if;
  new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  if new.status = old.status then
    new.decide_note := old.decide_note;
    new.version := old.version;
    return new;
  end if;
  v_approver := v_priv or app.has_perm(old.branch_id, 'attendance.approve');

  if old.status = 'requested' and new.status in ('approved', 'rejected') then
    if not v_approver then
      raise exception 'Chỉ Nhung, Linh duyệt ngày nghỉ.' using errcode = '42501';
    end if;
    if new.status = 'rejected' and char_length(btrim(coalesce(new.decide_note, ''))) = 0 then
      raise exception 'Cần ghi lý do từ chối.' using errcode = 'P0001';
    end if;
    if new.status = 'approved' then
      perform app._require_open(old.branch_id, old.from_date);
    end if;
    new.decided_by := coalesce(v_uid, new.decided_by);
    new.decided_at := now();

  elsif old.status in ('requested', 'approved') and new.status = 'cancelled' then
    if old.status = 'requested' and not (v_approver or old.user_id = v_uid) then
      raise exception 'Chỉ người đăng ký hoặc Nhung, Linh huỷ được đơn nghỉ.' using errcode = '42501';
    end if;
    if old.status = 'approved' then
      if not v_approver then
        raise exception 'Ngày nghỉ đã duyệt: chỉ Nhung, Linh huỷ được.' using errcode = '42501';
      end if;
      if char_length(btrim(coalesce(new.decide_note, ''))) = 0 then
        raise exception 'Cần ghi lý do huỷ ngày nghỉ đã duyệt.' using errcode = 'P0001';
      end if;
      perform app._require_open(old.branch_id, old.from_date);
    end if;
    new.cancelled_by := coalesce(v_uid, new.cancelled_by);
    new.cancelled_at := now();

  else
    raise exception 'Không đổi được trạng thái đơn nghỉ như vậy.' using errcode = 'P0001';
  end if;

  new.version := old.version + 1;
  return new;
end $$;

create trigger leave_guard before insert or update on leave_requests
  for each row execute function app.leave_guard();

-- Audit mọi lần duyệt, từ chối, huỷ (Q27: Nhung tự duyệt của mình)
create function app.leave_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_actor uuid := coalesce(app.uid(), new.decided_by, new.cancelled_by);
begin
  if (tg_op = 'INSERT' and new.status = 'approved') or (tg_op = 'UPDATE' and new.status <> old.status) then
    insert into audit_logs (actor_user_id, actor_label, branch_id, action, entity_type, entity_id, details)
    values (v_actor, case when v_actor is null then 'system' end, new.branch_id,
            case when v_actor = new.user_id then 'leave.self_' else 'leave.' end || new.status,
            'leave_request', new.id::text,
            jsonb_build_object('user', new.user_id, 'from', new.from_date, 'to', new.to_date, 'note', new.decide_note));
  end if;
  return null;
end $$;

create trigger leave_after after insert or update on leave_requests
  for each row execute function app.leave_after();

-- ---------------------------------------------------------------- Trạng thái từng ngày công

-- Mỗi người có hồ sơ (RLS: thợ chỉ thấy mình) × mỗi ngày trong khoảng. Thứ tự: ngoài thời gian làm (vắng) → quán đóng
-- cửa → quyết định của Nhung → nghỉ đã duyệt → chưa tới → chưa duyệt (test 23: không phải ngày vắng).
create function app.attendance_grid(p_branch uuid, p_from date, p_to date)
returns table (user_id uuid, work_date date, status text, check_in_at timestamptz, check_out_at timestamptz,
               note text, decided_status text, leave_id uuid, closed_reason text)
language sql stable set search_path = pg_catalog, public as $$
  with t as (select app.branch_today(p_branch) as today),
  days as (
    select sp.user_id, sp.start_date, sp.end_date, g::date as d
    from staff_profiles sp cross join generate_series(p_from, p_to, interval '1 day') g
    where sp.branch_id = p_branch)
  select x.user_id, x.d,
    case when x.d < x.start_date or (x.end_date is not null and x.d > x.end_date) then 'out'
         when c.id is not null then 'closed'
         when a.status is not null then a.status
         when l.id is not null then 'leave'
         when x.d > (select today from t) then 'future'
         else 'pending' end,
    a.check_in_at, a.check_out_at, a.note, a.status, l.id, c.reason
  from days x
  left join shop_closed_days c on c.branch_id = p_branch and c.closed_date = x.d and c.removed_at is null
  left join attendance_days a on a.branch_id = p_branch and a.user_id = x.user_id and a.work_date = x.d
  left join lateral (select lr.id from leave_requests lr
                     where lr.branch_id = p_branch and lr.user_id = x.user_id and lr.status = 'approved'
                       and x.d between lr.from_date and lr.to_date
                     limit 1) l on true
  order by x.user_id, x.d
$$;

-- Người trong cơ sở cho màn Nhân viên, Chấm công: Linh, Nhung thấy mọi người; người khác chỉ mình
create function app.staff_people(p_branch uuid)
returns table (user_id uuid, display_name text, is_active boolean, role_code text, role_name text)
language sql stable security definer set search_path = pg_catalog, public as $$
  select u.id, u.display_name, u.is_active and r.code is not null, r.code, r.name
  from users u
  left join lateral (select ro.code, ro.name from user_branch_roles ubr join roles ro on ro.id = ubr.role_id
                     where ubr.user_id = u.id and ubr.branch_id = p_branch and ubr.revoked_at is null
                     order by ubr.granted_at desc limit 1) r on true
  where app.has_branch(p_branch)
    and exists (select 1 from user_branch_roles x where x.user_id = u.id and x.branch_id = p_branch)
    and (u.id = app.uid() or app.has_perm(p_branch, 'payroll.read_all_branch')
         or app.has_perm(p_branch, 'attendance.approve'))
  order by u.display_name
$$;

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table payroll_settings enable row level security;
alter table kpi_policy_versions enable row level security;
alter table payroll_periods enable row level security;
alter table staff_profiles enable row level security;
alter table staff_policy_versions enable row level security;
alter table shop_closed_days enable row level security;
alter table attendance_days enable row level security;
alter table leave_requests enable row level security;

grant select on payroll_settings, payroll_periods, shop_closed_days to app_user;
create policy payroll_settings_read on payroll_settings for select to app_user using (app.has_branch(branch_id));
create policy payroll_periods_read on payroll_periods for select to app_user using (app.has_branch(branch_id));
create policy closed_days_read on shop_closed_days for select to app_user using (app.has_branch(branch_id));

-- Mốc KPI, chính sách lương người khác: chỉ người xem bảng lương toàn quán (PRD §4)
grant select on kpi_policy_versions, staff_policy_versions to app_user;
create policy kpi_read on kpi_policy_versions for select to app_user
  using (app.has_perm(branch_id, 'payroll.read_all_branch'));
create policy staff_policy_read on staff_policy_versions for select to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.has_perm(branch_id, 'payroll.read_all_branch')));

-- Hồ sơ, công, nghỉ: của mình; Nhung, Linh (duyệt công / xem lương toàn quán) thấy cả cơ sở
create function app.attendance_reader(p_branch uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select app.has_perm(p_branch, 'attendance.approve') or app.has_perm(p_branch, 'payroll.read_all_branch')
$$;

grant select on staff_profiles, attendance_days to app_user;
create policy staff_profiles_read on staff_profiles for select to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.attendance_reader(branch_id)));
create policy attendance_read on attendance_days for select to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.attendance_reader(branch_id)));

grant select, insert, update on leave_requests to app_user;
create policy leave_read on leave_requests for select to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.attendance_reader(branch_id)));
create policy leave_insert on leave_requests for insert to app_user
  with check (app.has_perm(branch_id, 'attendance.own') and user_id = app.uid());
create policy leave_update on leave_requests for update to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.has_perm(branch_id, 'attendance.approve')))
  with check (app.has_branch(branch_id));

grant execute on function app.payroll_locked_until(uuid) to app_user;
grant execute on function app._require_open(uuid, date) to app_user;
grant execute on function app.branch_today(uuid) to app_user;
grant execute on function app.attendance_reader(uuid) to app_user;
grant execute on function app.attendance_grid(uuid, date, date) to app_user;
grant execute on function app.staff_people(uuid) to app_user;
grant execute on function app.staff_profile_save(uuid, uuid, date, date, text) to app_user;
grant execute on function app.staff_policy_save(uuid, uuid, date, bigint, int, int, boolean, text) to app_user;
grant execute on function app.kpi_policy_save(uuid, date, bigint, int, bigint, int) to app_user;
grant execute on function app.payroll_settings_save(uuid, date) to app_user;
grant execute on function app.closed_days_add(uuid, date, date, text) to app_user;
grant execute on function app.closed_day_remove(uuid) to app_user;
grant execute on function app.attendance_check_in(uuid) to app_user;
grant execute on function app.attendance_check_out(uuid) to app_user;
grant execute on function app.attendance_decide(uuid, uuid, date, text, text) to app_user;
grant execute on function app.attendance_approve_checked_in(uuid, date) to app_user;
