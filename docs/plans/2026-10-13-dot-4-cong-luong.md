# Kế hoạch Đợt 4 — Công và lương

**Ngày:** 13/10/2026 · **Trạng thái:** CHỜ DUYỆT. Chưa viết code. `[x]` xong và đã kiểm; `[~]` làm một phần; `[ ]` chưa làm.
**Nguồn:** `CLAUDE.md`; `docs/DECISIONS.md` (D04, D08, D09, D13, A01, A05, C04, C05, K09–K19); PRD v1.2 §4, §6.1 (D04), §6.3 (Q34), §8, §9, §11, §12, §14 (UI08, UI09, UI10, UI16), §17, §18; PRD v1.1 §8, §9 (Q25–Q41, chi tiết hơn bản 1.2); `data/staff.csv`; kế hoạch Đợt 2, Đợt 3 (phần dời sang Đợt 4).

Ký hiệu `[Pn]`: điểm phản biện ở mục 11 (nối tiếp P64 của Đợt 3). `Sn`: test bảo mật ở mục 10.2 (nối tiếp S48).

## 1. Hiểu yêu cầu

Làm PRD §17 Đợt 4: ca fulltime, Vào ca / Ra ca, duyệt công, ngày nghỉ, ngày quán đóng cửa; tạm ứng; lương tạm tính, bản nháp ngày 5, khoá, trả lương ngày 10. Cộng phần Đợt 2, 3 dời sang: số tiền hoa hồng và KPI, đơn xác nhận sau khi khoá kỳ (D04), hoàn tiền sau khi khoá kỳ (Q34). Mục tiêu nghiệp vụ: hết làm lương tay trên Sheets; mỗi người xem được lương tạm tính của mình.

Chia hai phần, chấm công làm trước:

- **4A — Nhân viên và chấm công:** hồ sơ, chính sách lương theo tháng, ngày quán đóng cửa, Vào ca / Ra ca, đăng ký nghỉ, duyệt công, bảng công tháng. Triển khai riêng được để quán bắt đầu chấm công sớm; tháng lương đầu tiên trên app cần đủ dữ liệu công cả tháng.
- **4B — Lương:** sổ doanh thu tính lương (hoa hồng, KPI), tạm ứng, lương tạm tính, bảng lương, khoá, trả lương, Q34 và D04.

## 2. Hiện trạng (13/10/2026)

| Có sẵn | Dùng cho Đợt 4 |
|---|---|
| Quyền `payroll.read_all_branch`, `payroll.read_own`, `payroll.edit`, `payroll.approve_lock`, `payroll.pay`, `advance.approve`, `attendance.approve` đã có trong `catalog.ts` và đã gán đúng vai trò (PRD §4) | Không phải đổi vai trò |
| `order_staff_allocations.commission_base_amount` từng dòng chia thợ (gồm phần giảm giá quán chịu, invariant 12) | Cơ sở hoa hồng |
| `order_refunds.revenue_date` + `order_refund_allocations` (phần trừ từng thợ) | Hoàn tiền giảm hoa hồng, KPI; luật Q34 |
| Sổ bút toán `money_ledger_entries`, `app._ledger_post`, chốt quỹ, báo cáo dòng tiền | Chi tạm ứng, chi lương |
| Nhóm chi "Lương", "Thưởng" (Linh duyệt) | Giữ cho khoản ngoài bảng lương |
| Mẫu Đợt 2–3: trigger guard theo cột, constraint trigger kiểm khi commit, bảng chỉ thêm, `withUser`, version/409, idempotency, `limitWrites`, audit log | Mọi bảng công, lương |
| `scripts/check-upgrade.ts` | Thử nâng cấp DB trước khi triển khai |

**Chưa có:** bảng hồ sơ nhân viên, chính sách lương theo tháng, ngày đóng cửa, chấm công, nghỉ, tạm ứng, kỳ lương. Thợ hiện là tài khoản người dùng có vai trò trong cơ sở; Đợt 4 gắn hồ sơ, chính sách theo `user_id` (đã ghi ở kế hoạch Đợt 2).

**Còn treo ngoài code:** hosting vẫn chạy bản Đợt 1 (chờ Mắt Bão); `VAPID_SUBJECT` trên hosting sai dạng; P62 (trả tip trước khi khớp sao kê) chờ anh quyết.

## 3. Quyết định đã có và điểm cần chốt

**Đã chốt, không hỏi lại:**
- Mỗi người 1 ca fulltime 9:00–21:00 mỗi ngày = 1 công (A01, C05). Ca nửa ngày để sau.
- Ba lớp: ca dự kiến / giờ chấm thực tế / công được duyệt. **Quên chấm công không tự trừ lương** (test 23). Không tự trừ đi muộn, về sớm; không tự tính tăng ca.
- Nhung duyệt công, ngày nghỉ của mọi người, **kể cả của mình**, ghi audit log (Q27). Bổ sung công phải có lý do.
- Nghỉ không phép tính như nghỉ thường; vượt số ngày được hưởng thì trừ 1 ngày lương mỗi ngày, không phạt thêm (Q28).
- Ngày quán đóng cửa không tính là ngày nghỉ, trả lương như đi làm (Q29). Linh khai báo.
- Công thức §9.1: `cong_chuan = ngay_thang − nghi_huong`; `luong_ngay = luong_cung / cong_chuan`; `dieu_chinh_cong = (nghi_huong − nghi_thuc_te) × luong_ngay`; hoa hồng = Σ cơ sở hoa hồng đơn Đã xác nhận × %; KPI Nhung theo bậc trên doanh thu quán (< 85.000.000đ: 0; từ 85.000.000đ: 1%; từ 102.000.000đ: 1,5%; nhảy bậc trên toàn doanh thu); `luong_phai_tra = luong_cung + dieu_chinh_cong + hoa_hong + KPI + thuong_them − khau_tru`; `con_lai = luong_phai_tra − tam_ung_da_chi − luong_da_tra`.
- Ngày trước khi vào làm và sau khi nghỉ việc là ngày vắng (Q35). Cọc khách bỏ hẹn ngoài hoa hồng, KPI (C04). Doanh thu KPI không gồm tip (Q33).
- Đổi lương cứng, % hoa hồng chỉ từ ngày 1 của tháng; không tính lại kỳ đã khoá (Q36, test 13, 40).
- Tạm ứng: chỉ Linh duyệt; tối đa bằng lương cứng; không phải chi phí; trừ vào lương (Q37, Q38, A05).
- Nháp ngày 05, Linh khoá, trả ngày 10 bằng chuyển khoản hoặc tiền mặt theo từng người (Q41). Sai lệch sau khoá: điều chỉnh vào kỳ đang mở.
- Nhung xem toàn bộ bảng lương trên app, không sửa, khoá, trả, tải; thợ xem doanh thu, lương tạm tính, phiếu lương của mình (Q39, Q40, D13). Mọi lần xem bảng toàn quán ghi audit log.
- Đơn xác nhận sau khi kỳ lương khoá: phần hoa hồng, KPI vào kỳ đang mở (D04). Hoàn tiền sau khi khoá: tính vào tháng phát sinh hoàn, tháng cũ giữ nguyên (Q34, test 25, 41).
- Lương khi bắt đầu: bảng tháng 10/2026 (Q31, `data/staff.csv`): Linh 3.500.000đ, Nhung 7.000.000đ, Chin 4.000.000đ, Trang 3.500.000đ; hoa hồng 25%; nghỉ hưởng 3 ngày, Nhung 4; Linh có dòng lương (Q32).

**Linh tự nhập trong app, không cần trả lời trước khi code:**
- Ngày vào làm, cách nhận lương (chuyển khoản / tiền mặt) của từng người (`OPEN_QUESTIONS.md` §2).
- Chính sách lương từng người (số ở trên), mốc KPI (nạp sẵn 85tr/1%, 102tr/1,5%, Linh sửa được theo tháng).
- **Tháng bắt đầu tính lương trên app** (như tháng mở sổ): tháng đầu tiên mà đơn và công đều nhập đủ trên app. Tháng trước đó vẫn làm trên Sheets.
- Ngày quán đóng cửa (Tết 2027…).

**Cần chốt khi duyệt** (tài liệu thiếu; không tự đoán):

**Q-F. Ngày chưa duyệt công khi khoá lương.** Test 23 chỉ nói quên chấm công không tự trừ lương.
- **(a) Đề xuất:** trong tháng, ngày chưa duyệt tạm coi như đi làm (lương tạm tính không bị trừ) và hiện "chưa duyệt"; **khoá bảng lương chỉ được khi mọi ngày đã duyệt** (đi làm / nghỉ có phép / nghỉ không phép).
- (b) Khi khoá, ngày chưa duyệt tự tính là đi làm.

Chặn bước 4.16.

**Q-G. Hạn mức tạm ứng "tối đa bằng lương cứng".**
- **(a) Đề xuất:** **tổng các lần ứng trong một tháng** ≤ lương cứng (Chin ứng 3.000.000đ rồi xin thêm 1.500.000đ → chặn).
- (b) Mỗi lần ứng ≤ lương cứng, không giới hạn tổng.

Chặn bước 4.13.

**Q-H. Tạm ứng nhiều hơn lương của tháng** (ví dụ nghỉ nhiều, `con_lai` âm).
- **(a) Đề xuất:** khi khoá, phần âm tự chuyển thành **khoản trừ vào lương tháng sau**, có ghi tháng gốc; phiếu lương tháng này còn lại 0đ.
- (b) Để âm; Linh tự xử lý bằng thưởng thêm / khấu trừ.

Chặn bước 4.16.

**Cách hiểu đang dùng (anh xem khi duyệt, thấy sai thì báo):**
1. **Khoá từ ngày 5 tháng sau** (ngày tạo nháp). Trước đó chỉ có lương tạm tính. "Bản nháp" là trạng thái tháng đã qua mà chưa khoá, không cần tiến trình nền.
2. **Không mở lại kỳ đã khoá.** "Khoá/mở kỳ" ở PRD §4 hiểu là Linh khoá kỳ, kỳ sau tự mở. Sai lệch dùng điều chỉnh vào tháng đang mở (§9.4 bước 6).
3. **Việc xảy ra sau khi khoá** (xác nhận đơn muộn, sửa đơn đã xác nhận, phiếu hoàn, huỷ đơn) đưa phần hoa hồng, doanh thu KPI vào **tháng xảy ra việc đó** (luôn đang mở), tính theo % hoa hồng và bậc KPI của tháng nhận. Báo cáo doanh thu vẫn theo ngày làm dịch vụ (Q02, test 31); riêng phiếu hoàn sau khoá ghi doanh thu ở ngày hoàn (Q34).
4. **Lương tạm tính trong tháng:** ngày chưa tới và ngày chưa duyệt coi như đi làm, trừ ngày nghỉ đã duyệt; hoa hồng, KPI tính đến hôm nay.
5. **Ngày quán đóng cửa nằm ngoài thời gian làm việc** (trước ngày vào làm, sau ngày nghỉ việc) vẫn là ngày vắng.
6. **Trả lương** bằng nút "Trả lương" trong Bảng lương (Linh), không qua đề nghị chi, để không ghi chi phí lương hai lần. Trả được nhiều lần, tổng không quá số còn lại.
7. **Tạm ứng đã duyệt:** Linh hoặc Nhung bấm "Đã chi" (như phiếu chi đã duyệt). Linh tự đề nghị thì duyệt luôn. Tạm ứng trừ vào lương tháng xin ứng; tháng đó đã khoá lúc chi thì trừ vào tháng đang mở.
8. **Làm tròn** từng khoản (điều chỉnh công, hoa hồng, KPI) đến đồng; ví dụ Q35 ra đúng 2.285.714đ.
9. **Hệ số ngày lễ** (Q30, mặc định 1,0): chưa làm. Q30 chốt "như ngày thường" nên kết quả giống hệt; khi anh muốn hệ số khác thì làm cùng danh sách ngày lễ.
10. **Chấm công không kiểm vị trí, mạng wifi**: PRD không yêu cầu; Nhung duyệt công là lớp kiểm.

## 4. Lựa chọn kỹ thuật

| Việc | Đề xuất | Phương án khác | Lý do |
|---|---|---|---|
| Hoa hồng, KPI theo tháng | **Sổ doanh thu tính lương** `payroll_revenue_entries`, chỉ thêm: mỗi đơn đã xác nhận, phiếu hoàn sinh dòng (thợ, tháng lương, cơ sở hoa hồng, doanh thu quán). Sửa, huỷ đơn: dòng đảo + dòng mới. Tháng tự nhiên đã khoá thì dòng vào tháng hiện tại | Mỗi lần xem thì cộng lại từ đơn theo `service_date` | Tháng đã khoá không đổi ngược (test 13, 25, 41, D04) mà không phải sửa luật báo cáo doanh thu; cùng mẫu sổ tiền Đợt 3 |
| Ai ghi sổ doanh thu tính lương | **Constraint trigger trong DB** chạy khi commit (đơn đổi trạng thái, đổi bộ dòng, đổi ngày; phiếu hoàn mới): so dòng đang có với dòng đúng, đảo dòng sai, ghi dòng mới | Code TypeScript ghi | Không quên, không ghi đôi; chạy lại không đổi gì |
| Công thức lương | **Một hàm SQL** `app.payroll_compute(cơ sở, tháng)` dùng cho lương tạm tính, bảng lương, khoá | Tính trong TypeScript | Một nguồn số; khoá lưu đúng số đang hiện; quyền xem kiểm ngay trong hàm |
| Khoá lương | Bảng chụp `payroll_lines` (đủ tham số: ngày tháng, công chuẩn, ngày vắng, lương ngày, cơ sở hoa hồng, %, doanh thu KPI, bậc, tạm ứng, điều chỉnh) chỉ thêm; khoá dùng khoá loại trừ theo cơ sở để không có dòng doanh thu nào lọt vào tháng đang khoá [P60] | Tính lại mỗi lần xem | Phiếu lương đã chốt không đổi khi chính sách, đơn thay đổi |
| Ngày công | Mỗi người mỗi ngày tối đa một dòng `attendance_days`; trạng thái ngày tính ra: đóng cửa → nghỉ đã duyệt → quyết định của Nhung → chưa duyệt | Bảng lịch ca chi tiết từng ngày | Chỉ có một ca fulltime; không cần xếp ca |
| Tiền tạm ứng, lương | Bút toán mới `advance`, `payroll` trong sổ tiền | Đi qua phiếu chi nhóm Lương | Tạm ứng không phải chi phí (§7.3); báo cáo dòng tiền tách riêng |

## 5. Thế nào là xong

**4A xong khi:**
- `bun run check` xanh; build chạy bằng Node; `scan-bundle` sạch; `check-upgrade --from=0015` và `--from=0005` đạt.
- Test PRD §18 **40** đạt; **23** phần chấm công (quên chấm không thành ngày vắng).
- S49–S54 đạt.
- Thử tay ở 375×812, sáng và tối: Vào ca ≤ 2 lần chạm từ Tổng quan; Nhung duyệt công cả quán một ngày ≤ 3 lần chạm.

**4B xong khi:**
- Test PRD §18 **9, 10, 11, 12, 13, 14** (khoá lương), **23** (lương), **25, 33, 34** (số tiền hoa hồng), **36** (hoa hồng Linh không đổi), **38, 39, 41, 42, 53** đạt; ví dụ Q35 (2.285.714đ) và D04 đạt.
- S55–S62 đạt.
- Bảng lương một tháng mẫu khớp tính tay; số chi lương, tạm ứng khớp sổ tiền và báo cáo dòng tiền.
- Cập nhật `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`; báo đúng kết quả, kể cả phần chưa kiểm.
- Sau triển khai (việc vận hành, ngoài code): chạy song song với bảng lương Sheets ít nhất một tháng, đối chiếu từng người (PRD §17).

## 6. Phạm vi

**Làm:** như mục 1.

**Không làm ở đợt này:**
- Ca sáng/chiều, ca nửa ngày, xếp ca theo tuần (chờ chủ, `OPEN_QUESTIONS.md` §4).
- Hệ số ngày lễ, danh sách ngày lễ (mục 3, cách hiểu 9).
- Kiểm vị trí, wifi khi chấm công; tự trừ đi muộn, về sớm; tăng ca.
- Mở lại kỳ đã khoá (mục 3, cách hiểu 2).
- Chặn tạo lịch hẹn vào ngày quán đóng cửa (module lịch không có luật này).
- Lợi nhuận ước tính, xuất file bảng lương (PDF/CSV/XLSX), nhập lương cũ từ Sheets → Đợt 5.
- Bảo hiểm, thuế TNCN (khấu trừ chỉ là dòng Linh tự nhập, có lý do).
- Push cho chấm công, nghỉ, tạm ứng, lương: PRD không có. Hiện trong Cần xử lý.

## 7. Dữ liệu

### 7.1. `0016_attendance` (4A)

- `staff_profiles`: `user_id` + `branch_id` (khoá chính), `start_date`, `end_date` (null = đang làm), `pay_method` (`cash` / `transfer`), `version`. Chỉ người có `payroll.edit` sửa. Ngày vào làm không đổi được về sau tháng đã khoá.
- `staff_policy_versions`: `user_id`, `branch_id`, `effective_month` (luôn ngày 1, test 40), `base_salary`, `commission_bps` (2500 = 25%), `leave_days` (3; Nhung 4), `manager_kpi` (có thưởng KPI quản lý), `reason`, `created_by/at`. Unique `(user_id, branch_id, effective_month)`. Thêm, sửa chỉ cho tháng sau tháng lương đã khoá cuối cùng (test 13). Hạn mức tạm ứng = `base_salary` (A05).
- `payroll_settings`: `branch_id`, `start_month` (tháng bắt đầu tính lương; null = chưa bật), `draft_day` (5), `pay_day` (10).
- `kpi_policy_versions`: `branch_id`, `effective_month`, `tier1_min` (85.000.000), `tier1_bps` (100), `tier2_min` (102.000.000), `tier2_bps` (150). Nạp sẵn.
- `shop_closed_days`: `branch_id`, `closed_date`, `reason`, `created_by/at`, `removed_by/at`. Unique ngày đang có hiệu lực. Không thêm, gỡ trong tháng đã khoá.
- `attendance_days`: `branch_id`, `user_id`, `work_date`, `check_in_at`, `check_out_at` (DB đặt giờ), `status` (null = chưa duyệt / `worked` / `leave` / `unexcused`), `decided_by/at`, `note` (bắt buộc khi bổ sung công không có giờ vào ca), `version`. Unique `(branch_id, user_id, work_date)`. Vào ca: chỉ chính mình, chỉ hôm nay theo giờ cơ sở, chỉ khi đang trong thời gian làm việc; vào hai lần → một dòng. Duyệt: `attendance.approve`; không sửa ngày của tháng đã khoá.
- `leave_requests`: `branch_id`, `user_id`, `from_date`, `to_date`, `reason`, `status` (`requested` / `approved` / `rejected` / `cancelled`), `decided_by/at`, `decide_note`, `version`. Nghỉ đã duyệt → các ngày đó là "nghỉ có phép" trừ khi Nhung quyết khác trên ngày đó.
- Nhung (hay ai có `attendance.approve`) tự duyệt công, nghỉ của mình → audit log (Q27).
- RLS: thợ đọc dòng của mình; người có `attendance.approve` hoặc `payroll.read_all_branch` đọc cả cơ sở; chính sách lương người khác chỉ người có `payroll.read_all_branch`.

### 7.2. `0017_payroll` (4B)

- `payroll_revenue_entries` (chỉ thêm): `branch_id`, `payroll_month`, `natural_month` (tháng làm dịch vụ hoặc tháng ghi hoàn), `staff_user_id` (null = dòng doanh thu quán cho KPI), `commission_base`, `shop_revenue`, `source_type` (`order` / `refund`), `source_id`, `order_id`, `reverses_id`. Ghi bù cho đơn, phiếu hoàn đã có (chưa có kỳ khoá → tháng tự nhiên).
  - Đơn Đã xác nhận: mỗi thợ một dòng (Σ `commission_base_amount` của thợ ở bộ dòng hiện tại) + một dòng quán (`net_amount`).
  - Phiếu hoàn (đơn còn Đã xác nhận): mỗi thợ −phần trừ; dòng quán −số hoàn.
  - Sửa đơn đã xác nhận, đổi ngày, huỷ: đảo dòng cũ, ghi dòng mới (huỷ → không ghi mới, đảo cả dòng phiếu hoàn).
  - `payroll_month` = `natural_month` nếu tháng đó chưa khoá, ngược lại tháng hiện tại (cách hiểu 3).
- `app.refund_order` sửa theo Q34: `revenue_date` = ngày làm dịch vụ nếu tháng lương đó chưa khoá, ngược lại ngày hoàn.
- `employee_advances`: `branch_id`, `user_id`, `amount`, `reason`, `status` (`requested` / `approved` / `rejected` / `paid` / `cancelled`), `payroll_month` (tháng xin; khi chi mà tháng đó đã khoá → tháng hiện tại), `decided_by/at`, `paid_by/at`, `paid_account_id`, `idempotency_key`, `version`. DB chặn vượt hạn mức theo Q-G (test 53), chặn người không có `advance.approve` duyệt (test 42). "Đã chi" → bút toán `advance` (−).
- `payroll_adjustments`: `branch_id`, `user_id`, `payroll_month`, `kind` (`bonus` thưởng thêm / `deduction` khấu trừ / `carry` chuyển từ tháng trước theo Q-H), `amount`, `reason`, `source_month`, `created_by/at`, `voided_by/at`. Chỉ Linh; không thêm, huỷ trong tháng đã khoá.
- `payroll_periods`: `branch_id`, `month`, `locked_by/at`, `totals`. Có dòng = đã khoá; chỉ thêm, không sửa, không xoá (test 14).
- `payroll_lines` (chỉ thêm, sinh lúc khoá): mọi tham số và số tiền từng người (mục 4).
- `payroll_payouts`: `branch_id`, `user_id`, `payroll_month`, `amount`, `money_account_id` (mặc định theo cách nhận lương), `paid_by/at`, `idempotency_key`. Σ trả ≤ còn lại. Bút toán `payroll` (−).
- Sổ tiền: thêm `entry_type` `advance`, `payroll`; `source_type` `advance`, `payroll_payout`.
- `app.payroll_compute(branch, month)`: trả mỗi người một dòng: ngày tháng, nghỉ hưởng, công chuẩn, lương ngày, ngày vắng, ngày chưa duyệt, điều chỉnh công, cơ sở hoa hồng, %, hoa hồng, doanh thu KPI, bậc, KPI, thưởng thêm, khấu trừ, phải trả, tạm ứng, đã trả, còn lại. Người không có `payroll.read_all_branch` chỉ nhận dòng của mình. Gọi xem toàn quán ghi audit log.

## 8. Quyền

Có sẵn, dùng ngay: `attendance.approve` (Linh, Nhung), `advance.approve` (Linh), `payroll.read_all_branch` (Linh, Nhung), `payroll.read_own` (mọi người), `payroll.edit`, `payroll.approve_lock`, `payroll.pay` (Linh), `cashbook.manage` (Linh, Nhung: chi tạm ứng đã duyệt), `booking_settings.manage` (Linh: ngày đóng cửa).

Thêm vào `catalog.ts` (`seedBase` tự gán khi khởi động trên hosting):

| Quyền mới | Linh | Nhung | Chin | Thợ |
|---|---|---|---|---|
| `attendance.own` — Vào ca / Ra ca, đăng ký nghỉ, xem công của mình | Có | Có | Có | Có |
| `advance.request` — đề nghị tạm ứng | Có | Có | Có | Có |

`payroll.edit` dùng cho: hồ sơ, chính sách lương, mốc KPI, tháng bắt đầu, thưởng thêm, khấu trừ.

## 9. Các bước

Mỗi bước kiểm tra xong mới sang bước sau; xong bước nào đánh dấu `[x]` và commit local (không push khi chưa được yêu cầu).

### 4A — Nhân viên và chấm công

- [ ] **4.1 Chốt Q-F, Q-G, Q-H.** Ghi vào `DECISIONS.md` (K20–K22).
- [ ] **4.2 Bảng nhân viên, chính sách.** Migration `0016_attendance` phần hồ sơ, chính sách, `payroll_settings`, mốc KPI, RLS. Dữ liệu dev: hồ sơ, chính sách 4 người theo `data/staff.csv` (chỉ DB `lindy_dev`).
  *Kiểm tra:* test 40 (hiệu lực 15/11 → 422; 01/12 → được); Nhung, thợ sửa chính sách → 403 (API, SQL); thợ đọc chính sách người khác → 0 dòng.
- [ ] **4.3 Màn Nhân viên (UI09, phần hồ sơ).** Thêm → Nhân viên: danh sách người trong cơ sở; mở một người: ngày vào, ngày nghỉ việc, cách nhận lương; chính sách theo tháng (lương cứng, % hoa hồng, ngày nghỉ hưởng, thưởng KPI quản lý) có lịch sử. Mốc KPI, tháng bắt đầu tính lương. Linh sửa; Nhung chỉ xem.
  *Kiểm tra:* 375px, sáng và tối; Nhung không thấy nút sửa và API trả 403.
- [ ] **4.4 Ngày quán đóng cửa.** Cài đặt lịch thêm khối "Ngày quán đóng cửa" (thêm một ngày hoặc một khoảng ngày, lý do; gỡ).
  *Kiểm tra:* Nhung thêm → 403; trùng ngày → một dòng.
- [ ] **4.5 Vào ca / Ra ca.** API ghi giờ theo server; thẻ trên Tổng quan cho người có hồ sơ: "Vào ca" / "Đã vào 8:57 · Ra ca"; Lịch → **Chấm công**: tháng của tôi (từng ngày: giờ vào/ra, trạng thái, số ngày đã nghỉ / được hưởng).
  *Kiểm tra:* vào ca hai lần → một dòng; vào ca hộ người khác → 403; quên vào ca → ngày "chưa duyệt", không phải ngày vắng (test 23 phần công); S49, S50.
- [ ] **4.6 Đăng ký nghỉ.** Mọi người đăng ký ngày nghỉ (từ ngày, đến ngày, lý do), huỷ khi chưa duyệt; Nhung, Linh duyệt / từ chối; Nhung tự duyệt của mình → audit log.
  *Kiểm tra:* thợ tự duyệt → 403; duyệt ngày thuộc tháng đã khoá → chặn (kiểm lại ở 4B); S51.
- [ ] **4.7 Duyệt công (UI08).** Lịch → Chấm công (Nhung, Linh): chọn ngày → mọi người: giờ vào/ra, nghỉ đã duyệt; **Duyệt tất cả người đã vào ca**; người thiếu chấm: **Đi làm** (cần lý do) hoặc **Nghỉ không phép**; đổi quyết định có lý do, có lịch sử.
  *Kiểm tra:* thợ duyệt → 403 (API, SQL); bổ sung công không lý do → 422; Nhung tự duyệt → có audit log; S52.
- [ ] **4.8 Bảng công tháng (UI09).** Lưới ngày × người: đi làm, nghỉ có phép, không phép, đóng cửa, chưa duyệt, ngoài thời gian làm; cộng ngày vắng, ngày chưa duyệt. Thợ chỉ thấy dòng mình.
  *Kiểm tra:* đếm khớp tay cho tháng mẫu (31 ngày, 2 ngày nghỉ, 1 ngày đóng cửa).
- [ ] **4.9 Tổng quan phần 4A.** Cần xử lý (Nhung, Linh): ngày chưa duyệt công (trước hôm nay), đơn nghỉ chờ duyệt.
  *Kiểm tra:* đăng nhập 4 tài khoản, đối chiếu với quyền ở mục 8.
- [ ] **4.10 Chốt 4A.** `bun run check`, build, `scan-bundle`, `check-upgrade --from=0015` và `--from=0005`; test gom vào `tests/acceptance/cham-cong.test.ts`, `tests/security/cham-cong.test.ts`; dữ liệu demo có chấm công; `CHAY_LOCAL.md`; báo kết quả. Triển khai 4A riêng được (khi anh yêu cầu).

### 4B — Lương

- [ ] **4.11 Sổ doanh thu tính lương.** Migration `0017_payroll` phần sổ: bảng, trigger khi commit trên đơn và phiếu hoàn, ghi bù, sửa `refund_order` theo Q34.
  *Kiểm tra:* xác nhận đơn → dòng đúng từng thợ và dòng quán; sửa đơn đã xác nhận, đổi ngày sang tháng khác, huỷ → đảo đúng, tổng theo đơn khớp; chạy lại không ghi đôi; `app_user` ghi thẳng bảng → lỗi; S55.
- [ ] **4.12 Tính lương.** `app.payroll_compute` + `GET /api/payroll?month=` (lương tạm tính tháng này, bản nháp tháng trước).
  *Kiểm tra:* test 9, 10, 11, 38, 39; Q35 (Chin vào 16/10 → 2.285.714đ); test 33 (hoa hồng Chin 125.000đ), 34 (+12.500đ), 36 (cọc bỏ hẹn không đổi hoa hồng Linh, KPI Nhung); test 23 phần lương; S56.
- [ ] **4.13 Tạm ứng.** Đề nghị (mọi người), duyệt / từ chối (Linh), Đã chi (Linh, Nhung; chọn tài khoản) → bút toán `advance`; theo Q-G.
  *Kiểm tra:* test 42, 53; chi hai lần → một bút toán; S57, S58.
- [ ] **4.14 Màn Tạm ứng (UI16, phần tạm ứng).** Thêm → Tạm ứng: form (số tiền, lý do; hiện hạn mức còn lại và lương tạm tính để tham khảo), danh sách theo trạng thái, nút theo quyền.
  *Kiểm tra:* 375px; thợ chỉ thấy phiếu của mình.
- [ ] **4.15 Màn Bảng lương (UI10).** Thêm → Lương: chọn tháng; Linh, Nhung: bảng mọi người (phải trả, tạm ứng, đã trả, còn lại) và tổng; mở một người: phiếu lương đủ tham số (công, hoa hồng theo đơn, KPI, điều chỉnh từ tháng trước). Thợ: phiếu của mình. Linh: thêm thưởng thêm / khấu trừ có lý do.
  *Kiểm tra:* test 12 (thợ chỉ đọc của mình; Nhung đọc toàn bộ, không sửa, khoá, trả); mở bảng toàn quán → audit log.
- [ ] **4.16 Khoá bảng lương.** Từ ngày 5 tháng sau, Linh bấm **Khoá bảng lương** (hộp xác nhận hiện tổng tiền); theo Q-F, Q-H. Khoá xong: phiếu lương cố định; công, nghỉ, ngày đóng cửa, chính sách của tháng đó không sửa được; việc mới vào tháng đang mở.
  *Kiểm tra:* test 13, 14 (khoá lương), 25, 41; D04 (đơn làm 31/10 xác nhận sau khi khoá tháng 10 → hoa hồng vào tháng 11, doanh thu báo cáo vẫn tháng 10); khoá trước ngày 5 → 422; khoá hai lần → 409; S59, S60.
- [ ] **4.17 Trả lương.** Phiếu lương đã khoá có **Trả lương** (Linh): số tiền mặc định = còn lại, tài khoản theo cách nhận lương → bút toán `payroll`. Trả nhiều lần được, không quá còn lại.
  *Kiểm tra:* bấm hai lần → một bút toán; trả vượt → 422; Nhung trả → 403; S61.
- [ ] **4.18 Tổng quan, báo cáo phần 4B.** Thợ: lương tạm tính tháng này (Q39). Cần xử lý: tạm ứng chờ duyệt (Linh), tạm ứng chờ chi (Linh, Nhung), bảng lương chờ khoá (Linh, từ ngày 5), còn người chưa trả lương (Linh, từ ngày 10). Báo cáo dòng tiền: tạm ứng dòng riêng, chi lương vào chi nhân sự. Báo cáo tháng: lương phải trả, đã trả, tạm ứng, KPI quản lý (§11).
  *Kiểm tra:* số trên báo cáo khớp bảng lương và sổ tiền; S62.
- [ ] **4.19 Chốt Đợt 4.** Phản biện lại toàn đợt; `bun run check`, build, `scan-bundle`, `check-upgrade`; test gom vào `tests/acceptance/luong.test.ts`, `tests/security/luong.test.ts`; cập nhật `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`; báo kết quả.

## 10. Kiểm thử

### 10.1. Test PRD §18 theo bước

| Test | Bước | Ghi chú |
|---|---|---|
| 40 | 4.2 | |
| 23 | 4.5, 4.12 | Theo Q-F |
| 9, 10, 11, 38, 39; Q35 | 4.12 | |
| 33, 34, 36 | 4.12 | Số tiền hoa hồng (Đợt 2, 3 mới kiểm cơ sở hoa hồng) |
| 42, 53 | 4.13 | Theo Q-G |
| 12 | 4.15 | Phần "không tải": chưa có tải file (Đợt 5) |
| 13, 14, 25, 41; D04 | 4.16 | |
| 27 | Đợt 5 | Phần lợi nhuận |

### 10.2. Test bảo mật

| Mã | Tình huống | Kết quả bắt buộc |
|---|---|---|
| S49 | Vào ca hộ người khác; vào ca cho ngày khác hôm nay (API, SQL) | 403 / chặn |
| S50 | Người chưa có hồ sơ, đã nghỉ việc, tài khoản bị khoá vào ca | 403 |
| S51 | Thợ tự duyệt nghỉ của mình; huỷ nghỉ đã duyệt | 403 |
| S52 | Thợ duyệt công (API, SQL); sửa giờ vào ca | 403; giờ do DB đặt |
| S53 | Thợ đọc công, chính sách lương người khác (API, SQL) | 403 / 0 dòng |
| S54 | Nhung, thợ sửa chính sách, hồ sơ, ngày đóng cửa | 403 |
| S55 | `app_user` ghi thẳng sổ doanh thu tính lương, phiếu lương, kỳ lương | Lỗi DB |
| S56 | Thợ gọi tính lương người khác, tháng khác (API, SQL) | Chỉ dòng của mình |
| S57 | Nhung, thợ duyệt tạm ứng (API, SQL) | 403 (test 42) |
| S58 | Tạm ứng vượt hạn mức; hai đề nghị song song cộng lại vượt | 422 cho phiếu vượt |
| S59 | Sửa công, nghỉ, ngày đóng cửa, chính sách, điều chỉnh của tháng đã khoá | Chặn |
| S60 | Nhung khoá lương; khoá song song với xác nhận đơn cùng tháng | 403; dòng mới không lọt vào tháng đã khoá |
| S61 | Nhung, thợ trả lương; trả hai lần; trả vượt còn lại | 403; một lần; 422 |
| S62 | Thợ nhận sự kiện tiền, lương qua SSE | Không nhận |

## 11. Phản biện trước khi làm

| Mã | Điểm yếu | Cách chặn trong kế hoạch |
|---|---|---|
| P65 | Thợ vào ca ở nhà | Không có kiểm vị trí (PRD không yêu cầu); giờ do server ghi; Nhung duyệt công là lớp kiểm |
| P66 | Nhung tự duyệt công, nghỉ của mình để được cộng lương | Q27 cho phép; mọi lần tự duyệt ghi audit log; Linh xem phiếu lương trước khi khoá |
| P67 | Xác nhận đơn đúng lúc Linh khoá tháng → hoa hồng lọt vào tháng đã khoá | Ghi sổ lấy khoá chia sẻ theo cơ sở, khoá lương lấy khoá loại trừ (như P60) |
| P68 | Sửa đơn đã xác nhận của tháng đã khoá để đổi hoa hồng tháng cũ | Dòng đảo và dòng mới đều vào tháng đang mở |
| P69 | Linh đổi chính sách lùi về tháng đã khoá | DB chặn tháng ≤ tháng khoá cuối (test 13) |
| P70 | Hai đề nghị tạm ứng song song vượt hạn mức | Constraint kiểm khi commit, khoá theo người |
| P71 | Bấm trả lương hai lần, hai máy | Mã chống gửi trùng + constraint Σ trả ≤ còn lại |
| P72 | Nhung xem bảng lương rồi chụp màn hình gửi ra ngoài | Không chặn được bằng app; có audit log mỗi lần xem toàn quán (Q40) |

## 12. File sẽ tạo hoặc sửa

- **DB:** `db/migrations/0016_attendance.sql`, `db/migrations/0017_payroll.sql`.
- **Server:** `src/server/authz/catalog.ts`; mới `src/server/staff/`, `src/server/attendance/`, `src/server/advances/`, `src/server/payroll/` (schema, policy, service); sửa `src/server/reports/service.ts` (Tổng quan, dòng tiền, báo cáo tháng), `src/server/money/service.ts` (nhãn bút toán mới).
- **API:** `src/routes/api/staff-profiles/…`, `api/attendance/…`, `api/leave/…`, `api/closed-days.ts`, `api/advances/…`, `api/payroll/…`.
- **Giao diện:** mới `src/routes/_app/lich/cham-cong.tsx`, `_app/them/nhan-vien.tsx`, `_app/them/luong.tsx`, `_app/them/tam-ung.tsx`; sửa `_app/index.tsx` (thẻ Vào ca, lương tạm tính, Cần xử lý), `_app/them/index.tsx`, `_app/them/cai-dat-lich.tsx`, `_app/them/bao-cao.tsx`, `_app/lich/index.tsx` (lối vào Chấm công), `src/lib/money-book.ts`.
- **Test:** `tests/acceptance/cham-cong.test.ts`, `tests/acceptance/luong.test.ts`, `tests/security/cham-cong.test.ts`, `tests/security/luong.test.ts`, `tests/integration/payroll-ledger.test.ts`.
- **Script:** `scripts/demo-data.ts` (hồ sơ, chính sách, chấm công mẫu), `scripts/check-upgrade.ts` (thử 4A, 4B).
- **Tài liệu:** `DECISIONS.md` (K20–K22), `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`, kế hoạch này.

## 13. Rủi ro và cách quay lại

| Rủi ro | Cách giảm | Quay lại |
|---|---|---|
| Công thức lương sai làm trả sai tiền | Test theo đúng ví dụ PRD (9, 10, 11, 38, 39, Q35); phiếu lương hiện đủ tham số để Linh kiểm; chạy song song với Sheets ít nhất một tháng | Trước khi khoá: sửa code, số tự tính lại. Sau khi khoá: điều chỉnh vào tháng đang mở |
| Khoá nhầm (không mở lại được) | Chỉ từ ngày 5; hộp xác nhận hiện tổng tiền và số ngày chưa duyệt; theo Q-F không khoá khi còn ngày chưa duyệt | Thưởng thêm / khấu trừ tháng sau |
| Ghi bù sổ doanh thu tính lương trên DB thật sai | `check-upgrade` từ 0015 và 0005; so tổng sổ với báo cáo doanh thu theo thợ từng tháng | Migration chưa áp dụng thì sửa; đã áp dụng thì migration sửa tiếp |
| Trigger khi commit làm chậm xác nhận đơn | Mỗi lần chỉ xử lý một đơn; có chỉ mục theo đơn | Tối ưu truy vấn, không đổi luật |
| Migration lỗi khi triển khai | Sao lưu DB trước khi triển khai; `check-upgrade` | Khôi phục bản sao lưu, triển khai lại bản trước |
| Tháng lương đầu tiên thiếu dữ liệu (đơn, công nhập chưa đủ) | Tháng bắt đầu tính lương do Linh chọn; tháng trước đó vẫn dùng Sheets | Đổi tháng bắt đầu khi chưa khoá kỳ nào |
