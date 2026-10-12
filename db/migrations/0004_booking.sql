-- 0004 — Lịch đặt khách (module v1.2 §11; kế hoạch 7.3). Không có staff_id: lịch hẹn không phân thợ (D17).
-- Trigger kiểm quyền theo từng cột và từng chuyển trạng thái (§4), chặn cả khi gọi SQL trực tiếp dưới app_user [P2].

create table branch_booking_settings (
  branch_id uuid primary key references branches(id),
  open_time time not null default '09:00',
  close_time time not null default '21:00',
  default_duration_min int not null default 120 check (default_duration_min between 15 and 720),
  max_concurrent_guests int,          -- B11: chưa bật, để trống
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  check (close_time > open_time)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  customer_id uuid,                    -- liên kết hồ sơ khách ở Đợt 2
  customer_display_name text not null check (char_length(btrim(customer_display_name)) between 1 and 100),
  phone text check (char_length(phone) <= 20 and phone ~ '^\+?[0-9]{8,15}$'),
  start_at timestamptz not null,
  end_at timestamptz not null,
  guest_count int not null default 1 check (guest_count between 1 and 4),   -- K05
  service_summary text check (char_length(service_summary) <= 200),
  notes text check (char_length(notes) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show')),
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  customer_cancel_reported_at timestamptz,
  customer_cancel_reported_by uuid references users(id),
  customer_cancel_note text check (char_length(customer_cancel_note) <= 500),
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  arrived_by uuid references users(id),
  arrived_at timestamptz,
  no_show_by uuid references users(id),
  no_show_at timestamptz,
  completed_by uuid references users(id),
  completed_at timestamptz,
  outside_hours boolean not null default false,
  needs_capacity_review boolean not null default false check (needs_capacity_review = false), -- B11
  search_norm text not null default '' check (char_length(search_norm) <= 300),
  created_by uuid not null references users(id),
  updated_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  create_request_id uuid not null,
  create_request_hash text not null check (char_length(create_request_hash) = 64),
  check (end_at > start_at),
  check (status <> 'cancelled' or char_length(btrim(coalesce(cancel_reason, ''))) > 0),
  unique (created_by, create_request_id)
);
create index appointments_range_idx on appointments(branch_id, start_at, end_at);
create index appointments_phone_idx on appointments(branch_id, phone) where phone is not null;
create index appointments_search_idx on appointments(branch_id, search_norm text_pattern_ops);
create index appointments_open_idx on appointments(branch_id, end_at) where status in ('pending', 'confirmed');

create table appointment_audit_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references appointments(id),
  branch_id uuid not null references branches(id),
  actor_user_id uuid references users(id),
  action text not null,
  before_json jsonb,
  after_json jsonb,
  reason text,
  occurred_at timestamptz not null default now()
);
create index appointment_audit_appt_idx on appointment_audit_events(appointment_id, id);
create trigger appointment_audit_no_update before update or delete on appointment_audit_events
  for each row execute function app.forbid_mutation();
create trigger appointment_audit_no_truncate before truncate on appointment_audit_events
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------- Hàm phụ

create function app.branch_tz(p_branch uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select timezone from branches where id = p_branch
$$;

create function app.appointment_snapshot(a appointments) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'customer_display_name', a.customer_display_name, 'phone', a.phone,
    'start_at', a.start_at, 'end_at', a.end_at, 'guest_count', a.guest_count,
    'service_summary', a.service_summary, 'notes', a.notes, 'status', a.status,
    'customer_cancel_reported_at', a.customer_cancel_reported_at, 'outside_hours', a.outside_hours)
$$;

-- Người tạo lịch (để người tạo xem được lịch sử lịch của mình)
create function app.appointment_created_by(p_id uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, public as $$
  select created_by from appointments where id = p_id
$$;
grant execute on function app.appointment_created_by(uuid) to app_user;

-- ---------------------------------------------------------------- Kiểm và chuẩn hoá trước khi ghi

create function app.appointments_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_tz text;
  v_open time;
  v_close time;
  v_local_start timestamp;
  v_local_end timestamp;
  v_fields_changed boolean;
  v_privileged boolean;
  v_own_pending boolean;
begin
  -- Chủ DB (migration, quản trị) không bị kiểm quyền; mọi người dùng app đều chạy dưới app_user.
  if current_user <> 'app_user' then
    v_uid := coalesce(v_uid, new.updated_by);
  elsif v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  v_tz := app.branch_tz(new.branch_id);
  v_local_start := new.start_at at time zone v_tz;
  v_local_end := new.end_at at time zone v_tz;
  if v_local_start::date <> v_local_end::date then
    raise exception 'Giờ kết thúc phải cùng ngày với giờ bắt đầu.' using errcode = 'P0001';
  end if;
  select open_time, close_time into v_open, v_close from branch_booking_settings where branch_id = new.branch_id;
  new.outside_hours := coalesce(v_local_start::time < v_open or v_local_end::time > v_close, false);
  new.needs_capacity_review := false;

  if tg_op = 'INSERT' then
    if current_user = 'app_user' then
      if new.created_by is distinct from v_uid then
        raise exception 'Người tạo phải là người đang đăng nhập.' using errcode = '42501';
      end if;
      if not app.has_perm(new.branch_id, 'appointments.create') then
        raise exception 'Không có quyền tạo lịch.' using errcode = '42501';
      end if;
      if new.status = 'confirmed' and not app.has_perm(new.branch_id, 'appointments.confirm_all') then
        raise exception 'Không có quyền Tạo và chốt.' using errcode = '42501';
      end if;
    end if;
    if new.status not in ('pending', 'confirmed') then
      raise exception 'Lịch mới chỉ ở trạng thái Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
    end if;
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    new.confirmed_by := case when new.status = 'confirmed' then new.created_by end;
    new.confirmed_at := case when new.status = 'confirmed' then now() end;
    new.customer_cancel_reported_at := null; new.customer_cancel_reported_by := null; new.customer_cancel_note := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    new.arrived_by := null; new.arrived_at := null; new.no_show_by := null; new.no_show_at := null;
    new.completed_by := null; new.completed_at := null;
    return new;
  end if;

  -- UPDATE ---------------------------------------------------------
  -- Cột không bao giờ đổi [P2]
  if new.id <> old.id or new.branch_id <> old.branch_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.create_request_id <> old.create_request_id
     or new.create_request_hash <> old.create_request_hash then
    raise exception 'Không được đổi cơ sở, người tạo hoặc mã lịch.' using errcode = '42501';
  end if;

  v_privileged := current_user <> 'app_user';
  v_own_pending := old.created_by = v_uid and old.status = 'pending';

  -- Sửa nội dung lịch
  v_fields_changed := new.customer_display_name is distinct from old.customer_display_name
    or new.phone is distinct from old.phone or new.start_at is distinct from old.start_at
    or new.end_at is distinct from old.end_at or new.guest_count is distinct from old.guest_count
    or new.service_summary is distinct from old.service_summary or new.notes is distinct from old.notes
    or new.customer_id is distinct from old.customer_id;
  if v_fields_changed then
    if old.status in ('cancelled', 'no_show', 'completed') then
      raise exception 'Lịch đã kết thúc, không sửa được.' using errcode = 'P0001';
    end if;
    if not (v_privileged or app.has_perm(old.branch_id, 'appointments.manage_all')
            or (v_own_pending and app.has_perm(old.branch_id, 'appointments.update_own_pending'))) then
      raise exception 'Chỉ sửa được lịch do mình tạo khi còn Mới đặt.' using errcode = '42501';
    end if;
  end if;

  -- Khách báo huỷ: cờ riêng, ghi một lần, giữ trạng thái [P10]
  if old.customer_cancel_reported_at is not null then
    new.customer_cancel_reported_at := old.customer_cancel_reported_at;
    new.customer_cancel_reported_by := old.customer_cancel_reported_by;
    new.customer_cancel_note := old.customer_cancel_note;
  elsif new.customer_cancel_reported_at is not null then
    if old.status not in ('pending', 'confirmed') then
      raise exception 'Chỉ báo huỷ được lịch Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
    end if;
    if not (v_privileged or app.has_perm(old.branch_id, 'appointments.report_customer_cancel')) then
      raise exception 'Không có quyền báo khách huỷ.' using errcode = '42501';
    end if;
    new.customer_cancel_reported_at := now();
    new.customer_cancel_reported_by := v_uid;
  else
    new.customer_cancel_reported_by := null;
    new.customer_cancel_note := null;
  end if;

  -- Cột trạng thái chỉ đổi qua đúng chuyển trạng thái; giá trị máy gửi lên bị thay bằng giá trị server.
  new.confirmed_by := old.confirmed_by; new.confirmed_at := old.confirmed_at;
  new.arrived_by := old.arrived_by; new.arrived_at := old.arrived_at;
  new.no_show_by := old.no_show_by; new.no_show_at := old.no_show_at;
  new.completed_by := old.completed_by; new.completed_at := old.completed_at;
  if new.status = old.status then
    new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at; new.cancel_reason := old.cancel_reason;
  end if;

  if new.status <> old.status then
    if old.status in ('cancelled', 'no_show', 'completed') then
      raise exception 'Lịch đã kết thúc, không đổi trạng thái được.' using errcode = 'P0001';
    end if;
    case new.status
      when 'confirmed' then
        if old.status <> 'pending' then
          raise exception 'Chỉ chốt được lịch Mới đặt.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.confirm_all')) then
          raise exception 'Không có quyền chốt lịch.' using errcode = '42501';
        end if;
        new.confirmed_by := v_uid; new.confirmed_at := now();
      when 'arrived' then
        if old.status not in ('pending', 'confirmed') then
          raise exception 'Chỉ đánh dấu đến được lịch Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.mark_arrived')) then
          raise exception 'Không có quyền đánh dấu khách đến.' using errcode = '42501';
        end if;
        new.arrived_by := v_uid; new.arrived_at := now();
      when 'no_show' then
        if old.status not in ('pending', 'confirmed') then
          raise exception 'Chỉ đánh dấu không đến được lịch Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.manage_all')) then
          raise exception 'Không có quyền đánh dấu khách không đến.' using errcode = '42501';
        end if;
        new.no_show_by := v_uid; new.no_show_at := now();
      when 'completed' then
        if old.status not in ('arrived', 'in_progress') then
          raise exception 'Chỉ hoàn thành được lịch khách đã đến.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.manage_all')) then
          raise exception 'Không có quyền đánh dấu hoàn thành.' using errcode = '42501';
        end if;
        new.completed_by := v_uid; new.completed_at := now();
      when 'cancelled' then
        if old.status not in ('pending', 'confirmed', 'arrived') then
          raise exception 'Không huỷ được lịch ở trạng thái này.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.cancel_all')
                or (v_own_pending and app.has_perm(old.branch_id, 'appointments.cancel_own_pending'))) then
          raise exception 'Không huỷ được lịch này. Dùng Khách báo huỷ để báo người có quyền.' using errcode = '42501';
        end if;
        if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
          raise exception 'Cần ghi lý do huỷ.' using errcode = 'P0001';
        end if;
        new.cancelled_by := v_uid; new.cancelled_at := now();
      else
        -- in_progress: do module đơn hàng đặt (Đợt 2)
        raise exception 'Không đổi được sang trạng thái này.' using errcode = 'P0001';
    end case;
  end if;

  new.updated_by := v_uid;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create trigger appointments_guard before insert or update on appointments
  for each row execute function app.appointments_guard();

-- ---------------------------------------------------------------- Lịch sử thay đổi và cập nhật tức thời (sau khi ghi)

create function app.appointments_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_action text;
  v_reason text;
  v_tz text := app.branch_tz(new.branch_id);
  v_dates text[];
begin
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'confirmed' then 'created_confirmed' else 'created' end;
    insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, before_json, after_json)
    values (new.id, new.branch_id, new.created_by, v_action, null, app.appointment_snapshot(new));
    v_dates := array[to_char(new.start_at at time zone v_tz, 'YYYY-MM-DD')];
  else
    if new.status <> old.status then
      v_action := new.status;          -- confirmed, arrived, no_show, completed, cancelled
      v_reason := case when new.status = 'cancelled' then new.cancel_reason end;
    elsif new.customer_cancel_reported_at is distinct from old.customer_cancel_reported_at then
      v_action := 'customer_cancel_reported';
      v_reason := new.customer_cancel_note;
    elsif new.start_at <> old.start_at or new.end_at <> old.end_at then
      v_action := 'rescheduled';
    else
      v_action := 'updated';
    end if;
    insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, before_json, after_json, reason)
    values (new.id, new.branch_id, new.updated_by, v_action, app.appointment_snapshot(old), app.appointment_snapshot(new), v_reason);
    v_dates := array[to_char(new.start_at at time zone v_tz, 'YYYY-MM-DD'), to_char(old.start_at at time zone v_tz, 'YYYY-MM-DD')];
  end if;
  perform pg_notify('lindy_events', json_build_object('kind', 'appointments', 'branchId', new.branch_id, 'dates', v_dates)::text);
  return null;
end $$;

create trigger appointments_after after insert or update on appointments
  for each row execute function app.appointments_after();

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table branch_booking_settings enable row level security;
alter table appointments enable row level security;
alter table appointment_audit_events enable row level security;

grant select on branch_booking_settings to app_user, app_worker;
grant update (open_time, close_time, default_duration_min, updated_at, updated_by) on branch_booking_settings to app_user;
create policy booking_settings_read on branch_booking_settings for select to app_user using (app.has_branch(branch_id));
create policy booking_settings_manage on branch_booking_settings for update to app_user
  using (app.has_perm(branch_id, 'booking_settings.manage'))
  with check (app.has_perm(branch_id, 'booking_settings.manage') and updated_by = app.uid());
create policy booking_settings_worker on branch_booking_settings for select to app_worker using (true);

grant select, insert, update on appointments to app_user;
grant select on appointments to app_worker;
create policy appt_read on appointments for select to app_user
  using (app.has_perm(branch_id, 'appointments.read_branch'));
create policy appt_insert on appointments for insert to app_user
  with check (app.has_perm(branch_id, 'appointments.create') and created_by = app.uid());
create policy appt_update on appointments for update to app_user
  using (app.has_perm(branch_id, 'appointments.read_branch'))
  with check (app.has_perm(branch_id, 'appointments.read_branch'));
create policy appt_worker on appointments for select to app_worker using (true);

grant select, insert on appointment_audit_events to app_user;
create policy appt_audit_read on appointment_audit_events for select to app_user
  using (app.has_perm(branch_id, 'appointments.audit_read')
         or (app.has_perm(branch_id, 'appointments.read_branch') and app.appointment_created_by(appointment_id) = app.uid()));
-- Người dùng chỉ thêm được ghi chú (ví dụ ghi chú khi bấm lại Khách báo huỷ) dưới tên mình
create policy appt_audit_note on appointment_audit_events for insert to app_user
  with check (actor_user_id = app.uid() and action = 'note' and app.has_perm(branch_id, 'appointments.read_branch'));

-- Cài đặt mặc định cho các cơ sở đã có
insert into branch_booking_settings (branch_id) select id from branches on conflict do nothing;
