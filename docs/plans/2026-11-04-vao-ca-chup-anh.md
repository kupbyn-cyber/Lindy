# Vào ca bằng ảnh có giờ, tự duyệt công (S59–S61)

Brief đã duyệt: `docs/vibe/vao-ca-chup-anh/brief.md`. Quyết định: S59–S61 trong `docs/DECISIONS.md`.

**Trạng thái:** anh duyệt 04/11/2026 (kèm 2 chi tiết mục 8); đã code, kiểm xong trên máy (chưa thử iPhone thật).

## 1. Mục tiêu

Bấm **Vào ca** → màn camera trong app, đồng hồ giờ máy chủ chạy từng giây → chụp → ảnh đóng dấu giờ, nén ≤ 150KB, gửi lên → máy chủ ghi giờ vào ca và **tự duyệt Đi làm**. Không chụp được thì **Vào ca không ảnh**, chờ duyệt như cũ. Ảnh tự xoá sau 35 ngày, dòng công giữ nguyên.

## 2. Thế nào là xong

- Thợ bấm Vào ca → màn camera mở, giờ chạy từng giây; chụp xong ≤ 5 giây thẻ báo "Đã vào ca lúc 8:57", chip **Đi làm**; Bảng công hiện Đi làm; Cần xử lý không đếm ngày đó.
- Giờ trên ảnh và giờ vào ca theo máy chủ, kể cả khi đồng hồ điện thoại sai 1 tiếng.
- Màn chụp không có lối chọn ảnh từ thư viện.
- Camera bị từ chối hoặc gửi ảnh lỗi → có nút **Vào ca không ảnh** → ngày đó Chưa duyệt, Nhung duyệt như cũ.
- Linh, Nhung thấy ảnh ở Duyệt công (chạm một người) kèm nhãn **Tự duyệt**; thợ thấy ảnh mình ở Của tôi; thợ mở ảnh người khác → không thấy (404).
- Ảnh trong DB ≤ 150KB, chỉ JPEG.
- Ảnh có ngày vào ca cũ hơn 35 ngày bị xoá dữ liệu ở lần chạy job kế tiếp; dòng công, giờ vào, trạng thái còn nguyên; màn hiện "Ảnh đã xoá sau 35 ngày".
- Linh/Nhung đổi ngày tự duyệt thành Nghỉ không phép (có lý do) → mất nhãn Tự duyệt, có lịch sử, lương tạm tính đổi theo.
- `bun run check`, build, `check-upgrade --from=0033` đạt.

## 3. Phạm vi

**Làm:** đúng mục "Phạm vi bản đầu" của brief.

**Không làm:** so mặt, wifi/GPS, ảnh Ra ca, đi muộn, thông báo, album/tải ảnh, cài đặt số ngày giữ (xem "Để sau" của brief). Không thêm ảnh vào gói Dữ liệu dùng thử. Không đổi hàm `attendance_grid` và cách tính lương.

## 4. Lựa chọn kỹ thuật

| Việc | Chọn | Lý do |
|---|---|---|
| Nơi lưu ảnh | Bảng mới `attendance_photos` trong PostgreSQL (bytea) | Giống ảnh chứng từ, không cần ổ đĩa riêng trên Vibe Host (container triển khai lại là mất file). ~30MB tối đa. |
| Xoá ảnh | Đặt `data = null`, ghi `purged_at`; giữ dòng | Biết ngày đó từng có ảnh để hiện "Ảnh đã xoá sau 35 ngày"; app không cần quyền DELETE; dung lượng được PostgreSQL tái dùng cho ảnh mới. |
| Đóng dấu, nén | Trên iPhone (canvas) | Thêm thư viện xử lý ảnh ở máy chủ làm ảnh Docker vượt 1GB. Giờ chính thức vẫn do DB ghi. |
| Giờ trên màn chụp | API trả giờ máy chủ; app tính độ lệch, đồng hồ chạy theo giờ máy chủ | Chỉnh giờ điện thoại không đổi được giờ trên ảnh. |
| Tự duyệt | Trong cùng hàm DB vào ca có ảnh | Một giao dịch: có ảnh mới có tự duyệt; không gọi được riêng phần tự duyệt. |

**Quy tắc tự duyệt** (trong DB): chỉ khi ngày đó chưa có quyết định, **không phải ngày quán đóng cửa**, **không có nghỉ cả ngày đã duyệt**, tháng chưa khoá lương. Trường hợp còn lại vẫn ghi giờ và ảnh, ngày đó chờ Nhung/Linh quyết như hiện nay.

## 5. File sẽ tạo / sửa

- **Mới:** `db/migrations/0034_attendance_photos.sql`, `src/server/attendance/photo.ts`, `src/routes/api/attendance/photo.$id.ts`, `src/lib/checkin-photo.ts`, `src/components/cong/CheckInCamera.tsx`, `tests/acceptance/vao-ca-anh.test.ts`, `tests/unit/checkin-photo.test.ts`.
- **Sửa:** `src/server/attendance/service.ts` (giờ máy chủ, ảnh và nhãn Tự duyệt trong từng ngày), `src/routes/api/attendance/$action.ts` (`check-in-photo`), `src/server/worker.ts` (job xoá), `src/server/http/headers.ts` (`camera=(self)`), `src/components/cong/AttendanceCard.tsx`, `src/components/cong/views.tsx`, `src/routes/_app/lich/cham-cong.tsx`, `scripts/check-upgrade.ts`, `docs/CHAY_LOCAL.md`, test sẵn có cho sao lưu, dữ liệu thử, header.

**Đổi dữ liệu:** thêm bảng `attendance_photos`, thêm cột `attendance_days.auto_approved` (mặc định false, dữ liệu cũ không đổi). Thay hàm `attendance_decide`, `demo_wipe_tables`, `backup_dump`.

## 6. Các bước

### Gói 1 — Database (migration 0034)
- [x] **1.1** Bảng `attendance_photos` (một ảnh mỗi ngày công, JPEG, 1 byte–150KB, kiểm byte đầu, sha256, `taken_at`, `purged_at`; ràng buộc `data is null` ⇔ `purged_at is not null`), cột `attendance_days.auto_approved`, RLS đọc như `attendance_days` (của mình hoặc Linh, Nhung), không cấp INSERT/UPDATE/DELETE cho app, trigger chặn xoá. *Kiểm:* `bun run db:migrate`, `bun run lint`.
- [x] **1.2** `app.attendance_check_in_photo(branch, data)`: quyền `attendance.own`, có hồ sơ hôm nay, **chưa vào ca hôm nay** (đã vào thì báo lỗi), ảnh hợp lệ → ghi giờ `now()`, ghi ảnh, tự duyệt theo quy tắc mục 4, audit `attendance.auto_approved`. *Kiểm:* test 6.1.
- [x] **1.3** Thay `app.attendance_decide`: mọi quyết định của Nhung/Linh đặt `auto_approved = false`. *Kiểm:* test 6.1.
- [x] **1.4** `app.attendance_photo_purge()` (chỉ `app_worker`): xoá dữ liệu ảnh có `work_date < hôm nay theo giờ cơ sở − 35 ngày`, mỗi lần tối đa 200 ảnh. *Kiểm:* test 6.1.
- [x] **1.5** `demo_wipe_tables` thêm `attendance_photos`; `backup_dump` bỏ `attendance_photos` khỏi file sao lưu Linh tải (ảnh tạm thời, file nhẹ hơn). *Kiểm:* `tests/ops/demo.test.ts`, `tests/integration/backup.test.ts`.

### Gói 2 — Máy chủ
- [x] **2.1** `photo.ts`: `checkInWithPhoto` (kiểm kích thước, JPEG trước khi vào DB), `getCheckInPhoto` (RLS lọc; không có quyền → 404). Route `POST /api/attendance/check-in-photo` (thân là ảnh), `GET /api/attendance/photo/:id` (`private, no-store`). *Kiểm:* test 6.1.
- [x] **2.2** `service.ts`: `myToday` trả `serverNow`; mỗi ngày công thêm `photo` (`id`, `purged`) và `autoApproved` (truy vấn phụ, không đổi `attendance_grid`). *Kiểm:* typecheck, test.
- [x] **2.3** `worker.ts`: đăng ký job xoá ảnh, tự giãn còn mỗi giờ một lần. *Kiểm:* test gọi job trực tiếp.
- [x] **2.4** `headers.ts`: `Permissions-Policy: camera=(self), microphone=(), geolocation=()`. *Kiểm:* test header.

### Gói 3 — Giao diện
- [x] **3.1** `checkin-photo.ts`: tính độ lệch giờ máy chủ, chữ đóng dấu (giờ:phút:giây, thứ, ngày, tên, "Vào ca · LINDY"), vẽ khung hình + dải chữ, nén (cạnh dài 960px, hạ chất lượng/kích thước tới ≤ 150KB). *Kiểm:* `tests/unit/checkin-photo.test.ts`.
- [x] **3.2** `CheckInCamera.tsx`: màn toàn màn hình, camera trước, nút đổi camera, đồng hồ chạy, nút Chụp → xem lại → **Vào ca** / Chụp lại. Lỗi camera hoặc gửi lỗi → câu báo + **Vào ca không ảnh**. Không có ô chọn file. *Kiểm:* trình duyệt có camera giả.
- [x] **3.3** `AttendanceCard.tsx`: Vào ca mở màn chụp; xong báo "Đã vào ca lúc 8:57", chip Đi làm. *Kiểm:* trình duyệt 375px.
- [x] **3.4** `views.tsx`, `cham-cong.tsx`: ảnh nhỏ ở Của tôi và trong hộp Duyệt công (chạm phóng to), nhãn **Tự duyệt**, dòng "Ảnh đã xoá sau 35 ngày". *Kiểm:* trình duyệt, sáng/tối, tài khoản thợ và Nhung.

### Gói 4 — Kiểm thử và chốt
- [x] **4.1** `tests/acceptance/vao-ca-anh.test.ts`: vào ca có ảnh → Đi làm, tự duyệt, giờ DB; vào lần hai → lỗi; không ảnh → chờ duyệt; ngày đóng cửa, nghỉ cả ngày đã duyệt → không tự duyệt; PNG, file giả, > 150KB → lỗi; Nhung đổi quyết định cần lý do, mất Tự duyệt; xoá sau 35 ngày giữ dòng công, chưa tới 35 ngày không xoá; thợ không xem ảnh người khác; app không ghi/xoá thẳng bảng ảnh, không gọi được hàm xoá; khoá lương vẫn chạy.
- [x] **4.2** `bun run check`, `bun run build`, `bun scripts/check-upgrade.ts --from=0033` (thêm bước vào ca có ảnh).
- [x] **4.3** Chạy bản build trên trình duyệt có camera giả (CSP, header chỉ áp ở bản build): chụp, xem ảnh, từ chối camera; 375px sáng/tối.
- [x] **4.4** Cập nhật `CHAY_LOCAL.md`, đánh dấu kế hoạch, commit. Không push khi anh chưa yêu cầu.

## 7. Rủi ro và cách lùi

| Rủi ro | Cách xử lý |
|---|---|
| App mở từ màn hình chính iPhone hỏi quyền camera nhiều lần, hoặc không mở được camera | Có **Vào ca không ảnh**. Phải thử trên iPhone thật trước khi báo quán dùng. |
| Header, CSP chỉ áp ở bản build, dev chạy được mà bản thật hỏng camera | Bước 4.3 kiểm trên bản build. |
| Gửi ảnh nặng hoặc gửi liên tục | Giới hạn 150KB ở API và DB, mỗi ngày một ảnh, giới hạn ghi sẵn có (`limitWrites`). |
| Dung lượng DB sau khi xoá ảnh | PostgreSQL tự dùng lại chỗ trống cho ảnh mới; tổng ổn định ~30MB. |
| Sao lưu tự động của Vibe Host vẫn còn ảnh cũ | Ghi rõ trong brief; mất khi bản sao lưu cũ bị thay. |
| Hỏng sau khi triển khai | Triển khai lại bản trước. Migration chỉ thêm bảng, cột; code cũ vẫn chạy với DB mới (Vào ca cũ vẫn dùng được). |

## 8. Hai chi tiết em tự chọn, cần anh gật đầu

1. **Không tự duyệt** ngày quán đóng cửa và ngày đã có nghỉ cả ngày được duyệt: vẫn ghi giờ và ảnh, để Nhung/Linh quyết (tránh vào ca nhầm làm mất ngày nghỉ đã duyệt).
2. **File sao lưu Linh tải không gồm ảnh vào ca** (ảnh tạm thời; file sao lưu nhẹ hơn khoảng 40MB).

## 9. Xác minh (04/11/2026)

- Lint, typecheck, toàn bộ 420 kiểm thử (40 file) đạt; trong đó `tests/acceptance/vao-ca-anh.test.ts` 14 ca, `tests/unit/checkin-photo.test.ts` 4 ca.
- Build production đạt. `check-upgrade --from=0033` đạt: ngày công cũ không mang nhãn tự duyệt, gửi ảnh lần hai bị chặn, việc nền xoá ảnh chạy bằng quyền `app_worker`.
- Bản build ở cổng 3107 + Chrome headless có camera giả (390×844): header `camera=(self)`; Trang chụp → Đi làm, tự duyệt, ảnh 720×960 (~22KB với camera giả); màn chụp không có ô chọn file; xem ảnh ở Của tôi (giao diện tối); Chin bị từ chối camera → **Vào ca không ảnh** → Chưa duyệt; Chin mở ảnh của Trang → 404; Nhung thấy ảnh trong hộp Duyệt công.
- **Chưa thử trên iPhone thật**: quyền camera khi mở từ màn hình chính, cỡ ảnh thật (dự kiến 60–130KB), camera trước/sau.
- Giới hạn biết trước: tháng đã khoá lương thì hộp Duyệt công không mở được, nên Nhung/Linh không xem ảnh của tháng đó ở màn này (ảnh vẫn còn tới hết 35 ngày).
