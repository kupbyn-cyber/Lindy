# Triển khai LINDY OS lên Vibe Host Mắt Bão (T03)

Cập nhật 13/10/2026: dựng bằng `Dockerfile` riêng theo cách của CEN WORK (trước đó để Vibe Host tự dựng bằng Nixpacks, ảnh 1,2 GB vượt hạn mức 1 GB của gói). Bài học: `docs/BAI_HOC_TRIEN_KHAI.md`.

## Thông tin hosting

| Mục | Giá trị |
|---|---|
| Bảng quản lý | https://v2.tinhgon.xyz (mục **Triển khai website**) |
| Địa chỉ app | **https://lindy.n2.tinhgon.xyz** (SSL tự cấp) |
| Mã nguồn | GitHub `kupbyn-cyber/Lindy` (riêng tư), nhánh `main`. Chưa bật tự triển khai: push xong phải bấm **Triển khai lại** |
| Gói | Vibe Host Starter: **2 dịch vụ tính cả website** (website Lindy + 1 DB là hết), **1 GB lưu trữ tính chung** ảnh website, DB và bản sao lưu; website 0,3 nhân, 512 MB RAM |
| Database | PostgreSQL 16 `linhdy-db`, chỉ có địa chỉ nội bộ, gắn vào website ở trang DB → Website sử dụng; Vibe Host tự điền `DATABASE_URL`. Tạo lại website thì phải gắn lại (không còn chỗ để Vibe Host tự tạo DB) |

## Ảnh Docker (`Dockerfile`)

- **Tầng dựng** `oven/bun:1.4.2` (cùng bản Bun với máy local): `bun install --frozen-lockfile` → `bun run build` → đóng gói `scripts/release.ts` thành `release.mjs`.
- **Tầng chạy** `node:24-slim`: chỉ có `.output` (Nitro tự chứa thư viện lúc chạy), `db/migrations`, `release.mjs`, `package.json`. Ảnh khoảng 250 MB.
- `vite.config.ts` cố định `preset: 'node-server'`. Thiếu dòng này thì dựng bằng Bun ra bản chạy cho Bun, chạy bằng Node sẽ sập ngay ("Bun is not defined").
- Khởi động: `node release.mjs && node .output/server/index.mjs`, cổng 3000.

## Khi container khởi động

`release.mjs` chuẩn bị DB **trước** khi bật server (như entrypoint của CEN WORK). Lỗi thì thoát mã 1: container không lên, Vibe Host giữ bản đang chạy, dòng `[release] Lỗi …` hiện trong nhật ký triển khai.

Chuỗi kết nối quản trị: `DATABASE_ADMIN_URL` nếu có; không thì `DATABASE_URL` (hoặc `MIGRATE_DATABASE_URL`, `PG_ADMIN_URL`) có user khác `lindy_app`.

1. Kiểm user quản trị DB có quyền tạo role (báo lỗi rõ nếu không).
2. Tạo role `app_user`, `app_worker`, `lindy_app` (đăng nhập, mật khẩu = `LINDY_APP_PASSWORD`).
3. Chạy migration còn thiếu (có khoá chống chạy trùng).
4. Dữ liệu nền: tổ chức, cơ sở CS 31/49 HTK, quyền, vai trò, giờ mở cửa 09:00–21:00, danh mục dịch vụ. **Không** tạo tài khoản mẫu.
5. DB chưa có tài khoản nào → tạo tài khoản Chủ từ `INITIAL_OWNER_*`, bắt đổi mật khẩu lần đầu.

Server lặp lại bước này ở request đầu (không còn gì để làm nên nhanh), rồi chỉ kết nối bằng `lindy_app`; chuỗi quản trị được rút khỏi `process.env` ngay từ đầu.

## Biến môi trường

Mẫu: `.env.example` (Vibe Host đọc file này khi tạo website).

| Biến | Giá trị | Bí mật |
|---|---|---|
| `DATABASE_URL` | Vibe Host tự điền khi gắn DB | Có |
| `LINDY_APP_PASSWORD` | Trong `.local/prod-env.txt` (sinh bằng `bun scripts/gen-prod-env.ts`) | Có |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Trong `.local/prod-env.txt`; khác khoá local | Khoá riêng: có |
| `VAPID_SUBJECT` | `mailto:` + email liên hệ thật của quán | |
| `APP_ORIGIN` | `https://lindy.n2.tinhgon.xyz` (không có `/` cuối) | |
| `TRUST_PROXY` | `1` (lấy IP người dùng ở cuối `X-Forwarded-For`, do proxy Vibe Host thêm) | |
| `INITIAL_OWNER_NAME`, `INITIAL_OWNER_PHONE` | `Linh` và SĐT đăng nhập của Linh | |
| `INITIAL_OWNER_PASSWORD` | Mật khẩu tạm ≥ 8 ký tự; Linh đổi khi đăng nhập lần đầu | Có |

- `INITIAL_OWNER_*` chỉ dùng khi DB chưa có tài khoản; tạo xong có thể xoá.
- Vibe Host báo `DEV`, `PROD`, `PASSWORD_HASH_N` "chưa khai báo": bỏ qua, **không đặt** (`PASSWORD_HASH_N` chỉ để test hạ độ khó băm mật khẩu).
- Đổi biến xong phải **Triển khai lại**.

## Kiểm tra trạng thái

Nhật ký triển khai: dòng `[release]` cho biết bước chuẩn bị DB. Sau khi lên, mở `https://lindy.n2.tinhgon.xyz/api/health`:

- `"ready": true` → đã chuẩn bị DB xong.
- `"missingEnv": [...]` → tên biến còn thiếu hoặc gõ sai tên.
- `"badEnv": [...]` → biến sai dạng (khoá VAPID dán thiếu ký tự, `APP_ORIGIN` có `/` cuối, `VAPID_SUBJECT` không phải `mailto:`…).
- `"problem": {"code": ...}` → bước bị vướng: `missing_DATABASE_ADMIN_URL` (chưa gắn DB), `db_unreachable`, `db_auth_failed`, `cannot_create_role`…
- `"hasAccounts": false` → DB chưa có tài khoản nào: đặt `INITIAL_OWNER_*` rồi triển khai lại.

## Cập nhật bản mới

1. Sao lưu DB nếu bản mới có migration (mục **Sao lưu**).
2. Push lên `main` → **Triển khai lại**.
3. Xem nhật ký có `[release] Xong` và `/api/health` → `ready: true`.

## Sau khi lên lần đầu

1. Linh đăng nhập, đổi mật khẩu.
2. Linh vào **Thêm → Tài khoản** tạo tài khoản cho Nhung, Chin, Trang. Mật khẩu tạm hiện một lần, đưa trực tiếp cho từng người.
3. Mỗi người: Safari → Thêm vào Màn hình chính → mở app ghim → đăng nhập → **Thêm → Thông báo** → bật → Gửi thử (test 21–23).
4. Bật sao lưu tự động, giữ ít bản (bản sao lưu tính vào 1 GB). Xem trang **Dung lượng** mỗi tháng: ảnh chứng từ lưu trong DB nên DB lớn dần.
