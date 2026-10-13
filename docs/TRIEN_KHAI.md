# Triển khai LINDY OS lên Vibe Hosting Nhân Hòa (T02)

Cập nhật 13/10/2026.

## Thông tin hosting

| Mục | Giá trị |
|---|---|
| Bảng quản lý | https://vibe.nhanhoa.com (project **Lindy**) |
| Địa chỉ app | https://lindy.vibe.vnws.com (HTTPS Let's Encrypt tự cấp) |
| Mã nguồn | GitHub `kupbyn-cyber/Lindy` (riêng tư), nhánh `main`; đẩy code lên là tự deploy |
| Build | Railpack: `vite build`; chạy `npm start` = `node .output/server/index.mjs` |
| Container Port của domain | **3000** (mặc định 80 sẽ báo Bad Gateway) |
| Database | Vibe Hosting PostgreSQL `lindy_db`, chỉ có địa chỉ nội bộ |

## Khi app khởi động

Có biến `DATABASE_ADMIN_URL` thì ở request đầu tiên app tự làm (`src/server/ops/release.ts`):

1. Kiểm user quản trị DB có quyền tạo role (báo lỗi rõ nếu không).
2. Tạo role `app_user`, `app_worker`, `lindy_app` (đăng nhập, mật khẩu = `LINDY_APP_PASSWORD`).
3. Chạy migration còn thiếu (có khoá chống chạy trùng).
4. Tạo dữ liệu nền: tổ chức, cơ sở CS 31/49 HTK, quyền, vai trò, giờ mở cửa 09:00–21:00. **Không** tạo tài khoản mẫu.
5. DB chưa có tài khoản nào → tạo tài khoản Chủ từ `INITIAL_OWNER_*`, bắt đổi mật khẩu lần đầu.

Sau đó server chạy bằng role `lindy_app` và xoá `DATABASE_ADMIN_URL`, `INITIAL_OWNER_PASSWORD` khỏi bộ nhớ tiến trình. Log có tiền tố `[release]`.

## Biến môi trường (tab Environment)

| Biến | Giá trị | Bí mật |
|---|---|---|
| `NODE_ENV` | `production` | |
| `APP_ORIGIN` | `https://lindy.vibe.vnws.com` | |
| `TRUST_PROXY` | `1` | |
| `DATABASE_ADMIN_URL` | Ô **Internal Connection URL** ở trang database `lindy_db` | Có |
| `LINDY_APP_PASSWORD` | Trong `.local/prod-env.txt` (sinh bằng `bun scripts/gen-prod-env.ts`) | Có |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Trong `.local/prod-env.txt`; khác khoá local | Khoá riêng: có |
| `VAPID_SUBJECT` | `mailto:` + email liên hệ thật của quán | |
| `INITIAL_OWNER_NAME` | Tên chủ tài khoản đầu tiên, ví dụ `Linh` | |
| `INITIAL_OWNER_PHONE` | SĐT đăng nhập của Linh (hoặc `INITIAL_OWNER_EMAIL`) | |
| `INITIAL_OWNER_PASSWORD` | Mật khẩu tạm ≥ 8 ký tự, không phổ biến; Linh đổi khi đăng nhập lần đầu | Có |

`INITIAL_OWNER_*` chỉ dùng một lần khi DB chưa có tài khoản; tạo xong có thể xoá khỏi Environment.

## Sau khi lên

1. Linh đăng nhập ở https://lindy.vibe.vnws.com, đổi mật khẩu.
2. Linh vào **Thêm → Tài khoản** tạo tài khoản cho Nhung, Chin, Trang. Mật khẩu tạm hiện một lần, đưa trực tiếp cho từng người.
3. Mỗi người: Safari → Thêm vào Màn hình chính → mở app ghim → đăng nhập → **Thêm → Thông báo** → bật → Gửi thử (test 21–23).
4. Bật sao lưu tự động cho `lindy_db` trên hosting.
