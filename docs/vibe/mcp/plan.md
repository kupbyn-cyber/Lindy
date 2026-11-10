# Kế hoạch: MCP cho LINDY OS

- Trạng thái: Đang triển khai
- Brief: ./brief.md
- Dự án: LINDY OS (`kupbyn-cyber/Lindy`)
- Nhánh git: vibe/mcp
- Lệnh kiểm tra: build `bun run build` · lint `bun run lint` · typecheck `bun run typecheck` · test `bun run test` (gộp: `bun run check` rồi `bun run build`)
- Hiện trạng trước khi làm (10/11/2026, commit 2084a50): lint pass · typecheck pass · build pass · test 42 file / 449 test pass (một lần chạy đầu có 1 lỗi ở `tests/integration/backup.test.ts`, chạy lại pass — nghi lỗi chập chờn)

## Cách làm tổng thể
Thêm vào Lindy một máy chủ MCP tại `/api/mcp`, chép khung của CEN WORK (`kupbyn-cyber/cenwork-lovable`: `src/lib/mcp/oauth.server.ts`, `oauth-http.server.ts`, `mcp-handler.server.ts`, `write-intents.server.ts`, `audit.server.ts`, `http.server.ts`, `config.server.ts`, `metadata.server.ts`; tài liệu `docs/cen-mcp-oauth.md`; migration `0158`, `0159`) nhưng viết lại theo cách của Lindy: thư viện `postgres` (tagged template, `withUser` / `withWorker` ở `src/server/db/client.ts`), lỗi `AppError` ở `src/server/http/errors.ts`, alias `~/`, code ở `src/server/mcp/`. Đăng nhập OAuth 2.1 + PKCE + đăng ký client động; màn "Cho phép" dùng phiên đăng nhập Lindy sẵn có. Mỗi lần gọi tool, server dựng `Auth` (cùng kiểu `SessionInfo` của phiên web) từ `userId` trong token, rồi gọi **service có sẵn** trong `src/server/*` — không viết SQL nghiệp vụ mới, quyền vẫn do `hasPerm` + RLS quyết. Tool ghi đi 2 bước qua bảng intent: preview lưu bản đã chuẩn hoá + mã dùng một lần; execute chỉ nhận mã.

## Quyết định kỹ thuật
- Không dùng thư viện MCP SDK; viết tay JSON-RPC (Streamable HTTP, không trạng thái) như CEN — giữ ảnh Docker nhẹ, đã chạy được với Claude và ChatGPT ở CEN (giả định).
- Bảng OAuth + intent nằm ở schema `public` như `sessions`, chỉ role `app_worker` có quyền (giống `sessions`, `user_credentials`); `app_user` không thấy. Token, mã chỉ lưu SHA-256 (giả định, theo mẫu `sessions` của Lindy).
- Chỉ tài khoản có vai trò **Chủ** (`roles.code = 'owner'` qua `user_branch_roles` chưa `revoked_at`) được cấp và dùng token; kiểm lại ở mỗi request, không chỉ lúc cấp (anh chốt trong brief: chỉ anh và Linh, dùng tài khoản Chủ của Linh).
- Scope: `lindy:read`, `lindy:write`, `offline_access`. **Cấp cả ba ngay lần kết nối đầu** theo cách CEN đang chạy (`docs/cen-mcp-oauth.md` mục "Cấp scope theo vai trò"): 401 của `/api/mcp` trả `WWW-Authenticate: Bearer resource_metadata="…", scope="lindy:read lindy:write offline_access"`; `/oauth/authorize` không có `scope` hoặc chỉ xin `lindy:read`(+`offline_access`) → mở rộng ra cả ba; màn Cho phép luôn có dòng cảnh báo ghi. Tool vẫn kiểm scope (grant cũ thiếu `lindy:write` → `isError` + `_meta['mcp/www_authenticate']`, phải ngắt và kết nối lại). Mọi thao tác ghi vẫn qua xem trước → đồng ý. (Phản biện L2 — đổi giả định của brief vì step-up không chạy ổn trên claude.ai theo kinh nghiệm CEN; em quyết khi anh ngủ, anh xem lại.)
- Tài khoản còn cờ "phải đổi mật khẩu" không dùng được MCP: màn Cho phép báo "Đổi mật khẩu trong app trước", `verifyAccessToken` từ chối (phản biện L9).
- Access token 1 giờ, refresh 30 ngày xoay vòng, dùng lại refresh cũ hoặc mã cũ ⇒ thu hồi cả grant; mã đăng nhập 5 phút; intent 15 phút — theo CEN (giả định).
- **Exactly-once khác CEN:** service Lindy tự mở giao dịch `withUser`, nên execute không thể chạy nghiệp vụ trong cùng giao dịch khoá intent như CEN. Cách làm: (1) giao dịch worker khoá intent `for update`, chuyển `pending → executing`; (2) gọi service; (3) giao dịch worker ghi kết quả, `executing → done` (hoặc `failed` kèm lỗi). Gọi lại mã đã `done` → trả kết quả đã lưu. Mã đang `executing` chưa quá 2 phút → báo "đang thực hiện, thử lại sau ít giây", không gọi service; quá 2 phút (tiến trình chết giữa chừng) → báo "không rõ đã ghi chưa, kiểm tra trong app", không tự chạy lại. Lưới an toàn thứ hai là cơ chế chống trùng sẵn có của service: tạo lịch và đề nghị chi nhận `createRequestId` = id intent (service tìm lại theo `create_request_id`); duyệt/sửa/huỷ lịch, nghỉ, tạm ứng, sửa khách có `version` (chạy lần hai lỗi lệch phiên bản); `decideDay` không có `version` nên preview lưu `decidedStatus` hiện tại và execute đọc lại qua `dayBoard`, khác thì báo "đã thay đổi, xem trước lại" (phản biện L6, L7, L8).
- CSP: middleware `applySecurityHeaders` (`src/server/http/headers.ts`, gọi từ `src/start.ts`) ghi đè CSP mọi response, có `form-action 'self'` làm Chrome chặn chuyển hướng về claude.ai/chatgpt.com sau khi bấm Cho phép. Với đường dẫn bắt đầu bằng `/oauth/` thì đặt CSP riêng không có `form-action` (như CEN `oauth-http.server.ts` `PAGE_HEADERS`, thêm font của design system: `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'`) (phản biện L1, vòng 2 L7).
- Rate limit trong bộ nhớ tiến trình như CEN: `/api/mcp` 120/phút/IP + 60/phút/người; `/oauth/token` 30/phút/IP; `/oauth/authorize` 60/phút/IP; `/oauth/register` 10/giờ/IP, trần 500 client. Tool ghi còn qua `limitWrites` sẵn có (giả định). `src/server/mcp/http.ts` export `resetMcpRateLimits()` để test gọi trong `beforeEach`, như `resetWriteLimits()` (phản biện L11).
- File route mới (`oauth.*.ts`, `[.]well-known.*.ts`, `api/mcp.ts`) cần `src/routeTree.gen.ts` sinh lại (chỉ plugin Vite làm, khi `build` hoặc `dev`) thì typecheck mới qua: ở gói có route mới, chạy `bun run build` **trước** `bun run check`, và commit `routeTree.gen.ts` cùng gói (phản biện L3).
- Lịch sử: mỗi lần gọi tool ghi 1 dòng `audit_logs` (`action = 'mcp.tool_call'`, `entity_type = 'mcp'`, `details` = `{ tool, outcome, client: 'claude' | 'chatgpt' | 'other', grantId, requestId, errorCode? }`); nhãn client suy từ `redirect_uris` đã đăng ký (claude.ai/claude.com → `claude`, chatgpt.com/openai → `chatgpt`). Thao tác ghi còn có lịch sử nghiệp vụ sẵn có của từng service. Không ghi token, mã, tham số tool (giả định).
- Màn "Cho phép": trang HTML do server trả (như CEN `oauth-http.server.ts`), dùng màu/chữ lấy từ `src/styles/tokens.css`, chống CSRF bằng mã gắn với phiên; không dựng route React (giả định — ít code hơn, không cần client JS).
- Đăng nhập khi chưa có phiên: `/oauth/authorize` chuyển sang `/dang-nhap?next=<đường dẫn authorize>`; trang đăng nhập chỉ nhận `next` bắt đầu bằng `/oauth/authorize?` (chống mở chuyển hướng) (giả định).
- Địa chỉ công khai: `publicOrigin(request)` lấy `APP_ORIGIN` nếu có (`https://lindy.aiduocviec.com` trên Vibe Host), không có thì lấy origin của request, giống `expectedOrigin()` ở `src/server/http/route.ts`. Test truyền origin `http://…` (không đặt `APP_ORIGIN` dạng https, vì sẽ đổi tên cookie sang `__Host-lindy_sid` làm hỏng `sessionOf()` trong `tests/helpers/auth.ts`). Không thêm biến môi trường mới (phản biện vòng 2 L1).
- Đổi hoặc bị đặt lại mật khẩu thì token MCP cũ mất hiệu lực: `verifyAccessToken` và `refresh` từ chối grant có `created_at < user_credentials.password_changed_at`, giống web thu hồi phiên khi đổi mật khẩu (phản biện vòng 2 L2).
- Lỗi trả cho AI: `AppError` → `ZodError` → `fromDbError(e)` (luật trong hàm SQL, mã `P0001`/`42501`) → câu chung; dùng lại đúng thứ tự của `errorResponse` ở `src/server/http/route.ts` (phản biện vòng 2 L4).
- Tiền trong kết quả tool: giữ số nguyên VND và thêm chuỗi hiển thị `8.450.000đ` ở các trường tổng để AI đọc đúng (giả định). SĐT khách: `lindy_get_customer`, chi tiết lịch/đơn trả đủ; `lindy_search_customers` trả SĐT bị che như service sẵn có (`phoneMasked`), mô tả tool ghi rõ muốn xem đủ thì gọi `lindy_get_customer` (phản biện vòng 2 L11).
- Tên tool tiền tố `lindy_`; tool ghi theo cặp `lindy_preview_<việc>` / `lindy_<việc>` (execute chỉ có tham số `action_token`).

## Danh sách gói
| # | Gói | Phụ thuộc | Dừng hỏi anh |
|---|-----|-----------|--------------|
| 1 | Migration MCP + dựng `Auth` từ userId | — | Không |
| 2 | Lõi OAuth (store) | 1 | Không |
| 3 | Route OAuth + màn Cho phép + `next` ở Đăng nhập | 2 | Không |
| 4 | Endpoint `/api/mcp` + `lindy_get_me` + lịch sử | 3 | Không |
| 5 | Tool đọc: lịch, đơn, khách, Cần xem lại | 4 | Không |
| 6 | Tool đọc: báo cáo, lợi nhuận, tiền, thu chi, cọc, công, lương, tạm ứng | 4 | Không |
| 7 | Nền tảng intent ghi + tool ghi lịch hẹn | 4 | Không |
| 8 | Tool ghi còn lại + tài liệu | 5, 6, 7 | Không |
| 9 | Đưa lên `main`, triển khai, thử thật | 8 | Có — anh duyệt merge, bấm Triển khai lại, kết nối và thử trên Claude + ChatGPT |

## Chi tiết gói

### ☑ Gói 1 — Migration MCP + dựng `Auth` từ userId
- Mục tiêu: có bảng lưu OAuth và intent ghi; có hàm dựng quyền của một người từ `userId` dùng chung với phiên web.
- File: tạo `db/migrations/0036_mcp.sql`, `tests/security/mcp-db.test.ts` · sửa `src/server/auth/session.ts`, `src/server/auth/context.ts`
- Các bước:
  1. `0036_mcp.sql` (đầu file ghi chú như các migration khác): tạo `mcp_oauth_clients` (client_id uuid, client_name, redirect_uris text[] 1–5 phần tử, client_label text, created_at, revoked_at), `mcp_oauth_grants` (id, user_id → users, client_id, scope text[], resource, created_at, last_used_at, revoked_at, revoked_reason), `mcp_oauth_codes` (code_hash PK, grant_id, redirect_uri, code_challenge, expires_at, used_at), `mcp_oauth_tokens` (id, token_hash unique, kind access|refresh, grant_id, expires_at, used_at, revoked_at) — theo CEN `0158`, đổi `auth.users` thành `users`.
  2. Tạo `mcp_write_intents` (id uuid, token_hash unique, user_id, grant_id, action_type text check `^[a-z0-9_]{1,64}$`, payload jsonb, summary jsonb, status pending|executing|done|failed, result jsonb, error jsonb, created_at, expires_at default now()+15 phút, claimed_at, finished_at) — theo CEN `0159`, bỏ cờ `cen.mcp_write` vì bảng chỉ `app_worker` chạm được.
  3. Bật RLS, `grant select, insert, update` cho `app_worker` + policy `for all to app_worker using (true)`; không grant `app_user`; trigger chặn `delete`/`truncate` bằng `app.forbid_mutation()` như các bảng khác.
  4. `create or replace function app.backup_dump()` (chép nguyên bản mới nhất ở `0034_attendance_photos.sql`) và thêm 5 bảng mcp vào danh sách `relname not in (...)`.
  5. `session.ts`: tách đoạn đọc `user_branch_roles … role_permissions` trong `loadSession` thành `export async function loadAccess(tx: Tx, userId: string): Promise<BranchAccess[]>`; `loadSession` gọi lại hàm này (hành vi không đổi).
  6. `context.ts`: thêm `export async function authForUser(userId: string, sessionLabel: string): Promise<Auth | null>` — kiểm `users.is_active`, lấy `displayName`, `mustChangePassword`, `branches` qua `loadAccess`; `sessionId` đặt giá trị nhận diện grant (không phải phiên web); trả `null` khi `mustChangePassword` đúng (phản biện L9).
  7. Test: migration chạy được; `app_user` không `select` được `mcp_oauth_tokens`; `backup_dump()` không chứa tên bảng mcp; `authForUser` ra cùng `branches` như `loadSession` của cùng người.
- Xong khi:
  - lint + typecheck + test + build pass
  - `bun scripts/migrate.ts up --test` chạy `0036` không lỗi; test ở bước 7 pass
- Dừng hỏi anh: Không (migration chỉ chạy ở DB local/test; DB thật chạy ở gói 9)

### ☑ Gói 2 — Lõi OAuth (store)
- Mục tiêu: toàn bộ logic cấp, đổi, gia hạn, thu hồi, kiểm token, không dính HTTP.
- File: tạo `src/server/mcp/config.ts`, `src/server/mcp/oauth.ts`, `tests/security/mcp-oauth.test.ts`
- Các bước:
  1. `config.ts`: `MCP_PATH = '/api/mcp'`, hằng scope, `SUPPORTED_SCOPES = ['lindy:read', 'lindy:write', 'offline_access']`, `WRITE_SCOPES = ['lindy:write']`, `expandRequestedScope()` (thiếu `scope` hoặc chỉ `lindy:read` ± `offline_access` → cả `SUPPORTED_SCOPES`; xin tường minh khác → giữ nguyên nếu hợp lệ), TTL (access 3600s, refresh 30 ngày, code 300s), `MAX_REGISTERED_CLIENTS = 500`, `MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']`, `ALLOWED_REDIRECT_HOSTS` (chatgpt.com, chat.openai.com, platform.openai.com, claude.ai, claude.com, localhost, 127.0.0.1), `clientLabelFromRedirects()`, `publicOrigin(request)` (xem Quyết định kỹ thuật), `resourceUrl(origin)`, `protectedResourceMetadataUrl(origin)`.
  2. `oauth.ts`: chép từ CEN `oauth.server.ts` các hàm `sha256Hex`, `randomToken`, `verifyPkce` (S256), `validateRedirectUri(s)` (https hoặc loopback, host trong danh sách), `parseScope`, `consentCsrfToken`, `safeEqualStrings`; store dùng `withWorker`: `registerClient`, `getClient`, `createGrantAndCode`, `exchangeCode` (PKCE, đúng redirect_uri, mã dùng một lần; dùng lại ⇒ thu hồi grant), `refresh` (xoay vòng; dùng lại refresh cũ ⇒ thu hồi grant; giữ đúng scope grant), `revokeToken`, `verifyAccessToken` (chưa thu hồi/hết hạn, đúng resource, client chưa thu hồi, user `is_active`, không còn cờ phải đổi mật khẩu, grant tạo sau `password_changed_at`, **còn vai trò Chủ**) trả `McpPrincipal { userId, grantId, clientId, clientLabel, scope }`; cập nhật `grants.last_used_at` tối đa mỗi phút.
  3. `isOwner(tx, userId)`: có dòng `user_branch_roles` chưa `revoked_at` nối `roles` có `code = 'owner'` (khớp `ROLES.owner` ở `src/server/authz/catalog.ts`).
  4. Test: luồng đủ (đăng ký → code → token → verify); PKCE sai bị từ chối; mã dùng hai lần ⇒ grant bị thu hồi; refresh cũ dùng lại ⇒ thu hồi; tài khoản Thợ/Quản lý (seed có Nhung, Chin, Trang) không tạo được grant và token cũ của người bị khoá/mất vai trò Chủ bị từ chối ngay; đổi mật khẩu xong thì access và refresh token cũ bị từ chối.
- Xong khi:
  - lint + typecheck + test + build pass
  - `verifyAccessToken` trả null cho token của người không phải Chủ (test)
- Dừng hỏi anh: Không

### ☑ Gói 3 — Route OAuth + màn Cho phép + `next` ở Đăng nhập
- Mục tiêu: Claude/ChatGPT tự tìm, đăng ký và đăng nhập được.
- File: tạo `src/server/mcp/oauth-http.ts`, `src/server/mcp/http.ts`, `src/server/mcp/metadata.ts`, `src/routes/[.]well-known.oauth-protected-resource.ts`, `src/routes/[.]well-known.oauth-protected-resource.api.mcp.ts`, `src/routes/[.]well-known.oauth-authorization-server.ts`, `src/routes/oauth.register.ts`, `src/routes/oauth.authorize.ts`, `src/routes/oauth.token.ts`, `src/routes/oauth.revoke.ts`, `tests/security/mcp-oauth-http.test.ts` · sửa `src/routes/dang-nhap.tsx`, `src/server/http/headers.ts`, `src/routeTree.gen.ts` (tự sinh), test header sẵn có nếu có
- Các bước:
  1. `http.ts`: `rateLimit`, `resetMcpRateLimits`, `clientIp` (dùng lại `src/server/http/client-ip.ts`), `jsonResponse` (`cache-control: no-store`), CORS mở cho đúng các route OAuth/MCP, `preflight`.
  2. `metadata.ts`: metadata RFC 9728 (resource, authorization_servers, scopes_supported) và RFC 8414 (issuer, authorization/token/registration/revocation endpoint, `code_challenge_methods_supported: ['S256']`, grant types, `token_endpoint_auth_methods_supported: ['none']`).
  3. `oauth-http.ts`: chép `handleRegister`, `handleAuthorize` (GET hiện màn; POST nhận Cho phép/Từ chối), `handleToken`, `handleRevoke` từ CEN `oauth-http.server.ts`; phiên lấy bằng `getAuth(request)` của Lindy; chưa đăng nhập → 302 `/dang-nhap?next=…`; đã đăng nhập nhưng không phải Chủ → trang báo "Chỉ tài khoản Chủ kết nối được AI", không tạo grant; còn cờ phải đổi mật khẩu → trang báo "Đổi mật khẩu trong app trước", không tạo grant; scope qua `expandRequestedScope()`; màn Cho phép tiếng Việt, liệt kê quyền đọc, và khi có `lindy:write` thì thêm dòng cảnh báo "AI có thể GHI dữ liệu (sau khi anh/chị xem trước và đồng ý)"; trang HTML tự đặt CSP như CEN `PAGE_HEADERS` (không có `form-action`).
  4. Các file route mỏng: gọi hàm tương ứng, bọc lỗi không lộ chi tiết (không dùng `handle()` vì nó kiểm Origin cùng trang — các route này nhận request từ Claude/ChatGPT).
  5. `headers.ts`: `applySecurityHeaders` không ghi đè CSP khi `opts.path` bắt đầu bằng `/oauth/` và response đã có CSP (giữ CSP riêng của trang Cho phép); thêm test unit gọi `applySecurityHeaders` với `path: '/oauth/authorize', dev: false` trên response có CSP riêng → không có `form-action`; với `/` → vẫn CSP cũ có `form-action 'self'`.
  6. `dang-nhap.tsx`: đọc `next` từ search; hợp lệ khi bắt đầu bằng `/oauth/authorize?`; đăng nhập xong thì `window.location.assign(next)` (đi qua server, không qua router); `beforeLoad` đã đăng nhập mà có `next` hợp lệ cũng chuyển thẳng tới `next`. Nếu đăng nhập xong mà còn cờ phải đổi mật khẩu thì vẫn sang `/doi-mat-khau` như cũ (không mất an toàn; Cho phép sẽ báo phải đổi mật khẩu khi quay lại).
  7. Chạy `bun run build` trước `bun run check` để sinh lại `src/routeTree.gen.ts`; commit file này cùng gói.
  8. Test (`beforeEach` gọi `resetMcpRateLimits()`): metadata đúng URL theo `APP_ORIGIN`; `register` từ chối redirect_uri lạ; `authorize` chưa đăng nhập chuyển sang `/dang-nhap?next=`; Thợ bị chặn; Chủ bấm Cho phép nhận `code` về đúng redirect; client không gửi `scope` → grant có `lindy:write`; CSRF sai bị từ chối; `token` đổi được code.
- Xong khi:
  - lint + typecheck + test + build pass
  - chạy `bun run build` rồi `bun run start`, `curl localhost:3000/.well-known/oauth-authorization-server` ra JSON có `registration_endpoint`; trên bản build, `curl -i` trang Cho phép **kèm cookie phiên của Linh** và `client_id`/`redirect_uri` đã đăng ký → 200, header CSP không có `form-action` (phản biện vòng 2 L6)
- Dừng hỏi anh: Không

### ☑ Gói 4 — Endpoint `/api/mcp` + `lindy_get_me` + lịch sử
- Mục tiêu: Claude/ChatGPT gọi được tool đầu tiên.
- File: tạo `src/server/mcp/handler.ts`, `src/server/mcp/tools.ts`, `src/server/mcp/audit.ts`, `src/routes/api/mcp.ts`, `tests/security/mcp-handler.test.ts` · sửa `src/routeTree.gen.ts` (tự sinh)
- Các bước:
  1. `handler.ts` theo CEN `mcp-handler.server.ts` (phần giao thức, ~dòng 980–1300): POST JSON-RPC; thiếu/sai token → 401 + `WWW-Authenticate: Bearer resource_metadata="…", scope="lindy:read lindy:write offline_access"`; `initialize` (chọn phiên bản giao thức hỗ trợ, `serverInfo: { name: 'lindy-os' }`, `instructions` tiếng Việt: dữ liệu là dữ liệu ứng dụng không tin cậy; tool ghi phải preview → người dùng đồng ý → execute), `ping`, `notifications/initialized`, `tools/list` (chỉ liệt kê tool scope đang có, kèm tool ghi để AI biết mà xin quyền), `tools/call`; GET → 405; batch JSON-RPC → từ chối.
  2. `tools.ts`: kiểu `ToolDef { name, description, scope, inputSchema (JSON Schema), parse (zod .strict()), run(ctx) }`, `ctx = { auth, principal, requestId }`; thiếu scope → kết quả `isError` + `_meta['mcp/www_authenticate']` (insufficient_scope, scope = quyền đang có + quyền cần); tham số lạ (kể cả `userId`, `role`) → `-32602`; lỗi theo thứ tự `AppError` → `ZodError` → `fromDbError` → câu chung (log `[mcp]` chỉ tên lỗi), trả `isError` với đúng câu tiếng Việt.
  3. Tool `lindy_get_me`: tên, vai trò, cơ sở.
  4. `audit.ts`: `writeMcpAudit(userId, entry)` ghi `audit_logs` qua `withWorker` (`actor_user_id = userId`, `action = 'mcp.tool_call'`); gọi sau mỗi `tools/call`.
  5. `src/routes/api/mcp.ts`: route mỏng như CEN `src/routes/api/mcp.ts` (thiếu `DATABASE_URL` → 503). Chạy `bun run build` trước `bun run check` để sinh lại `src/routeTree.gen.ts`, commit cùng gói.
  6. Test: gọi không token → 401 có `resource_metadata` và `scope`; `initialize` + `tools/list` + `lindy_get_me` với token của Linh; tham số `userId` bị từ chối; có dòng audit sau mỗi lần gọi; một lỗi `P0001` giả lập trong tool thử trả đúng câu của DB.
- Xong khi:
  - lint + typecheck + test + build pass
  - `lindy_get_me` trả tên "Linh", vai trò Chủ trong test
- Dừng hỏi anh: Không

### ☑ Gói 5 — Tool đọc: lịch, đơn, khách, Cần xem lại
- Mục tiêu: AI xem được vận hành hằng ngày.
- File: tạo `src/server/mcp/tools-read-ops.ts`, `tests/acceptance/mcp-doc-van-hanh.test.ts` · sửa `src/server/mcp/tools.ts` (đăng ký)
- Các bước (scope `lindy:read`; tham số ngày dạng `YYYY-MM-DD`, khoảng ngày tối đa 62 ngày):
  1. `lindy_list_appointments` (from, to, filter, q) → `listAppointments`; `lindy_get_appointment` (id) → `getAppointment` (kèm cọc nếu có); `lindy_list_attention` → `attentionList`.
  2. `lindy_list_orders` → `listOrders` (đối chiếu tham số với `src/routes/api/orders/index.ts`); `lindy_get_order` → `getOrder`.
  3. `lindy_search_customers` (q) → `searchCustomerList` (q rỗng → `recentCustomers`), SĐT bị che, mô tả chỉ sang `lindy_get_customer`; `lindy_get_customer` (id) → `getCustomer` (lịch sử đơn).
  4. `lindy_review_queue` → `reviewQueue`.
  5. Áp `limitSensitiveReads` cho các tool chi tiết có SĐT như route web đang làm.
  6. Test acceptance: với dữ liệu seed, kết quả tool khớp kết quả gọi service trực tiếp; mô tả tool tiếng Việt, nói rõ đơn vị tiền.
- Xong khi:
  - lint + typecheck + test + build pass
  - `tools/list` có đủ 8 tool trên
- Dừng hỏi anh: Không

### ☑ Gói 6 — Tool đọc: báo cáo, lợi nhuận, tiền, thu chi, cọc, công, lương, tạm ứng
- Mục tiêu: đủ số liệu để AI nhận định kinh doanh.
- File: tạo `src/server/mcp/tools-read-money.ts`, `tests/acceptance/mcp-doc-so-lieu.test.ts` · sửa `src/server/mcp/tools.ts`
- Các bước (scope `lindy:read`; mỗi tool gọi đúng service mà route `GET` tương ứng trong `src/routes/api/*` đang gọi):
  1. `lindy_overview` (period day|month) → `overview`; `lindy_day_report` (date) → `dayReport`; `lindy_month_report` (month `YYYY-MM`) → `monthReport`; `lindy_month_profit` (month) → lấy trường `profit` (kèm `closed`) trong kết quả `monthReport(auth, { month })`, **không** gọi thẳng `monthProfit` (hàm này nhận `tx` + doanh thu tính sẵn, không kiểm `profit.read`) (phản biện L4).
  2. `lindy_money_book` → `getBook` (số dư); `lindy_money_entries` (from, to, …) → `listEntries`.
  3. `lindy_list_expenses` → `listExpenses`.
  4. `lindy_deposit_seasons` → `listSeasons` (cọc từng lịch xem qua `lindy_get_appointment` ở gói 5).
  5. `lindy_attendance_month` → `monthSheet`; `lindy_attendance_day` → `dayBoard` (có đơn nghỉ chờ duyệt nếu service trả).
  6. `lindy_payroll_month` → `payrollMonth`; `lindy_list_advances` → `listAdvances`.
  7. Kết quả tiền thêm trường hiển thị `…đ` ở các tổng (dùng `formatVND` ở `src/lib/money.ts`).
  8. Test acceptance: số doanh thu tháng của tool bằng `monthReport`; `lindy_month_profit` bằng `monthReport(...).profit`; chỉ tính đơn Đã xác nhận (dựa vào service, kiểm một ca có đơn chưa xác nhận).
- Xong khi:
  - lint + typecheck + test + build pass
  - `tools/list` có thêm 12 tool trên
- Dừng hỏi anh: Không

### ☑ Gói 7 — Nền tảng intent ghi + tool ghi lịch hẹn
- Mục tiêu: ghi qua chat an toàn: xem trước, đồng ý, chạy đúng một lần.
- File: tạo `src/server/mcp/intents.ts`, `src/server/mcp/tools-write-appointments.ts`, `tests/security/mcp-intents.test.ts`, `tests/acceptance/mcp-ghi-lich.test.ts` · sửa `src/server/mcp/tools.ts`
- Các bước:
  1. `intents.ts`: `createIntent({ userId, grantId, actionType, payload, summary })` → mã 32 byte base64url, lưu SHA-256, trả `{ action_token, expires_at, summary }`; `executeIntent({ token, principal, actionType, run })` theo quy trình 3 bước ở mục Quyết định kỹ thuật (khoá `for update`, đúng người, đúng `action_type`, chưa hết hạn, `done` → trả kết quả cũ, `executing` chưa quá 2 phút → lỗi "đang thực hiện, thử lại sau ít giây", `executing` quá 2 phút → lỗi "không rõ", `failed` → trả lỗi cũ); scope `lindy:write` kiểm lại ngay trước khi chạy.
  2. Preview chạy toàn bộ kiểm tra không ghi được trước (zod, quyền qua `hasPerm`, đọc bản ghi hiện tại để lấy `version` và hiện tóm tắt "trước → sau"); `checkWarnings` cho lịch mới để hiện cảnh báo trùng giờ.
  3. Cặp tool: `lindy_preview_create_appointment` / `lindy_create_appointment` → `createAppointment` với `createRequestId` = id intent (phản biện L6); `endTime` không bắt buộc — thiếu thì preview lấy thời lượng mặc định `default_duration_min` trong cài đặt lịch của cơ sở (hàm đọc cài đặt sẵn có ở `src/server/appointments/service.ts`, như form `AppointmentForm.tsx`) và hiện giờ kết thúc trong bản xem trước, không để AI tự đoán (phản biện vòng 2 L8); `lindy_preview_update_appointment` / `lindy_update_appointment` → `updateAppointment`; `lindy_preview_cancel_appointment` / `lindy_cancel_appointment` → `transitionAppointment` hành động `cancel` (có lý do); `lindy_preview_customer_cancel_appointment` / `lindy_customer_cancel_appointment` → `transitionAppointment` `report_customer_cancel` (kiểu `Transition` trong `src/server/appointments/service.ts`).
  4. Mô tả tool ghi nói rõ: "chỉ gọi tool thực hiện khi người dùng đã xem bản xem trước và yêu cầu thực hiện".
  5. Test: preview không tạo lịch; execute tạo đúng 1 lịch; execute lại cùng mã trả kết quả cũ, không thêm lịch; mã hết hạn bị từ chối; mã của grant khác/action khác bị từ chối; execute khi intent đang `executing` (đặt tay trong test) trả "đang thực hiện" và không tạo lịch; token chỉ `lindy:read` gọi preview → challenge `insufficient_scope`.
- Xong khi:
  - lint + typecheck + test + build pass
  - test "execute 2 lần ra 1 lịch" pass
- Dừng hỏi anh: Không

### ☑ Gói 8 — Tool ghi còn lại + tài liệu
- Mục tiêu: đủ phạm vi ghi của brief; có hướng dẫn kết nối.
- File: tạo `src/server/mcp/tools-write-other.ts`, `tests/acceptance/mcp-ghi-khac.test.ts`, `docs/MCP.md` · sửa `src/server/mcp/tools.ts`, `docs/DECISIONS.md`, `CLAUDE.md`, `README.md`
- Các bước:
  1. `lindy_preview_create_expense` / `lindy_create_expense` → `createExpense` (`createRequestId` = id intent; nhóm chi lấy từ `expense_categories`, gợi ý danh sách mã trong lỗi nếu sai).
  2. `lindy_preview_decide_attendance` / `lindy_decide_attendance` → `decideDay`; preview gọi `dayBoard` và kiểm `board.date === input.date` (khác — vd ngày tương lai bị đổi thành hôm nay — thì báo lỗi), lưu trường `decided` của đúng `userId`; execute đọc lại, khác thì báo "đã thay đổi, xem trước lại" và không ghi (phản biện L7, vòng 2 L9). Test: bổ sung công thiếu ghi chú trả đúng câu "cần ghi lý do" của DB.
  3. `lindy_preview_decide_leave` / `lindy_decide_leave` → `actOnLeave` (`approve` | `reject` của `LeaveAction`).
  4. `lindy_preview_decide_advance` / `lindy_decide_advance` → `actOnAdvance` (`approve` | `reject` của `AdvanceAction`; **không** có `pay` — để sau).
  5. `lindy_preview_update_customer` / `lindy_update_customer` → `updateCustomer`.
  6. `docs/MCP.md`: địa chỉ, cách thêm connector ở claude.ai và ChatGPT (Developer mode), lưu ý grant cũ muốn nhận quyền mới phải ngắt và kết nối lại, danh sách tool, scope, cách thu hồi (SQL như CEN `docs/cen-mcp-oauth.md` mục Thu hồi), cách xem lịch sử (`audit_logs` `entity_type = 'mcp'`).
  7. `DECISIONS.md`: thêm mục quyết định mới nhóm `M01–M0x` (MCP chỉ cho Chủ; dùng chung tài khoản Linh; phạm vi đọc/ghi bản đầu; ghi qua xem trước). `CLAUDE.md`: thêm M01–M0x vào danh sách quyết định đã chốt và một câu trạng thái đợt MCP. `README.md`: thêm link `docs/MCP.md`.
  8. Test: mỗi cặp tool một ca preview → execute đúng, một ca execute lại không ghi thêm.
- Xong khi:
  - lint + typecheck + test + build pass
  - `tools/list` (đủ scope) có đúng 39 tool: `lindy_get_me` + 20 tool đọc (8 ở gói 5, 12 ở gói 6) + 9 cặp ghi (4 ở gói 7, 5 ở gói 8) (phản biện L10)
- Dừng hỏi anh: Không

### ☐ Gói 9 — Đưa lên `main`, triển khai, thử thật
- Mục tiêu: chạy trên lindy.aiduocviec.com, kết nối được từ Claude và ChatGPT.
- File: không sửa code (chỉ ghi nhật ký vào plan)
- Các bước:
  0. Hỏi anh (hoặc xem trường `migration` trong bản sao lưu tải từ app) bản trên Vibe Host đang ở migration số mấy; tài liệu đợt S62–S64 ghi "chưa triển khai lên Vibe Host", nên lần này có thể đưa lên cùng lúc cả đợt đó — báo anh rõ những đợt nào sẽ lên (phản biện vòng 2 L3).
  1. Chạy lại `bun run build` + `bun run check` trên nhánh, rồi `bun scripts/check-upgrade.ts --from=<số thật ở bước 0>` (mô phỏng nâng cấp DB từ bản đang chạy) theo `docs/BAI_HOC_TRIEN_KHAI.md` (phản biện L5).
  2. **Hỏi anh** duyệt merge `vibe/mcp` vào `main` và push (lần đầu lên `main` là migration `0036` sẽ chạy trên DB thật khi triển khai).
  3. Anh **sao lưu DB trên Vibe Host** trước, rồi bấm **Triển khai lại**, xem nhật ký có dòng `[release]` chạy `0036` không lỗi, mở `/api/health` → `ready: true`.
  4. Anh tự thử theo "Tiêu chí xong" của brief: `curl https://lindy.aiduocviec.com/.well-known/oauth-protected-resource/api/mcp`; thêm connector trên claude.ai; trên ChatGPT; hỏi lịch hôm nay; phân tích tháng; tạo một lịch thử qua chat (tên khách "THỬ MCP", vào giờ hoặc ngày quán nghỉ, báo trước nhân viên vì app sẽ gửi thông báo "Lịch mới") rồi huỷ nó trong app (phản biện L12); đăng nhập Nhung ở màn Cho phép bị chặn.
- Xong khi:
  - anh báo các bước thử ở trên đều đạt
- Dừng hỏi anh: Có — anh cho biết migration đang chạy trên hosting, duyệt merge/push, bấm Triển khai lại, tự thử trên Claude và ChatGPT

## Đối chiếu brief
| Mục trong brief | Gói |
|-----------------|-----|
| Đăng nhập OAuth (metadata, đăng ký, Cho phép, token) | 2, 3 |
| Chỉ tài khoản Chủ kết nối, kiểm mỗi lần gọi | 2, 3, 4 |
| Ghi lịch sử mọi lần gọi tool | 4 |
| `lindy_get_me` | 4 |
| Đọc: lịch, đơn, khách, Cần xem lại | 5 |
| Đọc: báo cáo, lợi nhuận, sổ tiền, thu chi, cọc, công, lương, tạm ứng | 6 |
| Ghi: tạo/sửa/huỷ lịch, Khách báo huỷ | 7 |
| Ghi: đề nghị chi, duyệt công, duyệt nghỉ, duyệt tạm ứng, sửa khách | 8 |
| Tiêu chí: kết nối claude.ai, hỏi lịch hôm nay khớp app | 4, 5, 9 |
| Tiêu chí: kết nối ChatGPT, gọi `lindy_get_me` | 4, 9 |
| Tiêu chí: phân tích doanh thu, lợi nhuận, khách khớp app | 5, 6, 9 |
| Tiêu chí: tạo lịch qua chat có xem trước, không tạo trùng | 7, 9 |
| Tiêu chí: Thợ/Quản lý bị chặn | 2, 3, 9 |
| Tiêu chí: `bun run check` + build đạt | mọi gói |

## Rủi ro
- **Script DB local chỉ chạy trên Windows** (`scripts/db-local.ts` gọi `initdb.exe`). Trong môi trường cloud phải tự dựng PostgreSQL 16 hệ thống (`/usr/lib/postgresql/16/bin`, chạy bằng user `postgres`, cổng 5433) rồi ghi `PG_ADMIN_URL` vào `.env` và chạy `db-bootstrap` → `migrate up` → `migrate up --test` → `seed`. Đã làm một lần ngày 10/11 và test pass. Không sửa `db-local.ts` trong đợt này.
- **Bản sao lưu lộ token** — `app.backup_dump()` loại bảng theo danh sách tên; thiếu bảng mcp thì bản sao lưu chứa `token_hash` và test `backup.test.ts` sẽ đỏ → gói 1 bước 4 + test.
- **Exactly-once không cùng giao dịch như CEN** — tiến trình chết giữa bước 2 và 3 để intent `executing`; phòng bằng chống trùng của service (`createRequestId`, `version`, kiểm lại trạng thái với `decideDay`) và báo "không rõ" thay vì chạy lại.
- **Chuyển tên miền cũ** (`canonical-host.ts`) — Claude/ChatGPT luôn dùng `lindy.aiduocviec.com`; metadata lấy `APP_ORIGIN` nên không lệch. Kiểm trong gói 3.
- **Kiểm Origin của `handle()`** chặn request ghi từ trang khác — route OAuth/MCP không dùng `handle()`, phải tự bọc lỗi; không được nới `assertSameOrigin` cho route web.
- **CSP `form-action 'self'`** chặn chuyển hướng về claude.ai sau khi bấm Cho phép, chỉ lộ ở bản build → gói 3 bước 5 + kiểm bằng `curl -I` trên bản build.
- **RAM 512 MB** — MCP không thêm thư viện, không giữ trạng thái ngoài vài bảng đếm rate limit (giới hạn 20.000 khoá như CEN).
- **Dùng chung tài khoản Linh** — lịch sử không tách được anh hay Linh, chỉ tách theo app (Claude/ChatGPT).
- **Test chập chờn** `backup.test.ts` một lần đỏ khi chạy đầu — nếu đỏ lại trong lúc build, chạy lại một lần trước khi coi là lỗi của gói.

## Giả định
- Toàn bộ mục "giả định" trong Quyết định kỹ thuật.
- Lindy có một cơ sở; tool không nhận `branchId`, dùng cơ sở đầu tiên của `auth.branches` như `requireBranch` mặc định.
- Tên tool, tham số, mô tả viết theo kiểu CEN; mô tả và lỗi tiếng Việt.
- Số migration tiếp theo là `0036` (hiện có đến `0035_sua_don_hang_ban.sql`).
- Không thêm biến môi trường; `APP_ORIGIN` và `TRUST_PROXY` đã có trên Vibe Host.

## Phản biện
2 vòng, 23 lỗi: tự sửa 21, bác bỏ 0, 1 câu anh quyết: cấp quyền ghi ngay lần kết nối đầu (em chọn khi anh ngủ, anh xác nhận 10/11). Sửa chính: CSP trang Cho phép, sinh lại route tree, lợi nhuận lấy từ `monthReport`, thu hồi token khi đổi mật khẩu, lỗi SQL trả đúng câu, kiểm migration thật + sao lưu trước triển khai. Anh dặn phản biện xong chạy `/vibe-build` (10/11, 01:44), nên plan chuyển Đã phản biện.
Chi tiết: ./review.md

## Nhật ký triển khai
- 10/11 02:55 · Bắt đầu · nhánh vibe/mcp · chuẩn: pass (anh ngủ, chạy gói 1–8, dừng trước gói 9)
- 10/11 03:05 · ☑ Gói 1 — Migration MCP + dựng `Auth` từ userId · test 454 pass
- 10/11 03:20 · ☑ Gói 2 — Lõi OAuth (store) · test 465 pass · Lệch plan: hàm `eligibility()` gộp kiểm Chủ + khoá + cờ đổi mật khẩu (thay `isOwner` riêng); `client_label` lưu luôn ở bảng client lúc đăng ký
- 10/11 03:45 · ☑ Gói 3 — Route OAuth + màn Cho phép + `next` ở Đăng nhập · test 474 pass; bản build: trang Cho phép 200 với CSP riêng không `form-action`, chưa đăng nhập → 302 `/dang-nhap?next=`, đã đăng nhập → 307 về `/oauth/authorize` · Lệch plan: `audit.ts` làm sớm ở gói này (authorize/token ghi lịch sử); `safeNext` đặt ở `src/lib/safe-next.ts` (không export từ file route); thêm `safeRun` trong `http.ts` bọc lỗi route
- 10/11 04:05 · ☑ Gói 4 — Endpoint `/api/mcp` + `lindy_get_me` + lịch sử · test 482 pass · Lệch plan: khung tool (`defineTool`, `toToolFailure`, kiểu `ToolDef`) tách ra `src/server/mcp/kit.ts` để file tool không import vòng với `tools.ts` (chỉ còn danh sách đăng ký); thêm `tests/helpers/mcp.ts` (cấp token thật, gọi tool) dùng chung cho gói 5–8
- 10/11 04:25 · ☑ Gói 5 — Tool đọc: lịch, đơn, khách, Cần xem lại · test 487 pass · Lệch plan: tool không kiểm thêm 62 ngày (service `listAppointments` đã chặn khoảng ngày, mô tả tool ghi rõ); test tự tạo một khách + một lịch riêng vì DB test không có sẵn dữ liệu
- 10/11 04:45 · ☑ Gói 6 — Tool đọc: báo cáo, lợi nhuận, tiền, thu chi, cọc, công, lương, tạm ứng · test 493 pass · Lệch plan: không thêm chuỗi `…đ` vào kết quả (bước 7) — các kết quả có nhiều trường số không phải tiền (khách, lượt, phút), tự gắn dễ sai; thay bằng câu đơn vị tiền trong mô tả mọi tool có tiền + trong `instructions` của máy chủ; ca "đơn chưa xác nhận không vào doanh thu" dựa vào test sẵn có của báo cáo (tool trả nguyên số của `monthReport`, test kiểm khớp)
- 10/11 05:10 · ☑ Gói 7 — Nền tảng intent ghi + tool ghi lịch hẹn · test 502 pass · Lệch plan: tool thực hiện gọi `limitWrites` như route web; xem trước kiểm thêm cờ `can.edit` / `can.cancel` / `can.reportCustomerCancel` của lịch để báo sớm; `tests/helpers/mcp.ts` nhận cả kết quả tool dạng chữ (challenge quyền)
- 10/11 05:20 · ⏸ Gói 8 — test duyệt công/nghỉ/tạm ứng đỏ do DB test thiếu hồ sơ nhân viên và chính sách lương (không phải lỗi tool); phiên dừng giữa chừng
- 10/11 20:35 · ☑ Gói 8 — Tool ghi còn lại + tài liệu · test 509 pass · Lệch plan: test dựng cơ sở thử riêng "Aa cơ sở thử MCP" (hồ sơ + chính sách lương, thu hồi vai trò khi xong) như `cham-cong.test.ts`; quyết định ghi thành M01–M05 trong `DECISIONS.md` (M03 ghi rõ chờ anh xác nhận)
- 10/11 20:45 · Kiểm tra cuối: lint + typecheck + test 509 + build pass; chạy thử bản build: đăng ký → Cho phép → token → `initialize` → `tools/list` 39 tool → `lindy_get_me` ra Linh, Chủ; `check-upgrade --from=0035` và `--from=0034` đều NÂNG CẤP ĐẠT
- 10/11 20:45 · ⏸ Gói 9 — dừng chờ anh: cho biết migration đang chạy trên Vibe Host, xác nhận M03 (quyền ghi ngay lần đầu), duyệt merge `vibe/mcp` → `main`, sao lưu DB rồi bấm Triển khai lại
- 10/11 20:55 · Gói 9 bước 0: anh không nhớ bản trên hosting; em kiểm qua trình duyệt trên máy anh — bundle đang chạy có chuỗi S63 "Thành tiền giảm từ" (chỉ có từ commit 2084a50), `/api/health` ready, `/api/mcp` 404 ⇒ hosting đang ở `main` 2084a50, migration 0035. Lần triển khai này chỉ thêm MCP (0036); `check-upgrade --from=0035` đã ĐẠT
- 10/11 21:00 · Anh xác nhận M03 (cấp quyền ghi ngay lần đầu) và duyệt merge `vibe/mcp` → `main`, push
- 10/11 21:10 · Gói 9: lint + typecheck + test 509 + build pass; push `main` 2084a50 → c86ecd1 (fast-forward). Chờ anh sao lưu DB và bấm Triển khai lại
