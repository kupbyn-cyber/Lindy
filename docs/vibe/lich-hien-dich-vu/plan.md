# Kế hoạch: Hiện dịch vụ trên ô lịch

- Trạng thái: Đang triển khai
- Brief: ./brief.md
- Dự án: LINDY OS (`kupbyn-cyber/lindy`)
- Nhánh git: vibe/lich-hien-dich-vu
- Lệnh kiểm tra: build `bun run build` · lint `bun run lint` · typecheck `bun run typecheck` · test `bun run test` (cần DB test local)
- Hiện trạng trước khi làm (12/11/2026, workspace cloud): build pass · lint pass · typecheck pass · test chưa chạy (chưa có DB test; `scripts/db-local.ts` dùng bản nhúng `initdb.exe` của Windows — ở workspace dựng Postgres 16 Linux theo Gói 1 bước 0). Mọi lệnh vitest, kể cả `tests/unit`, đều cần DB test vì `globalSetup` (`tests/setup/global.ts`) đòi `TEST_DATABASE_URL`.

## Cách làm tổng thể
Thêm cột `service_chips` (mảng chữ) vào `branch_booking_settings`, trả kèm trong `GET /api/booking-settings` và thêm `PUT /api/service-chips` (quyền `booking_settings.manage`). Ô lịch màn Ngày đổi `cellParts` từ SĐT sang dịch vụ; ô màn Tuần thêm một dòng dịch vụ. Form lịch (`AppointmentForm`) đưa ô "Dịch vụ dự kiến" ra ngoài, thêm hàng chip bật/tắt nối bằng " + ". Trang Thêm → Cài đặt lịch có mục sửa bộ chip. Dữ liệu `appointments.service_summary` giữ nguyên là chữ tự do.

## Quyết định kỹ thuật
- Lưu chip ở cột `service_chips text[]` của `branch_booking_settings`, mặc định `{Tay,Chân,Gel,Móng giả,Design,Mi,Chăm sóc}` — ít code nhất, cùng chỗ cài đặt lịch (anh chốt).
- Quyền sửa chip = `booking_settings.manage` (Chủ/Linh), cùng quyền giờ mở cửa, mùa cọc (giả định; brief để ngỏ).
- Sửa chip ở trang `/them/cai-dat-lich` (nhóm Cài đặt quán), không tạo trang mới (giả định).
- API sửa chip tách riêng `PUT /api/service-chips` thay vì nhồi vào `PUT /api/booking-settings` — form giờ mở cửa hiện có không phải gửi thêm trường (giả định).
- Chip chỉ là lối điền nhanh vào `service_summary`; không thêm bảng, không gắn mã dịch vụ (giả định, theo brief).

## Danh sách gói
| # | Gói | Phụ thuộc | Dừng hỏi anh |
|---|-----|-----------|--------------|
| 1 | Dựng DB test, cột `service_chips` + API đọc/sửa + test quyền | — | Không (dừng nếu không dựng được DB) |
| 2 | Ô lịch Ngày/Tuần hiện dịch vụ thay SĐT | 1 (bước 0: DB để thử) | Không |
| 3 | Form lịch: ô Dịch vụ hiện sẵn + hàng chip | 1 | Không |
| 4 | Trang Cài đặt lịch: sửa bộ chip | 1 | Không |
| 5 | Ghi quyết định S65, cập nhật tài liệu, kiểm tra cuối | 1–4 | Không |

## Chi tiết gói

### ☑ Gói 1 — Cột `service_chips` + API đọc/sửa + test quyền
- Mục tiêu: lưu bộ chip theo cơ sở, ai xem lịch đọc được, chỉ người có `booking_settings.manage` sửa được (server lẫn DB).
- File: tạo `db/migrations/0037_service_chips.sql`, `src/routes/api/service-chips.ts`, `tests/acceptance/lich-dich-vu.test.ts` · sửa `src/server/appointments/service.ts`, `src/server/appointments/schema.ts`, `src/lib/appointments.ts`, `src/routeTree.gen.ts` (tự sinh khi build)
- Các bước:
  0. Dựng DB local nếu chưa có (`.env` chưa có `TEST_DATABASE_URL`), theo `docs/CHAY_LOCAL.md` mục "Dùng PostgreSQL cài thật":
     - Workspace chạy bằng root, `initdb` không chạy dưới root → dùng cụm có sẵn `16/main` (cổng 5432, owner `postgres`): `pg_ctlcluster 16 main start`. **Cấm** tạo `.pgdata` trong repo (`db-local.ts ensure` thấy `.pgdata/PG_VERSION` sẽ gọi `pg_ctl.exe` Windows và làm hỏng `bun run test`, `bun run dev`).
     - Đặt mật khẩu: `runuser -u postgres -- psql -c "alter user postgres password '<mật khẩu ngẫu nhiên>'"`.
     - `.env`: `PG_ADMIN_URL=postgres://postgres:<mật khẩu>@localhost:5432/postgres` (host phải `localhost`, `scripts/lib/db-guard.ts` không nhận socket).
     - Chạy `bun scripts/db-bootstrap.ts && bun run db:migrate && bun run db:seed && bun scripts/dev-passwords.ts && bun scripts/demo-data.ts` (bỏ đổi mật khẩu bắt buộc của tài khoản seed; tạo lịch demo trên `lindy_dev` để thử màn Ngày).
     - Chạy `bun run test` một lần trên code chưa sửa để biết hiện trạng; ghi vào Nhật ký.
     - Workspace khởi động lại thì chạy lại `pg_ctlcluster 16 main start` ở đầu Gói 2–5.
     - **Không dựng được thì dừng hỏi anh**, không chỉ ghi "chưa chạy".
  1. Migration 0037 (theo cách viết 0004/0027, có chú thích tiếng Việt đầu file "S65"): `alter table branch_booking_settings add column service_chips text[] not null default array['Tay','Chân','Gel','Móng giả','Design','Mi','Chăm sóc']`; check: tối đa 20 phần tử, không phần tử rỗng, mỗi phần tử ≤ 30 ký tự, không chứa dấu `+` (`position('+' in e) = 0`, vì chip được nối/tách bằng `+`) (viết hàm SQL `app.valid_service_chips(text[])` immutable rồi dùng trong check). `grant execute on function app.valid_service_chips(text[]) to app_user;` (bắt buộc: 0008 đã thu EXECUTE mặc định, CHECK gọi hàm chạy lại ở mọi UPDATE dòng — thiếu grant thì cả lưu giờ mở cửa đang chạy cũng lỗi 42501). `grant update (service_chips) on branch_booking_settings to app_user;` — policy `booking_settings_manage` có sẵn đã chặn người không có quyền.
  2. `service.ts`: type `Settings` thêm `serviceChips: string[]`; `loadSettings` select thêm `s.service_chips`. Thêm `updateServiceChips(auth, { branchId?, chips })`: `requireBranch`, kiểm `hasPerm(…, 'booking_settings.manage')` (lỗi `forbidden('Chỉ chủ quán đổi được chip dịch vụ.')`), chuẩn hoá (trim, bỏ trùng không phân biệt hoa thường, giữ thứ tự), update `service_chips, updated_at, updated_by`, ghi `audit_logs` action `booking_settings.service_chips_updated` với before/after, rồi **sau khi `await withUser(…)` (update + audit) đã xong**, ở ngoài callback mới `return getSettings(auth, branch.id)` — `getSettings` mở giao dịch riêng, gọi bên trong callback sẽ đọc bộ chip cũ chưa commit. Kết quả có `depositSeason`, để `setQueryData` không làm mất phần cọc của form lịch.
  3. `schema.ts`: `ServiceChipsBody = z.strictObject({ branchId: z.uuid().optional(), chips: z.array(z.string().trim().min(1).max(30).regex(/^[^+]*$/, 'Tên chip không chứa dấu +.')).max(20) })`.
  4. Route `src/routes/api/service-chips.ts` chỉ có `PUT`, theo đúng mẫu `src/routes/api/booking-settings.ts` (`requireAuth`, `limitWrites`, `readBody`).
  5. `src/lib/appointments.ts`: type `Settings` thêm `serviceChips: string[]`.
  6. Test `tests/acceptance/lich-dich-vu.test.ts` (theo mẫu `tests/acceptance/lich-nghi.test.ts`, cơ sở mới mã **`'CS12'`** — `branches.code` unique, CS3–CS11 đã dùng; tính năng `doi-huy-nghi-da-duyet` dùng mã khác): cơ sở mới có đủ 7 chip mặc định; giá trị trả về của `updateServiceChips` có `serviceChips` mới và có khoá `depositSeason`; chip có dấu `+` bị cả zod lẫn DB từ chối; Chủ sửa được, có audit; thợ gọi `updateServiceChips` bị `forbidden`; thợ `update branch_booking_settings set service_chips = …` trực tiếp dưới `app_user` cập nhật **0 dòng** (policy USING, không ném lỗi) và owner đọc lại thấy `service_chips` không đổi; **sau migration Chủ vẫn gọi `updateSettings` (giờ mở cửa) thành công** dưới `app_user`; mảng 21 phần tử hoặc phần tử 31 ký tự bị DB từ chối.
- Xong khi:
  - build + lint + typecheck pass
  - `GET /api/booking-settings` trả `serviceChips` có 7 chip mặc định
  - `bun run test` pass, gồm `tests/acceptance/lich-dich-vu.test.ts`
- Dừng hỏi anh: Không, trừ khi bước 0 không dựng được DB (migration chỉ chạy ở DB local/test; không triển khai)

### ☑ Gói 2 — Ô lịch Ngày/Tuần hiện dịch vụ thay SĐT
- Mục tiêu: ô lịch đọc được dịch vụ; SĐT chỉ còn ở chi tiết và màn Danh sách.
- File: sửa `src/components/lich/views.tsx`
- Các bước:
  1. `cellParts(it)`: thay `it.phone` bằng `it.serviceSummary` (thứ tự: số khách – tên – dịch vụ – giờ); sửa chú thích thành `Số khách – tên – dịch vụ – giờ (S65, thay SĐT của S10)`. `filter(Boolean)` giữ nguyên để lịch không có dịch vụ không sinh dòng trống. `aria-label` tự theo `parts`.
  2. Nhánh ô cao (`p.height >= 58`): giữ một dòng `truncate` cho mỗi phần; riêng phần dịch vụ khi `p.height >= 90` dùng `line-clamp-2 [overflow-wrap:anywhere]` thay `truncate`.
  3. `WeekGrid`: giữa tên và giờ thêm `<span>` dịch vụ `line-clamp-1 text-[12px] leading-[15px]` màu `calTone(it).sub`, chỉ khi có `serviceSummary`.
  4. Không đổi `AppointmentRows` (màn Danh sách vẫn có SĐT), không đổi `src/routes/_app/lich/$id.tsx`.
- Xong khi:
  - build + lint + typecheck pass
  - trong `views.tsx`, `cellParts` không còn `it.phone`; `AppointmentRows` vẫn có `it.phone`
  - mở `bun run dev` trên DB local (Gói 1 bước 0), đăng nhập tài khoản seed (mật khẩu `DEV_PASSWORD` sau `dev-passwords.ts`), sửa một lịch demo cho có dịch vụ; màn Ngày có lịch có dịch vụ: ô hiện tên → dịch vụ → giờ; lịch không có dịch vụ: tên → giờ, không dòng trống
- Dừng hỏi anh: Không

### ☑ Gói 3 — Form lịch: ô Dịch vụ hiện sẵn + hàng chip
- Mục tiêu: điền dịch vụ chỉ bằng chạm chip, vẫn gõ tự do được.
- File: sửa `src/lib/appointments.ts`, `src/components/lich/AppointmentForm.tsx`, `src/routes/_app/lich/index.tsx`, `src/routes/_app/lich/$id.tsx`, `tests/unit/lib.test.ts`
- Các bước:
  1. `src/lib/appointments.ts`: hàm thuần `toggleServiceChip(text: string, chip: string): string` — tách `text` theo `+` (trim từng phần, bỏ phần rỗng); có `chip` (so không phân biệt hoa thường) thì bỏ, chưa có thì thêm cuối; nối lại bằng `' + '`. Hàm `hasServiceChip(text, chip): boolean` cho trạng thái chip đang bật.
  2. Unit test trong `tests/unit/lib.test.ts` (dạng `toggleServiceChip(text, chip)` → kết quả): `('', 'Tay')` → `Tay`; `('Tay', 'Chân')` → `Tay + Chân`; `('Tay + Chân', 'Tay')` → `Chân`; `('tay úp móng', 'Tay')` → `tay úp móng + Tay` (chỉ khớp nguyên phần); `('Tay +  + Gel', 'Chân')` → `Tay + Gel + Chân`; `('Tay +  + Gel', 'Gel')` → `Tay`; `('TAY', 'Tay')` → `''`.
  3. `AppointmentForm`: thêm prop `serviceChips: string[]`. Đưa `TextField` "Dịch vụ dự kiến" ra khỏi khối `moreOpen`, đặt ngay sau ô SĐT; khối ẩn chỉ còn "Ghi chú nội bộ"; `setMoreOpen(!!props.editing?.notes)`; đổi nhãn nút "Thêm dịch vụ, ghi chú" thành "Thêm ghi chú" và chú thích dòng 81 ("…dịch vụ, ghi chú mở khi cần (S52)") thành "…ghi chú mở khi cần (S52); dịch vụ luôn hiện (S65)". Dưới ô Dịch vụ là hàng chip **cuộn ngang**, dùng đúng pattern hàng Thời lượng trong cùng file (`AppointmentForm.tsx:356-375`): `<div className="lo-chips">` + nút `cx('lo-toggle', 'label', on && 'is-on')`, `aria-pressed={hasServiceChip(...)}` (cao `--tap-min`, S52), chạm thì `set('serviceSummary', toggleServiceChip(...))`. Nếu kết quả vượt `LIMITS.service` thì không đổi và báo lỗi ngắn ở ô. Giữ Enter ở ô tên lưu như S52.
  4. `lich/index.tsx` và `lich/$id.tsx`: truyền `serviceChips={settings.data?.serviceChips ?? []}`. Danh sách rỗng thì không vẽ hàng chip.
- Xong khi:
  - build + lint + typecheck pass; unit test `toggleServiceChip` pass (`bunx vitest run tests/unit/lib.test.ts`, cần DB test của Gói 1 vì globalSetup)
  - `bun run dev` trên DB local: mở form Lịch mới: ô Dịch vụ thấy ngay, chạm Tay, Chân, Gel → ô ghi `Tay + Chân + Gel`; chạm Chân lần nữa → `Tay + Gel`; lưu xong ô lịch hiện đúng chuỗi đó
- Dừng hỏi anh: Không

### ☑ Gói 4 — Trang Cài đặt lịch: sửa bộ chip
- Mục tiêu: Linh thêm, xoá, đổi tên, đổi thứ tự chip không cần sửa code.
- File: sửa `src/routes/_app/them/cai-dat-lich.tsx`, `src/routes/_app/them/index.tsx` (tách component `src/components/lich/ServiceChipsEditor.tsx` nếu file vượt ~200 dòng)
- Các bước:
  1. Thêm mục "Chip dịch vụ" dưới phần giờ mở cửa: danh sách chip, mỗi dòng có ô sửa tên, nút lên / xuống, nút X xoá; cuối có ô + nút "Thêm"; nút "Lưu chip" riêng gọi `PUT /api/service-chips` rồi `qc.setQueryData(['booking-settings'], next)` (`next` đã có `depositSeason` nhờ Gói 1). Bộ sửa chip giữ state riêng, chỉ khởi tạo từ `s.data` lần đầu hoặc khi không có sửa dở (cờ `dirty`) — vì `useEffect([s.data])` ở `cai-dat-lich.tsx:29-34` nạp lại ô giờ mỗi khi cache đổi; tương tự, ô giờ mở cửa chỉ nạp lại khi chưa sửa dở để lưu chip không xoá giờ đang sửa.
  2. Chặn ở giao diện: tối đa 20 chip, mỗi chip 1–30 ký tự, trùng tên thì báo, có dấu `+` thì báo "Tên chip không chứa dấu +". Thông báo "Đã lưu chip dịch vụ." theo mẫu thông báo sẵn có.
  3. Mục chỉ hiện với người có `booking_settings.manage` — dùng đúng cách trang đang kiểm quyền cho phần giờ mở cửa.
  4. `src/routes/_app/them/index.tsx:182`: gợi ý mục Cài đặt lịch đổi thành `'Giờ mở cửa, chip dịch vụ, cọc, ngày đóng cửa'`.
- Xong khi:
  - build + lint + typecheck pass
  - `bun run dev` trên DB local, đăng nhập Chủ: thêm chip "Úp móng", lưu, mở form Lịch mới thấy chip đó cuối hàng
  - đăng nhập thợ: không thấy mục sửa chip; gọi thẳng `PUT /api/service-chips` nhận 403 (đã có test gói 1)
- Dừng hỏi anh: Không

### ☐ Gói 5 — Ghi quyết định S65, cập nhật tài liệu, kiểm tra cuối
- Mục tiêu: tài liệu khớp code, mọi lệnh kiểm tra chạy hết.
- File: sửa `docs/DECISIONS.md`, `CLAUDE.md`, `docs/modules/LICH_DAT_KHACH_v1_2.md` (chỉ thêm ghi chú trỏ S65 ở mục ô lịch §227 nếu file đang có ghi chú kiểu này; không thì bỏ)
- Các bước:
  1. `docs/DECISIONS.md`: thêm dòng **S65** (anh chốt 12/11/2026): ô lịch Ngày/Tuần hiện số khách – tên – dịch vụ – giờ, bỏ SĐT khỏi ô (thay phần SĐT của S10; chi tiết lịch, Danh sách vẫn có SĐT); form lịch hiện sẵn ô Dịch vụ với chip chạm nhanh nối " + "; Linh sửa chip ở Thêm → Cài đặt lịch (quyền `booking_settings.manage`), mặc định 7 chip; lý do: 2 tuần 29/10–12/11 có 166 lịch, chỉ 16 có điền dịch vụ. Migration 0037.
  2. `CLAUDE.md`: thêm S65 vào dãy "S01–S64" thành "S01–S65"; thêm một câu trạng thái "Hiện dịch vụ trên ô lịch (S65; brief, kế hoạch `docs/vibe/lich-hien-dich-vu/`) đã có code (dd/mm/2026), chưa thử trên iPhone thật."
  3. Chạy `bun run lint`, `bun run typecheck`, `bun run build`, `bun run test` (DB của Gói 1); ghi kết quả thật vào Nhật ký.
  4. Đưa anh danh sách test tay trên iPhone (theo Tiêu chí xong của brief; chuỗi mong đợi khi chạm Tay, Chân, Gel là **`Tay + Chân + Gel`** — nối " + " theo Giả định của brief, không phải "Tay + Chân · Gel").
- Xong khi:
  - build + lint + typecheck + test pass
  - `grep -n "S65" docs/DECISIONS.md CLAUDE.md` có kết quả ở cả hai file
- Dừng hỏi anh: Không (không merge vào `main`, không triển khai — anh yêu cầu riêng)

## Đối chiếu brief
| Mục trong brief | Gói |
|-----------------|-----|
| Ô lịch Ngày, Tuần: tên → dịch vụ → giờ, bỏ SĐT | 2 |
| Chi tiết lịch, Danh sách vẫn có SĐT | 2 (không đụng) |
| Form: ô Dịch vụ hiện sẵn, chip bật/tắt, gõ tự do, ≤ 200 ký tự | 3 |
| Bộ chip theo cơ sở, Linh sửa, mặc định 7 chip | 1, 4 |
| Ghi S65 vào DECISIONS | 5 |
| Tiêu chí: tạo lịch chỉ bằng chạm chip (ra `Tay + Chân + Gel`) | 3 |
| Tiêu chí: 5 lịch trùng giờ đọc được, không SĐT trên ô | 2 (thử tay trên iPhone) |
| Tiêu chí: chi tiết vẫn có SĐT, nút gọi | 2 |
| Tiêu chí: Linh thêm chip "Úp móng"; thợ bị server từ chối | 1, 4 |
| Tiêu chí: lịch không có dịch vụ không có dòng trống | 2 |
| Tiêu chí: lint, typecheck, test, build | 5 |

## Rủi ro
- Script DB nhúng chỉ chạy trên Windows (`initdb.exe`) — ở workspace dựng Postgres 16 Linux tạm (Gói 1 bước 0); không dựng được thì dừng hỏi anh.
- Số migration 0037 có thể trùng với tính năng song song `doi-huy-nghi-da-duyet` (S66) nếu nó cũng cần migration — làm tính năng nào sau thì đổi sang số kế tiếp trước khi gộp vào `main`.
- CHECK gọi hàm `app.valid_service_chips` cần `grant execute` cho `app_user`, thiếu là hỏng cả lưu giờ mở cửa — có test riêng ở Gói 1.
- Ô màn Tuần chỉ rộng ~50px: thêm dòng dịch vụ làm ô cao hơn — dùng `line-clamp-1`, thử bằng `bun run dev` khung 390px.
- Migration thêm cột có mặc định trên bảng đang có dữ liệu thật: an toàn (Postgres 16 thêm cột có default không ghi lại bảng), nhưng chỉ áp lên hosting khi anh triển khai.
- Lịch cũ có dịch vụ lẫn trong tên vẫn hiện như cũ (không tự sửa, theo S40) — ô lịch cũ chỉ thiếu dòng dịch vụ, không lỗi.
- `toggleServiceChip` có thể tách nhầm chữ tự do có dấu `+` của nhân viên — chỉ bỏ/thêm phần khớp nguyên chip, phần khác giữ nguyên chữ.

## Giả định
- Quyền sửa chip dùng `booking_settings.manage` sẵn có; không thêm quyền mới.
- Mục sửa chip nằm trong trang Thêm → Cài đặt lịch.
- Chip so khớp không phân biệt hoa thường; lưu đúng chữ Linh nhập.
- Giới hạn 20 chip, mỗi chip 30 ký tự.
- Ô Dịch vụ đặt ngay sau ô SĐT trong form.
- Ô màn Ngày: dịch vụ một dòng, ô cao từ 90px cho hai dòng.
- MCP không thêm tool chip (Để sau). `serviceChips` nằm trong `loadSettings` nên `lindy_list_appointments` tự có thêm trường `serviceChips` chỉ đọc — chấp nhận (bỏ khỏi `loadSettings` sẽ làm `PUT /api/booking-settings` trả về mất chip).

## Phản biện
2 vòng (12/11/2026), 17 lỗi: tự sửa 17, anh quyết 0, bác bỏ 0. Quan trọng nhất: `grant execute` cho hàm trong CHECK (thiếu sẽ hỏng cả lưu giờ mở cửa); dựng DB test bằng cụm Postgres 16 có sẵn (không `.pgdata`, không initdb dưới root) và bắt buộc `bun run test`; API chip gọi `getSettings` sau khi commit; cấm dấu `+` trong tên chip.
Chi tiết: ./review.md

## Nhật ký triển khai
- 12/11 15:46 · Bắt đầu · nhánh vibe/lich-hien-dich-vu · chuẩn: build + lint + typecheck pass (test chờ DB ở Gói 1 bước 0)
- 12/11 15:50 · Bước 0: Postgres 16 có sẵn (cụm 16/main) + PG_ADMIN_URL; bootstrap, migrate, seed, dev-passwords, demo-data; test hiện trạng 508/509 (backup.test.ts lỗi giờ chập chờn, chạy riêng pass)
- 12/11 15:50 · ☑ Gói 1 — Dựng DB test, cột service_chips + API + test quyền · lint, typecheck, build pass; test 514/514 · Lệch plan: kiểm '+', độ dài, trùng cả ở updateServiceChips (lỗi 422 rõ), grant execute thêm cho app_worker (đọc cài đặt)
- 12/11 15:53 · ☑ Gói 2 — Ô lịch Ngày/Tuần hiện dịch vụ thay SĐT · lint, typecheck, build pass; xem bằng Chrome headless 390px trên DB local: Ngày tên → dịch vụ (2 dòng) → giờ, Tuần thêm dòng dịch vụ · Lệch plan: bỏ class block khi line-clamp-2 (block ghi đè -webkit-box làm dịch vụ tràn, đẩy mất giờ)
- 12/11 15:54 · ☑ Gói 3 — Form lịch: ô Dịch vụ hiện sẵn + hàng chip · lint, typecheck, build pass; unit 28/28; thử Chrome headless (tài khoản thợ): chạm Tay, Chân, Gel → "Tay + Chân + Gel", chạm Chân → "Tay + Gel" · Lệch plan: bỏ role="group" ở hàng chip (biome a11y đòi fieldset), giống hàng Thời lượng
- 12/11 15:56 · ☑ Gói 4 — Trang Cài đặt lịch: sửa bộ chip · lint, typecheck, build pass; Chrome headless: Linh thêm "Úp móng" → lưu → form lịch có chip; "Tay + Chân" bị chặn; thợ PUT /api/service-chips → 403, không thấy mục · Lệch plan: tách ServiceChipsEditor.tsx ngay (trang sẽ quá 200 dòng); chip đang sửa có id riêng để giữ focus, không dùng index làm key
