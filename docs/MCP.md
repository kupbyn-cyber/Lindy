# MCP — kết nối Claude, ChatGPT với LINDY OS

Máy chủ MCP cho phép anh Đức và Linh hỏi và thao tác Lindy bằng cách nói chuyện với Claude hoặc ChatGPT. Kế hoạch: `docs/vibe/mcp/` (brief, plan, review). Quyết định: M01–M05 trong `docs/DECISIONS.md`.

- **Địa chỉ:** `https://lindy.aiduocviec.com/api/mcp`
- **Ai dùng được:** chỉ tài khoản vai trò **Chủ**, đang hoạt động, đã đổi mật khẩu lần đầu (M01). Hiện dùng chung tài khoản của Linh.
- **Đăng nhập:** OAuth 2.1 + PKCE, có đăng ký client tự động. Không cần khoá API hay biến môi trường mới; địa chỉ công khai lấy từ `APP_ORIGIN`.

## Kết nối

**Claude (claude.ai, app Claude):** Cài đặt → Connectors → Add custom connector → dán địa chỉ trên → Connect → đăng nhập Lindy bằng tài khoản Linh (nếu chưa đăng nhập) → bấm **Cho phép**.

**ChatGPT:** Settings → Apps & Connectors → bật Developer mode → Create → dán địa chỉ trên, chọn OAuth → đăng nhập → **Cho phép**.

Màn **Cho phép** liệt kê quyền xem và quyền ghi. Tài khoản Quản lý, Thợ bị chặn ở màn này.

**Cần kết nối lại khi:** đổi mật khẩu hoặc bị đặt lại mật khẩu (mọi kết nối cũ mất hiệu lực, M04); kết nối cũ thiếu quyền ghi (tool ghi báo "Ngắt rồi kết nối lại"); không dùng quá 30 ngày (refresh token hết hạn).

## Quyền (scope)

| Scope | Cho phép |
|---|---|
| `lindy:read` | Mọi tool đọc |
| `lindy:write` | Tool ghi (luôn qua xem trước → đồng ý) |
| `offline_access` | Giữ kết nối, không phải đăng nhập lại mỗi giờ |

Lần kết nối đầu cấp cả ba (M03, anh xác nhận 10/11/2026). Access token 1 giờ, refresh 30 ngày xoay vòng; dùng lại mã hoặc refresh cũ thì cả kết nối bị thu hồi.

## Tool

**Tài khoản:** `lindy_get_me`.

**Đọc vận hành (8):** `lindy_list_appointments`, `lindy_get_appointment`, `lindy_list_attention`, `lindy_list_orders`, `lindy_get_order`, `lindy_search_customers` (SĐT bị che), `lindy_get_customer` (SĐT đủ, lịch sử đơn), `lindy_review_queue`.

**Đọc số liệu (12):** `lindy_overview`, `lindy_day_report`, `lindy_month_report`, `lindy_month_profit`, `lindy_money_book`, `lindy_money_entries`, `lindy_list_expenses`, `lindy_deposit_seasons`, `lindy_attendance_month`, `lindy_attendance_day`, `lindy_payroll_month`, `lindy_list_advances`.

**Ghi (9 cặp, M05):** mỗi việc một cặp `lindy_preview_<việc>` (chỉ xem trước, chưa ghi, trả `action_token` dùng một lần, hết hạn 15 phút) và `lindy_<việc>` (thực hiện, chỉ nhận `action_token`):

| Việc | Service |
|---|---|
| `create_appointment` — tạo lịch (thiếu giờ kết thúc → thời lượng mặc định của quán) | `createAppointment` |
| `update_appointment` — sửa lịch (trước → sau) | `updateAppointment` |
| `cancel_appointment` — huỷ lịch, có lý do | `transitionAppointment('cancel')` |
| `customer_cancel_appointment` — Khách báo huỷ | `transitionAppointment('report_customer_cancel')` |
| `create_expense` — đề nghị chi | `createExpense` |
| `decide_attendance` — quyết công một người một ngày | `decideDay` |
| `decide_leave` — duyệt / từ chối đơn nghỉ | `actOnLeave` |
| `decide_advance` — duyệt / từ chối tạm ứng (không chi) | `actOnAdvance` |
| `update_customer` — sửa tên, SĐT khách | `updateCustomer` |

Thực hiện chạy **đúng một lần**: gọi lại cùng mã trả kết quả cũ; đang chạy dở thì báo "đang thực hiện"; tiến trình chết giữa chừng thì báo "không rõ đã ghi chưa, kiểm tra trong app", không tự chạy lại. Bản ghi đã đổi trong app sau lúc xem trước → báo lệch, phải xem trước lại.

Mọi tool gọi lại service sẵn có trong `src/server/*`: quyền, RLS, luật nghiệp vụ (chỉ đơn Đã xác nhận vào doanh thu, không xoá vĩnh viễn, tiền số nguyên VND…) giữ nguyên như app.

## Lịch sử

Mỗi lần cho phép, đổi token, gọi tool ghi một dòng `audit_logs` (`entity_type = 'mcp'`, `entity_id` = id kết nối). Không lưu token, mã hay tham số tool. Dùng chung tài khoản Linh nên chỉ tách được theo app (`details.client`: `claude` / `chatgpt` / `other`), không tách được anh hay Linh (M02). Thao tác ghi còn có lịch sử nghiệp vụ của từng màn như khi bấm trong app.

```sql
select created_at, action, details->>'tool' as tool, details->>'client' as app, details->>'outcome' as ket_qua
from audit_logs where entity_type = 'mcp' order by created_at desc limit 50;
```

## Thu hồi

- Ngắt connector trong Claude/ChatGPT (client gọi `POST /oauth/revoke`).
- Đổi mật khẩu tài khoản Linh: mọi kết nối cũ mất hiệu lực ngay.
- Thủ công trên DB (người vận hành):

```sql
-- các kết nối đang hoạt động
select g.id, u.display_name, c.client_name, c.client_label, g.created_at, g.last_used_at
from mcp_oauth_grants g
join users u on u.id = g.user_id
join mcp_oauth_clients c on c.client_id = g.client_id
where g.revoked_at is null;

-- thu hồi một kết nối (mọi token của nó mất hiệu lực ngay)
update mcp_oauth_grants set revoked_at = now(), revoked_reason = 'admin' where id = '<grant_id>';
```

## Mã nguồn

- `src/server/mcp/` — `config.ts`, `oauth.ts` (lõi OAuth), `oauth-http.ts` (các endpoint, màn Cho phép), `metadata.ts`, `handler.ts` (JSON-RPC), `kit.ts` (khung tool), `intents.ts` (xem trước → thực hiện), `tools*.ts`, `audit.ts`, `http.ts`.
- Route: `src/routes/api/mcp.ts`, `src/routes/oauth.*.ts`, `src/routes/[.]well-known.*.ts`.
- Migration `0036_mcp.sql`: bảng OAuth và intent (chỉ `app_worker`), bản sao lưu bỏ qua các bảng này.
- Trang Cho phép có CSP riêng không `form-action` (nếu có, Chrome chặn bước quay về Claude/ChatGPT); `src/server/http/headers.ts` không ghi đè CSP này.
- Test: `tests/security/mcp-*.test.ts`, `tests/acceptance/mcp-*.test.ts`, tiện ích `tests/helpers/mcp.ts`.
