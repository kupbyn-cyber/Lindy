# Triển khai LINDY OS lên Vibe Host Mắt Bão (T03)

Cập nhật 13/10/2026. Trước đó dùng Vibe Hosting Nhân Hòa (T02); cách app tự chuẩn bị DB giữ nguyên.

## Thông tin hosting

| Mục | Giá trị |
|---|---|
| Bảng quản lý | https://v2.tinhgon.xyz (mục **Đưa website lên mạng**) |
| Địa chỉ app | Tên miền Vibe Host cấp, dạng `https://<tên>.n2.tinhgon.xyz` (SSL tự cấp) |
| Mã nguồn | GitHub `kupbyn-cyber/Lindy` (riêng tư), nhánh `main`, nguồn **Git URL** + mã truy cập GitHub |
| Build | `vite build`; chạy `npm start` = `node .output/server/index.mjs`, cổng `PORT` (mặc định **3000**) |
| Database | PostgreSQL của Vibe Host, chỉ có địa chỉ nội bộ |

## Khi app khởi động

Ở request đầu tiên app tự làm (`src/server/ops/release.ts`) nếu tìm được chuỗi kết nối quản trị DB:

- `DATABASE_ADMIN_URL` nếu có;
- không có thì (bản build production) lấy `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `PG_ADMIN_URL` có user khác `lindy_app`. Vibe Host Mắt Bão tự điền các biến này theo `.env.example`.

Các bước:

1. Kiểm user quản trị DB có quyền tạo role (báo lỗi rõ nếu không).
2. Tạo role `app_user`, `app_worker`, `lindy_app` (đăng nhập, mật khẩu = `LINDY_APP_PASSWORD`).
3. Chạy migration còn thiếu (có khoá chống chạy trùng).
4. Tạo dữ liệu nền: tổ chức, cơ sở CS 31/49 HTK, quyền, vai trò, giờ mở cửa 09:00–21:00. **Không** tạo tài khoản mẫu.
5. DB chưa có tài khoản nào → tạo tài khoản Chủ từ `INITIAL_OWNER_*`, bắt đổi mật khẩu lần đầu.

Chuỗi quản trị được rút khỏi `process.env` ngay từ đầu, nên server không bao giờ mở kết nối thường bằng tài khoản quản trị. Xong bước 5, `DATABASE_URL` = cùng máy chủ, user `lindy_app`. Log có tiền tố `[release]`.

## Biến môi trường

| Biến | Giá trị | Bí mật |
|---|---|---|
| `DATABASE_URL` (hoặc `DATABASE_ADMIN_URL`) | Chuỗi kết nối DB quản trị Vibe Host điền sẵn | Có |
| `LINDY_APP_PASSWORD` | Trong `.local/prod-env.txt` (sinh bằng `bun scripts/gen-prod-env.ts`) | Có |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Trong `.local/prod-env.txt`; khác khoá local | Khoá riêng: có |
| `APP_ORIGIN` | Địa chỉ app, ví dụ `https://<tên>.n2.tinhgon.xyz` (không có `/` cuối) | |
| `TRUST_PROXY` | `1` | |
| `NODE_ENV` | `production` (không đặt app vẫn chạy chế độ production) | |
| `VAPID_SUBJECT` | `mailto:` + email liên hệ thật của quán | |
| `INITIAL_OWNER_NAME` | Tên chủ tài khoản đầu tiên, ví dụ `Linh` | |
| `INITIAL_OWNER_PHONE` | SĐT đăng nhập của Linh (hoặc `INITIAL_OWNER_EMAIL`) | |
| `INITIAL_OWNER_PASSWORD` | Mật khẩu tạm ≥ 8 ký tự, không phổ biến; Linh đổi khi đăng nhập lần đầu | Có |

`LINDY_OWNER_PASSWORD`, `TEST_*` chỉ dùng ở local; trên hosting để gì cũng được. `INITIAL_OWNER_*` chỉ dùng một lần khi DB chưa có tài khoản; tạo xong có thể xoá.

## Kiểm tra trạng thái

Mở `https://<địa chỉ app>/api/health`:

- `"ready": true` → đã chuẩn bị DB xong.
- `"dbUrlFrom"` → tên biến app đã lấy chuỗi kết nối quản trị.
- `"missingEnv": [...]` → tên biến còn thiếu hoặc gõ sai tên.
- `"problem": {"code": ...}` → bước bị vướng: `missing_LINDY_APP_PASSWORD`, `bad_admin_url`, `db_host_not_found`, `db_auth_failed`, `cannot_create_role`, `bad_INITIAL_OWNER_PASSWORD`…
- `"hasAccounts": false` → DB chưa có tài khoản nào: đặt `INITIAL_OWNER_*` rồi triển khai lại.

Đổi biến môi trường xong, triển khai lại để app khởi động với biến mới.

## Sau khi lên

1. Linh đăng nhập ở địa chỉ app, đổi mật khẩu.
2. Linh vào **Thêm → Tài khoản** tạo tài khoản cho Nhung, Chin, Trang. Mật khẩu tạm hiện một lần, đưa trực tiếp cho từng người.
3. Mỗi người: Safari → Thêm vào Màn hình chính → mở app ghim → đăng nhập → **Thêm → Thông báo** → bật → Gửi thử (test 21–23).
4. Bật sao lưu tự động cho DB trên hosting.
