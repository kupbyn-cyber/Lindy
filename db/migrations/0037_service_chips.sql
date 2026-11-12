-- 0037 — S65 (anh duyệt 12/11/2026). Brief, kế hoạch: docs/vibe/lich-hien-dich-vu/.
-- Bộ chip dịch vụ theo cơ sở cho form lịch: chạm chip là điền nhanh "Dịch vụ dự kiến" (nối bằng " + ").
-- Linh (booking_settings.manage) sửa ở Thêm → Cài đặt lịch; ai xem lịch cơ sở đều đọc được (policy có sẵn).
-- Chip chỉ là lối điền nhanh: appointments.service_summary vẫn là chữ tự do, không đổi.

-- Tối đa 20 chip; mỗi chip 1–30 ký tự, không trắng hai đầu, không chứa "+" (dấu nối/tách chip trong ô Dịch vụ).
create function app.valid_service_chips(p text[]) returns boolean
language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(cardinality(p), 0) <= 20
     and not exists (
       select 1 from unnest(p) e
       where e is null or char_length(e) not between 1 and 30 or e <> btrim(e) or position('+' in e) > 0)
$$;
-- 0008 đã thu EXECUTE mặc định; CHECK gọi hàm này chạy lại ở mọi UPDATE dòng cài đặt (kể cả lưu giờ mở cửa)
grant execute on function app.valid_service_chips(text[]) to app_user, app_worker;

alter table branch_booking_settings
  add column service_chips text[] not null
    default array['Tay', 'Chân', 'Gel', 'Móng giả', 'Design', 'Mi', 'Chăm sóc']::text[],
  add constraint branch_booking_settings_service_chips_check check (app.valid_service_chips(service_chips));

-- Policy booking_settings_manage có sẵn chỉ cho người có booking_settings.manage cập nhật dòng này
grant update (service_chips) on branch_booking_settings to app_user;
