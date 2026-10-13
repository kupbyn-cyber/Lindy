# Kế hoạch Đợt 3 — Sổ tiền và cọc Tết

**Ngày:** 13/10/2026 · **Trạng thái:** ĐÃ DUYỆT 13/10/2026. 3A ĐÃ LÀM (kết quả mục 15); 3B-1 ĐÃ LÀM (mục 17); 3B-2 chưa làm (chuẩn bị ở mục 16). Q-C, Q-D, Q-E đã chốt 13/10/2026 theo phương án (a) → K16, K17, K18. `[x]` xong và đã kiểm; `[~]` làm một phần; `[ ]` chưa làm.
**Nguồn:** `CLAUDE.md`; `docs/DECISIONS.md` (A02, A03, B01, C01–C04, K05, K09–K15); PRD v1.2 §4, §6.3, §6.6, §7, §11, §12, §13 (B, C, D), §14 (UI06, UI07, UI16), §17, §18; PRD v1.1 §7.3 (chứng từ, trạng thái phiếu chi), Q14–Q24, Q34; module lịch v1.2 §4, §5.1, §6, §9, §11, §12, §13 (test 29–36); kế hoạch Đợt 2 mục 6 (phần dời sang Đợt 3).

Ký hiệu `[Pn]`: điểm phản biện số n ở mục 11 (nối tiếp P26–P45 của Đợt 2). `Sn`: test bảo mật ở mục 10.2.

## 1. Hiểu yêu cầu

Làm PRD §17 Đợt 3: hai tài khoản tiền có số dư, bút toán mở sổ, thu chi và duyệt chi, tip giữ hộ, chốt quỹ cuối ngày, **tiền cọc mùa Tết**. Cộng phần Đợt 2 dời sang: phiếu hoàn tiền, huỷ đơn đã xác nhận, đối soát chuyển khoản. Mục tiêu nghiệp vụ: mỗi ngày biết tiền đang nằm ở đâu, và nhận được cọc Tết.

**Hạn cứng:** cọc phải chạy trước 19 tháng Chạp (PRD: khoảng cuối tháng 1/2027, còn khoảng 15 tuần). Vì vậy chia hai phần, cọc làm trước:

- **3A — Sổ tiền nền và cọc Tết:** sổ bút toán, số dư hai tài khoản, mở sổ, mùa cọc, ghi / xác nhận / hoàn / giữ cọc, trừ cọc vào bill, Tổng quan có Tiền trong quỹ. Xong 3A là nhận cọc Tết được, triển khai riêng được.
- **3B — Thu chi và chốt ngày:** đề nghị chi và duyệt chi, thu khác, góp/rút vốn, chuyển nội bộ, tip giữ hộ, hoàn tiền, huỷ đơn đã xác nhận, đối soát chuyển khoản, chốt quỹ, chứng từ ảnh, báo cáo dòng tiền.

## 2. Hiện trạng (13/10/2026)

| Có sẵn | Dùng cho Đợt 3 |
|---|---|
| `money_accounts` (đã nạp Tiền mặt cs HTK, Tài khoản cs HTK); `payments` có khoá idempotency, `voided_*`, cột `reconciliation_status` để sẵn | Bút toán thu từ đơn; đối soát |
| Quyền `deposits.record/confirm/resolve`, `expense.request/approve_within_limit/approve_above_limit`, `money_accounts.read_balance` đã có và đã gán đúng vai trò | Cọc và duyệt chi không cần thêm quyền |
| `appointments.customer_cancel_reported_at`, `cancelled_at`, trạng thái `no_show` (DB đặt thời điểm) | Mốc 12 tiếng, gợi ý hoàn hay giữ cọc |
| Outbox + Web Push (`app._emit`), SSE | Thông báo cọc chờ xác nhận (test 31) |
| Mẫu Đợt 2: trigger guard theo cột, constraint trigger kiểm khi commit, bảng chỉ thêm, `withUser`, version/409, idempotency, `limitWrites` | Mọi bảng tiền |
| Cần xem lại (Q04, K15), Tổng quan, báo cáo ngày/tháng | Thêm các mục tiền |
| `scripts/check-upgrade.ts` | Giả lập nâng cấp DB trước khi triển khai |

**Còn treo:** Đợt 2 đã ở GitHub nhưng hosting vẫn chạy bản Đợt 1 (13/10: `/api/orders` trả 404). Nên triển khai Đợt 2 và cho quán dùng thử đơn hàng trong lúc làm 3A. `VAPID_SUBJECT` trên hosting vẫn sai dạng (việc cũ, `BAI_HOC_TRIEN_KHAI.md` mục 6) — cần sửa trước khi thử push cọc trên iPhone.

## 3. Quyết định đã có và điểm cần chốt

**Đã chốt, không hỏi lại:**
- Hai tài khoản Tiền mặt cs HTK, Tài khoản cs HTK; Nhung xem số dư cả hai; không dùng tài khoản cá nhân (Q17, Q18).
- Duyệt chi: Nhung duyệt đến 1.000.000đ/phiếu; trên mức đó hoặc thuộc **tiền nhà; lương, thưởng, tạm ứng; máy móc, thiết bị; sửa chữa** thì Linh duyệt. Chỉ ghi tiền ra khi đã chi (Q19, Q20). Không làm sổ nợ nhà cung cấp (Q21, Q22).
- Một quỹ tiền mặt, chốt một lần sau 21:00; Nhung chốt, ngày Nhung nghỉ thì Linh chốt (Q23).
- Mở sổ vào ngày 1 của một tháng (Q24); số dư mở sổ bằng bút toán mở sổ.
- Tip: chỉ ghi khi khách chuyển vào tài khoản quán; là tiền giữ hộ, không doanh thu, không hoa hồng; cuối ngày Nhung trả tiền mặt và ghi phiếu chi tip; bill nhiều thợ chia theo phần tiền, trừ khi khách chỉ định (Q14, Q15).
- Cọc: chỉ lịch **được tạo** trong mùa 19–28 tháng Chạp (B01, C01); 100.000đ × số khách, tối đa 4 khách (A02, C02, K05); Nhung, Linh xác nhận tiền đã vào; báo huỷ trước giờ hẹn ≥ 12 tiếng thì hoàn, muộn hơn hoặc không đến thì giữ (C03); cọc bị giữ là doanh thu "cọc khách bỏ hẹn", phần của Linh, không hoa hồng, không KPI (A03, C04).
- Hoàn tiền sau khi khoá kỳ lương tính vào tháng hoàn (Q34): áp ở Đợt 4 khi có khoá kỳ.

**Linh tự nhập trong app, không cần trả lời trước khi code** (`OPEN_QUESTIONS.md` §2):
- Khoảng ngày dương lịch của mùa cọc Tết 2027. Chưa nhập thì form lịch không có phần cọc.
- Tháng mở sổ và số dư mở sổ hai tài khoản. Chưa nhập thì màn Sổ tiền hiện "Chưa mở sổ", không hiện số dư; các khoản thu, cọc vẫn ghi bình thường.

**Cần chốt khi duyệt** (tài liệu thiếu; không tự đoán):

**Q-C. Lịch tạo trong mùa cọc nhưng khách chưa chuyển cọc.** Test 30 ghi "Form yêu cầu cọc", chưa nói có chặn lưu không.
- **(a) Đề xuất:** lưu được; lịch có nhãn "Chưa cọc" và nằm trong Cần xử lý của Linh, Nhung, Chin đến khi có cọc. Khách thường đặt trước rồi chuyển khoản sau.
- (b) Phải ghi khoản cọc (chờ xác nhận) thì mới lưu được lịch.

Chặn bước 3.5.

**Q-D. Chốt quỹ: số tiền đếm được lệch số lý thuyết.**
- **(a) Đề xuất:** app ghi bút toán "chênh lệch kiểm quỹ" đúng bằng số lệch, kèm lý do, để số dư tiền mặt trong app bằng số tiền thật trong két; mọi lần lệch khác 0 vào Cần xem lại của Linh.
- (b) Chỉ lưu số lệch và lý do; số dư trong app giữ theo lý thuyết (app và két lệch nhau cho đến khi Linh tự ghi điều chỉnh).

Chặn bước 3.18.

**Q-E. Ai làm phiếu hoàn tiền và huỷ đơn đã xác nhận.** PRD chỉ nói cần lý do, chứng từ, xác nhận rõ.
- **(a) Đề xuất:** Nhung, Linh; phiếu hoàn và huỷ do Nhung làm vào Cần xem lại của Linh (như K15).
- (b) Chỉ Linh.
- (c) Như duyệt chi: Nhung đến 1.000.000đ/phiếu, trên mức Linh.

Chặn bước 3.16.

## 4. Lựa chọn kỹ thuật

| Việc | Đề xuất | Phương án khác | Lý do |
|---|---|---|---|
| Số dư | **Sổ bút toán** `money_ledger_entries`, chỉ thêm; số dư = số mở sổ + Σ bút toán từ ngày mở sổ | Mỗi lần xem thì cộng lại từ các bảng thu, chi, cọc | Một nguồn cho số dư, chốt quỹ, báo cáo dòng tiền; sửa sai bằng bút toán đảo, không sửa số (invariant 5) |
| Ai ghi bút toán | **Trigger trong DB** khi khoản thu, cọc, phiếu chi… đổi trạng thái; `app_user` chỉ được đọc bảng sổ | Code TypeScript ghi | Không thể quên ghi hay ghi hai lần; cùng mẫu Đợt 2 |
| Huỷ khoản thu, hoàn cọc, sai sót | Bút toán đảo (−X) trỏ về bút toán gốc | Sửa hoặc xoá bút toán | Đủ lịch sử; `app_user` không có UPDATE, DELETE ở bảng sổ |
| Ngày của bút toán | DB tính theo giờ Việt Nam lúc ghi; ngày đó đã chốt quỹ thì sang ngày kế | Cho người dùng chọn ngày | Không ghi lùi vào ngày đã chốt (test 14) |
| Trừ cọc vào bill | Khi Nhung xác nhận đơn tạo từ lịch, app tự ghi khoản thu loại "cọc" (không có bút toán mới, vì tiền đã vào sổ lúc xác nhận cọc) | Trừ ngay lúc tạo đơn | Lúc tạo đơn chưa có dòng, tổng 0đ; lịch nhóm nhiều đơn dùng chung tiền cọc |
| Doanh thu cọc bỏ hẹn | Đọc từ khoản cọc trạng thái "giữ cọc"; báo cáo tách dòng riêng | Bảng `revenue_entries` chung | Chưa cần bảng chung; Đợt 4 tính hoa hồng, KPI chỉ từ đơn nên cọc tự nằm ngoài (invariant 17) |
| Phiếu hoàn | Bảng `order_refunds` + phần trừ từng thợ theo tỷ lệ chia; doanh thu thuần = đơn − hoàn, theo `revenue_date` | Sửa đơn giảm tổng rồi chi tiền | Đơn đã xác nhận giữ nguyên; Đợt 4 cần ngày hoàn riêng cho Q34 |
| Chứng từ ảnh | Thu nhỏ trên iPhone (cạnh dài ≤ 1600px, JPEG), lưu trong DB (≤ 1MB/ảnh) | Lưu file trên hosting hoặc dịch vụ ngoài | Chưa rõ Vibe Host giữ file qua các lần triển khai; trong DB thì sao lưu cùng dữ liệu, không thêm khoá bí mật |

## 5. Thế nào là xong

**3A xong khi:**
- `bun run check` xanh; `bun run build` chạy bằng Node; `scan-bundle` sạch; `check-upgrade --from=0010` đạt (DB có sẵn đơn, khoản thu).
- Test module lịch **29–36** tự động và đạt.
- Test PRD §18 **2, 35, 36, 54** đạt; **27** phần số dư.
- S31–S38 đạt.
- Thử tay ở 375×812, sáng và tối: ghi cọc trên lịch ≤ 3 lần chạm sau khi mở lịch; máy Nhung có thông báo trong app, xác nhận được.

**3B xong khi:**
- Test PRD §18 **5** (kỳ mở), **6, 7, 8, 14** (khoá ngày), **18, 22, 37, 44** đạt.
- S39–S48 đạt.
- Chốt quỹ một ngày mẫu khớp tính tay; báo cáo dòng tiền tháng khớp tổng các ngày.
- Cập nhật `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`; báo đúng kết quả, kể cả phần chưa kiểm.

## 6. Phạm vi

**Làm:** như mục 1.

**Không làm ở đợt này:**
- Tạm ứng, chi lương theo bảng lương, khoá kỳ lương, luật hoàn sau khoá kỳ (Q34) → Đợt 4. Đợt 3 có nhóm chi "Lương, thưởng" (Linh duyệt) để ghi tiền lương đã trả trước khi có Đợt 4; tạm ứng là khoản nhân viên nợ quán, không phải chi phí, nên chờ Đợt 4.
- Lợi nhuận ước tính → Đợt 4–5 (cần chi phí lương).
- Sổ nợ nhà cung cấp, tài khoản cá nhân (Q18, Q21).
- Xuất CSV/XLSX/PDF, nhập dữ liệu cũ → Đợt 5.
- Đối soát tự động với sao kê ngân hàng; mã QR thanh toán tự sinh; nhắc khách chuyển cọc.
- Push cho đề nghị chi, tip: PRD không có. Chỉ cọc có thông báo (test 31). Đề nghị chi hiện trong Cần xử lý.
- Tự đổi lịch âm sang dương cho mùa cọc (module §6.1).

## 7. Dữ liệu

### 7.1. `0011_ledger` (3A)

- `money_books`: `branch_id` (khoá chính), `opening_date` (luôn ngày 1), `opened_by`, `opened_at`.
- `money_ledger_entries`: `id`, `branch_id`, `money_account_id`, `entry_type` (`opening`, `payment`, `payment_void`, `deposit_in`, `deposit_refund`, `tip_in`, `tip_payout`, `expense`, `other_income`, `capital_in`, `capital_out`, `transfer_out`, `transfer_in`, `refund`, `cash_count_diff`, `adjustment`), `amount` (số nguyên VND có dấu, khác 0), `business_date`, `occurred_at` (DB), `source_type` + `source_id`, `reverses_entry_id`, `transfer_group`, `note`, `created_by`.
  - Chỉ thêm. Unique `(source_type, source_id, entry_type)` để một nguồn không ghi hai lần [P46].
  - RLS: đọc khi có `money_accounts.read_balance` ở cơ sở. Không ai INSERT trực tiếp: chỉ trigger và hàm `SECURITY DEFINER`.
- Trigger trên `payments`: ghi khoản thu tiền mặt / chuyển khoản → `payment` (+); huỷ khoản thu → `payment_void` (−).
- Migration ghi bù bút toán cho khoản thu đã có (DB dev; và hosting nếu Đợt 2 đã chạy ở đó). Bút toán trước ngày mở sổ không tính vào số dư.
- Hàm `app.open_book(...)`: Linh, một lần; ngày 1 của tháng, không sau tháng hiện tại; ghi hai bút toán `opening`. Nhập sai thì Linh ghi bút toán điều chỉnh có lý do.

### 7.2. `0012_deposits` (3A)

- `deposit_seasons`: `branch_id`, `name` ("Tết 2027"), `start_date`, `end_date` (dương lịch, Linh nhập), `amount_per_guest` (100.000), `refund_notice_hours` (12), `forfeit_owner_user_id` (người nhận phần cọc bỏ hẹn, mặc định tài khoản Linh), `is_active`. Không chồng ngày nhau trong một cơ sở; sửa có lịch sử.
- `appointments.deposit_required`: DB tính lúc tạo lịch (ngày tạo theo giờ Việt Nam nằm trong mùa đang bật); không đổi về sau, kể cả khi Linh sửa mùa.
- `appointment_deposits` (module §11): `appointment_id`, `branch_id`, `amount`, `method` (`cash`/`transfer`), `money_account_id`, `status` (`recorded` / `confirmed` / `refunded` / `forfeited` / `voided`), `recorded_by/at`, `confirmed_by/at`, `resolved_by/at`, `resolve_reason`, `suggested_action` (DB tính lúc xử lý), `revenue_date` (giữ cọc: ngày hẹn), `forfeit_owner_user_id`, `needs_owner_review`, `idempotency_key`, `version`.
  - Bút toán: xác nhận → `deposit_in` (+) vào tài khoản nhận; hoàn → `deposit_refund` (−) từ tài khoản chọn lúc hoàn; giữ cọc → không bút toán (tiền đã ở quỹ), chỉ chuyển từ "cọc đang giữ" sang "doanh thu cọc bỏ hẹn".
  - Phần cọc còn lại = số cọc − phần đã trừ vào bill. Hoàn hoặc giữ áp cho phần còn lại.
- `payments`: thêm `method = 'deposit'` và `deposit_id`; khoản này không có tài khoản, không có bút toán. Constraint kiểm khi commit: Σ phần trừ từ một cọc ≤ số cọc đã xác nhận [P55].
- `appointments_guard`: thợ không tự huỷ lịch có cọc đã xác nhận (test 36).
- Thông báo: ghi cọc → sự kiện cho người có `deposits.confirm` (test 31); màn hình khoá không có SĐT, ghi chú.

### 7.3. `0013_cashbook` (3B)

- `expense_categories`: nạp sẵn theo PRD §7.3. Chi vận hành: thuê nhà, điện nước, internet, vật tư, công cụ, máy móc thiết bị, sửa chữa, marketing, vệ sinh, đào tạo, phí chuyển khoản, chi khác. Chi nhân sự: lương, thưởng. Cờ `owner_only` cho tiền nhà; lương, thưởng; máy móc thiết bị; sửa chữa (Q20).
- `expense_requests`: `category_code`, `amount` (> 0), `note`, `status` (`requested` / `approved` / `rejected` / `paid` / `cancelled`), `required_level` (DB tính: `manager` nếu ≤ 1.000.000đ và nhóm thường, ngược lại `owner`), `approved_by/at`, `reject_reason`, `paid_by/at`, `paid_account_id`, `needs_owner_review`, `requested_by`, `version`, mã yêu cầu chống bấm hai lần.
  - Bút toán `expense` (−) chỉ khi chuyển sang `paid` (invariant 9). Đã duyệt thì không sửa số tiền, nhóm.
- `cash_vouchers` (phiếu Linh lập): `kind` (`other_income` / `capital_in` / `capital_out` / `adjustment`), loại thu khác (vay, hoàn tiền nhà cung cấp, thu khác), `amount` (điều chỉnh có dấu), `money_account_id`, `reason` bắt buộc.
- `cash_transfers`: tài khoản đi ≠ tài khoản đến, cùng cơ sở → cặp bút toán −X/+X cùng `transfer_group`.
- `cash_day_closes`: `branch_id`, `business_date`, tiền mặt đầu ngày, thu, chi, lý thuyết, số đếm, chênh lệch, lý do, `closed_by/at`. Unique `(branch_id, business_date)`. Chỉ thêm, không sửa, không xoá (test 14).

### 7.4. `0014_tips_refunds` (3B)

- `tip_holdings`: `order_id`, `staff_user_id`, `amount`, `money_account_id` (Tài khoản cs HTK), `tip_group` (một lần ghi chia nhiều thợ), `recorded_by/at`, `payout_id`, `voided_*`. Bút toán `tip_in` (+).
- `tip_payouts`: `staff_user_id`, `amount` = Σ tip đang giữ được chọn, tài khoản tiền mặt, `paid_by/at`. Bút toán `tip_payout` (−).
- `order_refunds`: `order_id`, `amount`, `method`, `money_account_id`, `reason`, `revenue_date` (Đợt 3 = ngày làm dịch vụ; Đợt 4 thêm luật Q34), `refunded_by/at`, `needs_owner_review`, `idempotency_key`. Bút toán `refund` (−).
- `order_refund_allocations`: phần trừ từng thợ theo tỷ lệ phần chia; lệch làm tròn vào người cuối; Σ = số hoàn.
- Bất biến: Σ hoàn ≤ Σ đã thu (không kể khoản huỷ) của đơn. Phải thu khách không đổi khi hoàn.
- `orders_guard`: thêm đường `confirmed → cancelled` khi tiền đã thu trừ đã hoàn bằng 0, có lý do, theo Q-E.
- Trạng thái thu tính thêm **Hoàn một phần / Hoàn toàn bộ** (§6.3).

### 7.5. `0015_attachments` (3B)

- `attachments`: `branch_id`, `owner_type` (`expense` / `refund` / `voucher`), `owner_id`, `mime` (JPEG/PNG, kiểm byte đầu file), `size` (≤ 1MB), `sha256`, `data` (bytea), `uploaded_by/at`, `removed_by/at`. Ai xem được phiếu thì xem được ảnh của phiếu. Không sửa; gỡ là đánh dấu.

## 8. Quyền

Có sẵn, dùng ngay: `deposits.record` (mọi người), `deposits.confirm` (Linh, Nhung), `deposits.resolve` (Linh, Nhung, Chin), `expense.request` (mọi người), `expense.approve_within_limit` (Linh, Nhung), `expense.approve_above_limit` (Linh), `money_accounts.read_balance` (Linh, Nhung), `review_queue.read` (Linh), `booking_settings.manage` (Linh: mùa cọc).

Thêm vào `src/server/authz/catalog.ts` (`seedBase` tự gán khi khởi động trên hosting):

| Quyền mới | Linh | Nhung | Chin | Thợ |
|---|---|---|---|---|
| `cashbook.manage` — chuyển nội bộ, đối soát chuyển khoản, ghi và trả tip, chốt quỹ | Có | Có | Không | Không |
| `cashbook.owner` — mở sổ, góp/rút vốn, thu khác, bút toán điều chỉnh | Có | Không | Không | Không |
| `order.refund` — phiếu hoàn, huỷ đơn đã xác nhận (K18) | Có | Có, vào Cần xem lại | Không | Không |

Thợ xem được: tip của mình (đang giữ, đã nhận), phiếu chi mình đề nghị, cọc trên lịch. Không xem số dư, sổ, chốt quỹ, cọc đang giữ toàn quán.

## 9. Các bước

Mỗi bước kiểm tra xong mới sang bước sau; xong bước nào đánh dấu `[x]` và commit local (không push khi chưa được yêu cầu).

### 3A — Sổ tiền nền và cọc Tết

- [x] **3.1 Chốt Q-C, Q-D, Q-E.** Ghi vào `DECISIONS.md` (K16–K18).
- [x] **3.2 Sổ bút toán.** Migration `0011_ledger` như 7.1: bảng sổ, trigger từ khoản thu (ghi, huỷ), ghi bù khoản thu đã có, RLS.
  *Kiểm tra:* trả 200.000đ chuyển khoản + 148.000đ tiền mặt → hai tài khoản tăng đúng, công nợ 0 (test 2); huỷ khoản thu → có bút toán đảo; `app_user` INSERT/UPDATE/DELETE bảng sổ → lỗi; thợ đọc sổ → 0 dòng; chạy lại trigger không ghi đôi.
- [x] **3.3 Mở sổ và màn Sổ tiền (UI06, phần xem).** Linh chọn tháng mở sổ, nhập số dư hai tài khoản. Thêm → Sổ tiền: hai thẻ số dư; danh sách bút toán theo ngày, theo tài khoản. Nhung xem được; thợ không thấy mục này.
  *Kiểm tra:* mở sổ ngày 15 → 422; mở lần hai → chặn; Nhung gọi mở sổ → 403; thợ gọi API số dư → 403; test 27 phần số dư.
- [x] **3.4 Mùa cọc.** Migration `0012_deposits` phần mùa cọc. Cài đặt lịch thêm khối "Mùa cọc": tên, từ ngày, đến ngày, mức mỗi khách, số giờ báo trước để được hoàn, người nhận phần cọc bỏ hẹn.
  *Kiểm tra:* hai mùa chồng ngày → chặn; Nhung sửa → 403; sửa mùa không đổi lịch đã tạo.
- [x] **3.5 Lịch cần cọc.** DB tính `deposit_required` lúc tạo; form tạo lịch có phần cọc khi đang trong mùa, gợi ý số khách × mức; theo Q-C.
  *Kiểm tra:* test 29, 30. Tạo trong mùa, ngày hẹn sau mùa → cần cọc; tạo ngoài mùa, ngày hẹn trong mùa → không cần.
- [x] **3.6 Ghi và xác nhận cọc.** `POST /api/appointments/:id/deposits` (khoá idempotency); `POST /api/deposits/:id/confirm` (Nhung, Linh) → bút toán `deposit_in`; huỷ cọc ghi nhầm khi chưa xác nhận; thông báo cho người xác nhận.
  *Kiểm tra:* test 31, 32; S31, S32, S38.
- [x] **3.7 Hoàn cọc, giữ cọc.** App gợi ý theo mốc 12 tiếng (giờ hẹn so với thời điểm báo huỷ hoặc huỷ, DB ghi). `refund` chọn tài khoản chi, có lý do → bút toán `deposit_refund`; `forfeit` → doanh thu cọc bỏ hẹn (ngày hẹn, phần của người nhận). Làm trái gợi ý → bắt buộc lý do, vào Cần xem lại của Linh.
  *Kiểm tra:* test 33, 34, 36; PRD 36; S35, S37.
- [x] **3.8 Trừ cọc vào bill.** Đơn tạo từ lịch hiện "Cọc đã nhận …đ". Xác nhận đơn → app tự ghi khoản thu loại cọc, không quá số còn phải thu. Lịch nhóm dùng chung phần cọc còn lại. Huỷ khoản thu cọc → cọc trả về.
  *Kiểm tra:* test 35, PRD 35, 54. Lịch 2 khách cọc 200.000đ, hai đơn 150.000đ và 300.000đ → trừ 150.000đ và 50.000đ; S36.
- [x] **3.9 Màn cọc.** Chi tiết lịch có khối Cọc: ghi, trạng thái, xác nhận, hoàn/giữ kèm gợi ý. Danh sách lịch có nhãn "Chưa cọc", "Cọc chờ xác nhận". Cần xử lý: cọc chờ xác nhận, lịch chưa cọc, cọc chờ hoàn/giữ.
  *Kiểm tra:* 375px, sáng và tối; đếm lần chạm (mục 5).
- [x] **3.10 Tổng quan và báo cáo phần 3A.** Linh, Nhung: Tiền trong quỹ (hai tài khoản), cọc đang giữ, cọc chờ xác nhận. Báo cáo ngày/tháng: doanh thu cọc bỏ hẹn tách riêng, cọc đang giữ.
  *Kiểm tra:* PRD 36 ở mức báo cáo (doanh thu thợ của Nhung, Linh từ đơn không đổi); số trên Tổng quan khớp màn Sổ tiền.
- [x] **3.11 Chốt 3A.** `bun run check`, build, `scan-bundle`, `check-upgrade --from=0010`; gom test vào `tests/acceptance/coc-tet.test.ts` (mỗi test ghi đúng số module §13 / PRD §18) và `tests/security/so-tien.test.ts`; dữ liệu demo có cọc; báo kết quả. Triển khai 3A riêng được (khi anh yêu cầu) để chạy thử trước mùa cọc.

### 3B — Thu chi và chốt ngày

- [x] **3.12 Đề nghị chi và duyệt chi.** Migration `0013_cashbook` phần chi. Mọi người tạo đề nghị; duyệt hoặc từ chối theo bậc; "Đã chi" chọn tài khoản → bút toán; huỷ đề nghị khi chưa duyệt; Nhung tự duyệt phiếu của mình → Cần xem lại.
  *Kiểm tra:* test 8, 22, 37, §13C; S39–S41.
- [x] **3.13 Màn Thu chi (UI16, phần chi).** Danh sách theo trạng thái; form đề nghị (nhóm, số tiền, ghi chú); nút Duyệt, Từ chối, Đã chi.
  *Kiểm tra:* 375px; thợ chỉ thấy phiếu của mình.
- [x] **3.14 Chuyển nội bộ, thu khác, góp/rút vốn, điều chỉnh.** Nhung, Linh chuyển nội bộ; Linh lập phiếu còn lại.
  *Kiểm tra:* test 6 (chuyển 2.000.000đ tiền mặt sang ngân hàng, tổng không đổi), 7 (góp vốn 20.000.000đ tăng quỹ, không tăng doanh thu); S42, S43.
- [ ] **3.15 Tip giữ hộ.** Ghi khoản thu chuyển khoản có ô "Trong đó tip"; app chia theo phần tiền từng thợ, sửa được khi khách chỉ định (tổng phải khớp) → bút toán `tip_in`. Cuối ngày Nhung chọn thợ, trả tiền mặt → bút toán `tip_payout`. Thợ thấy tip của mình.
  *Kiểm tra:* test 44; S44.
- [ ] **3.16 Hoàn tiền, huỷ đơn đã xác nhận.** Theo Q-E. Phiếu hoàn ≤ số đã thu còn lại; giảm doanh thu ngày làm dịch vụ và phần từng thợ theo tỷ lệ. Huỷ đơn đã xác nhận khi đã hoàn hết tiền thu. Sửa thông báo 422 ở bước 2.19 thành "Dùng Hoàn tiền".
  *Kiểm tra:* test 5 phần kỳ mở; trạng thái thu Hoàn một phần / Hoàn toàn bộ; S45, S46.
- [x] **3.17 Đối soát chuyển khoản.** Nhung, Linh đánh dấu khoản thu, cọc, tip chuyển khoản "đã khớp sao kê"; đã đối soát thì không huỷ được.
  *Kiểm tra:* huỷ khoản đã đối soát → chặn (API, SQL).
- [x] **3.18 Chốt quỹ (UI07).** Màn Chốt ngày: tiền mặt đầu ngày, thu, chi, lý thuyết; việc còn treo (đơn chờ xác nhận, đơn thu thiếu, tip chưa trả, cọc chờ xác nhận, chuyển khoản chưa đối soát); nhập số đếm, lý do khi lệch; xử lý lệch theo Q-D. Mở từ giờ đóng cửa; mỗi ngày một lần; không sửa, không xoá.
  *Kiểm tra:* §13D; test 14 phần khoá ngày; chốt trước 21:00 → 422; chốt lần hai → 409; bút toán ghi sau khi chốt rơi vào ngày kế; S47.
- [ ] **3.19 Chứng từ ảnh.** Migration `0015_attachments`. Chụp hoặc chọn ảnh trên iPhone, thu nhỏ, gửi lên; gắn vào phiếu chi, phiếu hoàn, phiếu Linh lập; xem theo quyền của phiếu.
  *Kiểm tra:* test 5 phần chứng từ; S48.
- [ ] **3.20 Báo cáo dòng tiền (§7.5) và báo cáo ngày (§11).** Tháng: số dư đầu/cuối từng tài khoản; thu khách, thu cọc, hoàn cọc, thu khác; chi theo nhóm; rút vốn; chuyển nội bộ hiện riêng, không cộng vào tổng; theo ngày; cảnh báo doanh thu lớn mà tiền thu nhỏ. Ngày: thêm thu chi, hoàn, tip giữ hộ, chốt quỹ.
  *Kiểm tra:* test 18 (số dư cuối tháng = đầu + thu − chi từng tài khoản); Σ các ngày = số tháng.
- [ ] **3.21 Tổng quan phần 3B.** Cần xử lý thêm: đề nghị chi chờ duyệt, tip chưa trả, hôm qua chưa chốt quỹ. Cần xem lại (Linh) thêm: phiếu chi Nhung tự duyệt, phiếu hoàn của Nhung (theo Q-E), lệch quỹ (theo Q-D), cọc xử lý trái gợi ý.
  *Kiểm tra:* đăng nhập 4 tài khoản, đối chiếu mục hiện ra với quyền ở mục 8.
- [ ] **3.22 Chốt Đợt 3.** Phản biện lại toàn đợt (skill `phan-bien`); `bun run check`, build, `scan-bundle`, `check-upgrade`; cập nhật `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`; danh sách việc còn thiếu; báo kết quả.

## 10. Kiểm thử

### 10.1. Test PRD §18 và module §13 theo bước

| Test | Bước | Ghi chú |
|---|---|---|
| Module 29, 30 | 3.5 | Theo Q-C |
| Module 31, 32 | 3.6 | |
| Module 33, 34, 36 | 3.7 | |
| Module 35; PRD 35, 54 | 3.8 | |
| PRD 2 | 3.2 | |
| PRD 27 | 3.3 | Phần lợi nhuận ở Đợt 4–5 |
| PRD 36 | 3.7, 3.10 | Hoa hồng Linh không đổi: kiểm cơ sở hoa hồng; số tiền hoa hồng ở Đợt 4 |
| PRD 8, 22, 37 | 3.12 | |
| PRD 6, 7 | 3.14 | |
| PRD 44 | 3.15 | |
| PRD 5 | 3.16, 3.19 | Kỳ mở; kỳ đã khoá ở Đợt 4 (test 25, 41) |
| PRD 14 | 3.18 | Khoá ngày; khoá lương ở Đợt 4 |
| PRD 18 | 3.20 | |
| PRD 25, 41 | Đợt 4 | Kỳ lương |
| PRD 19, 29 | Đợt 5 | Xuất dữ liệu, nhập dữ liệu cũ |

### 10.2. Test bảo mật

| Mã | Tình huống | Kết quả bắt buộc | Điểm |
|---|---|---|---|
| S31 | Trang, Chin xác nhận cọc (API và SQL) | 403; DB không đổi | Test 32 |
| S32 | Ghi cọc hai lần cùng mã; số tiền ≤ 0 hoặc quá lớn; lịch cơ sở khác | Một khoản cọc; 422; 404 | |
| S33 | Thợ đọc số dư, sổ, cọc đang giữ toàn quán (API, SQL, SSE) | 403 / 0 dòng / không nhận sự kiện tiền | §4 |
| S34 | `app_user` ghi thẳng bảng sổ; đổi trạng thái cọc không qua hàm | Lỗi DB | P47 |
| S35 | Hoàn và giữ cùng một cọc song song; hoàn phần đã trừ vào bill | Chỉ một thao tác thành công; chặn | P46 |
| S36 | Hai đơn song song cùng trừ một cọc vượt số cọc | Constraint chặn khi commit | P55 |
| S37 | Thợ huỷ lịch mình tạo có cọc đã xác nhận (API, SQL) | 403 | Test 36 |
| S38 | Thông báo cọc trên màn hình khoá | Không SĐT, không ghi chú | Module §9.3 |
| S39 | Nhung duyệt phiếu 1.200.000đ hoặc phiếu sửa chữa 300.000đ (API, SQL) | 403 | Test 37 |
| S40 | Thợ tự duyệt, tự bấm Đã chi; sửa số tiền sau khi duyệt | 403; chặn | Invariant 14 |
| S41 | Bấm Đã chi hai lần | Một bút toán | P46 |
| S42 | Nhung mở sổ, góp/rút vốn, điều chỉnh | 403 | §8 |
| S43 | Chuyển nội bộ cùng tài khoản, số âm, tài khoản cơ sở khác | 422 / 404 | |
| S44 | Trả tip hai lần; trả quá số tip đang giữ | Một lần; chặn | P52 |
| S45 | Hoàn vượt số đã thu; hai phiếu hoàn song song cộng lại vượt | 422 cho phiếu vượt | |
| S46 | Huỷ đơn đã xác nhận khi còn tiền thu chưa hoàn | 422 | |
| S47 | Chốt quỹ hai lần; sửa hoặc xoá bản chốt | 409; lỗi DB | Test 14 |
| S48 | Gửi file không phải ảnh, ảnh > 1MB; xem chứng từ của phiếu ngoài quyền | 422; 404 | P56 |

## 11. Phản biện trước khi code

| Điểm | Mức | Vấn đề | Cách chặn |
|---|---|---|---|
| P46 | 🔴 | Số dư sai vì một nguồn ghi bút toán hai lần (bấm hai lần, trigger chạy khi sửa cột khác) | Unique `(source_type, source_id, entry_type)`; trigger chỉ ghi khi trạng thái đổi; khoá idempotency |
| P47 | 🔴 | Sửa số dư bằng cách sửa bút toán | Bảng chỉ thêm; `app_user` chỉ SELECT; sửa sai bằng bút toán đảo hoặc điều chỉnh có lý do (Linh) |
| P48 | 🟠 | Thợ ghi cọc tiền mặt, giữ tiền, để cọc "chờ xác nhận" mãi | Cọc chưa xác nhận không vào quỹ; nằm trong Cần xử lý; chốt quỹ cảnh báo cọc chờ xác nhận |
| P49 | 🟠 | Chin hoàn cọc cho người quen trái quy định 12 tiếng | Gợi ý do DB tính; làm trái gợi ý bắt buộc lý do, vào Cần xem lại của Linh |
| P50 | 🟠 | Lùi thời điểm báo huỷ để được hoàn | Mốc lấy `customer_cancel_reported_at` / `cancelled_at` do DB đặt bằng `now()`, không nhận từ máy |
| P51 | 🟡 | Chia nhỏ phiếu chi dưới 1.000.000đ để không cần Linh | Báo cáo tháng liệt kê phiếu chi theo người duyệt. Cảnh báo tự động chỉ làm nếu anh muốn (ngoài PRD) |
| P52 | 🟠 | Ghi tip khống rồi rút tiền mặt | Tip chỉ ghi kèm khoản thu chuyển khoản vào Tài khoản cs HTK (đối soát được với sao kê); trả tip ≤ tip đang giữ |
| P53 | 🟡 | Ngày bút toán lệch múi giờ (khoản thu lúc 23:30) | `business_date` tính trong DB theo múi giờ của cơ sở; test 23:59 và 00:01 |
| P54 | 🟡 | Đang chốt quỹ thì người khác ghi thu | Khoá dòng theo cơ sở + ngày khi chốt; bút toán sau khi chốt rơi vào ngày kế |
| P55 | 🟡 | Trừ cọc vượt số cọc khi lịch nhóm có nhiều đơn | Khoá dòng cọc khi trừ; constraint kiểm khi commit |
| P56 | 🟡 | Ảnh chứng từ lộ cho người không liên quan; ảnh nặng làm phình DB | Xem theo quyền của phiếu; ≤ 1MB; thu nhỏ trên máy; ≤ 3 ảnh/phiếu |
| P57 | ⚪ | Linh nhập mùa cọc sai năm | Kiểm đến ngày ≥ từ ngày, dài ≤ 31 ngày; hiện "Mùa cọc đang bật: …" ở Cài đặt và form lịch |
| P58 | 🟡 | Migration ghi bù bút toán chạy tự động trên hosting và sai | `check-upgrade --from=0010` có sẵn khoản thu và khoản huỷ; ghi bù có test; sao lưu DB trước khi triển khai |

## 12. Mặc định tôi tự đặt (không phải tham số nghiệp vụ, đổi được)

| Tham số | Giá trị |
|---|---|
| Ghi cọc | Tiền mặt → Tiền mặt cs HTK; chuyển khoản → Tài khoản cs HTK; điền sẵn số gợi ý, sửa được (> 0, ≤ 10.000.000đ); khác số gợi ý thì hiện nhắc |
| Ngày ghi doanh thu cọc bỏ hẹn | Ngày hẹn của lịch (như doanh thu ghi theo ngày làm dịch vụ). Báo huỷ muộn chỉ sớm hơn giờ hẹn dưới 12 tiếng nên gần như luôn cùng ngày |
| Hoàn cọc | Mặc định từ tài khoản đã nhận cọc, đổi được |
| Xử lý cọc trái gợi ý | Được, bắt buộc lý do, vào Cần xem lại của Linh |
| Huỷ lịch có cọc chưa xử lý | Người có quyền huỷ được; cọc hiện "Chờ hoàn/giữ" trong Cần xử lý |
| Phiếu chi | ≤ 100.000.000đ/phiếu; Linh lập thì tự duyệt; Nhung tự duyệt phiếu của mình trong hạn mức → Cần xem lại của Linh |
| Bấm "Đã chi" | Nhung, Linh; chọn tài khoản lúc chi |
| Chuyển nội bộ, đối soát, ghi và trả tip, chốt quỹ | Nhung, Linh |
| Mở sổ, góp/rút vốn, thu khác, điều chỉnh | Linh |
| Mở sổ | Một lần; ngày 1 của tháng, không sau tháng hiện tại; nhập sai thì bút toán điều chỉnh |
| Chốt quỹ | Mở từ giờ đóng cửa (21:00 trong Cài đặt lịch); hôm trước chưa chốt thì chốt bù được; mỗi ngày một lần |
| Ảnh chứng từ | ≤ 3 ảnh/phiếu; ≤ 1MB/ảnh sau khi thu nhỏ |
| Danh sách bút toán | ≤ 62 ngày, ≤ 500 dòng mỗi lần (như lịch, đơn) |

## 13. Rủi ro và cách quay lại

| Rủi ro | Cách xử lý |
|---|---|
| Đợt lớn, hạn cọc Tết cứng | Làm 3A trước, triển khai riêng được; 3B làm sau, không chặn mùa cọc |
| Đợt 2 chưa chạy thật trên hosting | Triển khai Đợt 2 ngay; quán dùng thử đơn hàng trong lúc làm 3A, lỗi Đợt 2 sửa song song |
| Bút toán ghi bằng trigger khó dò lỗi | Mỗi trigger có test riêng; hàm SQL ngắn; test kiểm chéo số dư với Σ các nguồn (khoản thu, cọc, phiếu) |
| Sổ đã có dữ liệu thật thì phát hiện sai luật | Sửa bằng bút toán điều chỉnh; không sửa bút toán cũ; migration sửa trigger chỉ áp cho bút toán mới |
| Ảnh trong DB làm phình dung lượng | Giới hạn số ảnh, cỡ ảnh; theo dõi dung lượng DB; chuyển sang lưu file nếu cần |
| Migration chạy tự động khi app khởi động trên hosting (K08) | `check-upgrade` trước khi đẩy; nhắc anh sao lưu DB trước khi bấm Triển khai lại |
| Quay lại code cũ sau khi migration đã chạy | Bảng mới không ảnh hưởng code Đợt 2; `payments` chỉ thêm cột, thêm giá trị `deposit` |

**Quay lại khi hỏng:** commit local sau mỗi bước; hỏng thì quay về commit trước. Migration chỉ chạy tiến; ở local dựng lại bằng `db:reset` (chỉ DB `lindy_dev`/`lindy_test`). Không push khi chưa được yêu cầu.

## 14. File sẽ tạo hoặc sửa

**Tạo:**
- `db/migrations/0011_ledger.sql`, `0012_deposits.sql`, `0013_cashbook.sql`, `0014_tips_refunds.sql`, `0015_attachments.sql`.
- `src/server/money/` (sổ, mở sổ, chuyển nội bộ, phiếu Linh lập, chốt quỹ, `policy.ts`, `schema.ts`), `src/server/deposits/`, `src/server/expenses/`, `src/server/orders/refunds.ts`, `src/server/orders/tips.ts`, `src/server/attachments/`.
- `src/routes/api/money/…`, `api/deposits/…`, `api/expenses/…`, `api/tips/…`, `api/attachments/…`, `api/appointments/$id.deposits.ts`.
- `src/routes/_app/them/so-tien.tsx`, `thu-chi.tsx`, `chot-ngay.tsx`; `src/components/tien/` (thẻ số dư, dòng bút toán, sheet cọc, sheet phiếu chi, sheet hoàn tiền, ô ảnh chứng từ).
- `tests/acceptance/coc-tet.test.ts`, `tests/acceptance/so-tien.test.ts`, `tests/integration/ledger.test.ts`, `tests/security/so-tien.test.ts`.

**Sửa:**
- `src/server/authz/catalog.ts` (3 quyền mới).
- `src/server/appointments/` (cọc, huỷ lịch có cọc), `src/routes/_app/lich/$id.tsx`, form tạo lịch, `them/cai-dat-lich.tsx` (mùa cọc).
- `src/server/orders/service.ts` (xác nhận trừ cọc), `payments.ts` (tip, loại cọc), `policy.ts` (hoàn, huỷ đơn đã xác nhận), `components/don-hang/OrderView.tsx`, `lib/orders.ts`, `lib/order-math.ts` (trạng thái thu có hoàn).
- `src/server/reports/service.ts`, `_app/index.tsx` (Tổng quan), `them/index.tsx`, `them/bao-cao.tsx`.
- `scripts/demo-data.ts`, `docs/CHAY_LOCAL.md`, `CLAUDE.md`, `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md`.

## 15. Kết quả 3A (13/10/2026)

**Đã làm:** bước 3.1–3.11. Migration `0011_ledger` (sổ bút toán, mở sổ, ghi bù khoản thu Đợt 2), `0012_deposits` (mùa cọc, cờ cần cọc, khoản cọc, trừ cọc vào bill). Quyền mới `cashbook.manage`, `cashbook.owner`, `order.refund` đã thêm (`seedBase` tự gán trên hosting); `order.refund` dùng ở 3B.

| Kiểm | Kết quả |
|---|---|
| `bun run lint`, `typecheck` | Đạt |
| Test tự động | 230/230 đạt (19 file). Mới: `tests/integration/ledger.test.ts` (7), `tests/acceptance/coc-tet.test.ts` (17) |
| Module lịch test 29–36 | Đạt (tự động) |
| PRD §18 test 2, 35, 36, 54; 27 phần số dư | Đạt (tự động). Test 36: doanh thu đơn, doanh thu theo thợ không đổi; số tiền hoa hồng ở Đợt 4 |
| S31–S38 | Đạt (S33 phần SSE: hub chỉ gửi sự kiện `money` cho người có `money_accounts.read_balance`, kiểm bằng đọc code, chưa có test tự động) |
| `bun run build` (Node), `scan-bundle` | Đạt; 48 file trình duyệt không có bí mật |
| `check-upgrade --from=0010` và `--from=0005` | Đạt: ghi bù bút toán khoản thu cũ đúng (kể cả khoản đã huỷ); trừ cọc vào bill; mở sổ, số dư khớp |
| Thử trên trình duyệt 375×812 (tối) | Mở sổ; mùa cọc; tạo lịch có cọc; xác nhận cọc; nhãn Chưa cọc / Cọc chờ xác nhận / Đã cọc; Tổng quan có Tiền trong quỹ và Cọc Tết |

**Sửa trong lúc làm:**
- postgres.js gửi chuỗi `'true'` cho tham số kiểu boolean thành `false` → gửi thẳng giá trị boolean.
- Nhãn cọc ở đầu chi tiết lịch lấy từ dòng lịch (thiếu tổng cọc) → lấy theo khối cọc.
- Ngày mùa cọc không điền sẵn ở form (tránh lỡ bật mùa cọc từ hôm nay).

**Chưa kiểm / còn lại:**
- Thông báo cọc trên iPhone thật (cần sửa `VAPID_SUBJECT` trên hosting trước).
- Thử tay cho đủ 4 tài khoản (Trang ghi cọc, Chin hoàn/giữ, Linh xem lại) trên điện thoại thật.
- Hosting chưa có Đợt 2; triển khai Đợt 2 + 3A cùng lúc thì chạy 7 migration (0006–0012), đã giả lập đạt từ 0005.
- Bước 3B (3.12–3.22) chưa làm.

## 16. Chuẩn bị 3B (rà lại sau khi làm 3A, 13/10/2026)

Không có câu hỏi nghiệp vụ mới: K16–K18 và mục 12 đã đủ để làm 3B. Mục này ghi những gì 3A làm lộ ra, để 3B làm đúng chỗ.

### 16.1. Chia nhỏ 3B

| Phần | Bước | Xong là dùng được |
|---|---|---|
| **3B-1 Thu chi và chốt ngày** | 3.12–3.14, 3.17, 3.18 | Đề nghị chi, duyệt chi, chuyển nội bộ, phiếu Linh lập, đối soát, chốt quỹ cuối ngày |
| **3B-2 Tip, hoàn tiền, chứng từ, báo cáo** | 3.15, 3.16, 3.19–3.22 | Tip giữ hộ, phiếu hoàn, huỷ đơn đã xác nhận, ảnh chứng từ, dòng tiền tháng, trang Cần xem lại |

Mỗi phần chốt bằng `bun run check`, build, `scan-bundle`, `check-upgrade --from=0012`, commit.

### 16.2. Migration (đánh số lại cho khớp)

- `0013_cashbook` (3B-1): `expense_categories`, `expense_requests`, `cash_vouchers`, `cash_transfers`, `cash_day_closes`; thay `app.ledger_business_date` (ngày đã chốt quỹ thì sang ngày kế); cho phép đối soát.
- `0014_tips_refunds` (3B-2): `tip_holdings`, `tip_payouts`, `order_refunds`, `order_refund_allocations`; `orders_guard` thêm `confirmed → cancelled`.
- `0015_attachments` (3B-2).

### 16.3. Thiết kế chốt thêm

**Ngày của bút toán và chốt quỹ [P54]**
- "Đã chốt đến ngày X" = ngày lớn nhất trong `cash_day_closes` của cơ sở.
- Bút toán mới lấy ngày = max(hôm nay, X + 1).
- Chỉ chốt được ngày > X, không sau hôm nay. Hôm qua quên chốt thì hôm nay chốt bù được.
- Bỏ qua một ngày (quán nghỉ) thì ngày đó gộp vào lần chốt sau, vì số lý thuyết tính lũy kế.
- Tiền mặt lý thuyết của ngày D = Σ bút toán tài khoản tiền mặt từ ngày mở sổ đến hết D. Thu, chi trong ngày tính trên các bút toán của D.
- Phải mở sổ trước khi chốt quỹ.
- K17: lệch khác 0 → bút toán `cash_count_diff` ghi đúng ngày D, trong cùng giao dịch chốt (trước khi đánh dấu đã chốt), và vào Cần xem lại của Linh.

**Duyệt chi**
- Mức duyệt do DB tính: `owner` nếu số tiền > 1.000.000đ hoặc nhóm `owner_only`, ngược lại `manager`.
- Linh lập phiếu → tự duyệt.
- Nhung tự duyệt phiếu của mình (trong hạn mức) → vào Cần xem lại.
- "Đã chi": Nhung, Linh (`cashbook.manage`), chọn tài khoản lúc chi. Số dư âm vẫn cho chi nhưng màn hình cảnh báo (tiền thật đã ra).

**Đối soát chuyển khoản (3.17)**
- `payments_guard` hiện chặn mọi thay đổi `reconciliation_status` → mở riêng một đường: `unreconciled → reconciled` cho người có `cashbook.manage`, chỉ khoản chuyển khoản.
- Thêm cột đối soát cho `appointment_deposits` (cọc chuyển khoản) và `tip_holdings`.
- Đã đối soát thì không huỷ được.

**Tip (3.15)**
- `POST /api/orders/:id/payments` nhận thêm `tip` (chỉ khi chuyển khoản): số tip và cách chia.
- Mặc định chia theo phần tiền từng thợ của đơn; khách chỉ định thì nhập tay, tổng phải khớp.
- Đơn đã thu đủ vẫn ghi tip riêng được ("Ghi tip" trên chi tiết đơn).
- Trả tip: Nhung chọn thợ → trả hết tip đang giữ của thợ đó, một bút toán tiền mặt.
- Bỏ câu "Tip chuyển khoản ghi ở Đợt 3" trong `orders/payments.ts`.

**Hoàn tiền, huỷ đơn đã xác nhận (3.16, K18)**
- Phiếu hoàn ≤ đã thu − đã hoàn. Khoản trừ cọc cũng tính là đã thu.
- Doanh thu thuần của đơn = net − Σ hoàn (theo `revenue_date`). Phải thu khách không đổi.
- Sửa các chỗ đang tính doanh thu, đã thu, cho trừ phần hoàn:
  - `reports/service.ts`: `totals`, `byStaff`, báo cáo tháng theo ngày, theo dịch vụ;
  - `orders/service.ts`: danh sách, chi tiết, lọc "chưa thu đủ";
  - lịch sử đơn của khách.
- `paymentStatus` trong `lib/order-math.ts` thêm `refund_partial` / `refund_full` (Hoàn một phần / Hoàn toàn bộ).
- Sửa 3 câu báo "có ở Đợt 3":
  - `orders/service.ts`: sửa đơn đã xác nhận nhỏ hơn số đã thu → "Dùng Hoàn tiền";
  - `orders/service.ts`: huỷ đơn đã xác nhận → làm thật;
  - `components/don-hang/OrderEditor.tsx`.
- Huỷ đơn đã xác nhận: chỉ khi đã thu − đã hoàn = 0 (hoàn hết, hoặc huỷ khoản trừ cọc để cọc về lịch). Lịch liên kết: `sync_appointment` đã bỏ qua đơn huỷ.

**Chứng từ ảnh (3.19)**
- Route riêng nhận nhị phân (body JSON hiện giới hạn 64KB): `POST /api/attachments?ownerType=&ownerId=`, content-type `image/jpeg` hoặc `image/png`, ≤ 1MB, kiểm byte đầu file.
- Máy thu nhỏ trước khi gửi: cạnh dài 1600px, JPEG chất lượng khoảng 0,8, thường 200–400KB.
- `GET /api/attachments/:id`: kiểm quyền theo phiếu gốc, `Cache-Control: private`.
- Gói DB trên Vibe Host (Starter) chưa rõ dung lượng → theo dõi. Khoảng 100 ảnh/tháng ≈ 30–40MB/tháng.

**Cần xem lại của Linh (3.21)**
- Hiện mỗi loại nằm một nơi: đơn (lọc ở Đơn hàng), phiếu ưu đãi, cọc (Cần xử lý của Lịch).
- 3B thêm phiếu chi Nhung tự duyệt, phiếu hoàn của Nhung, lệch quỹ → gom thành một trang **Thêm → Cần xem lại** (PRD §5.2, UI02), Tổng quan hiện tổng số.
- Mỗi dòng mở đúng phiếu, có nút "Đã xem".

### 16.4. Chuẩn bị ngoài code (anh, Linh)

- **Triển khai Đợt 2 + 3A trước khi làm xong 3B** để quán dùng thử đơn hàng và sổ tiền. Đã giả lập nâng cấp từ bản đang chạy (0005) và đạt. Các bước: anh bảo em đẩy lên GitHub → sao lưu DB trên Vibe Host → Triển khai lại → kiểm `/api/health`.
- **Ngày mở sổ** (Q24, ngày 1 của tháng): nếu mở sổ 01/11/2026 thì sáng 01/11 Linh đếm tiền mặt, xem số dư tài khoản ngân hàng rồi nhập ở Thêm → Sổ tiền. App cần chạy trên hosting trước ngày đó.
- **Mùa cọc Tết 2027**: Linh nhập ngày dương lịch của 19 và 28 tháng Chạp ở Cài đặt lịch khi gần đến (app không tự đổi lịch âm).
- **`VAPID_SUBJECT`** trên hosting: sửa thành `mailto:` + email quán để thử thông báo cọc trên iPhone.
## 17. Kết quả 3B-1 (13/10/2026)

**Đã làm:** bước 3.12, 3.13, 3.14, 3.17, 3.18. Migration `0013_cashbook`.

| Kiểm | Kết quả |
|---|---|
| `bun run check` (lint, typecheck, test) | Đạt: 240/240 (20 file). Mới: `tests/acceptance/so-tien.test.ts` (10) |
| PRD §18 test 6, 7, 8, 14 (khoá ngày), 22, 37; §13C | Đạt (tự động) |
| S39–S43, S47 | Đạt (tự động) |
| `bun run build`, `scan-bundle` | Đạt; 50 file trình duyệt không có bí mật |
| `check-upgrade --from=0012` và `--from=0005` | Đạt (thêm bước thử chi tiền, chuyển nội bộ) |
| Thử trên trình duyệt 375×812 | Linh lập phiếu chi (duyệt luôn) → Đã chi tiền mặt, số dư giảm đúng; chuyển nội bộ; khớp sao kê; màn Chốt quỹ (Nhung khi chưa mở sổ, Linh sau khi mở sổ) |

**Thiết kế chốt khi làm:**
- Đối soát theo bút toán của tài khoản ngân hàng (khoản thu, cọc, chuyển nội bộ, phiếu); khoản thu của đơn đồng bộ cột `reconciliation_status`. Không gỡ đối soát.
- Chốt quỹ gợi ý hôm nay (từ giờ đóng cửa) hoặc hôm qua; các ngày chưa chốt trước đó gộp vào. Số dư mở sổ tính vào đầu kỳ.
- Phiếu Nhung tự duyệt: hiện nhãn "cần Linh xem lại" cho cả hai, chỉ Linh bấm "Đã xem".
- Tổng quan có "Cần xử lý · thu chi": phiếu chờ duyệt, chờ chi, quên chốt quỹ, phiếu và lần chốt cần Linh xem lại.

**Chưa kiểm:** thử tay đủ 4 tài khoản trên điện thoại thật (Trang đề nghị chi, Nhung duyệt và chi, Linh duyệt phiếu trên mức).