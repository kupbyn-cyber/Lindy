# Kế hoạch: báo rõ khi tài khoản thiếu hồ sơ nhân viên

Ngày 20/10/2026. Trạng thái: **anh duyệt 20/10/2026, đang làm.**

## Bối cảnh

Tài khoản "Nhung Hi" (Quản lý) đủ quyền nhưng không đăng ký nghỉ, không vào ca, không có lương tạm tính, vì **chưa có hồ sơ nhân viên**. App không báo gì: thẻ Vào ca ở Trang chủ ẩn hẳn, màn Tài khoản không nhắc. Nguyên nhân gốc: gói dùng thử chỉ tạo hồ sơ cho tài khoản có tên trùng `data/staff.csv`; "Nhung Hi" khác "Nhung" nên bị bỏ qua im lặng. Đã nhập tay hồ sơ cho Nhung Hi trên bản thật ngày 20/10/2026.

Quyền gắn với tài khoản (vai trò), còn chấm công, nghỉ, lương cần thêm **hồ sơ** (ngày vào làm) và **chính sách lương** của tháng. Hai thứ tách rời nên dễ thiếu mà không ai biết.

## Mục tiêu và thế nào là xong

1. Linh thấy ngay ai thiếu hồ sơ hoặc chính sách lương ở **Thêm → Tài khoản** và trong **Cần xử lý** ở Trang chủ, bấm vào là tới đúng hồ sơ người đó.
2. Tạo tài khoản xong, app nhắc nhập hồ sơ và có nút mở thẳng hồ sơ người vừa tạo.
3. Người chưa có hồ sơ mở Trang chủ thấy dòng "Chưa có hồ sơ nhân viên…" thay vì thẻ Vào ca biến mất.
4. Nạp gói dùng thử: tài khoản không khớp tên trong `data/staff.csv` được **liệt kê ra**, không bỏ qua im lặng.
5. `bun run check` và `bun run build` qua; thử trên giao diện local bằng tài khoản mẫu.

## Phạm vi

**Làm:**
- Đếm người thiếu ở server, đọc qua RLS sẵn có (Chủ đọc được `staff_profiles`, `staff_policy_versions`).
- Nhãn, nút, dòng nhắc trên 5 chỗ: Tài khoản, sau khi tạo tài khoản, Nhân viên (mở thẳng một người), Cần xử lý, thẻ Chấm công ở Trang chủ, Dữ liệu dùng thử.

**Không làm:**
- Không đổi quyền, vai trò, RLS. Không migration, không đổi dữ liệu.
- Không tự tạo hồ sơ khi tạo tài khoản (ngày vào làm, lương là số thật, không tự đoán).
- Không gửi thông báo đẩy về việc thiếu hồ sơ.
- Không đổi cách gói dùng thử ghép tên (vẫn so đúng tên). Nếu anh muốn ghép thêm theo chữ đầu ("Nhung Hi" → "Nhung" khi chỉ một người khớp) thì báo, tôi thêm một bước.
- Không đổi chữ "Linh, Nhung" trong giao diện sang tên vai trò (đề xuất 5, việc riêng).

## Hướng làm

- **A (chọn):** tính danh sách thiếu bằng truy vấn TypeScript ở server, dùng RLS hiện có. Không cần migration, triển khai nhẹ.
- B: viết hàm DB `app.staff_gaps` mới. Đồng bộ với kiểu "hàm DB kiểm quyền", nhưng phải thêm migration cho một việc chỉ đọc; RLS đã chặn người không có quyền.

**Ai bị tính là thiếu:** tài khoản đang hoạt động, còn vai trò ở cơ sở, chưa xoá, và
- chưa có hồ sơ → **"Thiếu hồ sơ"**, hoặc
- có hồ sơ, chưa nghỉ việc, nhưng chưa có chính sách lương áp dụng tháng này → **"Thiếu chính sách"**.

Cùng chữ với màn Nhân viên hiện nay. Chỉ người có `payroll.edit` (Chủ) thấy trong Cần xử lý và Tài khoản; Nhung không thấy vì không sửa được.

## File sẽ sửa

| File | Việc |
|---|---|
| `src/server/staff/service.ts` | Hàm `staffGaps(tx, branchId)`: danh sách người thiếu hồ sơ / chính sách |
| `src/server/admin/accounts.ts` | `listAccounts` thêm trường `staffGap` cho mỗi tài khoản |
| `src/server/payroll/service.ts` | `payrollAttention` thêm `staffMissing` (tên người thiếu), chỉ `payroll.edit` |
| `src/routes/_app/index.tsx` | Cần xử lý: dòng "Nhung Hi thiếu hồ sơ nhân viên" → mở Nhân viên |
| `src/routes/_app/them/tai-khoan.tsx` | Nhãn Thiếu hồ sơ / Thiếu chính sách; nút "Mở hồ sơ nhân viên"; hộp mật khẩu tạm nhắc nhập hồ sơ, có nút mở luôn |
| `src/routes/_app/them/nhan-vien.tsx` | Nhận `?u=<id>` để mở sẵn hồ sơ một người |
| `src/components/cong/AttendanceCard.tsx` | Chưa có hồ sơ: hiện dòng nhắc thay vì ẩn thẻ |
| `src/server/ops/demo.ts` | Kết quả nạp thử thêm `unmatched` (tên không khớp) |
| `src/routes/_app/them/du-lieu-thu.tsx` | Hiện danh sách tên không khớp sau khi nạp |
| `tests/security/accounts.test.ts`, `tests/acceptance/cham-cong.test.ts`, `tests/ops/demo.test.ts` | Test mới cho từng phần |
| `docs/DECISIONS.md`, `docs/CHAY_LOCAL.md` | Ghi S39 sau khi anh duyệt; thêm cách thử |

## Các bước

- [x] **1. Hàm đếm người thiếu và màn Tài khoản (server).** `staffGaps`, `listAccounts.staffGap`.
  Kiểm: test mới trong `accounts.test.ts`: tạo tài khoản → `profile`; lưu hồ sơ → `policy`; lưu chính sách tháng này → `null`; tài khoản bị khoá không tính. `bun run test tests/security/accounts.test.ts`.
- [x] **2. Màn Tài khoản và Nhân viên (giao diện).** Nhãn, nút "Mở hồ sơ nhân viên", nhắc sau khi tạo, `?u=` mở sẵn hồ sơ.
  Kiểm: typecheck; local `linh@lindy.test` tạo tài khoản thử → thấy nhắc và nhãn "Thiếu hồ sơ" → bấm nút → mở đúng hồ sơ.
- [x] **3. Cần xử lý của Linh.** `staffMissing` trong `payrollAttention`, dòng mới trong thẻ Cần xử lý.
  Kiểm: test: Linh thấy tên người thiếu, Nhung không thấy; local: Trang chủ Linh có dòng mới, bấm tới Nhân viên.
- [x] **4. Thẻ Chấm công ở Trang chủ.** Chưa có hồ sơ → "Chưa có hồ sơ nhân viên nên chưa vào ca, đăng ký nghỉ được. Báo Linh nhập ở Thêm → Nhân viên."
  Kiểm: test `myToday.hasProfile = false` với tài khoản mới (đã có sẵn dữ liệu trả về, chỉ đổi giao diện); local đăng nhập tài khoản thử → thấy dòng nhắc.
- [ ] **5. Gói dùng thử báo tên không khớp.** `summary.unmatched`, hiện trên màn Dữ liệu dùng thử sau khi nạp.
  Kiểm: test trong `demo.test.ts`: thêm tài khoản tên không có trong `staff.csv` → nằm trong `unmatched`, không có hồ sơ.
- [ ] **6. Kiểm toàn bộ.** `bun run check`, `bun run build`, `bun scripts/scan-bundle.ts`; ghi S39 vào `docs/DECISIONS.md`; thêm mục thử vào `docs/CHAY_LOCAL.md`.

Commit sau mỗi bước, không push. Triển khai lên Vibe Host chỉ khi anh yêu cầu.

## Rủi ro và cách quay lại

- **Tổng quan của Linh chậm thêm một truy vấn nhỏ** (4–10 tài khoản): không đáng kể.
- **Nhắc sai người** (ví dụ người đã nghỉ việc vẫn bị đếm): đã loại tài khoản khoá, đã thu quyền, đã xoá, hồ sơ có ngày nghỉ việc đã qua; test bước 1 kiểm các trường hợp này.
- **Phần gói dùng thử ít tác dụng với bản thật:** bản thật đã nạp gói thử, sau khi "Xoá, bắt đầu dùng thật" thì mục này khoá. Phần này chỉ giúp khi dựng app mới (cơ sở mới, máy mới).
- **Quay lại:** không đổi dữ liệu, không migration, nên `git revert` các commit là đủ.
