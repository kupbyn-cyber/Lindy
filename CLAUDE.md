# CLAUDE.md — LINDY OS

Hướng dẫn cho AI lập trình khi làm việc trong thư mục này. Trao đổi với người dùng bằng tiếng Việt.

## Dự án

App quản lý nội bộ cho Lindy Nailash Studio. Web mobile-first/PWA, ưu tiên Safari trên iPhone (toàn bộ nhân sự dùng iPhone). Giao diện tiếng Việt.

**Nền tảng đã chốt (T01, `docs/TECH_STACK.md`):** kiến trúc như CEN WORK — TanStack Start (React 19, SSR), TanStack Router/Query, Vite, Tailwind v4, Nitro, PostgreSQL 16, phiên cookie tự viết, RLS qua transaction đặt role, migration runner SQL, Web Push qua outbox. Code nằm ngay tại thư mục này. **Chạy local trước**; đồng bộ GitHub và triển khai lên Vibe Host Mắt Bão (T03, thay Nhân Hòa ở T02) chỉ khi người dùng yêu cầu. Hướng dẫn: `docs/TRIEN_KHAI.md`.

Đợt 0, Đợt 1, Đợt 2 (đơn hàng) và Đợt 3 (sổ tiền, cọc Tết, thu chi, chốt quỹ, tip, hoàn tiền, chứng từ, dòng tiền; kế hoạch `docs/plans/2026-10-13-dot-3-so-tien-coc.md`) đã có code (13/10/2026). Đợt 4 (nhân viên, chấm công, lương, tạm ứng; kế hoạch `docs/plans/2026-10-13-dot-4-cong-luong.md`) đã có code. Đợt 5 (lợi nhuận, báo cáo đã chốt, xuất CSV/XLSX/PDF, sao lưu, nhập dữ liệu cũ có ghép cột; kế hoạch `docs/plans/2026-10-13-dot-5-hoan-thien.md`) đã có code. Đợt 6 (gói chỉnh sửa S01–S17 sau Phiếu 4: xoá tài khoản, bỏ bước chốt lịch, lịch nhiều khách ra nhiều đơn, màn lịch zoom/vuốt, trang chủ mới, dữ liệu dùng thử; kế hoạch `docs/plans/2026-10-14-goi-chinh-sua.md`) đã có code (15/10/2026). Hết lộ trình PRD §17; còn việc vận hành (triển khai, thử trên iPhone, nhập file Sheets thật). Cách chạy, kiểm tra: `docs/CHAY_LOCAL.md`. Đợt mới: báo kế hoạch trước, chưa code khi chưa được duyệt.

## Nguồn yêu cầu, theo thứ tự ưu tiên

1. Yêu cầu mới nhất của người dùng trong cuộc trò chuyện.
2. `docs/DECISIONS.md` (mục mới nhất thắng).
3. `docs/modules/LICH_DAT_KHACH_v1_2.md`, chỉ trong phạm vi lịch hẹn.
4. `docs/prd/LINDY_OS_PRD_v1_2.md`.
5. Bản cũ (`*_v1_0`, `*_v1_1`): chỉ tra lịch sử, không dùng làm yêu cầu.

Nền tảng kỹ thuật: theo `docs/TECH_STACK.md` khi đã ghi “đã chốt”.

Giao diện theo `design/design-system/README.md` và `tokens.json`. Dữ liệu mẫu và danh mục thật ở `data/`.

## Quy tắc không được tự thay đổi

- Các quyết định D01–D17, Q01–Q44, G01–G26, A01–A05, B01–B15, C01–C16, T01–T04, K01–K25, S01–S17 đã chốt, không hỏi lại, không tự sửa.
- **Không tự đoán tham số còn thiếu** (giờ ca, thời lượng dịch vụ, sức chứa, giá còn trống, hạn mức chưa có). Xem `docs/OPEN_QUESTIONS.md`; thiếu thì hỏi.
- Tiền lưu bằng **số nguyên VND**. Hiển thị `8.450.000đ`. Múi giờ `Asia/Ho_Chi_Minh`.
- Chỉ đơn **Đã xác nhận** mới vào doanh thu, hoa hồng, KPI; doanh thu ghi theo ngày làm dịch vụ.
- Lịch hẹn **không phân thợ** và không sinh doanh thu.
- Phân quyền kiểm tra ở server và database, không chỉ ẩn nút.
- Không xoá vĩnh viễn dữ liệu nghiệp vụ; sửa và huỷ có lý do, có lịch sử.
- CRM bản đầu chỉ có tên, SĐT (không bắt buộc), lịch sử đơn. Không thêm ngày sinh, ảnh, VIP.
- Không thêm tính năng ngoài yêu cầu.

## Cách làm việc

1. Đọc tài liệu liên quan trước khi sửa.
2. Báo ngắn trước khi làm: hiểu yêu cầu thế nào, file sẽ đổi, có đổi dữ liệu không, rủi ro.
3. Làm phạm vi nhỏ nhất, kiểm tra được độc lập.
4. Chạy kiểm tra (lint, typecheck, test, build) trước khi báo xong; báo đúng kết quả, kể cả phần chưa kiểm tra được.
5. Khi có quyết định mới từ chủ: ghi vào `docs/DECISIONS.md`, xoá câu tương ứng khỏi `docs/OPEN_QUESTIONS.md`.
