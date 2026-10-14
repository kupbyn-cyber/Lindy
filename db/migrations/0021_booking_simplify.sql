-- 0021 — Bỏ bước chốt lịch (S02), nhân viên thường gửi yêu cầu huỷ (S04), luật sửa lịch mới (S15). Đợt 6B.
-- - Lịch tạo ra là Đã chốt lịch luôn; không còn tạo mới hay chuyển về Mới đặt. Giá trị 'pending' giữ trong ràng
--   buộc để không đổi lịch sử.
-- - Nhân viên thường (appointments.update_own_pending, mã quyền giữ nguyên) sửa được lịch do mình tạo khi lịch
--   chưa tạo đơn và chưa đến giờ hẹn. Linh, Nhung, Chin (manage_all) sửa mọi lịch chưa kết thúc như cũ.
-- - Huỷ chỉ người có cancel_all; người khác bấm Huỷ lịch thì gửi yêu cầu (cờ khách báo huỷ, B07).
-- - Khách không đến chỉ ghi được khi đã đến giờ hẹn.

-- Lịch Mới đặt đang có → Đã chốt lịch. Tắt trigger để không ghi người chốt giả; lịch sử ghi "tự chốt".
alter table appointments disable trigger user;
with moved as (
  update appointments
  set status = 'confirmed', confirmed_by = created_by, confirmed_at = coalesce(confirmed_at, now()),
      version = version + 1, updated_at = now()
  where status = 'pending'
  returning id, branch_id
)
insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, reason)
select id, branch_id, null, 'auto_confirmed', 'Bỏ bước chốt lịch (S02)' from moved;
alter table appointments enable trigger user;

alter table appointments alter column status set default 'confirmed';

create or replace function app.appointments_guard() returns trigger
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
  v_own_editable boolean;
begin
  -- Chủ DB (migration, hàm đồng bộ với đơn hàng) không bị kiểm quyền; người dùng app chạy dưới app_user.
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
    end if;
    if new.status <> 'confirmed' then
      raise exception 'Lịch mới luôn ở trạng thái Đã chốt lịch.' using errcode = 'P0001';
    end if;
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    new.confirmed_by := new.created_by;
    new.confirmed_at := now();
    new.customer_cancel_reported_at := null; new.customer_cancel_reported_by := null; new.customer_cancel_note := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    new.arrived_by := null; new.arrived_at := null; new.no_show_by := null; new.no_show_at := null;
    new.completed_by := null; new.completed_at := null;
    return new;
  end if;

  -- UPDATE ---------------------------------------------------------
  if new.id <> old.id or new.branch_id <> old.branch_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.create_request_id <> old.create_request_id
     or new.create_request_hash <> old.create_request_hash then
    raise exception 'Không được đổi cơ sở, người tạo hoặc mã lịch.' using errcode = '42501';
  end if;

  v_privileged := current_user <> 'app_user';
  -- S15: lịch do mình tạo, chưa tạo đơn, chưa đến giờ hẹn
  v_own_editable := old.created_by = v_uid and old.status in ('pending', 'confirmed') and now() < old.start_at
    -- đếm cả đơn người sửa không xem được (K09) qua hàm security definer
    and not exists (select 1 from app.appointment_orders(old.id) x where x.status <> 'cancelled');

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
            or (v_own_editable and app.has_perm(old.branch_id, 'appointments.update_own_pending'))) then
      raise exception 'Chỉ sửa được lịch do mình tạo, khi chưa tạo đơn và chưa đến giờ hẹn.' using errcode = '42501';
    end if;
  end if;

  if old.customer_cancel_reported_at is not null then
    new.customer_cancel_reported_at := old.customer_cancel_reported_at;
    new.customer_cancel_reported_by := old.customer_cancel_reported_by;
    new.customer_cancel_note := old.customer_cancel_note;
  elsif new.customer_cancel_reported_at is not null then
    if old.status not in ('pending', 'confirmed') then
      raise exception 'Chỉ gửi yêu cầu huỷ được với lịch chưa đến.' using errcode = 'P0001';
    end if;
    if not (v_privileged or app.has_perm(old.branch_id, 'appointments.report_customer_cancel')) then
      raise exception 'Không có quyền gửi yêu cầu huỷ.' using errcode = '42501';
    end if;
    new.customer_cancel_reported_at := now();
    new.customer_cancel_reported_by := v_uid;
  else
    new.customer_cancel_reported_by := null;
    new.customer_cancel_note := null;
  end if;

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
      when 'arrived' then
        if old.status = 'in_progress' and v_privileged then
          null;   -- đơn liên kết bị huỷ hết: lịch về Khách đã đến
        else
          if old.status not in ('pending', 'confirmed') then
            raise exception 'Chỉ đánh dấu đến được lịch chưa đến.' using errcode = 'P0001';
          end if;
          if not (v_privileged or app.has_perm(old.branch_id, 'appointments.mark_arrived')) then
            raise exception 'Không có quyền đánh dấu khách đến.' using errcode = '42501';
          end if;
          new.arrived_by := v_uid; new.arrived_at := now();
        end if;
      when 'in_progress' then
        if not v_privileged or old.status <> 'arrived' then
          raise exception 'Lịch sang Đang làm khi tạo đơn từ lịch.' using errcode = 'P0001';
        end if;
      when 'no_show' then
        if old.status not in ('pending', 'confirmed') then
          raise exception 'Chỉ ghi khách không đến được với lịch chưa đến.' using errcode = 'P0001';
        end if;
        if not v_privileged and now() < old.start_at then
          raise exception 'Chưa đến giờ hẹn, chưa ghi khách không đến được.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.manage_all')) then
          raise exception 'Không có quyền ghi khách không đến.' using errcode = '42501';
        end if;
        new.no_show_by := v_uid; new.no_show_at := now();
      when 'completed' then
        if old.status not in ('arrived', 'in_progress') then
          raise exception 'Chỉ hoàn thành được lịch khách đã đến.' using errcode = 'P0001';
        end if;
        if not v_privileged then
          if not app.has_perm(old.branch_id, 'appointments.manage_all') then
            raise exception 'Không có quyền đánh dấu hoàn thành.' using errcode = '42501';
          end if;
          if exists (select 1 from orders o where o.appointment_id = old.id and o.status <> 'cancelled') then
            raise exception 'Lịch có đơn liên kết; lịch tự Hoàn thành khi đơn được xác nhận.' using errcode = 'P0001';
          end if;
        end if;
        new.completed_by := v_uid; new.completed_at := now();
      when 'cancelled' then
        if old.status not in ('pending', 'confirmed', 'arrived') then
          raise exception 'Không huỷ được lịch ở trạng thái này.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.cancel_all')) then
          raise exception 'Không huỷ được lịch này. Bấm Huỷ lịch để gửi yêu cầu cho Linh, Nhung, Chin.' using errcode = '42501';
        end if;
        if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
          raise exception 'Cần ghi lý do huỷ.' using errcode = 'P0001';
        end if;
        new.cancelled_by := v_uid; new.cancelled_at := now();
      else
        raise exception 'Không đổi được sang trạng thái này.' using errcode = 'P0001';
    end case;
  end if;

  new.updated_by := v_uid;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;
