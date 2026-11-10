# Phản biện: MCP cho LINDY OS

- Ngày: 10/11/2026
- Số vòng: 2
- Kết quả: 23 lỗi — tự sửa 21 · anh quyết 2 (cùng một câu về scope ghi; em tạm chọn khi anh ngủ, anh xác nhận 10/11) · bác bỏ 0
- Kết luận của agent: vòng 1 "dùng được sau khi sửa; cần xử lý L1, L3 và anh chốt L2"; vòng 2 "dùng được sau khi sửa"

## Vòng 1
| # | Mức | Loại | Gói | Vấn đề | Xử lý |
|---|------|------|-----|--------|-------|
| L1 | Nghiêm trọng | Rủi ro | 3 | `applySecurityHeaders` ghi đè CSP mọi response bằng CSP có `form-action 'self'` → Chrome chặn chuyển hướng về claude.ai/chatgpt.com sau khi bấm Cho phép; chỉ lộ ở bản build | Tự sửa: gói 3 bước 5 không ghi đè CSP ở `/oauth/*` khi trang đã có CSP riêng (không `form-action`), có test unit + kiểm bằng `curl` trên bản build |
| L2 | Vừa | Rủi ro | 2, 3, 4, 7 | Xin thêm `lindy:write` qua challenge chỉ chạy được khi ngắt/kết nối lại; CEN đã đổi sang cấp hết ngay lần đầu | Anh quyết (em tạm chọn khi anh ngủ): cấp `lindy:read lindy:write offline_access` ngay lần kết nối đầu như CEN, màn Cho phép có cảnh báo ghi; brief sửa giả định, ghi "chờ anh xác nhận" |
| L3 | Vừa | Gãy build | 3, 4 | Route mới cần `routeTree.gen.ts` sinh lại (chỉ Vite làm) thì typecheck mới qua | Tự sửa: gói 3, 4 chạy `bun run build` trước `bun run check`, commit `routeTree.gen.ts` |
| L4 | Vừa | Sai file/pattern | 6 | `monthProfit` nhận `tx` + doanh thu tính sẵn, không kiểm `profit.read`, lệch tháng đã chốt | Tự sửa: `lindy_month_profit` lấy `monthReport(...).profit` (kèm `closed`) |
| L5 | Vừa | Thiếu bước | 9 | Thiếu `check-upgrade` và sao lưu DB trước khi triển khai | Tự sửa: thêm vào gói 9 bước 1, 3 |
| L6 | Nhỏ | Thiếu bước | 7 | Chưa ghi `createRequestId` = id intent cho tạo lịch | Tự sửa |
| L7 | Nhỏ | Rủi ro | 8 | `decideDay` không có `version` → ghi đè khi đã đổi trong app | Tự sửa: preview lưu trạng thái ngày, execute đọc lại, khác thì dừng |
| L8 | Nhỏ | Thiếu bước | 7 | Chưa quy định execute lần hai khi intent đang `executing` < 2 phút | Tự sửa: trả "đang thực hiện, thử lại sau", không gọi service, có test |
| L9 | Nhỏ | Rủi ro | 1, 3, 4 | MCP bỏ qua chặn "phải đổi mật khẩu" của web | Tự sửa: `authForUser`/`verifyAccessToken` từ chối, màn Cho phép báo đổi mật khẩu trước |
| L10 | Nhỏ | Tiêu chí mơ hồ | 8 | Đếm 21 tool đọc, thực tế 20 | Tự sửa: tiêu chí đúng 39 tool, liệt kê theo gói |
| L11 | Nhỏ | Thiếu bước | 2, 3 | Rate limit trong bộ nhớ làm test 429 chập chờn | Tự sửa: `resetMcpRateLimits()` gọi trong `beforeEach` |
| L12 | Nhỏ | Rủi ro | 9 | Lịch thử trên dữ liệu thật gửi thông báo tới nhân viên | Tự sửa: tên "THỬ MCP", giờ quán nghỉ, báo trước nhân viên |

## Vòng 2
| # | Mức | Loại | Gói | Vấn đề | Xử lý |
|---|------|------|-----|--------|-------|
| L1 | Vừa | Thiếu bước | 2, 3 | `publicOrigin()` chỉ theo `APP_ORIGIN`, local/test không có → URL `undefined`; đặt https trong test thì đổi tên cookie | Tự sửa: `APP_ORIGIN` nếu có, không thì origin của request như `expectedOrigin()`; test dùng origin `http://` |
| L2 | Vừa | Rủi ro | 2 | Đổi/đặt lại mật khẩu không thu hồi token MCP | Tự sửa: từ chối grant tạo trước `password_changed_at`, có test |
| L3 | Vừa | Thiếu bước | 9 | Không chắc hosting đang ở migration 0035; có thể đưa cả đợt S62–S64 lên cùng lúc | Tự sửa: gói 9 bước 0 hỏi anh số migration thật, báo rõ đợt nào sẽ lên |
| L4 | Vừa | Sai file/pattern | 4 | Lỗi luật trong SQL (`P0001`) thành câu chung, AI không biết sửa gì | Tự sửa: `AppError` → `ZodError` → `fromDbError` → câu chung, có test |
| L5 | Vừa | Thiếu điểm dừng | 2, 3 | Đổi scope trái brief đã duyệt mà không có điểm dừng | Anh quyết (cùng câu với vòng 1 L2): không đặt điểm dừng vì đổi lại dễ (một hàm `expandRequestedScope`, code nằm trên nhánh riêng); ghi ở mục Còn mở để anh xác nhận trước gói 9 |
| L6 | Nhỏ | Tiêu chí mơ hồ | 3 | `curl` không kèm phiên chỉ ra 302, không kiểm được CSP trang Cho phép | Tự sửa: curl kèm cookie Linh + client đã đăng ký → 200, kiểm CSP |
| L7 | Nhỏ | Rủi ro | 3 | CSP riêng chặn font Be Vietnam Pro | Tự sửa: thêm `fonts.googleapis.com` / `fonts.gstatic.com` |
| L8 | Nhỏ | Thiếu bước | 7 | Tạo lịch bắt buộc `endTime`, câu thử không có | Tự sửa: thiếu thì lấy thời lượng mặc định trong cài đặt lịch, hiện ở bản xem trước |
| L9 | Nhỏ | Rủi ro | 8 | `dayBoard` đổi ngày sai/tương lai thành hôm nay; trường tên `decided` | Tự sửa: kiểm `board.date === input.date`, so trường `decided` |
| L10 | Nhỏ | Sai thứ tự | 8 | Gói 8 đếm tool gói 5, 6 nhưng chỉ phụ thuộc 7 | Tự sửa: phụ thuộc 5, 6, 7 |
| L11 | Nhỏ | Tiêu chí mơ hồ | 5 | Tìm khách chỉ trả SĐT che, mâu thuẫn "SĐT trả đủ" | Tự sửa: tìm khách giữ SĐT che, chi tiết khách trả đủ |

## Còn mở
Không. Scope ghi (vòng 1 L2, vòng 2 L5): anh xác nhận 10/11/2026 cấp quyền ghi ngay lần kết nối đầu (M03).
