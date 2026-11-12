# Phản biện: Hiện dịch vụ trên ô lịch

- Ngày: 12/11/2026
- Số vòng: 2
- Kết quả: 17 lỗi (vòng 1: 7, vòng 2: 10) — tự sửa 17 · anh quyết 0 · bác bỏ 0
- Kết luận của agent: plan dùng được sau khi sửa, bắt buộc sửa L1 (thiếu grant EXECUTE làm hỏng cả lưu giờ mở cửa đang chạy) và L2/L3 (phải dựng DB test có sẵn trên workspace để các tiêu chí kiểm được).

## Vòng 1
| # | Mức | Loại | Gói | Vấn đề | Xử lý |
|---|------|------|-----|--------|-------|
| L1 | Nghiêm trọng | Thiếu bước | 1 | CHECK gọi `app.valid_service_chips` nhưng không `grant execute` cho `app_user` (0008 đã thu EXECUTE mặc định) → mọi UPDATE `branch_booking_settings` lỗi 42501, hỏng cả lưu giờ mở cửa | Tự sửa: thêm `grant execute` vào migration 0037; thêm ca test Chủ vẫn lưu giờ mở cửa sau migration; ghi vào Rủi ro |
| L2 | Vừa | Thiếu bước | 1–5 | Plan để test DB là tuỳ chọn; workspace có Postgres 16 Linux (`/usr/lib/postgresql/16/bin`), tiêu chí Gói 1–4 cần DB và đăng nhập | Tự sửa: thêm Gói 1 bước 0 dựng DB theo `docs/CHAY_LOCAL.md` (`PG_ADMIN_URL` + bootstrap/migrate/seed), không dựng được thì dừng hỏi anh; `bun run test` bắt buộc ở Gói 1 và 5; tiêu chí Gói 2–4 ghi rõ chạy `bun run dev` trên DB đó |
| L3 | Vừa | Tiêu chí mơ hồ | 3 | Ghi unit test "không cần DB" là sai: `vitest.config.ts` luôn chạy `globalSetup` đòi `TEST_DATABASE_URL` | Tự sửa: tiêu chí ghi cần DB test của Gói 1; hiện trạng đầu plan nêu rõ |
| L4 | Vừa | Rủi ro | 1, 4 | `updateServiceChips` trả `loadSettings` (không có `depositSeason`) rồi `setQueryData` → form lịch mất phần cọc tới 5 phút | Tự sửa: `updateServiceChips` trả `getSettings(auth, branch.id)` |
| L5 | Nhỏ | Tiêu chí mơ hồ | 1 | Test "thợ update trực tiếp bị chặn": policy USING chỉ ra 0 dòng, không ném lỗi | Tự sửa: kiểm `count === 0` và owner đọc lại không đổi |
| L6 | Nhỏ | Thiếu bước | 3 | Nút "Thêm dịch vụ, ghi chú" và chú thích dòng 81 sai sau khi đưa ô Dịch vụ ra ngoài | Tự sửa: đổi nhãn thành "Thêm ghi chú", sửa chú thích |
| L7 | Nhỏ | Rủi ro | 4 | `useEffect([s.data])` ở `cai-dat-lich.tsx:29-34` nạp lại ô giờ khi cache đổi → lưu chip xoá giờ đang sửa dở (và ngược lại) | Tự sửa: chip và ô giờ chỉ nạp lại khi không có sửa dở (cờ `dirty`) |

Ghi chú thêm của agent: số migration 0037 có thể trùng với tính năng song song `doi-huy-nghi-da-duyet` — đã thêm vào Rủi ro của plan.

## Vòng 2
Chạy vì vòng 1 có lỗi Nghiêm trọng (agent mới, độc lập). Kết luận của agent: plan dùng được sau khi sửa; nên sửa L1, L2, L3 trước khi build.

| # | Mức | Loại | Gói | Vấn đề | Xử lý |
|---|------|------|-----|--------|-------|
| L1 | Vừa | Thiếu bước | 1 | Bước 0 vấp: workspace chạy root (`initdb` từ chối), đã có cụm `16/main` tắt, chưa nói đặt mật khẩu `postgres`; dùng `.pgdata` làm `db-local.ts ensure` gọi `pg_ctl.exe` | Tự sửa: dùng `pg_ctlcluster 16 main start`, đặt mật khẩu bằng `runuser -u postgres`, `PG_ADMIN_URL` host `localhost`, cấm `.pgdata`, ghi lệnh bật lại DB |
| L2 | Vừa | Rủi ro | 1 | Gọi `getSettings` bên trong callback `withUser` đọc chip cũ chưa commit | Tự sửa: gọi `getSettings` sau khi `withUser` xong; test giá trị trả về có chip mới và `depositSeason` |
| L3 | Vừa | Rủi ro | 1, 3, 4 | Chip có dấu `+` không bật/tắt được vì chuỗi tách theo `+` | Tự sửa: cấm `+` ở zod, hàm DB, trang sửa chip; thêm ca test |
| L4 | Nhỏ | Thiếu bước | 4 | Gợi ý mục Cài đặt lịch ở `them/index.tsx:182` chưa nhắc chip dịch vụ | Tự sửa: Gói 4 đổi gợi ý |
| L5 | Nhỏ | Thiếu bước | 1 | Mã cơ sở test trùng (`branches.code` unique, CS3–CS11 đã dùng) | Tự sửa: dùng `'CS12'` |
| L6 | Nhỏ | Thiếu bước | 2–4 | Tài khoản seed phải đổi mật khẩu, seed không có lịch; Gói 2 thực ra cần DB | Tự sửa: bước 0 chạy `dev-passwords.ts`, `demo-data.ts`; Gói 2 phụ thuộc "1 (bước 0)" |
| L7 | Nhỏ | Tiêu chí mơ hồ | 3 | Ca unit test "gọn chuỗi" không nói chạm chip nào | Tự sửa: ghi rõ từng ca `toggleServiceChip(text, chip)` → kết quả |
| L8 | Nhỏ | Tiêu chí mơ hồ | 3, 5 | Brief ghi "Tay + Chân · Gel" nhưng cách nối là " + " | Tự sửa: Đối chiếu brief và Gói 5 ghi chuỗi mong đợi `Tay + Chân + Gel` |
| L9 | Nhỏ | Sai file/pattern | 3 | Hàng chip chưa chỉ pattern có sẵn | Tự sửa: dùng `lo-chips` + `lo-toggle`/`is-on` như hàng Thời lượng, cuộn ngang |
| L10 | Nhỏ | Vượt phạm vi | 1 | `serviceChips` trong `loadSettings` lộ thêm qua MCP list lịch (chỉ đọc) | Tự sửa: giữ trong `loadSettings`, ghi rõ vào Giả định |

## Còn mở
Không
