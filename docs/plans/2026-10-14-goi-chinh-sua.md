# Kế hoạch Đợt 6 — Gói chỉnh sửa sau Đợt 5

**Ngày:** 14/10/2026 · **Trạng thái:** ĐÃ DUYỆT 14/10/2026. Q-N theo đề xuất (S15), Q-O chọn (c) bỏ mọi màn và chỉ tạo đơn từ lịch (S16), Q-P theo đề xuất (S17). `[x]` xong và đã kiểm; `[~]` làm một phần; `[ ]` chưa làm.
**Nguồn:** 11 yêu cầu của anh (14/10/2026); Phiếu 4 `docs/surveys/04-phieu-chinh-sua.md`; `docs/DECISIONS.md` S01–S14 (thắng B02–B04, B06, B08 phần ô lịch, G11); module lịch v1.2; PRD v1.2.

## 1. Hiểu yêu cầu

Gói sửa sau khi chạy thử, gồm 6 phần:

- **6A Giao diện chung:** cả app dùng Be Vietnam Pro, riêng chữ LINDY giữ chữ có chân (S13). Mọi hộp thoại, bảng trượt đóng bằng nút X ở góc (S05).
- **6B Màn lịch:** bỏ bước chốt lịch (S02). Chi tiết lịch chỉ còn Sửa lịch · Tạo đơn · Huỷ lịch, huỷ có chọn lý do (S03). Nhân viên thường bấm Huỷ thì gửi yêu cầu (S04). Lịch thấp hơn, phóng to/thu nhỏ bằng hai ngón, vuốt sang ngày bên cạnh, ô lịch theo thứ tự số khách – tên – SĐT – giờ (S10). Bỏ nút tròn "+ Tạo đơn" (S11).
- **6C Lịch nhiều khách:** tạo đơn ra đủ N đơn ngang nhau, hỏi tên từng khách (S06), cọc chia đều (S07), số đơn luôn bằng số khách (S08).
- **6D Tài khoản:** xoá tài khoản (S01).
- **6E Trang chủ:** chỉ số chữ to, biểu đồ 30 ngày, thẻ Cần xử lý gộp; làm cho mọi vai trò (S14).
- **6F Dữ liệu dùng thử:** Chủ nạp gói thử trên app thật; bấm "Xoá, bắt đầu dùng thật" một lần (S12).

## 2. Hiện trạng liên quan (14/10/2026)

| Có sẵn | Ảnh hưởng |
|---|---|
| Lịch có 7 trạng thái; `pending` = "Mới đặt", nút Chốt lịch, Tạo và chốt; nhân viên thường chỉ sửa, tự huỷ lịch **mình tạo khi còn pending** (`src/server/appointments/policy.ts`, trigger `appointments_guard`) | Bỏ `pending` làm nhân viên thường **không còn sửa được lịch nào** → cần chốt Q-N |
| Chi tiết lịch 8 nút (`src/routes/_app/lich/$id.tsx`) | Còn 3 nút |
| Tạo đơn từ lịch: 1 đơn, thêm đơn bằng "Tạo thêm đơn" (`createOrderFromAppointment`); cọc trừ vào đơn xong trước (`app.apply_deposits`) | Đổi sang N đơn, cọc chia đều |
| Trục giờ 64px/giờ, 0–24h, chạm chỗ trống để tạo lịch, nút "+" tạo lịch (`src/components/lich/views.tsx`) | Thấp hơn, zoom, vuốt |
| Nút tròn "+ Tạo đơn" nổi ở **mọi màn** trừ màn đơn (`src/routes/_app.tsx`); đây là **lối duy nhất** tạo đơn cho khách vãng lai | Cần chốt Q-O |
| `ConfirmDialog` có nút "Thôi", `Sheet` có nút "Đóng"; thêm 2 chỗ tự viết nút "Thôi" (`OrderEditor.tsx`, `nhan-vien.tsx`) | Đổi sang X |
| Font: `tokens.json` → `tokens.css` (sinh bằng `scripts/gen-tokens.ts`); tiêu đề, số tiền lớn, wordmark dùng Cormorant Garamond | Đổi token |
| Tài khoản: khoá, thu quyền; không xoá | Thêm xoá |
| Tổng quan (`src/routes/_app/index.tsx`, `overview()`): thẻ doanh thu, quỹ, cọc, 4 nhóm Cần xử lý, doanh thu thợ, lịch hôm nay | Làm lại bố cục |
| `scripts/demo-data.ts`: chỉ chạy trên DB `_dev`, dùng tài khoản `@lindy.test` | Viết bộ nạp mới chạy trên server, dùng tài khoản thật |
| 33 bảng có trigger chặn TRUNCATE/DELETE (chỉ thêm, không xoá) | Hàm xoá dữ liệu thử phải tạm tắt trigger trong cùng giao dịch |

## 3. Điểm cần anh chốt khi duyệt

**Q-N. Nhân viên thường được sửa lịch nào?** Trước đây chỉ sửa lịch mình tạo khi còn "Mới đặt". Bỏ bước chốt thì không còn lịch "Mới đặt".
- **(a) Đề xuất:** sửa được lịch **do mình tạo**, khi lịch **chưa tạo đơn và chưa đến giờ hẹn**. Lịch khác nhờ Linh, Nhung, Chin.
- (b) Không sửa lịch nào; mọi thay đổi nhờ Linh, Nhung, Chin.
- (c) Sửa được mọi lịch chưa tạo đơn.

Chặn bước 6B.1.

**Q-O. Bỏ nút tròn "+ Tạo đơn" ở đâu?** Nút này đang hiện ở mọi màn và là cách duy nhất tạo đơn cho khách vãng lai (không đặt lịch).
- **(a) Đề xuất:** bỏ ở **màn Lịch và chi tiết lịch** (ở đây tạo đơn từ lịch). Giữ ở Tổng quan, Đơn hàng, Khách cho khách vãng lai.
- (b) Bỏ ở mọi màn; khách vãng lai tạo đơn bằng nút "+ Tạo đơn" trên đầu màn Đơn hàng.
- (c) Bỏ hẳn tạo đơn ngoài lịch: khách vãng lai cũng tạo lịch rồi bấm Tạo đơn.

Chặn bước 6B.6.

**Q-P. Hồ sơ nhân viên và mức lương khi bấm "Xoá, bắt đầu dùng thật".** Gói thử tạo hồ sơ (ngày vào làm, lương cứng, % hoa hồng) để có lương tạm tính.
- **(a) Đề xuất:** xoá cùng dữ liệu thử. Sau khi xoá, Linh nhập hồ sơ thật ở Thêm → Nhân viên (đã có trong việc cần làm trước khi chạy thật).
- (b) Giữ hồ sơ và mức lương; Linh sửa cho đúng ngay trong lúc thử.

Chặn bước 6F.3.

**Em tự quyết, anh xem có đồng ý không:**
- **Trang chủ của thợ** dùng cùng bố cục nhưng là **số của chính người đó**: doanh thu của mình hôm nay, khách mình làm hôm nay, doanh thu tháng của mình, lương tạm tính, biểu đồ 30 ngày của mình. Thợ không thấy tiền quỹ, doanh thu quán (K09). Nhung thấy 5 chỉ số và biểu đồ của quán. Linh thấy thêm lãi tạm tính ở dưới (test 27).
- **"Số khách hôm nay"** đếm theo K13 (1 đơn đã xác nhận = 1 lượt khách), dòng phụ ghi thêm số đơn đang làm và chờ xác nhận.
- **Cỡ lịch:** mặc định 48px/giờ (hiện 64). Hai ngón tay phóng to, thu nhỏ trong khoảng 28–120px/giờ. App nhớ cỡ đã chọn trên từng máy.
- **"Khách báo huỷ"** khi chọn ở hộp Huỷ: người có quyền huỷ thì huỷ luôn; nhân viên thường thì thành yêu cầu (S04). Cọc còn giữ vẫn vào Cần xử lý để Nhung hoàn hoặc giữ như hiện nay (C03).
- **Lịch nhiều khách:** Khách 1 điền sẵn tên, SĐT người đặt. Khách để trống tên thì đơn ghi "Khách đi cùng" + tên người đặt và **không tạo hồ sơ khách** (CRM không bị rác). Khách có ghi tên thì tạo hoặc gắn hồ sơ như hiện nay.
- **Gói dữ liệu thử** chỉ nạp được khi app chưa có đơn, lịch, sổ tiền (tránh nạp trùng). Sau khi bấm "Xoá, bắt đầu dùng thật" thì cả hai nút khoá vĩnh viễn. Nhật ký thao tác (audit) **giữ lại**, thêm một dòng "đã xoá dữ liệu thử".

## 4. Thay đổi dữ liệu

Số migration đánh theo thứ tự làm (6D làm trước 6B).

| Migration | Nội dung |
|---|---|
| `0021_booking_simplify.sql` | Lịch `pending` đang có → `confirmed` (ghi audit). Trigger không cho tạo/chuyển về `pending`. Không thêm cột: lý do chọn trong hộp Huỷ ghi vào `cancel_reason` ("Khách báo huỷ: …"), "Khách không đến" chuyển trạng thái `no_show` (chỉ khi đã đến giờ hẹn). Luật sửa của nhân viên thường theo S15. Yêu cầu huỷ của nhân viên dùng lại cờ "khách báo huỷ" (B07). |
| `0022_group_orders.sql` | `orders.guest_no` (1…4), `orders.guest_label` (tên hiển thị khi không có hồ sơ). Ràng buộc: một lịch không có hai đơn chưa huỷ cùng `guest_no`; số đơn chưa huỷ ≤ `guest_count`. Giảm `guest_count` thấp hơn số đơn chưa huỷ thì bị chặn. `app.apply_deposits` trừ mỗi đơn tối đa phần chia đều (`tổng cọc ÷ số khách`, phần lẻ vào Khách 1). |
| `0020_account_delete.sql` (đã làm) | `users.deleted_at`. Hàm `app.admin_delete_user`: xoá phiên, quyền, đăng ký thông báo; thử xoá hẳn người dùng, gặp ràng buộc khoá ngoại (đã có dữ liệu, kể cả nhật ký đăng nhập) thì xoá SĐT, email, mật khẩu, khoá, thu quyền và đánh dấu đã xoá. Không xoá chính mình. |
| `0023_demo_data.sql` | Bảng `demo_state` (chưa nạp / đã nạp / đã dùng thật). Hàm `app.demo_golive_wipe()` (quyền chủ DB, chỉ người có `users.manage` gọi): trong một giao dịch tạm tắt trigger chặn xoá, TRUNCATE các bảng nghiệp vụ, đặt lại số đơn về 1, bật lại trigger, ghi audit. |

**Giữ lại khi xoá dữ liệu thử:** tổ chức, chi nhánh, tài khoản, mật khẩu, phiên, vai trò, quyền, dịch vụ, combo, lịch sử giá, nhóm chi, tài khoản tiền (tên), cài đặt lịch, ngày quán đóng cửa, KPI, tuỳ chọn và đăng ký thông báo, nhật ký thao tác. Hồ sơ, mức lương nhân viên theo Q-P.
**Xoá:** lịch, cọc, mùa cọc, khách, đơn và mọi bảng con, thanh toán, hoàn, tip, sổ tiền, mở sổ, thu chi, chốt quỹ, ảnh chứng từ, chấm công, nghỉ phép, kỳ lương, phiếu lương, tạm ứng, điều chỉnh, bản chụp báo cáo, dữ liệu nhập cũ, thông báo.

## 5. Các bước

Thứ tự: 6A → 6D → 6B → 6C → 6E → 6F (gói thử làm cuối để dùng đúng luồng mới). Mỗi phần commit riêng; xong mỗi phần chạy `bun run check` và `bun run build`.

### 6A — Giao diện chung
- [x] **6A.1** `tokens.json`: `font-display` → Be Vietnam Pro (700 cho tiêu đề, số tiền); thêm `font-brand` = Cormorant Garamond chỉ cho `.wordmark`. Chạy `bun scripts/gen-tokens.ts`. Font Google chỉ tải Cormorant 600. Sửa `design/design-system/README.md`. *Kiểm:* mở Tổng quan, Đơn, Lịch trên trình duyệt; đo `font-family` của `.screen-title`, `.display-money`, `.wordmark`.
- [x] **6A.2** `ConfirmDialog`: bỏ "Thôi", thêm nút X góc phải trên (vùng chạm 44px, `aria-label="Đóng"`), nút hành động rộng hết hàng. `Sheet`: "Đóng" → X. Sửa 2 chỗ tự viết nút "Thôi". *Kiểm:* mở hộp huỷ lịch, hộp tài khoản, bảng tạo lịch; bấm X, bấm nền tối, phím Esc đều đóng.

### 6D — Xoá tài khoản
- [x] **6D.1** Migration 0020 + `deleteAccount()` + `POST /api/accounts/:id/delete`. *Kiểm:* test bảo mật: chỉ Chủ gọi được; không xoá chính mình, Chủ cuối cùng; tài khoản trống bị xoá hẳn; tài khoản có đơn còn tên trong đơn, không đăng nhập được, SĐT tạo lại được.
- [x] **6D.2** Nút "Xoá tài khoản" trong bảng tài khoản, hộp xác nhận nói rõ xoá hẳn hay chỉ xoá đăng nhập. Danh sách tài khoản, Nhân viên, ô chọn thợ ẩn người đã xoá. *Kiểm:* thao tác trên trình duyệt.

### 6B — Màn lịch
- [x] **6B.1** Migration 0021; `policy.ts`, `service.ts` bỏ `confirm`, `pending`; luật sửa theo Q-N. Bỏ thông báo "lịch chờ chốt", bỏ "Mới đặt" khỏi bộ lọc, Tổng quan, Cần xử lý. *Kiểm:* sửa test `lich-dat.test.ts` theo S02, S04; lịch cũ `pending` thành `confirmed` sau migrate.
- [x] **6B.2** Chi tiết lịch còn 3 nút. Hộp Huỷ: chọn lý do (Khách báo huỷ / Khách không đến / Lý do khác) + ghi chú; nhân viên thường thì nút gửi yêu cầu. Lý do "Khách không đến" chỉ chọn được khi đã qua giờ hẹn. *Kiểm:* test API theo vai trò; thao tác trên trình duyệt với tài khoản Linh và thợ.
- [ ] **6B.3** Ô lịch: số khách – tên – SĐT – giờ, dấu "chưa cọc"; ô thấp thì cắt bớt từ phải sang. Thông báo đẩy vẫn không có SĐT. *Kiểm:* xem lịch 1 khách, nhóm 3 khách, ô 30 phút.
- [ ] **6B.4** Mặc định 48px/giờ; phóng to/thu nhỏ bằng hai ngón (giữ mốc giờ dưới ngón tay, chặn phóng to cả trang trong vùng lịch), nhớ cỡ trên máy. *Kiểm:* mô phỏng thao tác hai ngón trên trình duyệt; anh thử trên iPhone.
- [ ] **6B.5** Vuốt trái/phải: màn Ngày sang ngày bên cạnh, màn Tuần sang tuần bên cạnh; chỉ nhận khi vuốt ngang rõ ràng (≥ 60px, góc < 30°), không bắt đầu sát mép trái 24px (tránh vuốt "quay lại" của Safari); chạm chỗ trống vẫn tạo lịch. *Kiểm:* mô phỏng chạm trên trình duyệt; anh thử trên iPhone.
- [ ] **6B.6** Bỏ nút tròn "+ Tạo đơn" ở mọi màn và màn `/don-hang/tao` (S16). API `POST /api/orders` từ chối đơn không gắn lịch; chỗ đang trỏ tới màn tạo đơn rời (ví dụ "Dùng + Tạo đơn" trong thông báo lỗi) đổi sang hướng dẫn tạo lịch. Gói thử (6F) tạo đơn qua lịch. *Kiểm:* xem từng màn; test API tạo đơn không có lịch bị từ chối.

### 6C — Lịch nhiều khách
- [ ] **6C.1** Migration 0022; `createOrderFromAppointment` tạo đủ các đơn còn thiếu trong một giao dịch, nhận tên/SĐT từng khách, giữ chống bấm hai lần. Bỏ tham số `additional`. *Kiểm:* test: lịch 2 khách ra đúng 2 đơn; bấm lại không ra thêm; tăng số khách lên 3 rồi bấm Tạo đơn ra đơn thứ 3; giảm số khách khi còn 3 đơn bị chặn.
- [ ] **6C.2** Bảng "Tạo đơn" hỏi tên từng khách (Khách 1 điền sẵn), tạo xong về chi tiết lịch có danh sách Khách 1…N để mở từng đơn. Lịch 1 khách: bấm là vào thẳng đơn như hiện nay. Đơn hiện "Khách 2/2 · lịch 10:00". *Kiểm:* thao tác trên trình duyệt.
- [ ] **6C.3** Cọc chia đều. *Kiểm:* test `coc-tet.test.ts`: cọc 200.000đ lịch 2 khách, mỗi đơn trừ 100.000đ dù đơn nào xong trước; cọc 300.000đ lịch 3 khách huỷ 1 đơn thì phần đơn huỷ vẫn nằm trong Cần xử lý cọc.

### 6E — Trang chủ
- [ ] **6E.1** `overview()` thêm doanh thu từng ngày 30 ngày gần nhất (quán hoặc của chính thợ, theo quyền). *Kiểm:* test: thợ chỉ nhận số của mình, Nhung không nhận lãi.
- [ ] **6E.2** Bố cục mới: hàng chỉ số chữ to (2 cột trên iPhone), biểu đồ cột 30 ngày, thẻ "Cần xử lý: N việc" mở danh sách chi tiết, chấm công, lịch hôm nay gọn. *Kiểm:* chụp màn hình 375px sáng/tối với tài khoản Linh, Nhung, thợ.

### 6F — Dữ liệu dùng thử
- [ ] **6F.1** Bộ nạp gói thử chạy trên server qua các service của app (như `scripts/demo-data.ts`), dùng tài khoản thật đang có trong cơ sở: 7 ngày trước đến 7 ngày sau; khoảng 50 đơn có thanh toán, giảm giá, chờ xác nhận; lịch nhóm, lịch có cọc (mùa cọc thử); mở sổ, thu chi, chốt quỹ; chấm công, hồ sơ và mức lương (Q-P), tạm ứng. Tên khách, SĐT giả `0900000xxx`. *Kiểm:* test nạp trên DB test rồi kiểm số lượng, báo cáo tháng không lỗi.
- [ ] **6F.2** Màn Thêm → Dữ liệu dùng thử (chỉ Chủ): "Nạp dữ liệu thử" khi còn trống; "Xoá, bắt đầu dùng thật" phải gõ `XOA DU LIEU THU`. *Kiểm:* thao tác trên trình duyệt local.
- [ ] **6F.3** Migration 0023 + `app.demo_golive_wipe()`. *Kiểm:* test: sau khi xoá, mọi bảng nghiệp vụ trống, bảng giữ lại không đổi số dòng, số đơn mới bắt đầu từ 1, đăng nhập vẫn được, gọi lần hai bị từ chối, thợ và Nhung gọi bị từ chối, trigger chặn xoá bật lại đầy đủ.

## 6. Không làm

- Kiểu xem 3 ngày (S10). Chặn trùng khách (S09 chỉ cảnh báo).
- So sánh với hôm qua / cùng kỳ, biểu đồ 7 ngày (anh chỉ chọn 30 ngày).
- Đổi logo, biểu tượng app. Đổi màu.
- Triển khai lên Mắt Bão: làm sau khi anh thử local, khi anh yêu cầu.

## 7. Thế nào là xong

- 6 phần đúng S01–S14 và câu trả lời Q-N, Q-O, Q-P.
- `bun run check` (lint, typecheck, toàn bộ test) và `bun run build` đều qua; test cũ được sửa theo quyết định mới, không xoá test chỉ để cho qua.
- Kiểm trên trình duyệt ở cỡ iPhone (375px), sáng và tối. Thao tác hai ngón, vuốt và Web Push cần anh thử trên iPhone thật; em ghi rõ phần nào chưa thử được.

## 8. Rủi ro và cách quay lại

| Rủi ro | Cách xử lý |
|---|---|
| Bỏ `pending` làm hỏng luật quyền cũ ở DB | Giữ giá trị `pending` trong ràng buộc để không đổi lịch sử audit; trigger chỉ chặn tạo mới. Test quyền chạy lại toàn bộ. |
| Xoá dữ liệu thử xoá nhầm bảng cần giữ | Danh sách bảng xoá viết tường minh, không dùng CASCADE rộng; test so số dòng bảng giữ lại trước/sau. Trước khi bấm trên Mắt Bão, bật sao lưu của Vibe Host. |
| Zoom hai ngón và vuốt đụng cử chỉ của Safari | Chỉ bắt cử chỉ trong vùng lịch; tránh mép trái; anh thử trên iPhone trước khi triển khai. |
| Chia cọc lệch khi tổng cọc không chia hết | Chia theo số nguyên VND, phần lẻ vào Khách 1; test cho trường hợp lẻ. |
| Migration lỗi trên hosting | Release chạy migration trước khi bật server; lỗi thì Vibe Host giữ bản đang chạy (T04). Mỗi phần một commit, quay lại bằng `git revert`. |
