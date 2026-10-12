# Nền tảng kỹ thuật LINDY OS — ĐÃ CHỐT

**Đã chốt ngày 12/10/2026 (T01 trong `DECISIONS.md`):** phương án A, kiến trúc như CEN WORK. Chạy thật trên **Vibe Hosting của Mắt Bão**; tên miền mua sau. **Làm và chạy local trước**, xong mới đồng bộ lên GitHub. Code đặt tại `E:\AI - Vibecode\Lindy`.

## Phiên bản đã ghim (13/10/2026, Đợt 0–1)

Ghim chính xác trong `package.json` + `bun.lock`; không tự nâng.

| Gói | Phiên bản | Ghi chú |
|---|---|---|
| `@tanstack/react-start` | 1.168.61 | SSR, server route `/api/*` |
| `@tanstack/react-router` | 1.170.42 | |
| `@tanstack/react-query` | 5.104.2 | |
| `react`, `react-dom` | 19.3.0 | |
| `vite` | 8.3.4 | |
| `nitro` | 3.0.260903-beta | **beta**; preset node-server |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | |
| `postgres` (postgres.js) | 3.4.9 | SQL thuần, tagged template |
| `web-push` | 3.6.7 | |
| `zod` | 4.6.7 | |
| `typescript` | 7.0.2 | |
| `vitest` | 5.0.4 | |
| `@biomejs/biome` | 2.5.15 | lint + format |
| `embedded-postgres` | 16.14.0-beta.17 | PostgreSQL 16.14 nhúng cho local khi máy chưa cài PostgreSQL |

Bun 1.4 cài gói và chạy script; server chạy bằng Node 24.

Phần dưới giữ nguyên bản đề xuất để tra lý do chọn.

## Yêu cầu bắt buộc từ đặc tả

- PWA chạy tốt trên **Safari iPhone**, ghim ra màn hình chính; cần **HTTPS**.
- **Web Push** ngay P1, có hàng đợi gửi nền, gửi lại khi lỗi, hướng dẫn bật thông báo trên iPhone.
- **Cập nhật gần như tức thời** cho lịch hẹn giữa nhiều máy.
- **PostgreSQL** với giao dịch chặt cho tiền; phân quyền kiểm tra ở server và database; audit log chỉ thêm.
- Chi phí thấp, một cơ sở, khoảng 4–10 người dùng; anh tự vận hành cùng AI.

## Phương án A — dùng lại kiến trúc anh đang chạy cho CEN WORK (khuyến nghị)

| Thành phần | Lựa chọn |
|---|---|
| Ứng dụng | TanStack Start (React 19, SSR) + TanStack Router + TanStack Query; Vite; Tailwind v4 |
| Server | Nitro Node server, đóng gói Docker |
| Database | PostgreSQL 16 riêng cho LINDY |
| Đăng nhập | Phiên cookie HttpOnly tự viết, mật khẩu băm |
| Phân quyền | Transaction đặt `ROLE` và `user_id` để RLS áp dụng thật, như `withUser` của CEN WORK |
| Migration | Runner chạy file SQL đánh số, lưu checksum |
| Web Push | Thư viện `web-push`, hàng đợi outbox + tiến trình gửi nền, như CEN WORK |
| Cập nhật tức thời | **Phần mới phải làm**: SSE + PostgreSQL `LISTEN/NOTIFY`, tự tải lại khi mất kết nối; tạm thời có thể làm mới mỗi 15–30 giây |
| Hosting | Một VPS hoặc hosting riêng có Docker và HTTPS (có thể cùng nhà cung cấp Mắt Bão), tên miền hoặc tên miền phụ riêng |

**Ưu điểm**
- Anh đã quen quy trình: code → push → tự deploy; Claude Code đã làm việc với đúng các mẫu này.
- CEN WORK đã có sẵn cách làm Web Push trên iPhone (hàng đợi outbox, tiến trình gửi, màn hướng dẫn bật thông báo), đúng thứ lịch đặt cần.
- Không phụ thuộc nhà cung cấp; dữ liệu nằm ở server anh kiểm soát.

**Nhược điểm**
- Phải tự làm phần cập nhật tức thời và tự lo sao lưu database.
- Một server: nếu server dừng thì app dừng.

**Lưu ý bắt buộc**
- **Repo riêng, database riêng, tên miền riêng, khoá VAPID riêng.** Không dùng chung bất cứ thứ gì với CEN WORK ở môi trường chạy thật.
- CEN WORK là hệ thống của Tự Do. Nếu muốn **sao chép code** từ CEN WORK sang LINDY, anh cân nhắc quyền sở hữu mã nguồn trước; an toàn nhất là dùng lại **cách làm**, viết lại code cho LINDY.

## Phương án B — Supabase cloud

| Thành phần | Lựa chọn |
|---|---|
| Ứng dụng | React + Vite (PWA), host tĩnh trên Vercel hoặc Netlify |
| Backend | Supabase: PostgreSQL, Auth, Realtime, Storage, Edge Functions |
| Web Push | Edge Function + bảng outbox + lịch chạy định kỳ |

**Ưu điểm:** có sẵn đăng nhập và cập nhật tức thời; ra bản chạy thử nhanh nhất.  
**Nhược điểm:** anh vừa phải chuyển CEN WORK ra khỏi Supabase; phụ thuộc nhà cung cấp; gói miễn phí tạm dừng project khi lâu không dùng; dữ liệu đặt ở nước ngoài; cách làm khác hẳn CEN WORK nên không tận dụng được kinh nghiệm.

## Phương án C — Lovable

Lovable sinh code chạy trên Supabase (giống B) và khó kiểm soát chặt phân quyền, giao dịch tiền. **Không khuyến nghị** cho app có tiền và lương.

## Đề xuất

**Chọn phương án A.** Lý do chính: anh đang vận hành đúng kiến trúc này, Web Push trên iPhone đã có cách làm thực tế, và không phải chuyển hạ tầng lần hai như CEN WORK.

## Cần anh quyết định

1. Chọn A hay B.
2. Hosting: VPS nào, ai giữ quyền quản trị, ai lo sao lưu database.
3. Tên miền cho app (bắt buộc HTTPS để có PWA và Web Push).
4. Nơi để code: repo GitHub riêng cho LINDY (đề xuất), đặt tại `E:\AI - Vibecode\Lindy\app` hoặc một repo tách hẳn.
