# LINDY OS

App quản lý nội bộ cho **Lindy Nailash Studio** (cơ sở 31/49 Huỳnh Thúc Kháng, Hà Nội; Instagram @lindy.nailashstudio): lịch đặt khách, đơn hàng, chia doanh thu thợ, thu chi, chấm công, lương, khách hàng. Web mobile-first/PWA, dùng trên iPhone.

**Trạng thái (13/10/2026):** Đợt 0 (nền móng) và Đợt 1 (lịch đặt, trừ cọc và tạo đơn) **chạy được ở local**; test tự động đạt. Chưa thử trên iPhone, chưa lên GitHub, chưa lên Mắt Bão. Cách chạy: `docs/CHAY_LOCAL.md`. Kế hoạch và kết quả: `docs/plans/2026-10-12-dot-0-dot-1.md`.

## Bắt đầu phiên làm việc với Claude Code

1. Mở VS Code tại thư mục `E:\AI - Vibecode\Lindy` (File → Open Folder), rồi mở Claude Code trong cửa sổ đó. Như vậy Claude Code đọc `CLAUDE.md` của LINDY, không lẫn với dự án khác.
2. Chuẩn bị máy: Node 24 và Bun 1.4 đã có; cần cài **PostgreSQL 16**; nên cài **Git for Windows** (xem `docs/OPEN_QUESTIONS.md` mục 1).
3. Câu mở đầu gợi ý cho Claude Code:

   > Đọc README.md, CLAUDE.md, docs/TECH_STACK.md, docs/prd/LINDY_OS_PRD_v1_2.md và docs/modules/LICH_DAT_KHACH_v1_2.md. Lên kế hoạch Đợt 0 (nền móng) và Đợt 1 (lịch đặt) để chạy được ở local trên máy này, theo kiến trúc đã chốt. Báo kế hoạch trước, chưa code.

## Đọc theo thứ tự

1. `docs/prd/LINDY_OS_PRD_v1_2.md` — đặc tả đầy đủ, đã gộp mọi quyết định đến 12/10/2026.
2. `docs/modules/LICH_DAT_KHACH_v1_2.md` — module lịch đặt khách, làm đầu tiên. Thắng PRD trong phạm vi lịch hẹn.
3. `docs/DECISIONS.md` — nguồn gốc từng quyết định; quyết định mới ghi tiếp ở đây và thắng mọi tài liệu khác.
4. `docs/TECH_STACK.md` — đề xuất nền tảng, chờ chốt.
5. `docs/OPEN_QUESTIONS.md` — việc còn chờ.
6. `docs/MCP.md` — kết nối Claude, ChatGPT với LINDY OS (MCP).
6. `design/README.md` — bộ giao diện.
7. `data/` — bảng giá, combo, nhân sự để nhập vào app.

## Bản đồ thư mục

```text
Lindy/
├── README.md                     ← file này
├── CLAUDE.md                     ← quy tắc cho AI lập trình
├── docs/
│   ├── DECISIONS.md              ← D17, A01–A05, B01–B15, C01–C16, P01–P03
│   ├── OPEN_QUESTIONS.md         ← việc còn chờ
│   ├── TECH_STACK.md             ← đề xuất nền tảng kỹ thuật
│   ├── prd/                      ← v1.0, v1.1 (lịch sử), v1.2 (hiện hành)
│   ├── modules/                  ← lịch đặt khách v1.1 (lịch sử), v1.2 (hiện hành)
│   └── surveys/                  ← câu trả lời gốc 3 phiếu hỏi chủ
├── data/
│   ├── bang-gia-dich-vu.md       ← bảng giá, combo, bảo hành, cách chọn dịch vụ
│   ├── services.csv              ← 28 dịch vụ
│   ├── combos.csv                ← 4 combo
│   └── staff.csv                 ← nhân sự, lương, hoa hồng, hạn mức ứng, quyền lịch
├── design/                       ← bộ giao diện (token, thành phần, biểu tượng app)
└── assets/bang-gia/              ← ảnh menu gốc
```

## Liên kết

| Tài liệu | Link |
|---|---|
| Bộ giao diện LINDY OS | https://claude.ai/artifact/AVWhQDVKgZyiq6ig5VgpP3 |
| Phiếu 1 — Chốt thông tin vận hành | https://claude.ai/artifact/Jax6jt5Nb32j6SWwUuwJ3d |
| Phiếu 2 — Phong cách giao diện | https://claude.ai/artifact/6mBHHzBJJ67KYB9GxZVe5K |
| Phiếu 3 — Lịch đặt khách | https://claude.ai/artifact/2fVeeFX2NL8qsEKsEcJe6v |

Các link chỉ chủ tài khoản mở được, trừ khi đã chia sẻ qua menu Share.

## Việc tiếp theo

1. Cài PostgreSQL 16 (và Git for Windows) rồi mở phiên Claude Code tại thư mục này.
2. Đợt 0: nền móng chạy local (đăng nhập, quyền, khung giao diện, PWA, Web Push).
3. Đợt 1: module lịch đặt → chạy thử với Linh, Nhung, Chin → chuyển hẳn khỏi Apple Calendar.
4. Đợt 2: đơn hàng. Đợt 3: sổ tiền và **tiền cọc Tết (xong trước 19 tháng Chạp, khoảng cuối tháng 1/2027)**. Đợt 4: công và lương.
