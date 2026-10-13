# Kế hoạch Đợt 2 — Đơn hàng

**Ngày:** 13/10/2026 · **Trạng thái:** ĐÃ DUYỆT 13/10/2026 (Q-A chọn a → K12, Q-B chọn a → K13), đang làm. `[x]` xong và đã kiểm; `[~]` làm một phần; `[ ]` chưa làm.
**Nguồn:** `CLAUDE.md`; `docs/DECISIONS.md` (mới nhất: K09–K11); PRD v1.2 §4, §5, §6, §10, §11, §12, §13, §14, §17, §18; module lịch v1.2 §5.3, §5.4, §10, §12, §13 (test 26–28); `data/services.csv`, `data/combos.csv`; `design/design-system/` (Fab, Money, SummaryCard, OrderRow).

Ký hiệu `[Pn]`: điểm phản biện số n ở mục 11 (nối tiếp P1–P25 của Đợt 0–1). `Sn`: test bảo mật ở mục 10.2.

## 1. Hiểu yêu cầu

Làm phân hệ đơn hàng trên nền Đợt 0–1, đúng PRD §17 Đợt 2: danh mục dịch vụ và combo; tạo đơn bằng danh sách tích chọn có tìm kiếm thông minh; chia tiền cho thợ; giảm giá duyệt theo tổng %; phụ thu; bảo hành; xác nhận bill; ghi tiền thu; hồ sơ khách; tạo đơn từ lịch; Tổng quan và báo cáo doanh thu. Mục tiêu nghiệp vụ: **thay tab doanh thu trên Google Sheets**.

Đợt này lớn gấp đôi Đợt 1 nên chia hai phần, mỗi phần kiểm tra được riêng:

- **2A — Bán hàng:** danh mục (nạp sẵn), khách, tạo và sửa đơn, chia thợ, giảm giá và duyệt, Làm xong, xác nhận, thu tiền, tạo đơn từ lịch, danh sách và chi tiết đơn. Xong 2A là ghi được bill thật.
- **2B — Hoàn thiện:** tab Khách, phiếu xử lý bảo hành và ưu đãi bù khiếu nại, sửa đơn đã xác nhận, Tổng quan có số tiền, báo cáo doanh thu, màn cài đặt danh mục của Linh.

**Vì sao làm ngay:** Đợt 3 (cọc Tết) phải xong trước 19 tháng Chạp (PRD: khoảng cuối tháng 1/2027, còn khoảng 15 tuần). Cọc trừ vào bill nên cần Đợt 2 xong trước.

## 2. Hiện trạng (13/10/2026)

Dùng lại được từ Đợt 0–1:

| Có sẵn | Dùng cho Đợt 2 |
|---|---|
| `withUser`/`withWorker`, RLS, `app.has_perm`, role `app_user` không có DELETE | Mọi bảng đơn hàng theo cùng mẫu |
| Mẫu trigger kiểm quyền theo cột và chuyển trạng thái (`appointments_guard`) | `orders_guard` |
| Chống tạo trùng bằng `create_request_id` + hash nội dung; `version`/409 | Tạo đơn, lưu đơn, thu tiền |
| `handle`, `readBody` (zod strict), `limitWrites`, lỗi tiếng Việt | API đơn hàng |
| Outbox, SSE (`pg_notify('lindy_events')`) | Cập nhật tức thời danh sách đơn |
| `lib/money.ts` (`formatVND`, `parseVND`), `lib/text.ts` (bỏ dấu), `lib/phone.ts` (K06) | Tiền, tìm kiếm, SĐT khách |
| `seedBase` chạy cả trên hosting (K08) | Nạp danh mục, tài khoản tiền, quyền mới |
| Cột `appointments.customer_id` để trống chờ Đợt 2; trạng thái `in_progress` đã có nhưng trigger chặn | Liên kết khách, đồng bộ lịch ↔ đơn |

Còn treo của Đợt 1, không chặn Đợt 2: Web Push gửi thật và test 21–23 trên iPhone (thử trên tên miền Vibe Host theo K07).

## 3. Quyết định đã có và điểm cần chốt khi duyệt

**Đã chốt khi lập kế hoạch** (ghi ở `DECISIONS.md`):
- **K09:** Thợ thấy đơn mình tạo và đơn có phần mình làm. Linh, Nhung thấy mọi đơn.
- **K10:** Sau Làm xong chỉ Nhung, Linh sửa đơn.
- **K11:** Tạo đơn là Đang làm luôn; không có nút "Bắt đầu làm".

**Cần chốt khi duyệt kế hoạch** (tài liệu mâu thuẫn hoặc thiếu; không tự đoán):

**Q-A. Sửa giá thấp hơn khoảng hoặc thấp hơn giá niêm yết.** Test 46: Phá móng cũ (20.000–50.000đ) sửa thành 15.000đ, tức giảm 5.000đ, bằng 25% dòng, "cần lý do và **Nhung duyệt**". Nhưng C15 nói tổng % gồm mọi khoản giảm, trên 20% thì **Linh duyệt**.
- **(a) Đề xuất:** khoản giảm do sửa giá thấp hơn khoảng hoặc niêm yết **luôn cần Nhung (hoặc Linh) duyệt** và **không** tính vào bậc %. Các khoản giảm khác (5%, 10%, sinh nhật, bù khiếu nại, giảm tay) vẫn theo bậc C15. Khớp test 46.
- (b) Tính vào tổng % như C15: 25% thì Linh duyệt. Sửa lại test 46.

Chặn bước 2.4.

**Q-B. "Lượt khách"** (§5.2 "12 đơn | 15 lượt", §11 báo cáo ngày) chưa có định nghĩa.
- **(a) Đề xuất:** 1 đơn = 1 lượt khách.
- (b) Đơn có ô "số khách" (mặc định 1) cho bill nhóm trả chung; lượt = tổng số khách.
- (c) Lượt = số lượt thợ làm (mỗi thợ trên một đơn tính 1 lượt).

Chặn bước 2.20, 2.21.

## 4. Lựa chọn kỹ thuật

| Việc | Đề xuất | Phương án khác | Lý do |
|---|---|---|---|
| Lưu đơn | Mỗi lần Lưu gửi **cả đơn** (dòng, giảm giá, chia thợ) kèm `version`; server tính lại toàn bộ tiền | PATCH từng dòng | Một giao dịch, một lần kiểm bất biến, một bản lịch sử trước/sau; ít request trên 4G |
| Tính tiền | Hàm thuần dùng chung `src/lib/order-math.ts`: máy khách hiện tổng ngay khi tích chọn; server tính lại và **bỏ mọi số tiền máy gửi lên** [P26] | Chỉ tính ở server | Thợ thấy tổng ngay, không chờ mạng; server vẫn là nguồn đúng |
| Kiểm bất biến ở DB | Constraint trigger `DEFERRABLE INITIALLY DEFERRED` trên `orders`, kiểm khi commit: Σ dòng = tổng đơn; chia thợ khớp; Σ thu ≤ phải thu; mức duyệt giảm giá; cơ sở hoa hồng | Chỉ kiểm ở code | Như Đợt 1: bắt lỗi quên kiểm trong code |
| Bỏ dòng khi sửa đơn | Đánh dấu `removed_at`, không DELETE; lịch sử lưu ảnh chụp cả đơn trước/sau | Cho DELETE dòng của đơn chưa xác nhận | Giữ quy tắc `app_user` không có DELETE |
| Danh mục | Dùng chung cả tổ chức. Nạp từ `data/*.csv` (sinh sẵn thành `src/server/ops/catalog-data.ts` bằng `scripts/gen-catalog.ts`) trong `seedBase`, chạy cả trên hosting; chỉ thêm khi chưa có, **không ghi đè** giá Linh đã sửa | Nạp riêng ở local | Hosting không có dòng lệnh (K08) |
| Tìm dịch vụ | Lọc ở máy khách (khoảng 32 mục): bỏ dấu + chữ cái đầu ("tdc", "sgt") | Tìm ở server | Kết quả tức thì; không tốn request |
| Khách | Bảng `customers` theo tổ chức (hồ sơ chung mọi cơ sở, test 26); đơn thuộc cơ sở | Theo cơ sở | Đúng test 26 |
| Doanh thu | Tính từ đơn Đã xác nhận theo `service_date` bằng view SQL; chưa có bảng `revenue_entries` | Tạo `revenue_entries` ngay | Loại "cọc bỏ hẹn" có ở Đợt 3; thêm bảng khi cần |
| Mã đơn | Bộ đếm theo cơ sở trong bảng `order_counters`, khoá dòng khi cấp số | Sequence của PostgreSQL | Sequence nhảy số khi rollback; khoá dòng thì liên tục |

## 5. Thế nào là xong

**2A xong khi:**
- `bun run check` xanh; `bun run build` chạy bằng Node; `scan-bundle` sạch.
- Test PRD §18 tự động và đạt: **1, 3, 4, 15, 17, 21, 26, 28, 30, 31, 32, 43, 45, 46, 47, 48, 49, 50, 51, 52**. Test 33, 34 đạt phần **cơ sở hoa hồng**; số tiền hoa hồng cần % hoa hồng (Đợt 4).
- Test module lịch **26, 27, 28** tự động và đạt.
- Test bảo mật S19–S28 đạt.
- Thử tay ở 375×812, sáng và tối: tạo đơn khách lẻ 1 dịch vụ 1 thợ ≤ 5 lần chạm từ "+ Tạo đơn" đến "Làm xong"; không cuộn ngang.

**2B xong khi:**
- Test PRD §18 **16, 33** (phần ưu đãi bù khiếu nại), **20** (không cuộn ngang ở màn tạo đơn, nhận tiền, báo cáo) đạt.
- S29, S30 đạt; số trên Tổng quan khớp báo cáo cùng ngày.
- Cập nhật `docs/CHAY_LOCAL.md`, `CLAUDE.md`; báo kết quả thật, kể cả phần chưa kiểm.

## 6. Phạm vi

**Làm:** như mục 1.

**Không làm ở đợt này:**
- Hoàn tiền, phiếu hoàn, huỷ đơn đã xác nhận → **Đợt 3** (hoàn tiền làm giảm tài khoản tiền, đi cùng sổ quỹ). Đợt 2 trạng thái thu tiền chỉ có Chưa thu / Thu một phần / Đã thu đủ.
- Số dư tài khoản, đối soát chuyển khoản, sổ quỹ, chốt ngày, tip giữ hộ, tiền cọc → Đợt 3. Đợt 2 chỉ tạo sẵn 2 tài khoản để gắn khoản thu.
- Số tiền hoa hồng, KPI, lương, khoá kỳ → Đợt 4. Đợt 2 lưu sẵn `commission_base_amount` từng dòng chia thợ.
- Xuất CSV/XLSX/PDF, báo cáo tháng đầy đủ, nhập dữ liệu Sheets cũ → Đợt 5.
- Voucher, VIP, ngày sinh khách, gộp hồ sơ khách trùng (D10, D12, test 16).
- Thông báo push cho đơn hàng: PRD không có. Đơn chờ xác nhận hiện trong Cần xử lý.
- Thợ xem danh sách khách của người khác ngoài phạm vi K09.

## 7. Dữ liệu

### 7.1. `0006_catalog`

- `services`: `organization_id`, `code` (CB01…), `category`, `name`, `price_mode` (`list`/`custom`), `unit` (lần/ngón/hình/cái), `price_min`, `price_max` (số nguyên VND, `min ≤ max`, list thì bằng nhau), `has_hardening` (CB03, CB04), `warranty_days`, `is_active`, `sort_order`.
- `combos` (giá cố định, C07), `combo_items` (dịch vụ thành phần; `has_hardening` của combo suy từ thành phần → combo 139k bảo hành 7 ngày).
- `service_price_history`: chỉ thêm; mỗi lần đổi giá ghi giá cũ/mới, người đổi, thời điểm.
- RLS: đọc khi có cơ sở thuộc tổ chức; ghi chỉ qua hàm `SECURITY DEFINER` kiểm `catalog.manage`, có audit.

### 7.2. `0007_customers`

- `customers`: `organization_id`, `name` (≤ 100), `phone` (null được, chuẩn hoá K06, **không unique**, Q06), `search_norm`, `created_by/at`, `updated_by/at`, `version`. Không có trường khác (D10, invariant 10).
- `customer_audit_events`: chỉ thêm.
- `appointments.customer_id` → khoá ngoại tới `customers`.

### 7.3. `0008_orders`

- `order_counters` (`branch_id`, `last_no`).
- `orders`: `branch_id`, `code` (số tăng dần theo cơ sở), `customer_id` (null = khách lẻ), `appointment_id` (null được), `service_date` (ngày theo giờ Việt Nam), `status` (`in_progress` / `awaiting_confirmation` / `confirmed` / `cancelled`, K11), `gross_amount`, `discount_amount`, `net_amount`, `paid_amount`, `payment_status` (tính ra), `done_by/at`, `confirmed_by/at`, `cancelled_by/at`, `cancel_reason`, `needs_owner_review`, `reviewed_by/at`, `warranty_until`, `created_by/at`, `updated_by/at`, `version`, `create_request_id` + `create_request_hash`.
- `order_items`: `line_type` (`service` / `combo` / `surcharge` / `custom`), `service_id` hoặc `combo_id`, tên và đơn vị lúc bán, `price_mode`, `list_min`, `list_max`, `unit_price`, `quantity`, `gross_amount`, `discount_amount`, `net_amount`, `out_of_range` (cao hơn khoảng), `has_hardening`, `unallocated_reason`, `removed_at`.
- `order_discounts`: `scope` (dòng hoặc cả bill), `kind` (`preset_5` / `preset_10` / `birthday` / `manual` / `below_list` / `complaint_compensation`), `percent` hoặc `amount`, `shop_borne`, `reason`, `applied_by`, `required_level` (`staff` / `manager` / `owner`, server tính), `approved_by/at`, `approval_hash`, `removed_at`.
- `order_staff_allocations`: `order_item_id`, `staff_user_id`, `allocated_net_amount`, `commission_base_amount`, `removed_at`. Thợ là tài khoản người dùng trong cơ sở; Đợt 4 gắn chính sách lương theo `user_id`.
- `money_accounts`: nạp sẵn "Tiền mặt cs HTK" (`cash`) và "Tài khoản cs HTK" (`bank`), `manager_can_view_balance`.
- `payments`: `order_id`, `amount > 0`, `method` (`cash` / `transfer`), `money_account_id`, `received_at` (thời điểm DB), `recorded_by`, `idempotency_key` (unique), `reconciliation_status` (dùng ở Đợt 3), `voided_by/at`, `void_reason`.
- `order_audit_events`: chỉ thêm; ảnh chụp cả đơn trước/sau, người làm, lý do.

**Trigger `orders_guard`** (cùng luật với `policy.ts`):
- Cấm đổi `id`, `branch_id`, `code`, `created_by`, `created_at`, mã yêu cầu [P27].
- Chuyển trạng thái chỉ theo đường đi hợp lệ; mọi thời điểm lấy `now()` của DB.
- Nội dung đơn `awaiting_confirmation` chỉ người có `order.confirm` sửa (K10). Đơn `confirmed` chỉ sửa qua hàm sửa có lý do (bước 2.19). Đơn `cancelled` không sửa, không mở lại.

**Constraint trigger kiểm khi commit:**
- Σ `net_amount` các dòng = `orders.net_amount`.
- Mỗi dòng: Σ chia thợ = `net_amount`, hoặc ít hơn và có `unallocated_reason` (invariant 1).
- Σ `commission_base_amount` = Σ `allocated_net_amount` + phần giảm `shop_borne` (invariant 12).
- Σ thu chưa huỷ ≤ `net_amount` (invariant 2).
- Xác nhận: mọi khoản giảm vượt mức người áp đã có người duyệt đúng cấp, và `approval_hash` khớp nội dung hiện tại (invariant 13) [P29].
- `warranty_until` = `service_date` + 7 ngày nếu có dòng cứng móng, + 3 ngày nếu không (invariant 20).

**Đồng bộ lịch:** sửa `appointments_guard` để `in_progress` và `completed` chỉ đặt được qua hàm của đơn hàng (§5.4). Đơn tạo từ lịch → lịch Khách đã đến → Đang làm. Mọi đơn liên kết (trừ đơn huỷ) đã xác nhận → lịch Hoàn thành. Huỷ đơn duy nhất → lịch về Khách đã đến.

**RLS theo K09:** người có `order.read_all` đọc mọi đơn trong cơ sở; thợ chỉ đọc đơn `created_by = mình` hoặc có dòng chia thợ của mình. Bảng con đọc theo đơn cha. Không bảng nào có DELETE.

## 8. Quyền

Thêm 3 quyền vào `src/server/authz/catalog.ts` (`seedBase` tự gán khi khởi động trên hosting):

| Quyền mới | Linh | Nhung | Chin | Thợ |
|---|---|---|---|---|
| `order.read_all` — xem mọi đơn trong cơ sở | Có | Có | Không | Không |
| `revenue.read_branch` — doanh thu toàn quán, theo thợ, báo cáo | Có | Có | Không | Không |
| `customers.edit` — sửa tên, SĐT khách | Có | Có | Không | Không |

Quyền có sẵn dùng ở Đợt 2:
- `order.create_draft` (mọi người): tạo đơn, sửa đơn Đang làm.
- `order.confirm` (Linh, Nhung): sửa sau Làm xong (K10), xác nhận, ghi và huỷ khoản thu, huỷ đơn chưa xác nhận.
- `discount.apply_up_to_10pct`, `discount.approve_up_to_20pct`, `discount.approve_any`: giảm giá theo bậc C15.
- `review_queue.read` (Linh): Cần xem lại (Q04).
- `catalog.manage` (Linh): danh mục.
- `appointments.create_order` (mọi người): tạo đơn từ lịch.

## 9. Các bước

Mỗi bước kiểm tra xong mới sang bước sau; xong bước nào đánh dấu `[x]` và commit local (không push khi chưa được yêu cầu).

### 2A — Bán hàng

- [x] **2.1 Chốt Q-A, Q-B.** Ghi vào `DECISIONS.md` (K12, K13), xoá khỏi `OPEN_QUESTIONS.md`.
- [x] **2.2 Danh mục.** Migration `0006_catalog` như 7.1; nạp 28 dịch vụ + 4 combo trong `seedBase`.
  *Kiểm tra:* đủ 28 + 4; chạy seed lần hai không nhân đôi, không ghi đè giá đã sửa; Trang gọi hàm sửa giá → permission denied; `app_user` không DELETE được.
- [x] **2.3 Tìm dịch vụ** `src/lib/catalog-search.ts`: bỏ dấu, khớp chữ cái đầu, xếp khớp đầu từ lên trước.
  *Kiểm tra:* test 51 ("son gel" → Sơn gel trơn; "tdc" → Tẩy da chết); "mat meo" → Mắt mèo; "cung mong" → 2 mục cứng móng.
- [x] **2.4 Hàm tiền** `src/lib/order-math.ts`:
  - Thành tiền dòng = đơn giá × số lượng; giá khoảng tự điền giá thấp nhất (C14); cao hơn khoảng → `out_of_range`; thấp hơn khoảng hoặc niêm yết → khoản giảm `below_list` (theo Q-A).
  - Cộng dồn % trên giá gốc (C15). Giảm cả bill chia theo tỷ lệ thành tiền, lệch làm tròn đưa vào dòng cuối (§6.2).
  - Mức duyệt theo tổng % từng dòng (giảm của dòng + giảm cả bill), lấy mức cao nhất.
  - Chia thợ: một thợ nhận cả dòng; nhiều thợ nhập tay, tổng phải bằng thuần của dòng (C10).
  - Cơ sở hoa hồng = phần được chia + phần giảm quán chịu; hạn bảo hành.
  *Kiểm tra:* test đơn vị cho PRD 1, 4, 32, 46, 47, 48, 49, 50, 52; cơ sở hoa hồng của test 33 (500.000đ) và 34 (+50.000đ). Sinh ngẫu nhiên 1.000 đơn: tổng khớp từng đồng.
- [x] **2.5 Khách.** Migration `0007_customers` như 7.2. Service + API: tìm theo tên/SĐT không dấu (tối đa 20 kết quả), tạo khách, nhắc "SĐT này đã có: …" (Q06).
  *Kiểm tra:* test 43; tìm `%` không khớp mọi khách; người ở CS2 thấy được hồ sơ khách (hồ sơ chung).
- [x] **2.6 Bảng đơn hàng.** Migration `0009_orders` (số 0008 dành cho sửa quyền gọi hàm, P37) như 7.3: bảng, 2 tài khoản tiền, bộ đếm mã đơn, `orders_guard`, constraint trigger, RLS theo K09, sửa `appointments_guard`, `pg_notify` loại `orders`.
  *Kiểm tra (SQL dưới `app_user`):* đổi cột bị cấm → lỗi; thợ sửa đơn Chờ xác nhận → lỗi; Σ chia ≠ thuần → commit lỗi; thu vượt → commit lỗi; không DELETE được; Trang không đọc được đơn ngoài K09.
- [x] **2.7 Luật quyền.** Thêm 3 quyền; `src/server/orders/policy.ts` (`orderCan`) cùng luật với trigger.
  *Kiểm tra:* bảng test 4 vai trò × mọi thao tác, chạy ở cả service và SQL.
- [x] **2.8 Tạo và lưu đơn.**
  - `POST /api/orders` (mã yêu cầu chống bấm hai lần); `PUT /api/orders/:id` (cả đơn + `version`, lệch → 409 kèm bản mới); `POST /api/orders/:id/done` (Làm xong); `POST /api/orders/:id/cancel` (lý do bắt buộc).
  - zod `.strict()`; mọi số tiền máy gửi lên bị bỏ, server tính lại [P26].
  *Kiểm tra:* test 15, 21, 49, 52; S20, S21, S28.
- [x] **2.9 Giảm giá và duyệt.** Áp giảm có lý do; duyệt: `POST /api/orders/:id/approve-discounts` (Nhung đến 20%, Linh mọi mức). Đổi nội dung dòng sau khi duyệt → mất duyệt, phải duyệt lại [P29].
  *Kiểm tra:* test 28, 32, 46, 47, 48; S22, S23.
- [x] **2.10 Xác nhận bill** `POST /api/orders/:id/confirm`.
  - Chặn khi còn dòng chưa chia thợ (không có lý do) hoặc giảm giá chưa duyệt đúng cấp.
  - Ghi `warranty_until`. Người xác nhận có phần trong đơn và không có `review_queue.read` → `needs_owner_review` (Q04).
  - Lịch liên kết → Hoàn thành khi mọi đơn của lịch đã xác nhận.
  *Kiểm tra:* test 1, 4, 30, 31, 45, 50; module 27.
- [x] **2.11 Thu tiền.**
  - `POST /api/orders/:id/payments`: tiền mặt → Tiền mặt cs HTK; chuyển khoản → Tài khoản cs HTK. `idempotency_key` bắt buộc; khoá dòng đơn khi kiểm Σ thu ≤ phải thu [P30].
  - `POST /api/payments/:id/void`: huỷ khoản nhập nhầm, có lý do, khi chưa đối soát.
  - Trạng thái thu tự tính.
  *Kiểm tra:* test 3, 17; S24, S25.
- [x] **2.12 Tạo đơn từ lịch.**
  - `POST /api/appointments/:id/create-order`: chống bấm hai lần, mang tên, SĐT, khách; dịch vụ dự kiến chỉ để tham khảo.
  - "Tạo thêm đơn" cho lịch đã có đơn, có hộp xác nhận.
  - Huỷ lịch có đơn liên kết → cảnh báo. Lịch đã có đơn → ẩn nút "Hoàn thành" bấm tay (§5.4).
  *Kiểm tra:* module 26, 28; test PRD 26 (khách hai cơ sở: hồ sơ chung, đơn đúng cơ sở).
- [x] **2.13 Màn tạo/sửa đơn (UI04)** và nút tròn "+ Tạo đơn" (Fab).
  - Khách: tìm SĐT/tên hoặc khách lẻ. Ngày làm dịch vụ.
  - "Thêm dịch vụ" mở sheet danh sách tích chọn theo nhóm, có ô tìm; ô số lượng cho ngón/hình/cái; ô giá hiện khoảng ngay dưới.
  - Phụ thu, dòng nhập tay; chọn thợ từng dòng; giảm giá; tổng hiện ngay; nút Lưu, Làm xong; 409 → hiện bản mới.
  *Kiểm tra:* 375px không cuộn ngang, sáng và tối; đếm lần chạm (mục 5).
- [x] **2.14 Danh sách đơn (UI03), chi tiết và xác nhận (UI05).**
  - Danh sách lọc hôm nay / hôm qua / ngày chọn, trạng thái, thợ, khách, phương thức trả.
  - Chi tiết: dòng thời gian, dòng đơn, chia thợ, giảm giá, khoản thu, hạn bảo hành; nhãn "vượt khoảng", "dịch vụ nhập tay", "giảm chờ duyệt" [P28].
  - Nút Xác nhận và Ghi tiền thu nối liền (điền sẵn số còn phải thu).
  *Kiểm tra:* đăng nhập lần lượt 4 tài khoản, đối chiếu nút và đơn thấy được với K09, K10, mục 8.
- [x] **2.15 Nút trên chi tiết lịch + cập nhật tức thời cho đơn.**
  *Kiểm tra:* 2 cửa sổ: Trang bấm Làm xong → danh sách Chờ xác nhận của Nhung cập nhật dưới 2 giây.
- [x] **2.16 Chốt 2A.** `bun run check`, build, `scan-bundle`; gom test vào `tests/acceptance/don-hang.test.ts` (mỗi test ghi đúng số PRD §18 hoặc module §13) và `tests/security/orders.test.ts`; dữ liệu demo đơn hàng; báo kết quả.

### 2B — Hoàn thiện

- [x] **2.17 Tab Khách (UI11–12).** Tìm tên/SĐT; hồ sơ; lịch sử đơn (thợ chỉ thấy đơn trong phạm vi K09); Nhung, Linh sửa tên/SĐT có lịch sử. Form lịch hẹn có chọn khách có sẵn (module §10).
  *Kiểm tra:* test 16 (khách quay lại thấy lịch sử; trùng tên không tự gộp), 43; S29 phần lịch sử khách.
- [x] **2.18 Phiếu xử lý bảo hành (§6.7, §13F).**
  - Từ đơn gốc: còn hay hết hạn. Kết quả: sửa miễn phí (lỗi kỹ thuật, trong hạn; không sinh doanh thu) / tính phí (tạo đơn mới) / ưu đãi bill sau 10–20%, quán chịu.
  - Đơn kế tiếp của khách hiện ưu đãi còn chờ; áp một lần, loại `complaint_compensation`, duyệt theo bậc C15.
  *Kiểm tra:* test 33 (doanh thu 400.000đ, cơ sở hoa hồng Chin 500.000đ), 50; ưu đãi đã dùng không áp lại được.
- [x] **2.19 Sửa đơn đã xác nhận** (D04: kỳ còn mở; Đợt 2 chưa có kỳ lương nên mọi kỳ đều mở). Nhung, Linh sửa, lý do bắt buộc, lưu trước/sau. Tổng mới nhỏ hơn số đã thu → 422 "Cần phiếu hoàn (có ở Đợt 3)". Nhung sửa thêm phần của mình → vào Cần xem lại [P31].
  *Kiểm tra:* lịch sử có đủ trước/sau, người sửa, lý do; tổng mới < đã thu → 422; doanh thu ngày làm dịch vụ đổi theo; S27.
- [x] **2.20 Tổng quan (UI02) có số tiền.**
  - Linh, Nhung: doanh thu thuần, tiền đã thu, còn khách nợ; số đơn, lượt khách (Q-B); doanh thu từng thợ.
  - Cần xử lý: đơn chờ xác nhận, giảm giá chờ Linh duyệt, Cần xem lại (Linh), lịch Mới đặt.
  - Thợ: chỉ số của mình + lịch chung. "Tiền trong quỹ" → Đợt 3.
  *Kiểm tra:* số khớp báo cáo cùng ngày; S29.
- [x] **2.21 Báo cáo doanh thu (UI13, phần doanh thu).** Ngày: đơn đã xác nhận / chờ / huỷ, lượt khách, doanh thu gộp, giảm giá, thuần, theo thợ, tiền thu theo tài khoản, còn phải thu. Tháng: theo ngày, theo dịch vụ, theo thợ.
  *Kiểm tra:* test 30, 31 ở mức báo cáo; Σ các ngày = số tháng.
- [ ] **2.22 Cài đặt danh mục (UI14, Linh).** Thêm, sửa, ngừng bán dịch vụ, combo; đổi giá có lịch sử.
  *Kiểm tra:* thêm mục mới → tìm thấy ngay khi tạo đơn; đổi giá không đổi đơn cũ; Nhung gọi API → 403.
- [ ] **2.23 Chốt Đợt 2.** Phản biện lại toàn đợt (skill `phan-bien`); `bun run check`, build, `scan-bundle`; S30; cập nhật `CHAY_LOCAL.md`, `CLAUDE.md`; danh sách việc còn thiếu; báo kết quả.

## 10. Kiểm thử

### 10.1. Test PRD §18 và module §13 theo bước

| Test | Bước | Ghi chú |
|---|---|---|
| 1, 4 | 2.4, 2.10 | |
| 3, 17 | 2.11 | |
| 15, 21 | 2.8 | |
| 16 | 2.17 | |
| 26 (PRD) | 2.12 | DB test có cơ sở thứ hai |
| 28, 32, 46, 47, 48 | 2.9 | 46 theo Q-A |
| 30, 31 | 2.10, 2.21 | |
| 33 | 2.4, 2.18 | Số tiền hoa hồng ở Đợt 4 |
| 34 | 2.4, 2.8 | Số tiền hoa hồng ở Đợt 4 |
| 43 | 2.5 | |
| 45 | 2.10 | |
| 49, 52 | 2.4, 2.8 | |
| 50 | 2.4, 2.10, 2.18 | |
| 51 | 2.3 | |
| 20 | 2.13, 2.14, 2.21 | Thử tay 375px |
| Module 26, 27, 28 | 2.10, 2.12 | |
| 2, 35, 36, 44, 54 | Đợt 3 | Tài khoản tiền, cọc, tip |
| 5, 25, 41 | Đợt 3–4 | Hoàn tiền, kỳ lương |

### 10.2. Test bảo mật

| Mã | Tình huống | Kết quả bắt buộc | Điểm |
|---|---|---|---|
| S19 | Trang đọc đơn không do mình tạo, không có phần mình (API và SQL) | 404; SQL không thấy dòng | K09 |
| S20 | Gửi kèm tổng tiền, thành tiền, cơ sở hoa hồng, `confirmed_by`, `branch_id` hoặc trường lạ | Trường lạ → 422; số tiền máy gửi bị bỏ, server tính lại | P26, P27 |
| S21 | Thợ sửa đơn Chờ xác nhận hoặc Đã xác nhận | 403; DB không đổi | K10 |
| S22 | Thợ áp 15% rồi tự gọi API duyệt hoặc xác nhận; Nhung duyệt 25% | 403 | Invariant 13 |
| S23 | Sửa giá dòng sau khi giảm giá đã được duyệt | Mất duyệt; xác nhận bị chặn đến khi duyệt lại | P29 |
| S24 | Thu tiền hai lần cùng mã; hai request song song cộng lại vượt số phải thu | Một khoản thu; request vượt → 422 | P30 |
| S25 | Thợ ghi hoặc huỷ khoản thu | 403 | §4 |
| S26 | Người ở CS2 đọc đơn CS1; tạo đơn với `branch_id` CS1 | 404 / bị chặn | P12 |
| S27 | Nhung sửa đơn đã xác nhận để thêm phần của mình | Vào Cần xem lại của Linh; có lịch sử | P31 |
| S28 | Ngày làm dịch vụ ở tương lai; thợ chọn trước hôm qua | 422 | P32 |
| S29 | Thợ gọi API báo cáo, doanh thu theo thợ, lịch sử khách có đơn ngoài K09 | 403 / không có trong kết quả | K09 |
| S30 | Quét bundle trình duyệt, log | Không có bí mật; log không ghi nội dung đơn, SĐT | P14 |

## 11. Phản biện trước khi code

| Điểm | Mức | Vấn đề | Cách chặn |
|---|---|---|---|
| P26 | 🔴 | Máy gửi tổng tiền, giá, phần chia đã sửa → doanh thu, hoa hồng sai | Server tính lại toàn bộ từ dòng + danh mục; trigger kiểm tổng khi commit |
| P27 | 🟠 | PUT nhận cột hệ thống → tự xác nhận, đổi người tạo, chuyển cơ sở | zod `.strict()`; `orders_guard` cấm cột hệ thống |
| P28 | 🟠 | Thợ dùng dòng nhập tay hoặc giá thấp để né duyệt giảm giá | Giá dưới khoảng/niêm yết thành khoản giảm cần duyệt (Q-A); dòng nhập tay và vượt khoảng có nhãn khi Nhung xác nhận |
| P29 | 🟠 | Duyệt giảm giá xong rồi sửa dòng để giảm sâu hơn | Lưu hash nội dung lúc duyệt; lệch thì mất duyệt; trigger kiểm khi xác nhận |
| P30 | 🟠 | Hai lần thu song song vượt số phải thu | Khoá dòng đơn khi ghi thu; `idempotency_key` unique; constraint trigger |
| P31 | 🟡 | Nhung né Q04: xác nhận đơn không có phần mình rồi sửa thêm phần mình | Sửa sau xác nhận có phần người sửa → Cần xem lại |
| P32 | 🟡 | Lùi ngày làm dịch vụ để dời doanh thu sang ngày, tháng khác | Không cho ngày tương lai; thợ chỉ hôm nay hoặc hôm qua; đổi ngày có lịch sử |
| P33 | 🟡 | Danh sách, lịch sử khách, Tổng quan lộ doanh thu thợ khác | RLS theo K09 ở bảng đơn và bảng con; báo cáo cần `revenue.read_branch` |
| P34 | 🟡 | Tìm khách hàng loạt để lấy SĐT | Tối đa 20 kết quả; giới hạn tần suất; kết quả tìm hiện SĐT che giữa (`0912•••678`), chỉ chi tiết khách mới trả đủ số (như lịch, P11) |
| P35 | ⚪ | Đổi giá danh mục làm đổi đơn cũ | Dòng đơn lưu tên, giá lúc bán; lịch sử giá chỉ thêm |
| P36 | ⚪ | Làm tròn khi chia giảm giá lệch vài đồng | Chia theo số nguyên, phần lệch vào dòng cuối; test 1.000 đơn ngẫu nhiên |
| P37 | 🟡 | **Phát hiện khi làm (13/10):** lệnh thu quyền gọi hàm theo schema ở 0001 không có tác dụng; `app_user` gọi được hàm nội bộ Đợt 0 (`_emit`, `_revoke_user_access`, `_audit`, `emit_system_event`). Chỉ khai thác được qua lỗi code hoặc SQL injection | Migration `0008_function_grants`: thu EXECUTE của PUBLIC, đặt mặc định toàn cục, cấp lại đúng hàm cần; test trong `tests/security/orders.test.ts` |

## 12. Mặc định tôi tự đặt (không phải tham số nghiệp vụ, đổi được)

| Tham số | Giá trị |
|---|---|
| Mã đơn | `#0001` tăng dần theo cơ sở, không đặt lại |
| Ngày làm dịch vụ | Mặc định hôm nay; thợ chọn hôm nay hoặc hôm qua; Nhung, Linh chọn ngày bất kỳ không sau hôm nay |
| Số lượng mặc định (ngón/hình/cái) | 1, gõ số khác được |
| Giới hạn một đơn | ≤ 30 dòng; số lượng 1–20; một dòng ≤ 10.000.000đ (chặn gõ thừa số 0) |
| Thu tiền | Không cho thu quá số còn phải thu (tip giữ hộ có ở Đợt 3) |
| Huỷ đơn | Người tạo huỷ đơn Đang làm của mình; Nhung, Linh huỷ đơn chưa xác nhận; đều cần lý do |
| Khách | Mọi người tạo được khách mới; sửa tên/SĐT: Nhung, Linh |
| Phiếu xử lý bảo hành | Nhung, Linh tạo (cần xem đơn gốc của mọi thợ, K09) |
| Danh sách đơn | ≤ 62 ngày, ≤ 500 dòng mỗi lần (như lịch) |
| Tạo đơn nhanh | ≤ 5 lần chạm từ "+ Tạo đơn" đến "Làm xong" (khách lẻ, 1 dịch vụ, 1 thợ) |

## 13. Rủi ro và cách quay lại

| Rủi ro | Cách xử lý |
|---|---|
| Đợt lớn, dễ trễ hạn cọc Tết | Chia 2A/2B; Đợt 3 bắt đầu được ngay sau 2A nếu cần (cọc chỉ cần đơn và thu tiền) |
| Logic tiền viết hai nơi (TypeScript và SQL) lệch nhau | TypeScript tính, SQL chỉ **kiểm** tổng và mức duyệt; test chạy cùng bộ số liệu ở cả hai tầng |
| Migration chạy tự động khi app khởi động trên hosting (K08); lỗi là app không lên | Migration chạy trong giao dịch; thử trên bản sao DB dev có dữ liệu demo trước; chỉ đẩy lên khi được yêu cầu |
| Quay lại code cũ sau khi migration đã chạy | Bảng mới không ảnh hưởng code cũ; sửa `appointments_guard` chỉ mở thêm `in_progress`/`completed` qua hàm đơn hàng, code Đợt 1 vẫn chạy |
| Màn tạo đơn nhiều thứ trên 375px | Làm theo luồng chính trước (khách → dịch vụ → thợ → Làm xong); giảm giá, phụ thu nằm trong sheet phụ |
| Sửa đơn đã xác nhận trước khi có kỳ lương (Đợt 4) | Lưu đủ lịch sử trước/sau để Đợt 4 xử lý kỳ đã khoá bằng phiếu điều chỉnh (D04) |

**Quay lại khi hỏng:** commit local sau mỗi bước; hỏng thì quay về commit trước. Migration chỉ chạy tiến; ở local dựng lại bằng `db:reset` (chỉ DB `lindy_dev`/`lindy_test`). Chưa đẩy GitHub (tức chưa tự triển khai lên hosting) khi chưa được yêu cầu.

## 14. File sẽ tạo hoặc sửa

**Tạo:**
- `db/migrations/0006_catalog.sql`, `0007_customers.sql`, `0008_function_grants.sql` (P37), `0009_orders.sql`; 2B thêm migration cho phiếu bảo hành, báo cáo.
- `src/lib/order-math.ts`, `src/lib/catalog-search.ts`, `src/lib/orders.ts` (gọi API phía máy khách).
- `src/server/catalog/`, `src/server/customers/`, `src/server/orders/` (`policy.ts`, `schema.ts`, `service.ts`, `payments.ts`), `src/server/reports/`.
- `src/routes/api/catalog/…`, `api/customers/…`, `api/orders/…`, `api/payments/…`, `api/reports/…`.
- `src/routes/_app/don-hang/` (`index.tsx`, `$id.tsx`, `tao.tsx`), `_app/khach/` (`index.tsx`, `$id.tsx`), `_app/them/danh-muc.tsx`, `_app/them/bao-cao.tsx`.
- `src/components/don-hang/` (`OrderForm`, `ServicePicker`, `StaffSplit`, `DiscountSheet`, `PaymentSheet`, `OrderRow`, `OrderDetail`); `src/components/ui/` thêm `Fab`, `Money`, `SummaryCard` theo bộ giao diện.
- `tests/unit/order-math.test.ts`, `tests/unit/catalog-search.test.ts`, `tests/acceptance/don-hang.test.ts`, `tests/security/orders.test.ts`.

**Sửa:**
- `src/server/authz/catalog.ts` (3 quyền mới), `src/server/ops/seed.ts` (danh mục, tài khoản tiền).
- `src/routes/api/appointments/$id.$action.ts` (`create-order`), `src/server/appointments/service.ts`, `policy.ts` (ẩn Hoàn thành bấm tay khi có đơn, cảnh báo huỷ lịch có đơn).
- `src/components/lich/AppointmentForm.tsx` (chọn khách có sẵn), `src/routes/_app/lich/$id.tsx` (nút tạo đơn).
- `src/routes/_app.tsx` (Fab), `_app/index.tsx` (Tổng quan), `_app/them/index.tsx` (mục Danh mục, Báo cáo).
- `scripts/demo-data.ts` (đơn mẫu), `docs/CHAY_LOCAL.md`, `CLAUDE.md`, `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md`.

## 15. Kết quả 2A (13/10/2026)

### Đã kiểm bằng bằng chứng

| Kiểm tra | Kết quả |
|---|---|
| `bun run check` (Biome, cấm `sql.unsafe`, typecheck, test) | Đạt. 180/180 test, 13 file (103 test cũ Đợt 0–1 vẫn đạt) |
| Test PRD §18: 1, 3, 4, 15, 17, 21, 26, 28, 30, 31, 32, 43, 45, 46, 47, 48, 49, 50, 51, 52 | Đạt, tự động (`tests/acceptance/don-hang.test.ts`, `tests/unit/order-math.test.ts`, `tests/unit/catalog-search.test.ts`, `tests/integration/customers.test.ts`) |
| Test 33, 34 phần cơ sở hoa hồng | Đạt (`order-math.test.ts`); số tiền hoa hồng ở Đợt 4 |
| Test module lịch 26, 27, 28 | Đạt, tự động |
| Test bảo mật S19–S26, S28 + phần danh sách của S29 + chặn ở tầng SQL | Đạt (`tests/security/orders.test.ts`) |
| P37 — quyền gọi hàm schema `app` | Sửa ở `0008_function_grants`; test xác nhận `app_user` không gọi được hàm nội bộ |
| `bun run build` + `scan-bundle` | Build được; 42 file trình duyệt không chứa bí mật |
| Giao diện 375×812 (trình duyệt trong app, chế độ tối) | Không cuộn ngang ở Đơn hàng, Tạo đơn, Chi tiết đơn, Chi tiết lịch. Tạo đơn khách lẻ 1 dịch vụ: + → Thêm dịch vụ → tích → Thêm → Làm xong = 5 lần chạm |
| Luồng thật trên giao diện | Trang tạo đơn (mắt mèo 10 ngón tự điền 70.000đ, sinh nhật 10%) → Làm xong; Nhung xác nhận → ô thu tiền tự mở → thu chuyển khoản → Đã thu đủ, bảo hành +3 ngày. Từ lịch: "Khách đã đến · Tạo đơn" → đơn mang tên, SĐT; lịch sang Đang làm, ẩn Hoàn thành bấm tay |
| Cập nhật tức thời | Sự kiện `orders` đến SSE sau ~30 ms; gói tin chỉ có cơ sở và ngày |

### Khác với kế hoạch

- Danh mục nạp từ file sinh sẵn `catalog-data.ts` (Bun không đọc được `?raw`), không nhúng CSV.
- Thêm migration `0008_function_grants` (P37); đơn hàng thành `0009_orders`.
- DB dev dựng lại bằng `db:reset` (chỉ có dữ liệu mẫu: 4 tài khoản mẫu, 14 lịch mẫu, chưa có khách, đơn, push) vì migration 0009 sửa nhiều lần khi làm.
- Duyệt giảm giá ghi trên đơn (một người duyệt cho cả đơn), không theo từng khoản giảm; hiệu lực gắn với băm phần giá (`pricing_hash`).
- Nút trình duyệt trong app không nhận cú bấm khi khung trình duyệt bị ẩn; luồng giao diện được bấm bằng JavaScript trên đúng phần tử.

### Chưa làm hoặc chưa kiểm

- 2B (bước 2.17–2.23): tab Khách, phiếu bảo hành và ưu đãi bù khiếu nại, sửa đơn đã xác nhận, Tổng quan có số tiền, báo cáo, cài đặt danh mục.
- Chưa thử trên iPhone thật; chưa đẩy lên GitHub/hosting.
