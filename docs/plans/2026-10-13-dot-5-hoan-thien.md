# Kế hoạch Đợt 5 — Hoàn thiện

**Ngày:** 13/10/2026 · **Trạng thái:** CHỜ DUYỆT. Chưa viết code. `[x]` xong và đã kiểm; `[~]` làm một phần; `[ ]` chưa làm.
**Nguồn:** `CLAUDE.md`; `docs/DECISIONS.md` (D14, Q40, Q42, K20–K22); PRD v1.2 §1 (điểm đích), §4 (`profit.read`, `payroll.export_all_branch`), §7.1 (lợi nhuận tạm tính), §11, §15, §16, §17, §18 (test 19, 27, 29), §19.6; PRD v1.1 §15, §16 (chi tiết nhập dữ liệu cũ); kế hoạch Đợt 2–4 (phần dời sang Đợt 5).

Ký hiệu `[Pn]`: điểm phản biện ở mục 11 (nối tiếp P76). `Sn`: test bảo mật ở mục 10.2 (nối tiếp S62).

## 1. Hiểu yêu cầu

Làm PRD §17 Đợt 5: báo cáo tháng đầy đủ, xuất dữ liệu, nhập dữ liệu cũ. Cụ thể còn thiếu so với PRD:

- **Lợi nhuận ước tính** tháng (chỉ Linh, test 27); Tổng quan của Linh có lãi/lỗ tạm tính tháng (PRD §1).
- **Báo cáo đã chốt không bị đổi ngược** (§11).
- **Xuất CSV / XLSX / PDF** (§11, §15); bảng lương toàn quán chỉ Linh tải (Q40).
- **Sao lưu, khôi phục được** (§15, test 19).
- **Nhập dữ liệu cũ** từ Google Sheets 2025–2026 để tra cứu (D14, §16, test 29) — **sau khi app chạy ổn** (Q42).

Chia hai phần:

- **5A — Báo cáo, xuất dữ liệu, sao lưu:** làm ngay, không cần dữ liệu thật.
- **5B — Nhập dữ liệu cũ:** làm sau khi app chạy ổn ở quán (Q42) và anh gửi file xuất từ Google Sheets; cột của bảng tính chưa biết nên không tự đoán.

## 2. Hiện trạng (13/10/2026)

| Có sẵn | Dùng cho Đợt 5 |
|---|---|
| Báo cáo tháng (`monthReport`): doanh thu theo ngày, dịch vụ, thợ; cọc bỏ hẹn; dòng tiền, số dư; lương tháng; lịch huỷ, không đến; khách mới, quay lại | Phần lớn §11 đã có; thêm lợi nhuận, bản chốt, xuất file |
| Quyền `profit.read`, `payroll.export_all_branch` đã có, chỉ gán Linh | Không phải đổi vai trò |
| Sổ bút toán (chi theo ngày chi, nhóm chi vận hành / nhân sự), bảng lương (`app.payroll_view`), khoá lương (`app.payroll_lock`) | Chi phí, lương trong lợi nhuận; thời điểm chốt báo cáo |
| Audit log, `withUser`, RLS, `limitWrites` | Ghi lại mỗi lần tải file |

**Còn treo ngoài code:** triển khai (chờ Mắt Bão; hosting vẫn chạy bản Đợt 1), `VAPID_SUBJECT`, P62 (trả tip trước khi khớp sao kê).

## 3. Quyết định đã có và điểm cần chốt

**Đã chốt, không hỏi lại:**
- Nhung xem số dư hai tài khoản, **không xem lợi nhuận** (test 27); xem bảng lương toàn quán trên app, **không tải** (Q40). Tải bảng lương toàn quán chỉ Linh.
- Chi phí ghi khi trả tiền (§7.3); tạm ứng không phải chi phí; lợi nhuận ≠ số dư (§7.1).
- Doanh thu theo ngày làm dịch vụ (Q02); hoàn sau khoá tính vào tháng hoàn (Q34).
- Nhập dữ liệu cũ sau khi app chạy ổn (Q42); thiếu chi tiết thì nhãn "không rõ dịch vụ / chưa biết đã thu tiền", không tạo tiền giả, không đụng số dư quỹ (§16, test 29).

**Cần chốt khi duyệt:**

**Q-K. Lợi nhuận ước tính tính những gì.**
- **(a) Đề xuất:** Lợi nhuận = doanh thu thuần (sau giảm giá, hoàn) + doanh thu cọc bỏ hẹn − chi vận hành đã chi − chi nhân sự ngoài bảng lương đã chi (nhóm Lương, Thưởng) − lương phải trả của tháng (bảng lương tạm tính hoặc đã khoá). Thu khác, góp/rút vốn, tạm ứng, tip giữ hộ, chênh lệch quỹ, điều chỉnh: **hiện riêng, không cộng vào**.
- (b) Như (a), cộng thêm thu khác (trừ tiền vay) và chênh lệch quỹ vào lợi nhuận.

Chặn bước 5.2.

**Q-L. "Báo cáo đã chốt không bị đổi ngược".** Doanh thu ghi theo ngày làm dịch vụ (Q02), nên đơn tháng cũ xác nhận muộn vẫn làm số tháng cũ thay đổi.
- **(a) Đề xuất:** khi Linh **khoá bảng lương** tháng, app chụp lại số báo cáo tháng (doanh thu, theo thợ, cọc bỏ hẹn, số đơn). Báo cáo tháng đó hiện **số đã chốt**, kèm dòng riêng **"phát sinh sau khi chốt"** (đơn xác nhận muộn, sửa đơn) nếu có.
- (b) Không chụp; báo cáo luôn tính lại theo ngày làm dịch vụ, chỉ ghi chú "số có thể đổi khi xác nhận đơn muộn".

Chặn bước 5.3.

**Q-M. Ai tải được file xuất** (báo cáo tháng, đơn hàng, sổ tiền, thu chi, khách hàng).
- **(a) Đề xuất:** **chỉ Linh**. Nhung xem mọi thứ trên app như hiện tại, không tải file (giống bảng lương, Q40).
- (b) Linh tải tất cả; Nhung tải được báo cáo doanh thu, đơn hàng, sổ tiền, thu chi (không bảng lương, không khách hàng, không lợi nhuận).

Chặn bước 5.4.

**Cách hiểu đang dùng (anh xem khi duyệt, thấy sai thì báo):**
1. **Lương trong lợi nhuận:** từ tháng bắt đầu tính lương trên app = lương phải trả trên bảng lương; tháng trước đó = phiếu chi nhóm "Lương" (thời Sheets). Sau tháng bắt đầu, nhóm chi "Lương", "Thưởng" chỉ dùng cho khoản ngoài bảng lương, để không tính hai lần.
2. **Bản chốt báo cáo gắn với khoá bảng lương** (theo Q-L), không có nút chốt báo cáo riêng.
3. **PDF = in từ trình duyệt** (Safari → Chia sẻ → In / Lưu PDF; máy tính: In → Lưu PDF) với kiểu trang in gọn. Không tạo PDF trên máy chủ.
4. **XLSX tự tạo, không thêm thư viện** (file nhỏ, mở được bằng Excel, Numbers, Google Sheets). CSV có BOM UTF-8 để Excel đọc đúng tiếng Việt.
5. **Ô bắt đầu bằng `=`, `+`, `-`, `@`** trong file xuất được thêm dấu `'` đằng trước để Excel không chạy như công thức [P77].
6. **Bản sao lưu trong app** (Linh tải): toàn bộ dữ liệu nghiệp vụ, kể cả ảnh chứng từ; **không** gồm mật khẩu, phiên đăng nhập, đăng ký push. Sao lưu chính vẫn là sao lưu tự động của Vibe Host.
7. **Dữ liệu cũ nhập vào bảng riêng** (không thành đơn: không phải thu, không hoa hồng, không vào sổ tiền, không vào lương); hiện trong lịch sử khách và báo cáo tháng cũ với nhãn "nhập từ Sheets".
8. **Lương cũ không nhập** (vẫn tra trên Sheets). PRD v1.2 §16 không yêu cầu.

## 4. Lựa chọn kỹ thuật

| Việc | Đề xuất | Phương án khác | Lý do |
|---|---|---|---|
| Lợi nhuận | Tính khi xem từ số đã có (doanh thu, cọc bỏ hẹn, bút toán chi theo nhóm, bảng lương); chỉ trả về khi có `profit.read` | Bảng lợi nhuận riêng | Một nguồn số; không có gì phải đồng bộ |
| Báo cáo đã chốt | Bảng `month_report_snapshots` (chỉ thêm), hàm khoá lương ghi trong cùng giao dịch | Chụp bằng TypeScript sau khi khoá | Không thể khoá xong mà thiếu bản chụp |
| XLSX | Tự ghi file OOXML tối thiểu (zip không nén, chuỗi trực tiếp) | Thư viện `exceljs`, `xlsx` | Không thêm phụ thuộc (thư viện `xlsx` bản npm có lỗi bảo mật đã biết) |
| PDF | Trang in (`@media print`) + nút "In / Lưu PDF" | Tạo PDF trên máy chủ | Không thêm thư viện, iPhone in / lưu PDF sẵn |
| Sao lưu trong app | Hàm DB `SECURITY DEFINER` xuất JSON từng bảng nghiệp vụ (Linh); `scripts/restore-check.ts` nạp vào DB tạm và so số liệu | Chỉ dựa vào Vibe Host | Chứng minh được "khôi phục được" (test 19) mà không đụng DB thật; Vibe Host vẫn là bản chính |

## 5. Thế nào là xong

**5A xong khi:**
- `bun run check` xanh; build chạy bằng Node; `scan-bundle` sạch; `check-upgrade --from=0017` và `--from=0005` đạt.
- Test PRD §18 **19** (xuất dữ liệu, sao lưu, khôi phục), **27** (phần lợi nhuận) đạt.
- S63–S68 đạt.
- Lợi nhuận một tháng mẫu khớp tính tay; file CSV, XLSX mở được trên máy tính và iPhone (anh thử một lần); in / lưu PDF báo cáo tháng gọn trên khổ A4.
- Cập nhật `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`; báo đúng kết quả, kể cả phần chưa kiểm.

**5B xong khi:** test 29 đạt; nhập thử một tháng thật, tổng doanh thu theo thợ khớp bảng tính; danh sách lỗi hiện đủ dòng trống, trùng, sai ngày, sai tổng.

## 6. Phạm vi

**Làm:** như mục 1.

**Không làm ở đợt này:**
- Tự đồng bộ với Google Sheets, gửi báo cáo qua Zalo / email.
- Nhập lương cũ (cách hiểu 8); nhập thu chi cũ vào sổ tiền (§16: không đụng số dư quỹ).
- Khôi phục bản sao lưu trong app lên hosting bằng giao diện (khôi phục thật dùng Vibe Host; bản trong app để kiểm và để giữ ở máy Linh).
- Thuế, hoá đơn điện tử (ngoài phạm vi; app chỉ xuất doanh thu tháng).
- Các mục P2 (nhắc hẹn tự động, đặt lịch online, tồn kho, VIP, dự báo dòng tiền).

## 7. Dữ liệu

### 7.1. `0018_reports` (5A)

- `month_report_snapshots`: `branch_id`, `month`, `figures` (jsonb: doanh thu gộp, giảm, hoàn, thuần, số đơn, theo thợ, cọc bỏ hẹn), `created_by`, `created_at`. Khoá chính `(branch_id, month)`; chỉ thêm. `app.payroll_lock` ghi bản chụp trong cùng giao dịch (theo Q-L).
- Quyền mới `data.export` (Linh; theo Q-M có thể thêm Nhung một phần).
- `app.backup_dump()` (`SECURITY DEFINER`, chỉ người có `data.export` ở mọi cơ sở): trả JSON từng bảng nghiệp vụ; bỏ `user_credentials`, `sessions`, `login_attempts`, đăng ký push, hàng đợi gửi push. Ghi audit.

### 7.2. `0019_legacy` (5B, chốt sau khi có file mẫu)

- `legacy_imports` (một lần nhập: tên file, tab, số dòng, người nhập, lúc nhập) và `legacy_sales` (ngày, tên khách, SĐT, thợ, số tiền, ghi chú, dòng gốc, `customer_id` nếu khớp). Không liên kết đơn, không bút toán, không sổ doanh thu tính lương.

## 8. Quyền

| Quyền | Linh | Nhung | Chin | Thợ |
|---|---|---|---|---|
| `profit.read` (có sẵn) — lợi nhuận ước tính | Có | Không | Không | Không |
| `data.export` (mới) — tải file báo cáo, đơn hàng, sổ tiền, thu chi, khách hàng; bản sao lưu | Có | Theo Q-M | Không | Không |
| `payroll.export_all_branch` (có sẵn) — tải bảng lương toàn quán | Có | Không | Không | Không |
| `legacy.import` (mới, 5B) — nhập dữ liệu cũ | Có | Không | Không | Không |

In / lưu PDF là chức năng của trình duyệt: ai xem được trang nào thì in được trang đó (thợ in phiếu lương của mình).

## 9. Các bước

Mỗi bước kiểm tra xong mới sang bước sau; xong bước nào đánh dấu `[x]` và commit local (không push khi chưa được yêu cầu).

### 5A — Báo cáo, xuất dữ liệu, sao lưu

- [ ] **5.1 Chốt Q-K, Q-L, Q-M.** Ghi vào `DECISIONS.md` (K23–K25).
- [ ] **5.2 Lợi nhuận ước tính.** Báo cáo tháng có khối "Lợi nhuận ước tính" (Linh): doanh thu, cọc bỏ hẹn, chi vận hành theo nhóm, chi nhân sự, lương, kết quả; các khoản không tính hiện riêng. Tổng quan (Linh, xem Tháng): "Lãi/lỗ tạm tính tháng".
  *Kiểm tra:* tháng mẫu khớp tính tay; Nhung, thợ gọi API → không có trường lợi nhuận (test 27); tháng trước tháng bắt đầu tính lương dùng phiếu chi nhóm Lương.
- [ ] **5.3 Báo cáo đã chốt.** Migration `0018_reports` phần bản chụp; khoá lương ghi bản chụp; báo cáo tháng hiện số đã chốt và "phát sinh sau khi chốt" (theo Q-L).
  *Kiểm tra:* khoá tháng M, xác nhận đơn tháng M muộn → báo cáo tháng M hiện số chốt không đổi, dòng phát sinh +tiền đơn đó; xoá, sửa bản chụp → lỗi DB.
- [ ] **5.4 Xuất file (máy chủ).** Bộ ghi CSV, XLSX; `GET /api/export/:loai?month=&format=csv|xlsx`. Loại: báo cáo tháng (XLSX nhiều trang: tổng hợp, theo ngày, theo thợ, theo dịch vụ, dòng tiền, lương, lợi nhuận nếu là Linh), đơn hàng tháng (mỗi đơn một dòng, dùng kê khai doanh thu), sổ tiền tháng, thu chi tháng, bảng lương tháng (`payroll.export_all_branch`), khách hàng. Mỗi lần tải ghi audit.
  *Kiểm tra:* quyền theo Q-M (S63, S64); CSV có BOM, tiền là số nguyên, ngày dd/mm/yyyy; XLSX giải nén được, đủ trang; ô bắt đầu bằng `=` được chặn [P77].
- [ ] **5.5 Giao diện xuất, in.** Thêm → **Xuất dữ liệu** (chọn tháng, loại, CSV/XLSX). Nút **In / Lưu PDF** ở Báo cáo tháng và phiếu lương; kiểu trang in ẩn thanh điều hướng, nền trắng, khổ A4.
  *Kiểm tra:* 375px; tải được trên Safari iPhone (anh thử) và máy tính; bản in một trang báo cáo tháng gọn.
- [ ] **5.6 Sao lưu, khôi phục.** Thêm → Xuất dữ liệu → **Tải bản sao lưu** (Linh, JSON). `scripts/restore-check.ts --file=…` dựng DB tạm cùng phiên bản migration, nạp, so số đơn, doanh thu từng tháng, số dư từng tài khoản, số ảnh. Việc anh làm trên Vibe Host: bật sao lưu tự động, xem có bản sao lưu hằng ngày.
  *Kiểm tra:* test tự động xuất → nạp lại → số liệu khớp (test 19); bản sao lưu không có mật khẩu, phiên (S65); Nhung, thợ tải → 403 (S66).
- [ ] **5.7 Chốt 5A.** Phản biện lại; `bun run check`, build, `scan-bundle`, `check-upgrade`; cập nhật tài liệu; báo kết quả.

### 5B — Nhập dữ liệu cũ (sau khi app chạy ổn, Q42)

- [ ] **5.8 Nhận file mẫu.** Anh xuất 1–2 tab tháng (2025, 2026) từ Google Sheets ra CSV gửi em. Em chốt cách đọc cột, cập nhật mục 7.2 và các bước 5.9–5.11, báo anh duyệt.
- [ ] **5.9 Nhập.** Thêm → Nhập dữ liệu cũ (Linh): tải CSV → xem trước, danh sách lỗi (trống, trùng, sai ngày, sai tổng, tên thợ không khớp, tên khách gần giống) → xác nhận nhập; nhập lại cùng file không nhân đôi.
- [ ] **5.10 Tra cứu.** Lịch sử khách hiện dòng "nhập từ Sheets"; báo cáo tháng cũ có khối doanh thu nhập từ Sheets (theo thợ), tách khỏi số của app.
  *Kiểm tra:* test 29 (nhập lịch sử không sinh tiền vào quỹ, không đổi số dư, không vào lương).
- [ ] **5.11 Chốt 5B.** Phản biện; kiểm tra; tài liệu; báo kết quả.

## 10. Kiểm thử

### 10.1. Test PRD §18

| Test | Bước | Ghi chú |
|---|---|---|
| 27 (phần lợi nhuận) | 5.2 | |
| 19 | 5.4–5.6 | Phần sao lưu Vibe Host do anh bật, kiểm trên trang hosting |
| 29 | 5.10 | 5B |

### 10.2. Test bảo mật

| Mã | Tình huống | Kết quả bắt buộc |
|---|---|---|
| S63 | Thợ, Chin tải bất kỳ file nào | 403 |
| S64 | Nhung tải bảng lương, khách hàng, lợi nhuận | 403 (theo Q-M, các loại khác) |
| S65 | Bản sao lưu chứa mật khẩu, mã phiên, khoá push | Không có |
| S66 | Nhung, thợ gọi thẳng hàm sao lưu (SQL) | Lỗi quyền |
| S67 | Sửa, xoá bản chụp báo cáo | Lỗi DB |
| S68 | Tên khách `=HYPERLINK(...)` trong file xuất | Thành chữ, không thành công thức |

## 11. Phản biện trước khi làm

| Mã | Điểm yếu | Cách chặn |
|---|---|---|
| P77 | Chèn công thức vào ô Excel qua tên khách, ghi chú | Thêm `'` trước ô bắt đầu bằng `=`, `+`, `-`, `@` |
| P78 | File xuất, bản sao lưu bị chuyển ra ngoài | Chỉ Linh tải (theo Q-M); mỗi lần tải có audit; không chặn được sau khi đã tải |
| P79 | Bản sao lưu lớn (ảnh chứng từ) làm chậm máy chủ | Xuất từng bảng, ảnh dạng base64; giới hạn một lần tải mỗi phút |
| P80 | Lợi nhuận tính hai lần tiền lương (bảng lương + phiếu chi nhóm Lương) | Cách hiểu 1; báo cáo ghi rõ nguồn từng khoản |

## 12. File sẽ tạo hoặc sửa

- **DB:** `db/migrations/0018_reports.sql` (5A); `db/migrations/0019_legacy.sql` (5B).
- **Server:** mới `src/server/export/` (csv, xlsx, service), `src/server/reports/profit.ts`; sửa `src/server/reports/service.ts`, `src/server/authz/catalog.ts`.
- **API:** `src/routes/api/export/$kind.ts`, `src/routes/api/backup.ts`.
- **Giao diện:** mới `src/routes/_app/them/xuat-du-lieu.tsx`; sửa `_app/them/bao-cao.tsx`, `_app/index.tsx`, `_app/them/index.tsx`, `components/luong/Payslip.tsx`, `src/styles/app.css` (kiểu trang in).
- **Script:** `scripts/restore-check.ts`, `scripts/check-upgrade.ts`.
- **Test:** `tests/acceptance/bao-cao-xuat.test.ts`, `tests/integration/backup.test.ts`.
- **Tài liệu:** `DECISIONS.md` (K23–K25), `CHAY_LOCAL.md`, `CLAUDE.md`, `OPEN_QUESTIONS.md`, kế hoạch này.

## 13. Rủi ro và cách quay lại

| Rủi ro | Cách giảm | Quay lại |
|---|---|---|
| Lợi nhuận sai (thiếu hoặc trùng khoản) | Báo cáo hiện từng khoản và nguồn; tháng mẫu tính tay | Sửa cách tính; không có dữ liệu lưu nên không cần sửa dữ liệu |
| XLSX tự viết không mở được trên Excel / Numbers | Theo đúng cấu trúc OOXML tối thiểu; anh mở thử một lần | Tạm dùng CSV (mở được ở mọi nơi) |
| Bản sao lưu lộ dữ liệu | Chỉ Linh; không gồm mật khẩu, phiên; audit | — |
| Migration lỗi khi triển khai | `check-upgrade` từ 0017 và 0005; sao lưu DB trước | Khôi phục bản sao lưu Vibe Host, triển khai lại bản trước |
| Nhập dữ liệu cũ sai, trùng | Xem trước, danh sách lỗi, nhập lại không nhân đôi; bảng riêng không đụng tiền | Huỷ một lần nhập (đánh dấu, không xoá) |
