# Chạy LINDY OS ở local

Cập nhật 13/10/2026, sau Đợt 0, Đợt 1 và Đợt 2A (đơn hàng). Máy: Windows 11, Node 24, Bun 1.4.

## Chạy hằng ngày

```bash
bun run dev
```

Mở http://localhost:3000. `bun run dev` tự bật PostgreSQL nhúng trước (máy khởi động lại thì DB tắt theo). Tắt DB khi không dùng: `bun run db:stop`.

Đăng nhập báo "Chưa kết nối được dữ liệu" nghĩa là PostgreSQL chưa chạy: chạy `bun run db:start`.

**Tài khoản mẫu (chỉ ở local):** `linh@lindy.test` (Chủ), `nhung@lindy.test` (Quản lý), `chin@lindy.test` (Thợ, quyền lịch mở rộng), `trang@lindy.test` (Thợ). Đặt mật khẩu dev cố định cho cả 4 bằng `bun scripts/dev-passwords.ts`; mật khẩu nằm ở hằng `DEV_PASSWORD` trong file đó. Lệnh này chỉ chạy được trên DB `lindy_dev`.

## Dựng lại từ đầu trên máy mới

1. `bun install`
2. `bun run db:setup` — bật PostgreSQL 16 nhúng (thư mục `.pgdata`, cổng 5433), tạo role, DB `lindy_dev` + `lindy_test`, chạy migration, tạo dữ liệu nền và 4 tài khoản mẫu. Mật khẩu sinh ngẫu nhiên ghi vào `.env` và `.local/` (không commit, không in ra màn hình).
3. `bun scripts/gen-vapid.ts` — khoá VAPID riêng cho Web Push.
4. `bun scripts/gen-icons.ts` và `bun scripts/gen-tokens.ts` — chỉ cần khi đổi biểu tượng hoặc `tokens.json`.
5. (Tuỳ chọn) `bun scripts/demo-data.ts` — 12 lịch demo từ hôm nay (SĐT giả) và 5 đơn demo hôm nay, hôm qua. Chỉ chạy trên DB `lindy_dev`; chạy lại sẽ thêm bản nữa, muốn sạch thì `db:reset` trước.
6. Danh mục dịch vụ ban đầu nạp từ `src/server/ops/catalog-data.ts`. Sửa `data/services.csv` hoặc `data/combos.csv` thì chạy `bun scripts/gen-catalog.ts` để sinh lại (chỉ thêm mã mới vào DB; giá đã có trong DB không bị ghi đè).

**Cổng 3000 đang bận** (một dev server khác đang chạy): chạy `node node_modules/vite/bin/vite.js dev --port 3002 --strictPort` hoặc cấu hình `lindy-dev-3002` trong `.claude/launch.json`.

**Dùng PostgreSQL cài thật thay bản nhúng:** đặt `PG_ADMIN_URL` trong `.env` trỏ tới tài khoản `postgres` của bản cài (anh tự nhập mật khẩu), rồi chạy `bun scripts/db-bootstrap.ts`, `bun run db:migrate`, `bun run db:seed`.

## Kiểm tra

| Lệnh | Việc |
|---|---|
| `bun run check` | Biome + luật cấm `sql.unsafe` + typecheck + toàn bộ test (dựng lại DB `lindy_test` mỗi lần) |
| `bun run test` | Chỉ test |
| `bun run build` rồi `bun scripts/scan-bundle.ts` | Build bản chạy thật; quét bundle trình duyệt không chứa bí mật (S16) |
| `node --env-file=.env .output/server/index.mjs` | Chạy bản build bằng Node (cổng 3000, đổi bằng `PORT`) |
| `bun run db:status` | Migration nào đã chạy |
| `bun run db:reset -- --confirm=lindy_dev` | Xoá sạch DB dev và chạy lại migration (chỉ DB localhost tên `_dev`/`_test`) |

## Thử đơn hàng (Đợt 2A)

1. Đăng nhập `trang@lindy.test` → nút tròn **+** (Tạo đơn) → Thêm dịch vụ → tích chọn (gõ “tdc”, “son gel”, “mat meo”) → Thêm → **Làm xong**. Khách lẻ, thợ mặc định là người tạo.
2. Đăng nhập `nhung@lindy.test` → Đơn hàng → mở đơn Chờ xác nhận → **Xác nhận bill** → ô ghi tiền thu mở sẵn → Lưu.
3. Từ lịch: mở một lịch hôm nay → **Khách đã đến · Tạo đơn** → đơn mở sẵn với tên, SĐT khách; lịch sang Đang làm; xác nhận đơn → lịch Hoàn thành.
4. Thợ chỉ thấy đơn mình tạo hoặc có phần mình (K09); sau Làm xong chỉ Nhung, Linh sửa được (K10).

## Quản trị tài khoản (CLI, chưa có màn hình)

```bash
bun scripts/user.ts list
```

Các lệnh khác: `create --name "Trang" --phone 0912345678 --role staff --branch HTK`, `reset-password --user …`, `grant --user … --role … --branch …`, `revoke --user … --branch …`, `lock --user …`, `unlock --user …`. Mật khẩu tạm ghi vào `.local/mat-khau-tam.txt`; người dùng phải đổi khi đăng nhập lần đầu. Vai trò: `owner`, `manager`, `staff_booking_plus`, `staff`.

## Thử trên iPhone (K01, chưa làm)

Cần HTTPS tin cậy. Phương án đã chốt là mkcert:

1. Cài mkcert (cần quyền admin): `winget install -e --id FiloSottile.mkcert`, rồi `mkcert -install`.
2. Tạo chứng chỉ cho IP máy trong mạng nhà; file `rootCA-key.pem` để ngoài thư mục dự án.
3. Cài `rootCA.pem` lên **iPhone dùng để thử** (Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị → cài profile; rồi Giới thiệu → Cài đặt tin cậy chứng nhận → bật).
4. Chạy dev server có HTTPS, mở bằng Safari, Thêm vào Màn hình chính, đăng nhập lại trong app ghim, bật thông báo, bấm Gửi thử.
5. Thử xong gỡ profile khỏi iPhone.

Các bước 2 và 4 cần cấu hình HTTPS cho dev server; làm cùng anh khi thử.
