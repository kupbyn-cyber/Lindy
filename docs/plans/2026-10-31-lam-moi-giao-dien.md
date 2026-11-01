# Làm mới giao diện LINDY OS

Bắt đầu 31/10/2026. Trạng thái: **01/11/2026 anh quyết định dùng màu CEN WORK và triển khai (S51, S52), thay hướng B và phiếu của Linh. Đang ở Bước 4.**

Bốn bước: Phân tích → Đề xuất → Demo → Thực hiện. Mỗi bước xong ghi tiếp vào file này.

Mong muốn thêm của anh: giao diện chưa thân thiện với người dùng. Trang tham khảo: https://www.getlayers.ai/ (nền sáng nhiều khoảng trắng, chữ đậm to, thẻ bo lớn, ít đường kẻ, một màu nhấn, thứ bậc rõ).

---

## Bước 1: Phân tích

### 1.1. Đã làm gì, kiểm gì, chưa kiểm gì

**Đã đọc:** `CLAUDE.md`, `docs/DECISIONS.md` (D17 đến S44), `docs/surveys/02-phieu-phong-cach.md`, `design/design-system/README.md`, `tokens.json`, `src/styles/*`, `src/components/ui/*`, `src/routes/_app.tsx`, `__root.tsx`, `manifest.webmanifest`, và mã của các màn chính (Tổng quan, Lịch, chi tiết lịch, form lịch, Đơn hàng, chi tiết đơn, màn sửa đơn, các sheet chọn, Khách, Thêm, Chấm công, Chốt quỹ, Sổ tiền, Lương, cọc).

**Đã chạy:** app local (`bun run dev`, PostgreSQL nhúng cổng 5433, DB `lindy_dev`). Nạp gói **Dữ liệu dùng thử** (Thêm → Dữ liệu dùng thử): 77 lịch, 51 đơn, 18 khách, sổ tiền, chấm công, lương tạm tính. Tên, SĐT đều là giả (0900000100…).

**Đã xem:** mọi màn trong `src/routes/_app/` cùng `/dang-nhap`, ở khổ **390 × 844** (tỷ lệ 2×), **sáng và tối**, **4 vai trò** (Linh = Chủ, Nhung = Quản lý, Chin = Thợ có quyền lịch mở rộng, Trang = Thợ). Chụp bằng Chrome headless qua script `shoot.mjs` (nằm ở thư mục tạm, dùng lại ở Bước 4.5): Linh 31 màn, Nhung 25, Chin 17, Trang 17, mỗi màn hai giao diện, kèm bản chụp dài. Các hộp thoại (Lịch mới, Chọn dịch vụ, Ghi tiền thu) và luồng thao tác thật làm bằng tay trên trình duyệt trong app. 26 ảnh tiêu biểu chép vào `docs/plans/anh/2026-10-31-lam-moi-giao-dien/` (ví dụ [Chi tiết lịch](anh/2026-10-31-lam-moi-giao-dien/linh-light_chi-tiet-lich.png), [Khách](anh/2026-10-31-lam-moi-giao-dien/linh-light_khach.png), [Thêm](anh/2026-10-31-lam-moi-giao-dien/linh-light_them.png), [Đăng nhập](anh/2026-10-31-lam-moi-giao-dien/linh-light_dang-nhap.png)).

**Đã đo:** số lần chạm (mục 1.2), tương phản (mục 1.3, hai cách: tính từ token và quét DOM từng trang đã chụp, tính nền thực tế sau khi xếp lớp), kiểm kê trạng thái (mục 1.4, lấy từ mã nguồn, không bỏ sót trạng thái không có trong dữ liệu thử).

**Chưa kiểm được (nói rõ):**
- iPhone thật, Safari, app ghim màn hình chính; vuốt đổi ngày, chụm phóng to bằng tay thật; bàn phím iOS có che nút không.
- Khổ 360 (sẽ làm ở Bước 4.5).
- In bill (không có trạm in), chụp ảnh (không có camera).
- `/doi-mat-khau`: chỉ hiện khi tài khoản bị buộc đổi mật khẩu; đã đọc mã, bố cục giống hệt màn đăng nhập (`src/routes/doi-mat-khau.tsx`).
- Các trạng thái hiếm trên màn thật: lịch có cọc Tết (chưa cọc, cọc chờ xác nhận, hoàn/giữ cọc), đơn có hoàn tiền, phiếu lương đã khoá, phiếu chi bị từ chối. Màu của chúng lấy từ mã (mục 1.4).

### 1.2. Số lần chạm của việc hằng ngày

Quy ước: đếm số lần chạm vào nút, ô, dòng. Gõ bàn phím tính riêng ("+ gõ"). Đếm từ màn hợp lý nhất đang mở; sang tab khác tính thêm 1. Đã làm thật bằng tài khoản Trang (thợ) và Nhung.

| Việc | Vai | Đường đi | Chạm | Mục tiêu | Kết quả |
|---|---|---|---|---|---|
| Tạo lịch, giờ mặc định (mốc 15 phút kế tiếp) | mọi vai | Lịch: **+** → gõ tên → **Lưu lịch** | **2** + gõ | ≤ 4 | Đạt |
| Tạo lịch giờ khác | mọi vai | + → ô Bắt đầu → chọn giờ (bánh xe iOS, 1–2 chạm) → gõ tên → Lưu | 4–5 + gõ | ≤ 4 | Sát ngưỡng |
| Tạo lịch bằng chạm chỗ trống trên trục giờ | mọi vai | chạm ô giờ → gõ tên → Lưu | 2 + gõ | ≤ 4 | Đạt |
| Tạo đơn từ lịch | mọi vai | mở lịch → **Tạo đơn** | **2** | ≤ 3 | Đạt |
| Chọn dịch vụ rồi Làm xong (đơn 1 dịch vụ) | thợ | **Thêm dịch vụ** → tích dịch vụ → **Thêm 1 mục** → **Làm xong** | **4** (6 tính từ màn Lịch) | tạo đơn + xác nhận bill ≤ 3 | **Không đạt** |
| Xác nhận bill | thợ | Làm xong là xác nhận luôn (S41) | 0 thêm | ≤ 3 | Đạt |
| Xác nhận bill đơn chờ xác nhận | Nhung, Linh | mở đơn → Xác nhận bill → Xác nhận | 3 | ≤ 3 | Đạt |
| Ghi tiền thu (số tiền và Chuyển khoản điền sẵn, S29) | mọi vai | **Ghi tiền thu** → **Lưu** | **2** | ≤ 3 | Đạt |
| In bill | mọi vai | **In bill** | 1 | — | Đạt (chưa in thật) |
| Chụp ảnh thành phẩm | mọi vai | Chụp ảnh → Chụp ảnh (mở camera) → [chụp] → Lưu / Chia sẻ → [chọn Lưu hình ảnh] | 3 + camera + bảng chia sẻ iOS | — | Hợp lý |
| Vào ca | mọi vai | Tổng quan: **Vào ca** | **1** (2 nếu đang ở tab khác, 2 nếu phải cuộn tới thẻ) | — | Đạt |
| Ra ca | mọi vai | Ra ca → Ra ca (hỏi lại) | 2 | — | Hỏi lại là chủ ý (giờ không sửa được) |
| Chốt quỹ | Nhung, Linh | Thêm → Chốt quỹ → ô Tiền mặt đếm được → gõ → Chốt quỹ ngày… → Chốt quỹ (hỏi lại) | **5** + gõ | — | Nhiều |

Nhận xét: mọi việc một chạm đã tốt. Chỗ tốn chạm là **chọn dịch vụ** (3 chạm riêng cho một việc, vì chọn qua bảng trượt rồi phải bấm "Thêm N mục") và **đường vào Chốt quỹ** (hai chạm điều hướng rồi hai chạm xác nhận).

Ảnh luồng thật (tài khoản Trang, giao diện tối): [Lịch mới](anh/2026-10-31-lam-moi-giao-dien/trang-dark_lich-moi-sheet.jpg) · [Chi tiết lịch](anh/2026-10-31-lam-moi-giao-dien/trang-dark_chi-tiet-lich.jpg) · [Đơn trống](anh/2026-10-31-lam-moi-giao-dien/trang-dark_tao-don-trong.jpg) · [Chọn dịch vụ](anh/2026-10-31-lam-moi-giao-dien/trang-dark_chon-dich-vu.jpg) · [Đơn có 1 dòng](anh/2026-10-31-lam-moi-giao-dien/trang-dark_tao-don-1-dong.jpg) · [Sau Làm xong](anh/2026-10-31-lam-moi-giao-dien/trang-dark_don-sau-lam-xong-toast.jpg) · [Ghi tiền thu](anh/2026-10-31-lam-moi-giao-dien/trang-dark_ghi-tien-thu.jpg) · [Đã thu đủ](anh/2026-10-31-lam-moi-giao-dien/trang-dark_don-da-thu-du-toast.jpg) · [Chốt quỹ (Nhung)](anh/2026-10-31-lam-moi-giao-dien/nhung-dark_chot-quy.jpg).

### 1.3. Độ tương phản (WCAG 2.x, sáng / tối)

**Kết quả quét trang thật:** 184 trang chụp, mọi chữ nhìn thấy đều **≥ 4.5:1** ở cả hai giao diện. Viền ô nhập (`line-strong`) **≥ 3.07:1** trên cả ba nền. Vạch ô lịch, vạch giờ hiện tại ≥ 3:1 (trừ vạch huỷ, cố ý mờ, S31). Nghĩa là **phần chữ và viền ô nhập đang đạt chuẩn**, không cần sửa vì lý do tương phản.

Bảng cặp chính (tính từ `tokens.json`):

| Cặp | Sáng | Tối | Ghi chú |
|---|---|---|---|
| ink / surface, surface-raised, surface-sunken | 15.8 · 16.7 · 14.6 | 15.9 · 14.7 · 16.4 | |
| ink-muted / ba nền | 5.56 · 5.89 · 5.15 | 7.85 · 7.23 · 8.09 | |
| accent / surface · accent-soft | 7.47 · 6.67 | 7.87 · 6.31 | |
| on-accent / accent | 7.92 | 7.52 | |
| success / success-soft · surface | 5.59 · 6.13 | 7.37 · 9.63 | |
| warning / warning-soft · surface | 5.20 · 5.56 | 7.51 · 10.1 | |
| danger / danger-soft · surface | 5.85 · 6.76 | 6.91 · 8.30 | |
| ink-muted / warning-soft · success-soft · danger-soft | 5.20 · 5.08 · 4.82 | 5.84 · 6.00 · 6.53 | |
| line-strong / surface · raised · sunken | 3.31 · 3.51 · **3.07** | 3.85 · 3.55 · 3.97 | viền ô nhập, đạt |
| cal-booked-ink / cal-booked-bg · sub | 9.35 · 6.59 | 8.34 · 6.34 | |
| cal-active-ink / bg · sub | 7.78 · 4.89 | 8.83 · 7.11 | |
| cal-done-ink / bg · sub | 10.6 · 4.88 | 9.29 · 6.00 | |
| cal-cancel-ink / bg | 5.24 | 5.83 | |
| cal-deposit-ink / booked-bg · active-bg | 5.77 · 6.02 | 7.01 · 6.92 | |
| cal-*-bar / surface (booked, active, done, deposit, now) | 5.33 · 4.12 · 3.03 · 3.19 · 4.99 | 7.14 · 9.64 · 4.63 · 10.2 · 5.45 | đạt |
| cal-cancel-bar / surface | 1.74 | 2.47 | cố ý (S31) |

**Chỗ yếu (không phải chữ, nhưng ảnh hưởng cảm giác "đẹp" và "có chiều sâu"):**

| Cặp | Sáng | Tối | Ảnh hưởng |
|---|---|---|---|
| surface-raised / surface (nền thẻ so với nền trang) | 1.06 | **1.09** | Thẻ chỉ tách khỏi nền nhờ viền |
| surface-sunken / surface (nền SegmentedControl) | 1.08 | 1.03 | |
| line / surface, surface-raised (viền thẻ, đường kẻ) | 1.22 · 1.29 | 1.45 · 1.33 | Giao diện tối: thẻ gần như mất ranh giới |
| accent/45 (cột biểu đồ mờ) / surface-raised | 2.26 | 2.53 | Trang trí, chấp nhận được |
| Nút chính bị mờ (opacity 0.45): "Làm xong" khi chưa có dịch vụ, "Chốt quỹ" khi chưa nhập, "Chọn dịch vụ" khi chưa tích | ≈ 2.4 | ≈ 2.1 | WCAG miễn trừ nút tắt, nhưng nhìn như vẫn bấm được |

Kết luận: tương phản chữ không phải vấn đề. Vấn đề là **độ sâu** (thẻ, nền, viền quá gần nhau, nhất là giao diện tối) và **trạng thái nút**.

### 1.4. Kiểm kê trạng thái

Nguồn: `src/lib/orders.ts`, `src/lib/appointments.ts`, `src/lib/attendance.ts`, `src/routes/_app/them/{thu-chi,tam-ung,luong,tai-khoan,nhan-vien,may-in,chot-ngay}.tsx`, `src/components/**`. Chip trạng thái chỉ có **5 tone**: `success` xanh, `warning` cam, `danger` đỏ, `accent` mận, `neutral` xám.

| Nhóm | Trạng thái → nhãn → tone | Nơi dùng |
|---|---|---|
| **Đơn** | Đang làm → accent · Chờ xác nhận → warning · Đã xác nhận → neutral · Đã huỷ → danger | Danh sách đơn, chi tiết đơn, hồ sơ khách |
| **Tiền của đơn** | Chưa thu → danger · Thu một phần → warning · Đã thu đủ → success · Hoàn một phần → warning · Hoàn toàn bộ → neutral | Danh sách đơn (thay chip trạng thái khi đã xác nhận), chi tiết đơn |
| Nhãn phụ của đơn | Vượt khoảng giá → warning · Có dòng nhập tay → warning · Giảm chờ duyệt → warning · Cần xem lại → accent · Cần Linh xem lại (phiếu hoàn) → accent | Chi tiết đơn, màn sửa đơn |
| **Lịch** | Mới đặt → accent (không còn dùng, S02) · Đã chốt lịch → neutral (chip ẩn) · Khách đã đến → success · Đang làm → success · Hoàn thành → neutral · Đã huỷ → danger · Khách không đến → danger · Yêu cầu huỷ → warning · Ngoài giờ mở cửa → warning | Danh sách, chi tiết lịch |
| Ô lịch (S31) | Đã chốt → hồng mận · Khách đã đến, Đang làm → xanh · Hoàn thành → xám · Huỷ, không đến → xám gạch ngang · Chưa cọc, cọc chờ, yêu cầu huỷ → vạch cam | Màn Ngày, Tuần, vạch đầu dòng ở Danh sách |
| **Cọc** (trạng thái lịch) | Chưa cọc → warning · Cọc chờ xác nhận → **accent** · Đã cọc → success | Chip trên lịch, chi tiết lịch |
| Cọc (từng khoản) | Chờ xác nhận → **warning** · Đã nhận cọc → success · Đã hoàn cọc → neutral · Quán giữ cọc → accent · Đã huỷ → neutral | Khối Cọc trong chi tiết lịch |
| **Chấm công** (ngày) | Đi làm → success · Nghỉ có phép → accent · Nghỉ không phép → danger · Chưa duyệt → warning · Quán đóng cửa, Ngoài thời gian làm, Chưa tới → neutral · Nghỉ đã duyệt (thẻ Vào ca) → accent | Của tôi, Duyệt công, Bảng công (ô lưới cùng tone), thẻ Chấm công ở Tổng quan |
| Đơn nghỉ | Chờ duyệt → warning · Đã duyệt → success · Bị từ chối → danger · Đã huỷ → neutral | Chấm công |
| **Lương** (tháng) | Làm trên Sheets → neutral · Tạm tính → accent · Chờ ngày nháp → neutral · Bản nháp, chờ khoá → warning · Đã khoá → success | Màn Lương |
| Lương (từng người) | Còn N đ → warning · Đã trả đủ → success · Khoản thưởng/trừ Đã huỷ → neutral | Màn Lương, phiếu lương |
| **Thu chi** | Chờ duyệt → warning · Đã duyệt, chờ chi → accent · Đã chi → success · Từ chối → danger · Đã huỷ → neutral · Linh duyệt → neutral · Cần Linh xem lại → warning | Thu chi |
| **Tạm ứng** | Chờ Linh duyệt → warning · Đã duyệt, chờ chi → accent · Đã chi → success · Từ chối → danger · Đã huỷ → neutral | Tạm ứng |
| Chốt quỹ | Chờ Linh xem → warning · lệch quỹ → số âm đỏ | Chốt quỹ |
| Tài khoản, nhân viên | Đã thu quyền → danger · Đã khoá (tài khoản) → danger · Chưa đổi mật khẩu → warning · Thiếu hồ sơ, Thiếu chính sách → warning · Đã khoá (nhân viên) → neutral | Thêm → Tài khoản, Nhân viên |
| Khác | Trạm in Đang kết nối → success, Mất kết nối → warning · Máy này (thông báo) → accent · Sửa tên (khách) → warning · Mùa cọc Đã tắt → neutral · Lần nhập Đã huỷ → neutral · Số việc chờ ở Thêm → warning · Loại việc ở Cần xem lại → accent | |

**Một màu mang nhiều nghĩa:**

- **Mận (accent)** vừa là *hành động* (nút chính, mục đang chọn, link) vừa là **9 trạng thái "trung gian, thông tin"**: Đang làm, Tạm tính, Đã duyệt chờ chi (thu chi và tạm ứng), Cọc chờ xác nhận, Quán giữ cọc, Nghỉ có phép, Cần xem lại, Máy này. Chip mận trông như nút bấm được.
- **Cam (warning)** gánh 4 nghĩa: *đang chờ ai đó* (Chờ xác nhận, Chờ duyệt, Chưa duyệt, Chờ Linh xem), *chưa đủ* (Thu một phần, Hoàn một phần), *dữ liệu đáng ngờ* (Vượt khoảng giá, nhập tay, Sửa tên, Thiếu hồ sơ), và *số việc chờ* (huy hiệu ở Thêm, Cần xử lý).
- **Đỏ (danger)** vừa là tiền (Chưa thu, số âm, "Khách còn nợ" chữ to) vừa là kết thúc xấu (Đã huỷ, Không đến, Từ chối, Nghỉ không phép, Tài khoản đã khoá) vừa là nút nguy hiểm.
- **Xám (neutral)** vừa là *xong tốt đẹp* (Đã xác nhận đơn, Hoàn thành lịch, Hoàn toàn bộ) vừa là *bỏ đi* (Đã huỷ của thu chi, tạm ứng, nghỉ, cọc).

**Một nghĩa có nhiều màu:**

- "Đã huỷ": lịch, đơn → đỏ; thu chi, tạm ứng, đơn nghỉ, khoản cọc, khoản thưởng → xám.
- "Chờ xác nhận / chờ duyệt": đơn → cam; cọc (trên lịch) → mận; khoản cọc → cam; "đã duyệt, chờ chi" → mận.
- "Đã xong": đơn Đã xác nhận → xám; lịch Hoàn thành → xám; lương Đã khoá → xanh; thu chi Đã chi → xanh; chấm công Đi làm → xanh.
- "Đang làm": đơn → mận; lịch → xanh (chip) và xanh (ô lịch).

### 1.5. Đang tốt, phải giữ

- **Toàn bộ màu đi qua token**; quét `src/` chỉ thấy màu viết cứng ở mã QR, khung ảnh thành phẩm và `@media print` (đúng ngoại lệ). Đổi token là đổi cả app.
- **Tương phản chữ đạt chuẩn** cả sáng và tối trên mọi trang (mục 1.3); ink nâu ấm thay đen thuần đúng tinh thần "dịu nhẹ".
- **Ô lịch kiểu lịch iPhone** (S31), vạch giờ hiện tại (S34), thanh ngày kéo ngang, SĐT ngay trong ô (S10): nhìn một cái biết ngày hôm nay thế nào. Giữ nguyên.
- **Các việc một, hai chạm**: tạo lịch 2 chạm; tạo đơn từ lịch 2 chạm; ghi tiền thu 2 chạm với số tiền và Chuyển khoản điền sẵn; Làm xong là xác nhận; Vào ca 1 chạm.
- **Nút chính dính đáy** ở chi tiết đơn (S30), **nút X** đóng hộp thoại (S05), thanh dưới 5 mục biểu tượng nét mảnh kèm chữ (G16, G17), huy hiệu số thông báo.
- Trang **Thêm** chia nhóm theo việc, có số việc chờ (S40); **Khách** nhóm theo ngày, che SĐT, nhãn Sửa tên.
- **Số tiền** dạng `8.450.000đ`, chữ số thẳng cột, tự co theo ô hẹp (`FitMoney`); Be Vietnam Pro đủ dấu; chữ LINDY OS có chân làm dấu hiệu thương hiệu (S13).
- Ô nhập 16px (Safari không tự phóng), vùng chạm ≥ 44px, chừa safe-area, chuyển động tối thiểu và tắt khi iPhone bật Giảm chuyển động (G21).
- Giọng văn ngắn, không emoji, đúng tên gọi của quán.

### 1.6. Mười vấn đề, xếp theo mức ảnh hưởng đến việc hằng ngày

| # | Vấn đề | Màn · vai | Ảnh | Nguyên nhân |
|---|---|---|---|---|
| 1 | **Thông báo "Đã…" che đúng nút cần bấm tiếp.** Sau Làm xong, toast "Đã xong, đã xác nhận bill" đè lên "Ghi tiền thu 70.000đ"; sau ghi tiền, "Đã ghi thu" đè lên "In bill", 2,5 giây (lỗi: 5 giây). Mỗi đơn người dùng chờ hoặc chạm hụt một nhịp. | Chi tiết đơn · mọi vai | [sau Làm xong](anh/2026-10-31-lam-moi-giao-dien/trang-dark_don-sau-lam-xong-toast.jpg), [sau ghi tiền](anh/2026-10-31-lam-moi-giao-dien/trang-dark_don-da-thu-du-toast.jpg) | **Bố cục.** `.lo-toast-wrap` và `.lo-actionbar` cùng neo ở `nav-h + 16px` (`src/styles/components.css:320`, `:523`). |
| 2 | **Chọn dịch vụ mất 3 chạm riêng; từ Lịch đến Làm xong 6 chạm** (mục tiêu 3). Bảng trượt chọn dịch vụ đóng rồi mới thấy dòng; mỗi dòng dịch vụ là thẻ cao ~210px (tên, giá, Sửa giá, 5 chip thợ, thành tiền) nên 2 dịch vụ đã phải cuộn; "Phụ thu" gãy 2 dòng. | Màn sửa đơn · thợ (người tạo đơn nhiều nhất) | [đơn trống](anh/2026-10-31-lam-moi-giao-dien/trang-dark_tao-don-trong.jpg), [chọn dịch vụ](anh/2026-10-31-lam-moi-giao-dien/trang-dark_chon-dich-vu.jpg), [1 dòng](anh/2026-10-31-lam-moi-giao-dien/trang-dark_tao-don-1-dong.jpg) | **Số bước + bố cục.** Chọn qua sheet tách rời với nút "Thêm N mục"; chip thợ hiện đủ danh sách dù mặc định là người tạo; thanh nút 3 ô "Không lưu · Lưu · Làm xong". |
| 3 | **Tổng quan không có thứ bậc.** Linh thấy 7 ô số cùng cỡ chữ 24–30px; nhãn overline gãy dòng ("DOANH THU THÁNG / 10"); "Khách còn nợ" đỏ to như báo lỗi; thẻ **Vào ca** (việc mỗi sáng) nằm dưới 7 ô, phải cuộn; thợ cũng phải qua 4 ô mới tới Vào ca. | Tổng quan · Linh, Nhung (và thợ) | [Linh sáng](anh/2026-10-31-lam-moi-giao-dien/linh-light_tong-quan.png), [Linh tối](anh/2026-10-31-lam-moi-giao-dien/linh-dark_tong-quan.png), [Chin](anh/2026-10-31-lam-moi-giao-dien/chin-light_tong-quan.png) | **Chữ + bố cục + màu.** Mọi ô dùng `display-money`; overline 11px, giãn 0.1em quá rộng cho ô nửa màn; `danger` dùng cho số thường. |
| 4 | **Giao diện tối phẳng, mất chiều sâu.** Nền thẻ chỉ sáng hơn nền trang 1.09:1, viền 1.45:1 nên thẻ chìm; nút chính hồng #e58fb1 to gần nửa màn chói trên nền gần đen; ô lịch "Đã chốt" mận đậm phủ cả màn Ngày. | Mọi màn · mọi vai | [Lịch tối](anh/2026-10-31-lam-moi-giao-dien/linh-dark_lich.png), [Tổng quan tối](anh/2026-10-31-lam-moi-giao-dien/linh-dark_tong-quan.png), [Danh sách tối](anh/2026-10-31-lam-moi-giao-dien/linh-dark_lich_view_ds.png) | **Màu.** Bộ tối chỉ đảo sáng, chưa có cấp bề mặt rõ (3 nền cách nhau ≤ 1.09), chưa có màu nhấn riêng cho nền tối. |
| 5 | **Một màu nhiều nghĩa, một nghĩa nhiều màu** (mục 1.4). Chip "Đang làm" mận giống nút; "Đã xác nhận" xám giống "Đã huỷ" của thu chi; "Cọc chờ xác nhận" mận nhưng khoản cọc "Chờ xác nhận" cam. Người dùng không học được "màu này nghĩa là gì". | Mọi màn có chip · mọi vai | [Đơn hàng](anh/2026-10-31-lam-moi-giao-dien/linh-light_don-hang.png), [Lương](anh/2026-10-31-lam-moi-giao-dien/linh-light_them_luong.png), [Bảng công](anh/2026-10-31-lam-moi-giao-dien/linh-light_lich_cham-cong_tab_bang.png) | **Màu.** Chỉ 5 tone cho ~45 trạng thái, chưa có quy định "màu theo nhóm nghĩa"; `accent` vừa là hành động vừa là trạng thái. |
| 6 | **Đầu mỗi màn tốn 130–180px trước khi có nội dung.** Thanh trên có chữ LINDY OS + chip "CS 31/49 HTK" + chuông (chip chiếm 40% ngang dù quán một cơ sở), rồi "← Thêm" chữ mận, rồi tiêu đề 22px; thanh trên nền trang, không viền, cuộn lên không phân biệt với nội dung. | Mọi màn · mọi vai | [Sổ tiền](anh/2026-10-31-lam-moi-giao-dien/linh-light_them_so-tien.png), [Báo cáo](anh/2026-10-31-lam-moi-giao-dien/linh-light_them_bao-cao.png) | **Bố cục + chữ.** AppBar và tiêu đề màn là hai tầng rời; nút quay lại là chữ chứ không phải nút. |
| 7 | **Chi tiết đơn: hàng nút phụ và nút nguy hiểm.** "Chụp ảnh · In bill · Sửa đơn" xếp lưới 2 cột để ô trống; "Huỷ đơn" đỏ nằm ngay dưới, khi đơn ngắn chỉ cách nút chính dính đáy ~120px; ba dòng Người tạo / Làm xong / Xác nhận và nút chữ "Xem lịch sử thao tác" mận to chen giữa nội dung và nút chính. | Chi tiết đơn · Linh, Nhung (nhiều nút nhất) | [đơn #0051](anh/2026-10-31-lam-moi-giao-dien/linh-light_don-hang-full.png) | **Bố cục.** Nút phụ số lẻ trong lưới 2 cột; chưa có vùng "ít dùng" thu gọn. |
| 8 | **Form Lịch mới dài 8 ô cho việc 2 chạm.** Ngày / Bắt đầu / Kết thúc chen 3 cột chật (ô Ngày bị cắt trên Chrome; iPhone chưa kiểm); "Chọn khách có sẵn" rơi 2 dòng; Số khách, Dịch vụ, Ghi chú luôn hiện; nút Lưu ở đáy sheet dưới bàn phím. | Lịch · mọi vai | [Lịch mới](anh/2026-10-31-lam-moi-giao-dien/trang-dark_lich-moi-sheet.jpg) | **Bố cục.** Form xếp dọc đều, chưa tách "điền ngay" với "ít khi cần". |
| 9 | **Lịch Tuần không đọc được tên.** 7 cột ~48px, tên cắt còn "Gia …", "Phư…"; nhìn tuần chỉ thấy số lượng, không biết khách nào. | Lịch kiểu Tuần · Linh, Nhung, Chin | [Tuần](anh/2026-10-31-lam-moi-giao-dien/linh-light_lich_view_tuan.png) | **Chữ + bố cục.** Ô tuần dùng cùng caption 12px và cùng nội dung như ô Ngày. |
| 10 | **Trạng thái nút và điều khiển chưa rõ.** Nút chính bị tắt chỉ mờ 45% nên trông vẫn bấm được (Làm xong, Chốt quỹ, Chọn dịch vụ); SegmentedControl nhận ra nhờ viên trắng, viền 1.22:1; "Tải file / In / PDF" ở Báo cáo gãy dòng; chốt quỹ cần 5 chạm vì phải đi qua Thêm rồi hỏi lại. | Sửa đơn, Chốt quỹ, Báo cáo · Linh, Nhung | [Chốt quỹ](anh/2026-10-31-lam-moi-giao-dien/nhung-dark_chot-quy.jpg), [Báo cáo](anh/2026-10-31-lam-moi-giao-dien/linh-light_them_bao-cao.png) | **Số bước + chữ.** Chưa có kiểu nút tắt riêng; nút chữ dài trong ô hẹp. |

Ghi nhận ngoài phạm vi giao diện (không sửa trong đợt này, báo để anh biết): tài khoản Trang tạo lịch 09:30 lúc 09:29, chi tiết lịch không có nút "Sửa lịch" dù S15 cho sửa lịch mình tạo khi chưa tạo đơn và chưa đến giờ; có thể do mốc "chưa đến giờ" tính sát phút. Thuộc nghiệp vụ, chưa kiểm sâu.

### 1.7. Câu hỏi cần Linh trả lời

Viết ngắn để anh chuyển cho Linh:

1. Quán hiện chỉ có một cơ sở. Có cần thấy tên "CS 31/49 HTK" trên đầu mọi màn không, hay chỉ cần ở trang Thêm?
2. Khi lên đơn, dòng dịch vụ đang hiện đủ tên 5 người để chọn thợ. Thường thợ nào tạo đơn thì làm luôn. Chị có đồng ý app chỉ hiện tên mình, bấm "Đổi" mới hiện người khác?
3. Mở app buổi sáng, hai con số chị muốn thấy đầu tiên là gì? (doanh thu hôm nay, số khách, tiền trong két, khách còn nợ, lịch hôm nay…)
4. Chị có hay dùng điện thoại ở chế độ tối không? Nếu có, muốn nền tối màu đen hẳn hay nâu sẫm?
5. Instagram chị thấy đẹp ở điểm nào: nhiều khoảng trắng, chữ đậm, ảnh to, hay thanh dưới đơn giản? (giúp em chọn hướng ở Bước 2)
6. Với nút Huỷ đơn, Huỷ lịch: chị muốn nó nhỏ và xa nút chính như hiện nay, hay giấu vào mục "Thêm…" bấm mới hiện?

Câu hỏi cho anh (kỹ thuật, không cần Linh): toast che nút chính (vấn đề 1) là lỗi rõ ràng, em dự định sửa ngay trong gói "Thành phần dùng chung" ở Bước 4; anh có muốn sửa sớm hơn, tách thành một commit nhỏ trước khi làm mới toàn bộ không?

---

## Bước 2: Đề xuất

Anh duyệt Bước 1 ngày 31/10/2026. Bước này chưa sửa code. Mọi mã màu dưới đây đã tính tương phản bằng script (WCAG 2.x); số in đậm là chưa đạt và có ghi cách xử lý.

### 2.1. Quy định giao diện (áp cho cả ba hướng, viết trước khi chọn màu)

**Màu: mỗi màu một nghĩa.**

| Nhóm nghĩa | Tone | Dùng cho | Không dùng cho |
|---|---|---|---|
| Hành động | `accent` + `on-accent`, `accent-soft` | Nút chính, mục đang chọn, link, huy hiệu số thông báo | Bất kỳ chip trạng thái nào |
| Xong và đúng | `success` | Đã thu đủ, Đã xác nhận (đơn), Đã nhận cọc, Đã cọc, Đã chi, Đã trả đủ, Đã khoá lương, Đi làm, Đã duyệt (nghỉ), Trạm in đang kết nối | |
| Đang chờ ai đó làm | `warning` (cam) | Chờ xác nhận, Chờ duyệt, Chưa duyệt, Đã duyệt chờ chi, Cọc chờ xác nhận, Chưa cọc, Chờ Linh xem, Yêu cầu huỷ, Bản nháp chờ khoá, Thu một phần, Còn N đ, số việc chờ (huy hiệu), Thiếu hồ sơ, Chưa đổi mật khẩu, Trạm in mất kết nối | |
| Tiền chưa về, việc hỏng, nguy hiểm | `danger` (đỏ) | Chưa thu, số âm, lệch quỹ, Từ chối, Nghỉ không phép, Khách không đến, nút Huỷ, Hoàn tiền | Số thường (ví dụ "Khách còn nợ" khi bằng 0) |
| Thông tin, không cần làm gì | `info` (**mới**: nâu nhạt ấm) | Đang làm (đơn và lịch), Tạm tính, Làm trên Sheets, Chờ ngày nháp, Nghỉ có phép, Quán đóng cửa, Quán giữ cọc, Hoàn một phần, Hoàn toàn bộ, Linh duyệt (mức), Máy này, Vượt khoảng giá, Có dòng nhập tay, Ngoài giờ mở cửa, Sửa tên | |
| Đã kết thúc, hết tác dụng | `neutral` (xám) | Đã huỷ (mọi nơi), Hoàn thành (lịch, theo S31), Đã hoàn cọc, Đã tắt, Đã thu quyền, Đã khoá (tài khoản, nhân viên), Chưa tới, Ngoài thời gian làm | Trạng thái tốt |
| Ô lịch | `cal-*` giữ nguyên S31, S34 | Màn Ngày, Tuần, vạch ở Danh sách | |

Luật kèm: mọi màu trạng thái luôn có chữ (G10); một màn chỉ có một nút `accent`; `danger` chỉ tô chữ hoặc viền, không tô nền lớn; nút bị tắt dùng nền chìm + chữ mờ, không giảm opacity.

**Chữ: 7 mức thay 12.** Be Vietnam Pro cho cả app, Cormorant chỉ cho LINDY OS (S13).

| Mức | Cỡ / dòng / đậm | Dùng cho | Thay cho |
|---|---|---|---|
| display | 30/36/700, số tiền tabular | Một số lớn nhất mỗi màn | display-money |
| title | 22/28/700 | Tiêu đề màn, một lần | screen-title |
| heading | 17/22/600 | Tên khách, tên thẻ, số tiền thứ hai | (mới; thay display-money ở ô phụ của Tổng quan) |
| body / body-strong | 15/21/400 · 600 | Nội dung, mã đơn | giữ |
| amount | 16/21/600 tabular | Tiền trong dòng | giữ |
| label | 13/18/500, **chữ thường** | Nhãn nhóm, nhãn ô nhập, chữ phụ | label + caption 12 + overline (bỏ chữ hoa giãn 0.1em, nguyên nhân gãy dòng) |
| nav | 11/13/500 | Chữ thanh dưới | nav-label |

Ô nhập 16px (Safari). Caption 12px không dùng nữa: chữ nhỏ nhất trên nội dung là 13px.

**Bề mặt: 3 cấp cộng 1.** `surface` (nền trang), `surface-raised` (thẻ, dòng, thanh dưới), `surface-sunken` (nền chìm: SegmentedControl, nút tắt, vùng ngoài giờ trên lịch), và `surface-bar` (thanh trên, thanh dưới, thanh nút: có thể là kính). Quy định: trong giao diện tối thẻ phải sáng hơn nền trang ít nhất 1.15:1 **hoặc** có bóng; thanh trên và thanh dưới luôn tách khỏi nội dung bằng viền hoặc bóng.

**Khoảng cách.** Bước 4px. Lề 16. Trong thẻ 12 dọc, 16 ngang. Giữa thẻ 12, giữa nhóm 24. Dòng danh sách tối thiểu 56px (hai dòng chữ). Vùng chạm 44, nút chính 48. Mật độ vẫn dày (G15): không thêm khoảng trắng giữa các dòng, chỉ xếp lại thứ bậc.

**Bo góc: 3 mức.** nhỏ (chip, huy hiệu), vừa (nút, ô nhập, ô lịch), lớn (thẻ, bảng trượt, hộp thoại). Giá trị theo hướng.

**Độ sâu: 3 tầng.** Phẳng (dòng danh sách, ngăn bằng kẻ), nổi (thẻ: viền hoặc bóng mềm), trôi (bảng trượt, hộp thoại, thông báo: bóng lớn). Thông báo "Đã…" **không bao giờ nằm trên thanh nút chính**: neo ngay trên thanh nút (bottom = nav + thanh nút + 8px); không có thanh nút thì như cũ.

**Luật chạm.** Một màn = một việc chính = một nút chính dính đáy. Chọn nhiều mục: tích là thêm ngay, không có nút "Thêm N mục". Việc không hoàn tác được (Ra ca, Chốt quỹ, Huỷ, Hoàn) mới hỏi lại. Giá trị hay dùng điền sẵn (đã có: giờ kế tiếp, số tiền còn thu, Chuyển khoản).

**Gradient và kính (nếu hướng nào dùng).** Gradient chỉ là một lớp tĩnh trên một khối (đầu trang Tổng quan), không `background-attachment: fixed`, không gradient trên nút. Kính chỉ ở thanh dưới hoặc thanh trên: nền `surface-raised` 85% + `-webkit-backdrop-filter: blur(16px)`; không hỗ trợ (Safari cũ, máy yếu, `prefers-reduced-transparency`) thì rơi về nền đặc. Tương phản đo trên nền đã trộn 85%, không đo trên nền đặc.

### 2.2. Chỗ giảm chạm (chung cho ba hướng, không đổi nghiệp vụ, quyền, API)

| Việc | Nay | Đề xuất | Sau |
|---|---|---|---|
| Chọn dịch vụ rồi Làm xong | Thêm dịch vụ → tích → Thêm 1 mục → Làm xong = 4 | Tích là vào đơn ngay (bỏ nút "Thêm N mục"); đóng bằng X; Làm xong vẫn ở thanh nút | 3 (A) |
| | | Hướng B, C: danh sách dịch vụ nằm **ngay trong màn đơn** dưới dạng ô tích theo nhóm (Cơ bản mở sẵn, nhóm khác thu gọn), tìm kiếm ở đầu; vẫn cùng bộ dữ liệu và tìm kiếm thông minh C09 | **2** (B, C) |
| Chip thợ trên dòng dịch vụ | 5 chip luôn hiện | Chỉ hiện người tạo (đã chọn sẵn) và "Thêm thợ"; bấm mới xổ 4 người còn lại. Thẻ dòng thấp đi một nửa | 0 chạm thêm cho trường hợp thường |
| Tạo lịch giờ khác | ô giờ → bánh xe iOS = 4–5 | Dãy chip giờ 15 phút quanh giờ mặc định (−30 đến +90) ngay dưới ô Bắt đầu; ô giờ vẫn còn cho giờ xa | 3 |
| Sau Làm xong, Ghi tiền thu | chờ toast 2,5 s hoặc chạm hụt | Toast lên trên thanh nút | 0 chờ |
| Chốt quỹ | Thêm → Chốt quỹ → ô → Chốt → hỏi lại = 5 | Thẻ "Tiền trong quỹ" ở Tổng quan (Linh, Nhung) có link "Chốt quỹ" khi tới giờ đóng cửa hoặc còn ngày chưa chốt (đã có dòng này trong Cần xử lý, chỉ đưa ra ngoài); ô Tiền mặt đếm được đặt sát trên nút; hộp hỏi lại giữ (không sửa được sau khi chốt) | 4 |
| Form Lịch mới | 8 ô xếp dọc | Tên · giờ (chip) · SĐT · Số khách ở trên; "Dịch vụ dự kiến", "Ghi chú" thu gọn thành một dòng "Thêm dịch vụ, ghi chú" bấm mới mở | 2 (không đổi), form ngắn một nửa |

Các đề xuất này là xếp lại giao diện của tính năng đã có, không thêm tính năng. Chỗ cần anh chốt vì chạm vào mã đã chốt được ghi ở từng hướng.

### 2.3. Ba hướng

#### Hướng A — Ngà & mực, tinh chỉnh

**Cảm giác:** vẫn là app hôm nay, nhưng gọn, có thứ bậc, và tối không còn phẳng.

Bảng màu (chỉ đổi những ô có dấu *):

| Token | Sáng | Tối | Tương phản chính (sáng / tối) |
|---|---|---|---|
| surface | #fbf8f3 | #141011 * | ink 15.8 / 16.2 · muted 5.6 / 8.3 |
| surface-raised | #ffffff | #272022 * | ink 16.7 / 13.7 · muted 5.9 / 7.0 · so với surface 1.06 / 1.18 |
| surface-sunken | #f1ebe3 * | #0c0a0b * | muted 5.0 / 8.6 |
| line | #e6ddd3 * | #3b3034 * | chỉ chia vùng |
| line-strong | #8f7f73 * | #857479 * | trên 3 nền 3.64 · 3.85 · 3.25 / 4.29 · 3.80 · 4.49 |
| ink · ink-muted | #241c1a · #6e625c | #f3ece8 · #b6a9a2 * | |
| accent · on-accent | #8c2f55 · #ffffff | #e08aa8 * · #2a0f1b | on-accent/accent 7.9 / 7.1 · accent/surface 7.5 / 7.5 |
| accent-soft | #f6e8ee | #3c2130 * | accent/soft 6.7 / 5.8 |
| success / -soft | #1d6b43 / #e2f2e8 | #7ccb9e / #17301f | 5.6 / 7.4 |
| warning / -soft | #94550a / #fdefd9 | #f0b464 / #3a2a12 | 5.2 / 7.5 |
| danger / -soft | #a8241c / #fbe3e1 | #f2948c / #3d1a18 | 5.9 / 6.9 |
| info / -soft **mới** | #5f4b3f / #eee5db | #c9b8aa / #2e2521 | 6.6 / 7.8 |
| cal-* | giữ S31 | giữ S31 | đã đo ở 1.3 |

Chữ: theo 2.1 (7 mức), số to giữ 30px. Hình khối: bo 6 / 10 / 16 như nay; viền mảnh cho thẻ ở sáng, **tối thêm bóng 0 1px 0 #000 40%** để thẻ nổi; thanh trên có viền dưới. Thanh dưới nền raised, viền trên.

3 màn đổi nhiều nhất: Tổng quan (ô đầu 30px, 6 ô còn lại 17px; nhãn chữ thường; Vào ca lên ngay dưới ô đầu; "Khách còn nợ" chỉ đỏ khi > 0), Chi tiết đơn (toast lên trên thanh nút; nút phụ một hàng cuộn ngang hoặc 3 cột đều; Người tạo/Làm xong/Xác nhận gộp một dòng "Trang tạo 09:30 · xong 09:31"), Màn sửa đơn (tích là thêm ngay, chip thợ thu gọn).

Giảm chạm: Làm xong 4 → 3; tạo lịch giờ khác 5 → 3; Chốt quỹ 5 → 4.

Mã quyết định phải đổi: **không**. Ghi mới: S45 (quy định màu theo nhóm nghĩa, thêm tone info, "Đã xác nhận" xanh), S46 (toast trên thanh nút, nút tắt không mờ), S47 (tích là thêm ngay; chip thợ mặc định người tạo), S48 (bỏ chữ hoa giãn ở nhãn nhóm, chữ phụ 13px).

Rủi ro: thấp. Người dùng không phải học lại. Nhưng nhìn tổng thể "vẫn vậy", chưa chắc đủ cho ý "chưa thân thiện". Khối lượng: 3 gói (token, thành phần, 3 màn), khoảng 2–3 ngày làm, mỗi gói một commit.

#### Hướng B — Be, nâu, trắng cao cấp (khuyên chọn)

**Cảm giác:** như menu giấy kem của quán: nền be ấm, thẻ trắng kem nổi nhẹ, chữ nâu đen, nút nâu đậm; hồng mận chỉ còn trên ô lịch.

Bảng màu:

| Token | Sáng | Tối | Tương phản chính (sáng / tối) |
|---|---|---|---|
| surface | #f4ede4 | #17120f | ink 13.8 / 16.0 · muted 5.4 / 8.0 |
| surface-raised | #fffdf9 | #2a211c | ink 15.8 / 14.4 · muted 6.2 / 6.8 · so với surface 1.14 / 1.18 |
| surface-sunken | #eae1d5 | #0f0b09 | muted 4.9 / 8.5 |
| surface-bar (kính 85 % raised) | #fdfbf6 | #221b17 | muted 6.1 / 7.4 · accent 8.2 / 8.5 |
| line | #e2d7ca | #3c312b | chỉ chia vùng |
| line-strong | #8b7a6c | #8a7868 | trên 3 nền 3.55 · 4.05 · 3.18 / 4.40 · 3.96 · 4.63 |
| ink · ink-muted | #2a1f1a · #6d5d53 | #f5ede4 · #b7a89b | |
| accent · on-accent | **#6b4330 (nâu quán)** · #ffffff | #dcae8f · #2b1810 | on-accent/accent 8.5 / 8.5 · accent/surface 7.3 / 9.3 |
| accent-soft | #eedfd3 | #3a2a20 | accent/soft 6.5 / 6.9 |
| success / -soft | #1f6b45 / #dff1e5 | #7ccb9e / #17301f | 5.5 / 7.4 |
| warning / -soft | #91530b / #fbead2 | #f0b464 / #3a2a12 | 5.2 / 7.5 |
| danger / -soft | #a7261f / #fae1de | #f2948c / #3d1a18 | 5.7 / 6.9 |
| info / -soft | #5a4a40 / #ece3d8 | #cdbcad / #2f2621 | 6.7 / 8.0 |
| cal-booked-* | giữ hồng mận S31 | giữ | cal-booked-bar/surface 4.86 |
| cal-done-bar · cal-deposit-bar | **#8f8075 · #bd7210** (đậm hơn một nấc) | giữ | trên nền be mới: 2.76 và 2.91 với mã cũ, nên đậm lên để ≥ 3.0; nghĩa S31 không đổi |

Chữ: theo 2.1; số to 30px đậm 700 cách chữ −0.02em; heading 17/600 cho tên khách để danh sách có điểm nhìn. Hình khối: bo **10 / 14 / 20**; thẻ **không viền, bóng mềm** `0 1px 2px #2a1f1a0f, 0 4px 12px #2a1f1a0a` (sáng) và nền sáng hơn 1.18 + viền 1px (tối); dòng danh sách vẫn phẳng, ngăn bằng kẻ (không bóng cho dòng để máy yếu không nặng); thanh dưới và thanh trên kính 85 % với rơi về nền đặc; nút chính cao 48, bo 14. Biểu tượng nét mảnh giữ (G16).

3 màn đổi nhiều nhất: Tổng quan (một thẻ lớn "hôm nay" chứa doanh thu 30px + 3 số 17px xếp hàng ngang; Vào ca ngay dưới; biểu đồ gọn), Lịch (thanh trên gọn: "Lịch hẹn" + 3 nút; thẻ ngày không viền; ô Tuần hai dòng tên 12px + giờ, tên không cắt dưới 6 ký tự nhờ bỏ đệm; ô lịch bo 8), Màn sửa đơn và chi tiết đơn (danh sách dịch vụ tích ngay trong màn; dòng dịch vụ gọn; hàng nút phụ 3 cột đều; toast trên thanh nút).

Giảm chạm: Làm xong 4 → **2**; tạo lịch giờ khác 5 → 3; Chốt quỹ 5 → 4.

Mã quyết định phải đổi: **G07** (màu nhấn từ mận sang nâu quán; mận giữ cho ô lịch Đã chốt theo S31 vì đó là dữ liệu, không phải nút), **G08** (nền từ ngà #fbf8f3 sang be #f4ede4), **G14** (bo góc lớn hơn một nấc). Ghi mới: S45–S48 như hướng A, cộng S49 (thẻ dùng bóng mềm thay viền; thanh trên, thanh dưới kính có rơi về nền đặc; danh sách dịch vụ nằm trong màn đơn).

Rủi ro: vừa. (1) Nút nâu trên nền be: đã đo 7.3:1, nhưng cần demo để Linh thấy có "đủ nổi" không; nếu Linh muốn giữ mận thì B vẫn chạy với accent #8c2f55 (đo 6.9 trên #f4ede4). (2) Kính: Safari iOS hỗ trợ `-webkit-backdrop-filter` từ lâu, nhưng máy yếu cuộn lịch dài có thể giật; có rơi về nền đặc và chỉ dùng ở hai thanh. (3) Bóng mềm trên nhiều thẻ: giới hạn cho thẻ, không cho dòng; bản in tắt bóng. (4) Màn Lịch có hai màu "nhấn" (nút nâu, ô mận): chấp nhận vì ô lịch là trạng thái, đã chốt S31. Khối lượng: 4 gói (token + quy định; thành phần; Lịch, Đơn, Tổng quan; Khách, Thêm, màn còn lại, in), khoảng 4–5 ngày làm.

#### Hướng C — Thay đổi mạnh nhất mà vẫn đúng thương hiệu

**Cảm giác:** như Instagram phiên bản tiệm nail: nền trắng, thẻ be nổi trên trắng (đảo ngược hôm nay), tiêu đề to kiểu iOS gộp vào thanh trên, một dải gradient be–hồng tĩnh ở đầu Tổng quan, nút tròn đầy, thanh dưới kính.

Bảng màu:

| Token | Sáng | Tối | Tương phản chính (sáng / tối) |
|---|---|---|---|
| surface | #ffffff | #0e0b0b | ink 17.6 / 17.1 · muted 6.6 / 8.7 |
| surface-raised (thẻ be) | #f6f1ea | #201819 | ink 15.7 / 15.7 · muted 5.8 / 7.7 · so với surface 1.12 / 1.13 |
| surface-sunken | #ede6dc | #050404 | muted 5.3 / 9.1 |
| surface-bar (kính) | #f7f3ed | #1a1414 | muted 5.9 / 8.1 |
| line · line-strong | #e6ddd2 · #8a7a6d | #352a2d · #857479 | line-strong trên 3 nền 4.13 · 3.68 · 3.33 / 4.45 · 4.08 · 4.65 |
| ink · ink-muted | #1f1715 · #675b53 | #f5eeea · #b7aaa4 | |
| accent · on-accent | #8c2f55 (giữ mận) · #ffffff | #e58fb1 · #2a0f1b | 7.9 / 7.5 · accent/surface 7.9 / 8.3 |
| accent-soft | #f7e4ec | #3a1f2b | 6.5 / 6.3 |
| success, warning, danger, info | như B (đã đo ≥ 5.1 / ≥ 6.9) | | |
| gradient đầu Tổng quan | #f6f1ea → #f4e2e8, tĩnh | #1c1516 → #2a1a20 | ink 15.7–14.2 · muted 5.8–5.3 · accent 6.4 trên đầu hồng |
| cal-* | giữ S31; cal-done-bar, cal-deposit-bar, cal-active-bar trên nền trắng 3.21 · 3.38 · 4.36 | giữ | |

Chữ: display 34/40/700; title 28/34/700 gộp vào thanh trên, cuộn thì thu còn 17px; nhãn 13 chữ thường. Hình khối: nút **tròn đầy** (radius 999) cao 48, thẻ bo 20, ô lịch bo 10; thẻ không viền, nền be; danh sách không kẻ, cách nhau 8px; thanh dưới kính, biểu tượng nét mảnh nhưng mục đang chọn có nền `accent-soft` tròn. Biểu đồ cột bo đầu, màu `accent-soft` với cột hôm nay `accent`.

3 màn đổi nhiều nhất: Tổng quan (đầu trang gradient: lời chào, doanh thu 34px, hai số phụ; thẻ be xếp dưới; Vào ca là nút tròn ngay trong đầu trang), Lịch (thanh ngày thành viên tròn, ô lịch bo 10 không vạch trái mà **vạch trên** 3px và nền nhạt; thẻ ngày gộp vào thanh trên), Danh sách và chi tiết (Đơn hàng, Khách, Thêm: dòng thành thẻ be rời nhau 8px, chevron bỏ, giá trị bên phải đậm). Thanh trên: chữ LINDY OS chỉ còn ở Tổng quan; màn khác thanh trên là nút quay lại tròn + tên màn.

Giảm chạm: như B (Làm xong 2, tạo lịch giờ khác 3, Chốt quỹ 4); thêm: thanh ngày tròn to hơn, chạm trúng hơn.

Mã quyết định phải đổi: **G04** (chữ LINDY OS trên đầu app chỉ ở Tổng quan, màn khác là tên màn), **G08** (nền trắng, be làm thẻ), **G14** (nút tròn đầy, thẻ bo 20), **G15** (mật độ thoáng hơn: dòng thành thẻ cách 8px, nghĩa là mỗi màn ít dòng hơn khoảng 15 %), **S32** (thẻ đầu màn Lịch gộp vào thanh trên; nội dung ngày · số lịch · người nghỉ · Cần xử lý giữ nguyên nhưng bố cục đổi). Ghi mới: S45–S49 và S50 (gradient tĩnh đầu Tổng quan, tiêu đề to gộp thanh trên).

Rủi ro: cao. (1) Mọi người phải học lại vị trí thanh trên và nút quay lại; app đang dùng thật hằng ngày. (2) Nền trắng tinh ngược với "be" của quán, phụ thuộc thẻ be để giữ thương hiệu. (3) Thoáng hơn trái G15 "dày"; Linh từng chọn dày. (4) Nhiều mã phải chốt lại (5 mã). (5) Tiêu đề to co giãn khi cuộn là chuyển động, cần tắt khi Giảm chuyển động (G21) và tốn công kiểm Safari. Khối lượng: 5 gói, khoảng 6–8 ngày làm.

### 2.4. Khuyên chọn

Em khuyên **hướng B**, lý do:

1. Đúng thương hiệu nhất: be, nâu, trắng là ba màu Linh nêu (G02), B dùng chính ba màu đó làm nền, chữ, nút; A vẫn là ngà và mận, C là trắng.
2. Đủ khác để thấy "mới" (nền be, thẻ nổi, nút nâu, kính ở hai thanh), nhưng bố cục vẫn là bố cục hôm nay: 5 tab, nút chính dính đáy, ô lịch, tab Thêm và Khách giữ nguyên. Không phải học lại.
3. Giảm chạm nhiều nhất ở việc thợ làm nhiều lần mỗi ngày (lên đơn 4 → 2 chạm), nhờ danh sách dịch vụ nằm trong màn đơn.
4. Chỉ đổi 3 mã (G07, G08, G14), đều là lựa chọn thẩm mỹ của Linh, demo sẽ cho Linh xem và chốt lại. Không đụng nghiệp vụ, quyền, dữ liệu.
5. Rủi ro kỹ thuật kiểm soát được: kính và bóng đều có rơi về nền đặc, chỉ dùng ở hai thanh và thẻ.

Hướng A nên làm **bản demo thứ hai** để đối chiếu: nếu Linh muốn giữ mận và ngà thì A cộng toàn bộ phần giảm chạm của B vẫn là bước tiến rõ, ít rủi ro nhất. Hướng C em không khuyên làm lúc này: app đang dùng thật, đổi thanh trên và mật độ là bắt mọi người học lại, lại phải chốt lại 5 mã.

**Dừng ở đây, chờ anh chọn tối đa 2 hướng để làm demo** (em đề nghị B và A). → Anh chọn **chỉ B** (31/10/2026).

### 2.5. Khảo sát bổ sung: học từ CEN WORK (01/11/2026)

Anh hỏi "nếu làm theo màu CEN WORK thì sao" rồi yêu cầu hai agent khảo sát độc lập, chỉ đọc: A nhìn từ hệ thống (token, thành phần, cách làm), B nhìn từ người dùng iPhone trong tiệm (chữ thừa, thao tác). Nguồn CEN: `cenwork-lovable/src/styles.css` (bộ "Đen Ngọc Trai"), `docs/plans/2026-10-31-den-ngoc-trai.md`, `src/components/ui/*`.

**Kết luận chung:** không lấy màu đen trắng của CEN (trái G02, G06, G07, G08, G09, G20, G21 và luật đầu việc); lấy **cách làm**. Hướng B giữ, bổ sung các điểm dưới.

**2.5.1. Học từ CEN, mang sang hướng B**

| # | Cách làm (CEN file:dòng) | LINDY nay | Mang sang |
|---|---|---|---|
| 1 | Tách ba nghĩa "đang chạy / đang chờ duyệt / cần chú ý" (`styles.css:184-190`) | 5 tone; cam gánh 4 nghĩa | Bảng 8 tone ở 2.5.2 |
| 2 | Một biến khoảng trống đáy `--cen-mobile-nav-offset` cho toast, padding, thanh nút (`styles.css:215`, `sonner.tsx:19`) | Toast và thanh nút cùng neo `nav-h + 16` (`components.css:320`, `:523`) | `--lo-bottom-offset` trong tokens; `main`, `.lo-toast-wrap`, `.lo-actionbar` cùng đọc |
| 3 | Chip thuần trình bày, bảng tone có test (`status-badge.tsx:6-10`) | Tone chọn rải 27 file, 83 chỗ | `src/lib/status-tone.ts` một bảng trạng thái → tone, có test |
| 4 | Nút tắt nền riêng, không giảm opacity (`styles.css:487-491`) | opacity 0.45 | Nền `surface-sunken`, chữ `ink-muted` |
| 5 | Nút đang xử lý giữ kích thước, spinner đè lên chữ (`button.tsx:94-111`) | Thay chữ "Đang lưu…" làm nút đổi bề rộng | Chữ ẩn, spinner tuyệt đối |
| 6 | `EmptyState` dùng chung, một câu + một nút (`empty-state.tsx:31-58`) | 73 chuỗi "Chưa có / Đang tải" rải 37 file | `Empty` gọn (G15): "Hôm nay chưa có lịch" + "Tạo lịch" |
| 7 | `PageHeader` một kiểu cho mọi trang, có slot nút (`page-header.tsx:24-39`) | Mỗi màn tự xếp "← Thêm" + h1 | `ScreenHeader`: nút quay lại 44px + tiêu đề + 1–3 nút biểu tượng |
| 8 | Toast có mức, lỗi lâu hơn và đóng được (`toast.tsx:14-41`) | success/error, không đóng tay | Lỗi 6 s có X; thành công 2,5 s không X (tay ướt) |
| 9 | `prefers-reduced-transparency` rơi về nền đặc (`styles.css:300-306`) | Chưa có | Thêm media query đặt `--bar: var(--bar-solid)` |
| 10 | Bo góc theo vai trò badge/control/card/container (`styles.css:219-222`) | sm/md/lg | `radius-chip 10 / control 14 / card 20` |
| 11 | Thang z-index đặt tên (`styles.css:230-235`) | Số rải 10/12/15/40/50/55/60 | 5 token `--z-*` |
| 12 | Chuyển động một nguồn, reduced-motion tắt toàn cục bằng `*` (`styles.css:139-147`, `:438-453`) | Keyframes rải, liệt kê từng class | 2 token thời lượng, một quy tắc `*`; không thêm chuyển động (G21) |
| 13 | Hộp hỏi lại không đóng khi đang xử lý (`confirm-dialog.tsx:55-58`) | Chạm nền mờ đóng cả khi busy (`ui/index.tsx:367`) | Chặn đóng khi busy |
| 14 | Mục đang chọn ở thanh dưới có nền viên (`mobile-bottom-nav.tsx:103`) | Chỉ đổi màu chữ | Nền `accent-soft` bo 12 quanh biểu tượng, nét giữ 1.7 |
| 15 | Mọi phần tử bấm được ≥ 44 trên mobile, miễn trừ lịch (`button.tsx:29-33`) | Nút chữ caption `p-0` vùng chạm ~16px (`OrderView.tsx:433-439`, `:480-486`, `:544-551`) | `min-h-[44px]`; miễn trừ ô lịch, ô bảng công |

**Không mang sang:** nền gần đen + gradient toả + hạt nhiễu cố định (G08, G20, tốn GPU khi cuộn lịch); nút gradient ngọc trai; tiêu đề chữ gradient; stagger, view transition, aurora (G21); nút tròn đầy; thanh dưới nổi 4 mục + Menu (G16, G17, S40); Inter 14px (S13); tối mặc định tự chọn (G09); chấm màu trước chữ chip (G10 đã có chữ, G15); kính desktop, sidebar, vàng vinh danh; thêm sonner, cva, Radix.

**2.5.2. Bảng màu theo nghĩa, bản cuối (thay bảng ở 2.1)**

| Nghĩa | Tone | Sáng chữ / nền | Tối chữ / nền | Tương phản (sáng soft · surface / tối soft · surface) | Trạng thái |
|---|---|---|---|---|---|
| Hành động, đang chọn | `accent` | #6b4330 / #eedfd3 | #dcae8f / #3a2a20 | 6.5 · 7.3 / 6.9 · 9.3 | Nút chính, tab, link, huy hiệu số thông báo. Không chip |
| Đang làm | `progress` **mới** | #2b5a84 / #dde6ef | #9bbde0 / #1e2c3a | 5.7 · 6.2 / 7.3 · 9.5 | Đang làm (đơn, lịch), Tạm tính, Trạm in đang kết nối |
| Đang chờ ai đó | `waiting` **mới** (mận cũ) | #8c2f55 / #f6e8ee | #e58fb1 / #3a1f2b | 6.7 · 6.8 / 6.3 · 7.9 | Chờ xác nhận, Chờ duyệt, Chưa duyệt, Đã duyệt chờ chi, Cọc chờ xác nhận, Chờ Linh xem, Yêu cầu huỷ, Bản nháp chờ khoá, Chờ ngày nháp, Cần xem lại, số việc chờ ở Thêm |
| Chưa đủ, cần chú ý | `warning` | #91530b / #fbead2 | #f0b464 / #3a2a12 | 5.2 · 5.3 / 7.5 · 10.1 | Thu một phần (G10), Còn N đ, Chưa cọc, Vượt khoảng giá, nhập tay, Ngoài giờ, Sửa tên, Thiếu hồ sơ, Chưa đổi mật khẩu, Trạm in mất kết nối |
| Tiền chưa về, hỏng | `danger` | #a7261f / #fae1de | #f2948c / #3d1a18 | 5.7 · 6.2 / 6.9 · 8.3 | Chưa thu (G10), số âm, Từ chối, Nghỉ không phép, Không đến, Hoàn tiền, nút Huỷ |
| Xong và đúng | `success` | #1f6b45 / #dff1e5 | #7ccb9e / #17301f | 5.5 · 5.6 / 7.4 · 9.6 | Đã thu đủ (G10), Đã xác nhận, Đã nhận cọc, Đã cọc, Đã chi, Đã trả đủ, Đã khoá lương, Đi làm, Nghỉ đã duyệt |
| Thông tin | `info` | #5a4a40 / #ece3d8 | #cdbcad / #2f2621 | 6.7 · 7.3 / 8.0 · 10.1 | Làm trên Sheets, Nghỉ có phép, Quán đóng cửa, Quán giữ cọc, Hoàn một phần, Hoàn toàn bộ, Linh duyệt (mức), Máy này |
| Đã kết thúc | `neutral` | #6d5d53 / #eae1d5 | #b7a89b / #0f0b09 | 4.9 · 5.4 / 8.5 · 8.0 | Đã huỷ (mọi nơi), Hoàn thành (lịch), Đã hoàn cọc, Đã tắt, Đã thu quyền, Đã khoá tài khoản, Chưa tới, Ngoài thời gian làm |

Ô lịch giữ S31, S34; mận ô "Đã chốt" (chờ khách đến) cùng nghĩa với `waiting`. **Điều kiện:** nếu phiếu của Linh chọn giữ mận làm nút, `waiting` đổi sang tím ấm (chưa đo) để nút và chip không trùng màu.

**2.5.3. Chữ thừa trên màn (agent B tìm 49 dòng; nhóm b = giải thích nghiệp vụ lặp mỗi lần)**

Bỏ hẳn hoặc rút ngắn, không đụng mã: `AppointmentForm.tsx:304, 376, 386-387, 416, 202`; `lich/$id.tsx:389, 418, 422, 452-453, 223`; `DepositSection.tsx:247, 277, 133, 203`; `OrderEditor.tsx:313, 430, 444-446, 561-569`; `pickers.tsx:472-473, 521, 523, 118, 283`; `OrderView.tsx:400-401, 567, 619, 763, 776-777, 805, 388`; `don-hang/index.tsx:126, 111-112`; `PhotoSheet.tsx:155-156, 146, 137`; `routes/_app/index.tsx:46 ("Chào …"), 170, 201, 432, 82, 91, 63 ("Kéo xuống": PWA ghim không có kéo-tải-lại, thay nút Thử lại), 216`; `AttendanceCard.tsx:33`; `khach/index.tsx:74, 106`; `khach/$id.tsx:82, 294, 152`; `them/index.tsx:246`; `chot-ngay.tsx:185, 196, 199-200, 219, 240, 304, 313`; `thu-chi.tsx:73-74`; `tam-ung.tsx:69-70, 224-225`; `luong.tsx:191, 233-234`; `so-tien.tsx:112-113, 223, 417-418, 645, 733-735`; `cham-cong.tsx:54, 76`; `cong/views.tsx:74, 291`; `cong/parts.tsx:139-140`; `dang-nhap.tsx:71` (chỉ hiện khi không ở chế độ ghim). "(không bắt buộc)" bỏ ở mọi ô, chỉ đánh dấu ô bắt buộc (7 file). Lỗi lọt chữ nội bộ: `OrderEditor.tsx:446` "(hoàn tiền có ở Đợt 3)".

Đụng mã, cần chốt: `DayHeader.tsx:40` "Đủ nhân sự, không ai nghỉ" bỏ khi không ai nghỉ (S32); `them/index.tsx:93-227` bỏ dòng phụ ở nhóm Hằng ngày, Cá nhân (S40).

Giữ vì cần: `AppointmentForm.tsx:287` (chỉ hiện khi tên lẫn SĐT, S40); `OrderView.tsx:77` lỗi trạm in; `chot-ngay.tsx:174` gộp ngày chưa chốt; `AttendanceCard.tsx:105` hộp Ra ca.

**2.5.4. Thao tác trên điện thoại (agent B, 16 điểm; vùng ngón cái một tay ≈ nửa dưới màn)**

| # | Chỗ | Đề xuất | Chạm |
|---|---|---|---|
| 1 | Sau Làm xong không tự mở hộp Ghi tiền thu, sau Xác nhận bill thì có (`OrderView.tsx:159-164` so với `:177-195`) | Làm xong xong mà còn phải thu thì mở hộp luôn | 3 → 2, việc thợ làm nhiều nhất |
| 2 | Chốt quỹ: nút không dính đáy, bàn phím che (`chot-ngay.tsx:193-220`) | Nút vào thanh dính đáy; Enter ở ô tiền mở hộp chốt | 5 → 3 (+ hỏi lại giữ) |
| 3 | Lịch mới: Enter không lưu (`AppointmentForm.tsx:282`); ô Kết thúc là bánh xe iOS (`:336-346`) | Enter = Lưu khi hợp lệ; chip thời lượng 1h · 1h30 · 2h · 3h thay ô Kết thúc | 2 + gõ → 1 + gõ |
| 4 | Chụp ảnh: bấm "Chụp ảnh" mở sheet rồi bấm "Chụp ảnh" lần nữa (`OrderView.tsx:580`, `PhotoSheet.tsx:158`) | Nút ngoài mở camera thẳng, sheet chỉ hiện khi đã có ảnh | 3 → 2 |
| 5 | Chi tiết lịch: 3 nút cùng cỡ, Huỷ lịch đỏ sát Tạo đơn, không dính đáy (`lich/$id.tsx:369-386`) | Tạo đơn dính đáy, Huỷ lịch thành chữ nhỏ cuối trang | Đụng **S03**, cần chốt |
| 6 | Xác nhận bill, Duyệt giảm giá hỏi lại dù sửa lại được (`OrderView.tsx:675, 705`) | Bỏ hộp hỏi cho hai việc này; giữ cho Huỷ, Hoàn, Huỷ khoản | 2 → 1; đổi thói quen Nhung, nên hỏi Linh |
| 7 | Nút chữ caption 12px vùng chạm ~16px (`OrderView.tsx:433, 480, 530, 544`) | `min-h-[44px]` | hết chạm hụt |
| 8 | Nút "Gọi" cao 36px (`lich/$id.tsx:292`, `khach/$id.tsx:66`) | Cả dòng SĐT là nút gọi, cao 44 | |
| 9 | Thêm: Đăng xuất đỏ, trọn chiều ngang, nằm đúng vùng ngón cái (`them/index.tsx:233`) | Thành chữ nhỏ, hộp hỏi giữ | hết chạm nhầm |
| 10 | Lịch Ngày: hai vùng cuộn lồng nhau, vuốt ngang dễ bị nhận nhầm (`views.tsx:385-392`) | Màn Ngày chỉ trục giờ cuộn | bớt vuốt hụt |
| 11 | Đơn hàng: 4 ô lọc chiếm ~150px đầu màn (`don-hang/index.tsx:61-105`) | Ô tìm thành nút kính lúp như Lịch; ô ngày gộp vào segmented | nội dung lên ~50px |
| 12 | Tổng quan: biểu đồ 30 cột ~10px, chạm không trúng, có `onMouseEnter` (`index.tsx:279-300`) | Vuốt ngang trên biểu đồ để chọn ngày | |
| 13 | Hộp xác nhận đóng khi chạm nền dù đang busy (`ui/index.tsx:367`) | Chặn khi busy | |
| 14 | Bảng công ô ~34px (`cong/views.tsx:365-381`) | `py-1.5`; ô tuần miễn trừ | |
| 15 | Đăng nhập `inputMode="email"` cho ô "SĐT hoặc email" (`dang-nhap.tsx:51`) | Nếu đa số dùng SĐT thì bàn phím số; hỏi Linh | |
| 16 | Hướng B: nút + thanh trên 40px (< 44); chip không viền ở tối gần nền; toast nền đen lạc tông; nút phụ có bóng như thẻ (demo) | Sửa trong gói thành phần | |

Điền sẵn đã tốt, giữ: số tiền còn thu + Chuyển khoản, cọc gợi ý, giờ kế tiếp, "Phụ thu", ngày nghỉ hôm nay; bàn phím số đã đúng ở ô tiền, số ngón, %, SĐT.

**2.5.5. Chỗ cần anh hoặc Linh chốt trước Bước 4**

1. S03: chi tiết lịch đổi thành Tạo đơn dính đáy, Huỷ lịch chữ nhỏ (như S30 ở đơn).
2. S32: bỏ câu "Đủ nhân sự, không ai nghỉ" khi không ai nghỉ (giữ dải cam khi có người nghỉ).
3. S40: bỏ dòng phụ ở nhóm Hằng ngày và Cá nhân của tab Thêm.
4. Bỏ hộp hỏi lại ở Xác nhận bill và Duyệt giảm giá (Nhung, Linh dùng).
5. Màu "đang chờ": mận. Chỉ đúng khi nút chính là nâu (phiếu câu 2).
6. Ô đăng nhập: bàn phím số hay chữ (mọi người đăng nhập bằng SĐT hay email?).

**Anh chốt cả 6 điểm ngày 01/11/2026**, ghi thành **S45–S50** trong `docs/DECISIONS.md` (S45 nút chi tiết lịch; S46 bỏ câu "Đủ nhân sự"; S47 Thêm bớt dòng phụ; S48 bỏ hỏi lại ở Xác nhận bill, Duyệt giảm giá; S49 tám tone theo nghĩa, mận cho "đang chờ" với điều kiện nút nâu; S50 đăng nhập bàn phím số). Còn chờ phiếu của Linh để chốt lại G07, G08, G14 (màu nút, nền, bo góc) và ghi tiếp S51 trở đi cho quy định chữ, thẻ bóng mềm, kính, dịch vụ tích trong màn đơn.

## Bước 3: Demo

Anh chọn **chỉ hướng B** (31/10/2026). Chưa sửa `src/`.

**Sản phẩm:** `design/demo/lindy-huong-b.html` (một trang HTML độc lập, dữ liệu giả, không nối API). Bản Artifact riêng tư: **https://claude.ai/artifact/C3MLn3dxVm9QEpQG9HrktW** (anh bấm Share trên trang rồi gửi link cho Linh mở bằng Safari trên iPhone; trang mở toàn màn hình như app). Mở trên máy: `node design/demo/bao-local.mjs` rồi mở `lindy-huong-b.local.html`.

**Trong demo có:** Đăng nhập · Tổng quan (Toàn quán, Cá nhân, Vào ca, Cần xử lý, biểu đồ 30 ngày) · Lịch kiểu Ngày (thanh ngày, thẻ ngày với người nghỉ và Cần xử lý, trục giờ với đủ trạng thái: đã chốt, chưa cọc, đang làm, xong, huỷ, yêu cầu huỷ, vạch giờ hiện tại; nút + mở bảng Lịch mới có dãy chip giờ) · Đơn hàng (danh sách đủ chip: Đang làm, Chưa thu, Đã thu đủ, Chờ xác nhận, Thu một phần, Đã huỷ) · Lên đơn (chạm ô xanh "Khánh Vân" trên lịch: dịch vụ tích ngay trong màn, chip thợ mặc định người tạo, Làm xong) · Chi tiết đơn (chip, dòng, thành tiền, nút phụ 3 cột, Huỷ đơn tách xa, thanh nút chính dính đáy đổi theo trạng thái: Ghi tiền thu → In bill → Chụp ảnh) · hộp Ghi tiền thu (Chuyển khoản điền sẵn, QR mẫu đen trên trắng) · Khách · Thêm. Thông báo "Đã…" nằm trên thanh nút. Thanh "Demo hướng B" (Tự động · Sáng · Tối · Phiếu) và nút "Đo tương phản" chỉ có trong demo.

**Phiếu cho Linh** ở cuối trang: 8 câu chạm chọn (nhìn chung; nút nâu hay giữ mận; nền be; cỡ chữ; giao diện tối; lên đơn chạm là thêm; màn thích nhất; màn chưa ưng) và ô góp ý. Bấm "Chép kết quả" là có một đoạn chữ sẵn để dán vào Zalo gửi anh.

**Đã kiểm (Chrome headless, 390 × 844, sáng và tối, 8 màn, hộp Ghi tiền thu mở):** không lỗi console, không tràn ngang. Tương phản đo ngay trên trang (tính cả thanh kính 85 % và lớp mờ): mọi chữ ≥ 4.5:1; thấp nhất sáng 4.86 (chữ mục chưa chọn của SegmentedControl, 13px đậm 500 trên nền chìm), thấp nhất tối 5.43 (nhãn 13:22 trên vạch giờ). Nút "Đo tương phản" cuối trang chạy lại phép đo này ngay trên máy của Linh, kết quả có thể khác nhẹ theo giao diện đang xem.

**Chưa kiểm:** trên iPhone thật (kính mờ, cuộn lịch, bàn phím khi gõ tên lịch); Linh chưa trả lời phiếu.

**Việc sau khi có kết quả phiếu:** ghi mã quyết định mới (dự kiến S45–S49 và việc chốt lại G07, G08, G14) vào `docs/DECISIONS.md`, cập nhật dãy mã trong `CLAUDE.md`, xoá câu đã trả lời khỏi `docs/OPEN_QUESTIONS.md`, rồi sang Bước 4.

Nội dung gợi ý gửi Linh (anh chép):

> Chị Linh mở link này trên iPhone, bấm thử như app thật: đăng nhập, Tổng quan, Lịch, chạm ô xanh "Khánh Vân" để lên đơn, Làm xong, Ghi tiền thu, Khách, Thêm. Thử cả nút Sáng và Tối ở thanh trên. Xong kéo xuống cuối, chạm chọn 8 câu, bấm "Chép kết quả" rồi dán gửi em. Dữ liệu trong đó là giả.

## Bước 4: Thực hiện

Anh yêu cầu 01/11/2026: "làm màu của LINDY OS giống CEN luôn và triển khai đi" (nhắc lại sau khi em đã nêu các mã phải đổi). Ghi thành S51, S52. Hướng B và demo `design/demo/` chỉ còn là tài liệu tham khảo; phần bố cục đã phân tích ở 2.2, 2.5 vẫn dùng.

### 4.1. Kế hoạch (bản 1)

**Tiêu chí xong**

- Màu đúng S51 ở mọi màn, cả sáng và tối. Không còn màu be, nâu, mận cũ ngoài ô lịch, biểu tượng app, khung ảnh, bill.
- Trạng thái đúng bảng tone một nguồn (`src/lib/status-tone.ts`), mỗi nghĩa một màu, có test.
- Chữ trên nền thực tế (tính cả ánh sáng nền) ≥ 4.5:1, viền ô nhập và vạch màu ≥ 3:1.
- S45–S48, S50, S52 làm xong. Số chạm: Làm xong tính từ màn đơn 4 → 2; Làm xong → Lưu tiền thu 3 → 2; Chụp ảnh 3 → 2; Chốt quỹ 5 → 3 sau khi mở màn; tạo lịch giờ khác 5 → 3.
- `bun run check`, `build`, `scan-bundle` không tệ hơn mốc. Cổng 4.5 đạt.

**Làm:** token, thành phần dùng chung, thanh trên, thanh dưới, mọi màn, chữ thừa, theme-color, manifest, in.

**Không làm:** nghiệp vụ, quyền, API, migration, biến môi trường, bill in, `public/tram-in/`, khung ảnh (`src/lib/photo-frame.ts`), mã QR, biểu tượng app, nút chuyển sáng tối, hạt nhiễu, chuyển cảnh, thư viện mới. Không tự bấm Triển khai lại. Không chạm DB thật (đang có việc khôi phục dữ liệu riêng).

**Ánh xạ token LINDY ← CEN**

| Token LINDY | Sáng | Tối | Nguồn CEN |
|---|---|---|---|
| surface | #f6f6f7 | #08080a | background |
| surface-raised | #ffffff | #141416 | surface |
| surface-sunken | #ececee | #222226 | surface-subtle |
| line | #d9d9dd | #2a2a2e | border-default |
| line-strong | #85858c | #7c7c84 | **riêng** (CEN 2.16 / 1.68, cần 3:1); đo được 3.11–3.66 / 3.83–4.83 |
| ink · ink-muted | #111113 · #5e5e65 | #f5f5f5 · #ababb1 | text-primary · text-muted |
| accent · on-accent · accent-soft | #111113 · #ffffff · #dedee3 | #f2f2f4 · #0d0d0d · #303036 | brand-primary · foreground · subtle |
| accent-fill **mới** | #111113 | dải ngọc trai 100° #c4c6ce, #ffe9d6 45%, #c6d3f5 | pearl (chữ 11.4–16.6:1) |
| success / -soft | #0a7050 / #ddf4ec | #86e3b5 / #15302a | 5.29 / 9.19 |
| warning / -soft | #9c4a00 / #fcebda | #fbbf7a / #33261a | 5.32 / 8.96 |
| danger / -soft | #c81e2c / #fde5e7 | #ff8a8a / #3a1d20 | 4.77 / 6.72 |
| progress / -soft **mới** | #0b5fb3 / #e0eefc | #93c5fd / #16263a | 5.39 / 8.49 |
| waiting / -soft **mới** | #5b3fc4 / #ece7fc | #c4b5fd / #231f3a | 5.89 / 8.56 |
| cal-booked-*, cal-active-*, cal-deposit-*, cal-now | giữ S31, S34 | giữ | deposit-bar sáng #b86f0e (3.66) |
| cal-done-*, cal-cancel-* | xám trung tính | xám trung tính | ink/bg 11.3 · 5.7 / 11.0 · 6.9 |

Ánh sáng nền: một lớp tĩnh `body::before` (fixed, z-index −1, không nhận chạm), hai góc trên, 18% và 16%, ẩn khi in và khi `prefers-reduced-transparency`. Thẻ là nền đặc, viền `line`. Chỉ thanh dưới có kính (blur 12px, nền 58–62% như CEN nhưng đo lại chữ), thanh trên nền đặc. Bo góc 6 / 10 / 16 / 20 như CEN. SegmentedControl: mục chọn nền `accent`, chữ `on-accent`, bo tròn như tab CEN.

**Bảng tone** (nguồn `src/lib/status-tone.ts`, thay các hằng `*_TONE` rải rác): `progress`: Đang làm, Khách đã đến, Tạm tính, Làm trên Sheets? (xem red team) · `waiting`: Chờ xác nhận, Chờ duyệt, Chờ Linh duyệt, Chưa duyệt, Đã duyệt chờ chi, Cọc chờ xác nhận, Chờ Linh xem, Yêu cầu huỷ, Bản nháp chờ khoá, Cần xem lại, Giảm chờ duyệt · `warning`: Thu một phần, Còn N đ, Chưa cọc, Vượt khoảng giá, Có dòng nhập tay, Ngoài giờ mở cửa, Sửa tên, Thiếu hồ sơ, Thiếu chính sách, Chưa đổi mật khẩu, Trạm in mất kết nối · `danger`: Chưa thu, Từ chối, Nghỉ không phép, Khách không đến · `success`: Đã thu đủ, Đã xác nhận, Đã nhận cọc, Đã cọc, Đã chi, Đã trả đủ, Đã khoá (lương), Đi làm, Nghỉ đã duyệt, Trạm in đang kết nối · `neutral`: còn lại (Đã huỷ mọi nơi, Hoàn thành, Hoàn một phần, Hoàn toàn bộ, Đã hoàn cọc, Quán giữ cọc, Nghỉ có phép, Quán đóng cửa, Chờ ngày nháp, Đã khoá tài khoản, Đã thu quyền, Máy này…).

**Các gói, mỗi gói một commit, gỡ độc lập được**

| Gói | File chính | Cách kiểm |
|---|---|---|
| 0 Tài liệu: S45–S52, kế hoạch, demo | `docs/*`, `CLAUDE.md`, `design/demo/*` | đọc lại |
| 1 Token và quy định | `design/design-system/tokens.json`, `README.md`, `scripts/gen-tokens.ts` (thêm nhóm gradient), `src/styles/tokens.css` (sinh) | `bun run check`; xem 5 màn |
| 2 Thành phần | `src/styles/components.css`, `src/components/ui/*`, `src/lib/status-tone.ts`, `src/routes/_app.tsx` | check; test tone; xem sheet, hộp thoại, toast |
| 3a Lịch | `lich/*`, `components/lich/*` | S45, S46, form, vuốt, cuộn |
| 3b Đơn | `don-hang/*`, `components/don-hang/*` | luồng trọn vẹn |
| 3c Tổng quan, Khách, Thêm | `_app/index.tsx`, `khach/*`, `them/index.tsx`, `cong/AttendanceCard.tsx` | 4 vai, K09 |
| 3d Màn còn lại | `them/*`, `cham-cong`, `dang-nhap`, `doi-mat-khau`, `thong-bao` | quét chữ, S50 |
| 4 Ngoài trang | `__root.tsx`, `manifest.webmanifest`, `@media print`, `tests` | in, theme-color |

**Cách quay lại:** `git revert` các commit theo thứ tự ngược, push, Triển khai lại. Không force-push. Không có migration nên quay lại không chạm dữ liệu.

### 4.2. Red team và kế hoạch bản 2

Ba agent độc lập, chỉ đọc (iPhone và PWA; màu và thành phần; nghiệp vụ và quyền). 49 phát hiện. Những điểm dưới đây **thay** chỗ tương ứng ở bản 1.

**Nhận**

| Góc | Phát hiện | Cách làm trong bản 2 |
|---|---|---|
| Quyền | Xác nhận bill chính là duyệt giảm giá; nút Duyệt giảm giá thực tế không hiện (`OrderView.tsx:238`) | S48 sửa: đơn còn giảm chờ duyệt vẫn hỏi lại, hiện tổng giảm. Đơn thường bấm là xong |
| Quyền | Bỏ hộp thì lỗi và xung đột 409 mất chỗ hiện | Hàm chạy trực tiếp, lỗi báo bằng toast 6 giây, nút có `loading` |
| Quyền | Hộp thu tự mở sẽ lấy sai số khi đơn chờ duyệt | Chỉ khi `status === 'confirmed' && can.recordPayment && dueAmount > 0`, dùng số mới từ server. Lối chính là `OrderEditor.save(true)`, cờ một lần qua `onSaved`. Không hiện toast khi tự mở (toast đè nút Lưu) |
| Quyền | Thu gọn chip thợ làm hoa hồng vào nhầm người (Nhung lên đơn hộ; lịch nhiều khách) | Chỉ thu gọn khi người dùng không có `order.confirm` và `guestCount <= 1`. Tên lấy từ `line.staff`, luôn hiện đủ. Dòng chưa có thợ tự xổ. Chờ `staff.data` rồi mới cho thêm dòng |
| Quyền | Chạm để bỏ làm mất giá sửa, chia thợ, giảm theo dòng; `scope` theo vị trí | Chỉ bỏ khi dòng nguyên mặc định; khác thì báo dùng nút X. Danh sách tích chỉ cho đơn Đang làm, đơn khác giữ bảng chọn cũ. Có nút +1; có từ 2 dòng thì không bỏ bằng tích |
| Quyền | 2.5.3 liệt kê bỏ cả câu giữ tiền và quyền | Theo danh sách "phải giữ" bên dưới; chỉ rút gọn, không mất ý |
| Quyền | Enter lưu bỏ qua tách SĐT, cọc, cảnh báo | Enter chỉ lưu khi tạo mới, không có mùa cọc, không cảnh báo, không `isComposing`, có chạy `movePhoneOutOfName`, có `if (busy) return`; nếu không thì chỉ thu bàn phím |
| Quyền | Chip giờ, thời lượng: `addMinutes` kẹp 23:59, lịch dài lẻ | Giữ ô Kết thúc sau lối "Giờ khác"; chip đầu là thời lượng mặc định; chip không vừa trong ngày thì tắt; cảnh báo B10 giữ |
| Quyền | S45: khi nào không có nút chính | Thanh chỉ ở tab Thông tin, khi `createOrder && missing > 0`, không có yêu cầu huỷ, lịch không ở ngày tương lai; khác thì Tạo đơn nằm trong trang. `orderError` cạnh thanh. Huỷ lịch cách đáy ≥ 24px |
| Quyền | Tổng quan gộp ô | Không gộp số quỹ vào thẻ hôm nay; thẻ quỹ theo `d.money` và `scope === 'branch'`; khối Cá nhân không dùng chung `?? 0` |
| iPhone | Bản thật chỉ có một `theme-color` (TanStack lọc trùng) | Bỏ khỏi `head.meta`, viết tay 2 `<meta>` trong `RootDocument`, kiểm HTML sau build |
| iPhone | Bàn phím số không gõ được email | S50 sửa: thêm chữ "Dùng email" |
| iPhone | Bàn phím iOS không co layout, sticky nằm dưới phím; ô tiền không có Enter | Hook `visualViewport` ghi `--kb`, reset khi `focusout`; thanh nút, sheet, dialog, toast cùng dùng. Bỏ "Enter ở ô tiền". Chốt quỹ đích là **5 → 4** (qua link ở Tổng quan), không phải 3 |
| iPhone | Kính 58–62% rớt chuẩn | 86%, đo 4.78 / 5.93 ở ca xấu nhất. Nền đặc mặc định, kính trong `@supports`, có `-webkit-` |
| iPhone | Lớp ánh sáng và nền | Nền ở `html`, `body` trong suốt như CEN; hạ tâm sáng; viền dưới thanh trên; nhãn giờ bỏ `bg-surface`, kẻ giờ bắt đầu từ cột nội dung |
| iPhone | Hằng số 220px ở Lịch | Màn Ngày là khung flex, trục giờ `flex-1 min-h-0`, `overscroll-y-contain`; giữ phần tử cuộn và `swipeLayer` |
| iPhone | Danh sách inline: các dòng trượt dưới ngón tay | Bù cuộn trong `useLayoutEffect`; ô tìm không autoFocus |
| iPhone | Select 13px làm Safari tự phóng, thiếu mũi tên | `font-size: 16px` trong `.lo-input`, chevron |
| Màu | Mất dấu "hôm nay" | Số hôm nay nền `cal-now` tròn |
| Màu | Link thành chữ thường | `.lo-link` gạch chân; nút quiet gạch chân; "← Thêm" thành nút quay lại |
| Màu | Thiếu focus-ring, shadow, hex `cal-done`, `cal-cancel` | Bảng dưới |
| Màu | `accent-fill` không hợp lệ; sinh `@theme` hỏng | Nhóm `gradient` riêng trong tokens, sáng dùng `linear-gradient(#111113,#111113)` |
| Màu | Nút + Lịch thua cascade | `.lo-icon-btn-primary` |
| Màu | Hộp thoại tối mất ranh giới | Token `overlay` .35 / .66, viền `dialog-edge` |
| Màu | Bản in ở máy tối | Sinh khối tối trong `@media screen and (prefers-color-scheme: dark)`; print nền trắng cho thẻ, sheet, chip viền, ẩn `.lo-seg`, `body::before` |
| Màu | Tone viết tay 29 chỗ, 17 file | Bỏ `accent` khỏi `ChipTone`, thêm `progress`, `waiting`; `CELL`; `src/lib/status-tone.ts` là một nguồn; test quét cấm `StatusChip tone="` ở `tests/unit/status-tone.test.ts` |
| Màu | Giờ đóng cửa tối sáng hơn giờ mở | Token `cal-closed` |
| Màu | Tab tràn ngang | `.lo-seg { display:flex; max-width:100% }`, dưới 390px giảm đệm |
| Màu | 4 viên đặc xếp chồng trong sheet | Trong `.lo-sheet`, `.lo-dialog` mục chọn dùng `accent-soft` + `ink` |
| Màu | Mô tả cũ ở README, tokens.json | Cập nhật ở gói 1 |

**Bỏ, có lý do**

- "Viết cổng iPhone thật trước Gói 1, app ghim trên 2 máy": em không có iPhone. Cổng 4.5 theo master prompt (khổ 390, 360, 4 vai, luồng trọn vẹn, tải 8 lần, in). Phần iPhone thật ghi là chưa kiểm, thành việc của anh sau khi triển khai.
- Đổi `approveFirst` để hiện nút Duyệt giảm giá riêng: đổi luồng của Nhung, không cần vì hộp hỏi lại đã giữ được chốt chặn.
- Sửa triệt để rủi ro thu trùng khi cọc chờ xác nhận chưa vào `depositAvailable`: phải đổi API, ngoài phạm vi. Ghi vào báo cáo cuối.
- `<style>` nhúng trong head chống nháy màu: lợi ích nhỏ, thêm một nguồn màu.
- Đặt `html` không nền (đề xuất của góc màu): trái với cách sửa nháy; chọn cách CEN, `html` có nền và `body` trong suốt.
- Đo pin, giật trên máy cũ: chưa có bằng chứng, không làm được ở đây.

**Token bổ sung so với bản 1**

| Token | Sáng | Tối |
|---|---|---|
| line (đổi) | #d9d9dd | #34343a |
| cal-done-bg / bar / ink / sub | #ececee / #85858c / #2f2f33 / #5e5e65 | #222226 / #7c7c84 / #d7d7db / #ababb1 |
| cal-cancel-bg / bar / ink | #f1f1f3 / #c4c4c9 / #5e5e65 | #17171a / #4a4a50 / #a0a0a6 |
| cal-closed **mới** | #ececee | #101012 |
| overlay **mới** | rgb(0 0 0 / 35%) | rgb(0 0 0 / 66%) |
| dialog-edge **mới** | transparent | #7c7c84 |
| nav-fill **mới** | rgb(255 255 255 / 86%) | rgb(20 20 22 / 86%) |
| shadow-sm, -fab, -lg | theo CEN `elev-1..3` | theo CEN |
| focus-ring | 0 0 0 2px #f6f6f7, 0 0 0 4px #111113 | 0 0 0 2px #08080a, 0 0 0 4px #c6d3f5 |

**Bảng tone chốt:** như 4.1, bổ sung `neutral`: Làm trên Sheets, Chờ ngày nháp, Nghỉ đã duyệt, loại ở Cần xem lại, Linh duyệt, Đã tắt, Ngoài thời gian làm, Chưa tới. `success`: Đã duyệt (đơn nghỉ). `danger`: Bị từ chối. `waiting`: Cần Linh xem lại, số việc chờ ở Thêm. `warning`: số đếm Cần xử lý.

**Câu phải giữ (rút gọn được, không mất ý):** `OrderEditor` "Bạn lưu là đã duyệt mức này", doanh thu ngày đổi theo và thành tiền không nhỏ hơn số đã thu, khoảng giá. `OrderView` cọc chưa trừ, ai sửa được đơn, phải hoàn hết trước khi huỷ, hoàn tối đa và doanh thu giảm, "trừ vào doanh thu". `pickers` bậc duyệt, sinh nhật tự kiểm tra, SĐT đã có hồ sơ. `PhotoSheet` "Lưu hình ảnh", "kèm bill". `AppointmentForm` số cọc cần, khác số gợi ý, Nhung Linh xác nhận, chữ "nội bộ". `lich/$id` lịch giữ nguyên đến khi huỷ chính thức, chuyển cọc, huỷ lịch không huỷ đơn. `DepositSection:133, 247, 277`. Tổng quan "chưa xác nhận", "chưa phải doanh thu", "Chưa mở sổ". `chot-ngay` việc còn treo vẫn chốt được, thừa thiếu và lý do, ngày trên nút, không sửa được sau khi chốt, tiền tip ra khỏi quỹ. `thu-chi` "Tiền chỉ ra khỏi quỹ khi bấm Đã chi". `tam-ung:69-70, 224`. `luong:191, 233-234`. `so-tien:418, 645, 734-735`. `cong/views:74`, `cong/parts:139-140`, `cham-cong:54`, `AttendanceCard:33`, `khach/$id:152`.

### 4.3. Mốc (01/11/2026, trên `bb4860b` cộng file đang làm của phiên khôi phục)

| Lệnh | Kết quả |
|---|---|
| `bun run lint` | 1 lỗi định dạng ở `nhap-lai-du-lieu.tsx` (file của phiên khôi phục, đã sửa bên đó) |
| `bun run typecheck` | Đạt |
| `bun run test` | 330 đạt, 4 hỏng, 41 bỏ qua. 4 ca `luong.test.ts` phụ thuộc ngày (trước ngày 5 không khoá được lương); 5 bộ khác hỏng vì hai phiên chạy song song trên `lindy_test`. Phải đo lại khi phiên khôi phục cho phép |
| `bun run build` | Đạt |
| `bun scripts/scan-bundle.ts` | 73 file, không có bí mật |

**Điều kiện push:** phiên khôi phục dữ liệu báo xong việc trên bản thật và đã gỡ công cụ. Trước đó không push, không chạy test trên `lindy_test` (đã thống nhất giữa hai phiên).
