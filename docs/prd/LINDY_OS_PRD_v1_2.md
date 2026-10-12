# LINDY OS
## ĐẶC TẢ SẢN PHẨM V1.2 — BẢN GỘP ĐẦY ĐỦ QUYẾT ĐỊNH NGÀY 10–12/10/2026

**Đơn vị sử dụng:** LINDY NAIL / Lindy Nailash Studio (Instagram **@lindy.nailashstudio**)  
**Phiên bản:** 1.2, ngày 12/10/2026. Thay thế bản 1.1. Bản 1.0 và 1.1 giữ trong `docs/prd/` để tra lịch sử.  
**Trạng thái:** đã chốt D01–D17, Q01–Q44, G01–G26, A01–A05, B01–B15, C01–C16. Phần còn chờ ở mục 19.5. Đây là yêu cầu nghiệp vụ đã duyệt, chưa phải xác nhận đã có app.  
**Thiết bị:** toàn bộ nhân sự dùng **iPhone**. Web mobile-first/PWA chạy trên Safari, ghim ra màn hình chính.  
**Phạm vi:** cơ sở 31/49 Huỳnh Thúc Kháng, Hà Nội (**CS HTK**); kiến trúc nhiều cơ sở từ đầu.  
**Tài liệu đi kèm:**
- `docs/modules/LICH_DAT_KHACH_v1_2.md` — module lịch đặt khách (chi tiết, thắng PRD trong phạm vi lịch hẹn).
- `docs/DECISIONS.md` — nguồn gốc từng quyết định.
- `design/` — bộ giao diện (bản gốc: https://claude.ai/artifact/AVWhQDVKgZyiq6ig5VgpP3).
- `data/` — bảng giá, combo, nhân sự để nhập vào app.
- `docs/TECH_STACK.md` — đề xuất nền tảng kỹ thuật (chờ chốt).

> MỤC TIÊU TRUNG TÂM: Mỗi giao dịch được nhập một lần và tự chảy vào đơn hàng, báo cáo doanh thu, sổ tiền, hiệu suất nhân viên, tính lương và lịch sử khách hàng. Không nhập lặp tại nhiều bảng tính.

---

# 0. THAY ĐỔI SO VỚI V1.1

| Mục | Thay đổi | Nguồn |
|---|---|---|
| 4, 14, 17 | **Lịch đặt khách** thành module riêng, làm **đầu tiên**, không phân thợ; Chin có quyền lịch mở rộng; thông báo và Web Push ngay P1 | D17, B01–B15 |
| 6.1 | Chọn dịch vụ bằng **danh sách tích chọn có tìm kiếm thông minh**, app tự điền tiền | C09 |
| 6.5 | Giá khoảng tự điền giá thấp nhất; giảm giá sinh nhật 10%; **cộng dồn giảm giá** và mức duyệt theo tổng %; giảm được trên combo | A04, C11, C14, C15 |
| 6.6 | Tiền cọc chỉ mùa Tết (19–28 tháng Chạp, theo ngày tạo lịch), 100.000đ/khách, hoàn khi báo trước ≥ 12 tiếng; cọc bị giữ là doanh thu phần của Linh, **không hoa hồng, không KPI** | A02, A03, B01, C01–C04 |
| 6.7 (mới) | **Bảo hành**: bill có cứng móng 7 ngày, không có 3 ngày | C12 |
| 6.8 (mới) | Danh mục dịch vụ, combo bán đúng giá niêm yết, combo nhiều thợ nhập tay | P01, C06–C08, C10 |
| 8 | Mỗi người 1 ca fulltime 9:00–21:00 = 1 công | A01, C05 |
| 9 | Tạm ứng tối đa bằng lương cứng; cọc bị giữ nằm ngoài hoa hồng và KPI | A05, C04 |
| 17 | Thứ tự đợt làm mới: lịch đặt → đơn hàng → sổ tiền và cọc Tết → công, lương | D17 |
| 18 | Sửa test 36; thêm test 46–54 | Tổng hợp |

# 1. BỐI CẢNH VÀ VẤN ĐỀ CẦN GIẢI QUYẾT

LINDY đang theo dõi doanh thu bằng các tab theo tháng trong Google Sheets; mỗi khách một dòng, số tiền phân về từng thợ. Bảng lương riêng lấy doanh thu từng người, cộng hoa hồng, tính ngày nghỉ, thưởng, tạm ứng và KPI quản lý. Lịch hẹn ghi trên **Apple Calendar**. Phần thu chi chưa tạo được bức tranh liên tục từ đơn hàng đến tiền còn trong quỹ.

Cần giải quyết: (1) thông tin phân tán; (2) khó biết doanh thu đã thu đủ tiền chưa; (3) không thấy số dư quỹ theo thời gian; (4) lương cuối tháng làm tay; (5) thiếu lịch sử đơn của từng khách; (6) lịch hẹn nằm ngoài hệ thống; (7) khó chuẩn hoá khi mở cơ sở thứ hai.

**Điểm đích:** chủ nhìn trong 30 giây: hôm nay bao nhiêu lịch hẹn và lượt khách; doanh thu thuần; tiền đã thu; đã chi; tiền còn trong từng tài khoản; công nợ khách; lương tạm tính; lãi/lỗ vận hành ước tính của tháng.

# 2. THÔNG TIN ĐÃ BIẾT VÀ QUYẾT ĐỊNH ĐÃ CHỐT

## 2.1. Thông tin thực tế của quán

- Nhân sự: **Linh** (chủ), **Nhung** (quản lý), **Chin**, **Trang**. Danh sách chỉnh được, không viết cố định trong code. Chi tiết: `data/staff.csv`.
- Lương khi go-live giữ bảng tháng 10/2026 (Q31): Linh 3.500.000đ; Nhung 7.000.000đ; Chin 4.000.000đ; Trang 3.500.000đ; hoa hồng 25%; nghỉ được hưởng 3 ngày/tháng, Nhung 4 ngày. Linh có dòng lương (Q32).
- Thưởng KPI quản lý của Nhung: doanh thu quán < 85.000.000đ: 0%; từ 85.000.000đ đến < 102.000.000đ: 1%; từ 102.000.000đ: 1,5%; nhảy bậc trên toàn doanh thu quán.
- Mở cửa **9:00–21:00 mọi ngày** (Q25). Mỗi người làm **1 ca fulltime 9:00–21:00 mỗi ngày** (A01, C05).
- Nhận tiền: **tiền mặt**, **chuyển khoản/QR** (Q13). Hai tài khoản: **Tiền mặt cs HTK**, **Tài khoản cs HTK**; không dùng tài khoản cá nhân (Q17, Q18).
- Không có thu ngân riêng; Nhung kiêm (Q05).
- Dịch vụ móng và **mi** (uốn mi). Bảng giá 6 nhóm và 4 combo: `data/bang-gia-dich-vu.md`.
- **Bảo hành**: bill có cứng móng 7 ngày, không có cứng móng 3 ngày (C12).
- Lịch hẹn đang ở Apple Calendar; sẽ nhập tay sang LINDY OS (B15).
- Hộ kinh doanh; chưa dùng hóa đơn điện tử (Q43, Q44).
- Thương hiệu: logo đang làm mới; màu chủ đạo be, nâu, trắng; Instagram @lindy.nailashstudio (G01–G03, C13).
- Không dùng KPI doanh thu cá nhân trên màn hình hoạt động.

## 2.2. Quyết định discovery D01–D17

D01–D16 chốt ngày 10/10/2026 (bảng ở mục 19.1). **D17** (12/10/2026): lịch đặt khách không phân thợ, lịch chung có thông báo ngay P1, Linh/Nhung/Chin quản lý mọi lịch.

## 2.3. Quyết định bổ sung

- **Q01–Q44** (phiếu chốt thông tin), **G01–G26** (phiếu phong cách), **B01–B15** (phiếu lịch đặt): câu trả lời gốc ở `docs/surveys/`.
- **A01–A05**, **C01–C16**: trả lời các câu còn chờ, ghi ở `docs/DECISIONS.md`.

Mọi chính sách có ngày hiệu lực; thay đổi không tính lại âm thầm dữ liệu đã chốt. Không tự suy đoán giá trị tiền, hạn mức, giờ ca khi chưa được cung cấp.

# 3. TẦM NHÌN SẢN PHẨM VÀ CHỈ SỐ THÀNH CÔNG

App nội bộ, đơn giản như app bán hàng nhưng có báo cáo quản trị sâu, dùng trên iPhone là chính. Mục tiêu: **tạo lịch hẹn không quá 4 lần chạm; nhập đơn thông thường 20–40 giây; ít bước bấm nhất có thể (G24); chốt ngày trong vài phút; lương tạm tính tự cập nhật; mọi báo cáo dùng cùng một nguồn dữ liệu**.

Chỉ số đo sau khi chạy: tỷ lệ lịch hẹn ghi trên app thay Apple Calendar; số lịch không đến; tỷ lệ đơn có phân bổ thợ đúng; số đơn chờ xác nhận cuối ngày; độ lệch quỹ khi chốt ngày; thời gian chốt lương; tỷ lệ khách quay lại; số bước bấm để tạo đơn.

# 4. VAI TRÒ VÀ PHÂN QUYỀN

| Vai trò | Được làm | Không được làm |
|---|---|---|
| **Linh — Chủ** | Toàn hệ thống: xác nhận bill, chốt sổ (thay Nhung ngày Nhung nghỉ); duyệt giảm giá tổng trên 20%; duyệt chi trên 1.000.000đ và 4 nhóm chi riêng; duyệt tạm ứng; cài đặt (giờ mở cửa, mùa cọc, danh mục, chính sách); khóa/mở kỳ; danh sách Cần xem lại | — |
| **Nhung — Quản lý** | Xác nhận bill và thanh toán (kể cả đơn có phần của mình, Q04); duyệt giảm giá tổng đến 20%; quyền lịch mở rộng; xác nhận tiền cọc; duyệt công, ngày nghỉ của mọi người kể cả mình (Q27); chốt quỹ; duyệt chi đến 1.000.000đ/phiếu trừ 4 nhóm riêng; xem số dư 2 tài khoản; xem bảng lương toàn quán trên app, mọi lúc (Q40) | Xem lợi nhuận; sửa, khóa, chi, tải bảng lương; duyệt tạm ứng; đổi chính sách |
| **Chin — Thợ, quyền lịch mở rộng** | Như thợ, cộng: sửa, chốt, huỷ mọi lịch hẹn; hoàn/giữ cọc | Quyền lịch mở rộng **không** kéo theo quyền lương, thu chi, lợi nhuận, xác nhận bill hay xác nhận tiền cọc |
| **Thợ (Trang và người mới)** | Tạo lịch; sửa và tự huỷ lịch mình tạo khi còn “Mới đặt” (có lý do); “Khách báo huỷ”; “Khách đã đến”; tạo đơn từ lịch; tạo đơn nháp; bấm Làm xong; áp giảm giá tổng đến 10%; ghi cọc (chờ xác nhận); đề nghị chi, đề nghị tạm ứng; check-in/out; xem doanh thu, lương tạm tính, phiếu lương của mình | Xác nhận bill, thanh toán, cọc; xem doanh thu, lương người khác; xem dòng tiền |
| **Thu ngân / Kế toán** | Giữ trong mô hình quyền cho tương lai | Không cấu hình ở V1 |

**Quyền chính** (gán cho tài khoản theo cơ sở, không viết theo tên):

| Quyền | Linh | Nhung | Chin | Thợ |
|---|---|---|---|---|
| `order.create_draft` | Có | Có | Có | Có |
| `order.confirm` | Có | Có | Không | Không |
| `discount.apply_up_to_10pct` | Có | Có | Có | Có |
| `discount.approve_up_to_20pct` | Có | Có | Không | Không |
| `discount.approve_any` | Có | Không | Không | Không |
| `appointments.*` (sửa, chốt, huỷ mọi lịch) | Có | Có | Có | Không |
| `appointments.create`, `update_own_pending`, `cancel_own_pending`, `report_customer_cancel`, `mark_arrived`, `create_order` | Có | Có | Có | Có |
| `deposits.record` | Có | Có | Có | Có |
| `deposits.confirm` | Có | Có | Không | Không |
| `deposits.resolve` (hoàn/giữ) | Có | Có | Có | Không |
| `payroll.read_all_branch` | Có | Có (chỉ xem) | Không | Không |
| `payroll.read_own` | Có | Có | Có | Có |
| `payroll.edit` / `approve_lock` / `pay` / `export_all_branch` | Có | Không | Không | Không |
| `money_accounts.read_balance` | Có | Có | Không | Không |
| `profit.read` | Có | Không | Không | Không |
| `expense.request` | Có | Có | Có | Có |
| `expense.approve_within_limit` (≤ 1.000.000đ, ngoài 4 nhóm) | Có | Có | Không | Không |
| `expense.approve_above_limit` | Có | Không | Không | Không |
| `advance.approve` | Có | Không | Không | Không |
| `attendance.approve` | Có | Có | Không | Không |
| `review_queue.read` | Có | Không | Không | Không |
| `booking_settings.manage`, `catalog.manage` | Có | Không | Không | Không |

Mọi lần xem bảng lương toàn quán, mọi lần tự duyệt (đơn có phần của mình, công của mình) và mọi thao tác tiền cọc ghi audit log. Quyền kiểm tra ở API và database, không chỉ ẩn nút.

# 5. KIẾN TRÚC TRẢI NGHIỆM MOBILE

## 5.1. Thanh điều hướng

Thanh dưới cùng, **biểu tượng nét mảnh kèm chữ** (G16, G17), 5 mục:

1. **Tổng quan** — số hôm nay/tháng, lịch hôm nay, cảnh báo, danh sách cần xử lý.
2. **Đơn hàng** — tạo đơn, đơn trong ngày, chờ xác nhận, thu tiền.
3. **Lịch** — lịch hẹn (module lịch đặt), ca làm, chấm công.
4. **Khách** — tên, SĐT, lịch sử đơn.
5. **Thêm** — thu chi, báo cáo, lương, cài đặt, xuất dữ liệu.

Nút tròn nổi **“+ Tạo đơn”** góc phải dưới, trên thanh điều hướng (G18). Màn Lịch có nút `+` riêng ở đầu trang để tạo lịch hẹn.

## 5.2. Ví dụ Tổng quan (Linh và Nhung)

```text
LINDY OS                         [CS 31/49 HTK]
Hôm nay, 10/10/2026          [Hôm nay | Tháng]

DOANH THU THUẦN              8.450.000đ
Tiền đã thu                  7.900.000đ
Còn khách nợ                   550.000đ

12 đơn | 15 lượt | 2 chưa thu đủ | 1 chờ xác nhận
Lịch hôm nay: 14 lịch · 2 Mới đặt · 1 Khách báo huỷ

TIỀN TRONG QUỸ
Tiền mặt cs HTK              3.500.000đ
Tài khoản cs HTK            28.300.000đ

DOANH THU THỢ HÔM NAY   (chỉ Linh và Nhung)
Nhung   3.100.000đ | Chin   2.450.000đ
Linh    1.800.000đ | Trang  1.100.000đ

CẦN XỬ LÝ
1 đơn chờ xác nhận · 2 lịch Mới đặt · 1 cọc chờ xác nhận
[Linh] 3 đơn Nhung tự xác nhận cần xem lại

[Tổng quan] [Đơn hàng] [Lịch] [Khách] [Thêm]     (+)
```

Số liệu chỉ là ví dụ. Thợ mở Tổng quan chỉ thấy số của mình và lịch chung.

## 5.3. Định hướng giao diện

Phong cách **Ngà & mực** (G06): nền ngà, chữ mực ấm ngả nâu, tiêu đề và số tiền lớn chữ có chân (Cormorant Garamond), nội dung chữ không chân (Be Vietnam Pro), một màu nhấn mận. Sáng/tối tự đổi theo iPhone (G09). Trạng thái tiền xanh/cam/đỏ luôn kèm chữ (G10). Cỡ chữ vừa, mật độ dày, ô nhập 16px, vùng chạm ≥ 44px. Số tiền đầy đủ `8.450.000đ` (G13). Gần như không dùng ảnh (G20); chuyển động tối thiểu (G21); giọng văn ngắn gọn “Đã lưu đơn #0142.” (G22). Biểu tượng app: chữ L trên nền mận (G19). Chi tiết: `design/`.

Bảng dài có trang riêng và lọc; ô tiền mở bàn phím số; nút nguy hiểm (Huỷ đơn, Hoàn tiền, Khoá lương) cần xác nhận rõ.

# 6. PHÂN HỆ ĐƠN HÀNG

## 6.1. Tạo và xác nhận đơn

**Luồng:** thợ tạo đơn nháp (hoặc **tạo đơn từ lịch hẹn**) → chọn khách hoặc khách lẻ → **tích chọn dịch vụ** → phân bổ doanh thu từng thợ → giảm giá nếu có → bấm **Làm xong** → **Chờ xác nhận** → Nhung xác nhận bill và ghi thanh toán → **Đã xác nhận**. Ngày Nhung nghỉ, Linh xác nhận (Q03).

**Chọn dịch vụ (C09):**
- Màn tạo đơn mở **danh sách tích chọn** các hạng mục như menu, có **tìm kiếm thông minh**: gõ không dấu và gõ tắt vẫn ra (ví dụ “son gel” ra Sơn gel trơn, “tdc” ra Tẩy da chết).
- Chọn xong **app tự điền tiền**. Dịch vụ tính theo ngón/hình/cái có ô **số lượng** (mắt mèo 10 ngón × 7.000đ = 70.000đ).
- Danh mục do Linh quản lý trong Cài đặt, thêm hạng mục mới được.

**Quy tắc ghi nhận:**
- **Chỉ đơn Đã xác nhận** vào doanh thu, hoa hồng, KPI, báo cáo (Q01).
- Doanh thu ghi theo **ngày làm dịch vụ** (`service_date`), không theo ngày xác nhận (Q02).
- Đơn xác nhận sau khi kỳ lương của tháng làm dịch vụ đã khóa: phần hoa hồng/KPI ghi bằng phiếu điều chỉnh vào kỳ đang mở kế tiếp (D04).
- Đơn Nhung tự xác nhận có phần của Nhung: vẫn xác nhận được, đồng thời vào danh sách **Cần xem lại** của Linh (Q04).

**Thông tin cần lưu:** mã đơn, ngày giờ, ngày làm dịch vụ, cơ sở, người tạo, người xác nhận, `appointment_id` (nếu tạo từ lịch), trạng thái thực hiện, trạng thái thanh toán, hạn bảo hành; dòng đơn (loại dòng, dịch vụ, tên tại thời điểm bán, giá niêm yết/khoảng giá, giá áp dụng, số lượng, giảm giá, thành tiền thuần); phân bổ thợ theo dòng; giảm giá (loại, %, số tiền, lý do, người áp, người duyệt); thanh toán (số tiền, thời điểm, phương thức, tài khoản, đối soát; khoản cọc đã trừ).

## 6.2. Phân bổ doanh thu

**Tổng phần doanh thu phân cho thợ = doanh thu thuần của đơn** (phần “không phân bổ” phải hiển thị riêng, có lý do). Ví dụ: bill 348.000đ, Nhung 239.000đ, Chin 109.000đ → doanh thu quán 348.000đ; hoa hồng Nhung 59.750đ, Chin 27.250đ.

Giảm giá cả đơn phân bổ theo tỷ lệ thành tiền trước giảm; chênh lệch làm tròn đưa vào dòng cuối. **Combo do nhiều thợ làm: nhập tay số tiền từng thợ**, tổng phải bằng giá combo sau giảm (C10). Sửa chia tiền sau xác nhận phải ghi ai, lúc nào, lý do.

**Cơ sở tính hoa hồng** = phần doanh thu thuần được phân bổ, cộng lại phần giảm giá do quán chịu (ưu đãi bù khiếu nại). Mỗi dòng phân bổ lưu `allocated_net_amount` và `commission_base_amount`.

## 6.3. Trạng thái và sửa đơn

- Thực hiện: **Nháp / Đang làm / Chờ xác nhận / Đã xác nhận / Huỷ**.
- Thanh toán **tự tính**: **Chưa thu / Thu một phần / Đã thu đủ / Hoàn một phần / Hoàn toàn bộ**.
- Hai trạng thái độc lập. Đơn đã xác nhận không xoá vĩnh viễn; điều chỉnh bằng phiếu hoàn, điều chỉnh, huỷ có lý do.
- **Hoàn tiền sau khi kỳ lương đã khóa** (Q34): tính vào tháng phát sinh hoàn; tháng cũ giữ nguyên.
- Sửa móng trong bảo hành: phiếu xử lý dịch vụ gắn đơn gốc (mục 6.7).

## 6.4. Đơn hàng mỗi ngày

Lọc: hôm nay, hôm qua, ngày tùy chọn; trạng thái (đặc biệt Chờ xác nhận); nhân viên; tên/SĐT khách; phương thức trả. Hiện tổng đơn, doanh thu theo thợ (Linh, Nhung), hoàn tiền, công nợ, giảm giá, so sánh hôm qua.

## 6.5. Giá, giảm giá, phụ thu, khiếu nại

**Giá (Q07, Q08, C14):**

| Loại dịch vụ | App tự điền | Thợ sửa giá |
|---|---|---|
| Giá cố định (`list`) | Giá niêm yết | Thấp hơn = giảm giá, có lý do, Nhung duyệt |
| Giá khoảng (`custom`) | **Giá thấp nhất** của khoảng, hiện khoảng ngay dưới ô | Trong khoảng: tự do. **Thấp hơn khoảng** = giảm giá, có lý do, Nhung duyệt. **Cao hơn khoảng**: được, có nhãn “vượt khoảng” để Nhung thấy khi xác nhận |

**Giảm giá (Q09, Q10, A04, C11, C15):**
- Lý do có sẵn: **5%**, **10%**, **Sinh nhật 10%** (CRM không lưu ngày sinh; nhân viên tự kiểm tra rồi chọn).
- Giảm được **áp lên combo** (giá gốc là giá combo) và được **cộng dồn**.
- Cộng dồn: **cộng phần trăm trên giá gốc** (5% + sinh nhật 10% = 15%).
- Mức duyệt theo **tổng %** trên dòng hoặc bill, gồm mọi khoản giảm kể cả ưu đãi bù khiếu nại:

| Tổng giảm | Ai được áp |
|---|---|
| Đến 10% | Thợ tự áp, kèm lý do |
| Trên 10% đến 20% | Nhung duyệt |
| Trên 20% | Linh duyệt |

**Phụ thu (Q11):** dòng đơn tính như doanh thu dịch vụ: phân bổ cho thợ, có hoa hồng, tính KPI.

**Ưu đãi bù khiếu nại (Q12):** 10–20% bill sau, loại `complaint_compensation`, **quán chịu**: doanh thu quán giảm, hoa hồng thợ làm bill sau không giảm. Ví dụ bill 500.000đ của Chin, ưu đãi 20% → doanh thu 400.000đ; hoa hồng Chin 125.000đ.

## 6.6. Tip và tiền cọc

**Tip (Q14, Q15):** khách thường đưa tiền mặt trực tiếp cho thợ, app không ghi. Nếu tip chuyển vào tài khoản quán: ghi **tip giữ hộ**, không doanh thu, không hoa hồng; cuối ngày Nhung trả tiền mặt cho thợ và ghi phiếu chi tip. Bill nhiều thợ chia tip theo phần tiền mỗi người, trừ khi khách chỉ định.

**Tiền cọc (chi tiết: module lịch đặt §6):**
- Chỉ **mùa Tết, lịch được tạo từ 19 đến 28 tháng Chạp** (B01, C01). Linh nhập khoảng ngày dương lịch mỗi năm.
- **100.000đ × số khách** (A02, C02). Nhân viên ghi cọc; **Nhung xác nhận** tiền đã vào.
- Cọc đang giữ **không phải doanh thu**. Khách đến: cọc trừ vào bill.
- Khách báo huỷ **trước giờ hẹn ≥ 12 tiếng**: hoàn cọc. Báo muộn hơn hoặc không đến: **giữ cọc** (C03).
- **Cọc bị giữ** = doanh thu quán loại **“cọc khách bỏ hẹn”**, **phần của Linh**, **không tính hoa hồng, không tính KPI** (A03, C04).

## 6.7. Bảo hành (C12)

- Áp cho **mọi dịch vụ**, tính từ ngày làm dịch vụ. Hạn của một bill: **7 ngày** nếu bill có dòng **cứng móng** (Cứng móng 2 lớp, Cứng móng tạo cầu, Combo 139k); **3 ngày** nếu không có.
- App lưu `warranty_until` trên đơn khi xác nhận; phiếu xử lý dịch vụ hiện rõ còn hay hết hạn.
- Trong hạn: lỗi kỹ thuật sửa miễn phí, không tăng doanh thu; khách đổi ý thì tính phí (Q12, §10.3).

## 6.8. Danh mục dịch vụ và combo

- Danh mục ban đầu: `data/services.csv` (28 dịch vụ, 6 nhóm: Cơ bản, Design, Phụ kiện, Móng giả, Chăm sóc, Mi). Mỗi dịch vụ có kiểu giá (`list` / `custom`), đơn vị (lần / ngón / hình / cái), giá thấp nhất, giá cao nhất, số ngày bảo hành.
- **Nhặt da** làm lẻ 40.000đ (C06).
- **Combo** (`data/combos.csv`): Móng thật 99k và 139k, Móng giả 179k và 199k. **Bán đúng giá niêm yết** (C07); dòng “tiết kiệm” trên menu không dùng. “Sơn trơn” trong combo là Sơn gel trơn (C08). Combo là một dòng giá cố định.

# 7. TIỀN THU, TIỀN CHI, SỔ QUỸ

## 7.1. Các khái niệm không được đánh đồng

| Chỉ số | Ý nghĩa | Ví dụ |
|---|---|---|
| **Doanh thu gộp** | Giá trước giảm/hoàn | Dịch vụ 500.000đ |
| **Doanh thu thuần** | Sau giảm/hoàn | Giảm 50.000đ → 450.000đ |
| **Doanh thu cọc bỏ hẹn** | Cọc bị giữ; phần của Linh; ngoài hoa hồng và KPI | 100.000đ khách không đến |
| **Tiền thực thu** | Tiền đã nhận trong kỳ | Khách mới trả 300.000đ |
| **Phải thu khách** | Phần chưa thanh toán | 150.000đ |
| **Cọc đang giữ** | Tiền khách đặt trước, chưa thành doanh thu | Cọc 200.000đ lịch 2 khách |
| **Chi tiền** | Tiền thật đã rời quỹ | Vật tư 100.000đ |
| **Số dư quỹ** | Mở sổ + tiền vào − tiền ra | Không tính bằng doanh thu − chi phí |
| **Lợi nhuận tạm tính** | Doanh thu − chi phí của kỳ (gồm lương phát sinh) | Không đồng nhất với số dư |

## 7.2. Tài khoản tiền

| Tài khoản | Loại | Nhận tiền khách | Nhung xem số dư |
|---|---|---|---|
| **Tiền mặt cs HTK** | Tiền mặt tại quán | Tiền mặt | Có |
| **Tài khoản cs HTK** | Ngân hàng của quán | Chuyển khoản / QR | Có |

Tên là cấu hình. Mô hình vẫn hỗ trợ tài khoản cá nhân (D05) nhưng không dùng ở V1. Số dư mở sổ bằng **bút toán mở sổ** đúng ngày mở sổ. Một đơn có thể trả 200.000đ chuyển khoản + 148.000đ tiền mặt. Chuyển nội bộ tạo cặp bút toán −X/+X.

## 7.3. Thu chi và duyệt chi

- **Thu từ đơn**; **thu cọc** (gắn lịch hẹn); **hoàn cọc**; **thu ngoài đơn** (góp vốn, vay, hoàn tiền nhà cung cấp, thu khác).
- **Chi vận hành**: thuê nhà, điện nước, internet, vật tư, công cụ, sửa chữa, marketing, vệ sinh, đào tạo, phí chuyển khoản, chi khác.
- **Chi nhân sự**: lương, thưởng, tip trả thợ (khi tip vào tài khoản quán).
- **Tạm ứng**: khoản nhân viên nợ quán, không phải chi phí; trừ vào lương kỳ.
- **Chuyển nội bộ; rút vốn / góp vốn chủ**: theo dõi riêng.

**Duyệt chi (Q19, Q20):** nhân viên chỉ đề nghị chi; Nhung duyệt đến **1.000.000đ/phiếu**; trên mức đó hoặc thuộc **tiền nhà; lương, thưởng, tạm ứng; máy móc, thiết bị; sửa chữa** thì Linh duyệt. Chỉ ghi tiền ra khi xác nhận đã chi.

**Công nợ nhà cung cấp (Q21, Q22):** không làm ở V1; chi phí ghi khi trả tiền. Mở sổ không có công nợ.

## 7.4. Chốt quỹ cuối ngày

Một quỹ tiền mặt, chốt một lần sau 21:00 (Q23). Nhung chốt; ngày Nhung nghỉ Linh chốt. Tiền mặt lý thuyết = đầu ngày + thu tiền mặt (kể cả cọc tiền mặt đã xác nhận) − chi tiền mặt (kể cả hoàn cọc, tip trả thợ) ± chuyển nội bộ. Người chốt nhập số đếm; app ghi chênh lệch, lý do. Cảnh báo: đơn chờ xác nhận, đơn thu thiếu, tip giữ hộ chưa trả, cọc chờ xác nhận, chuyển khoản chưa đối soát.

## 7.5. Báo cáo dòng tiền tháng

Số dư đầu/cuối tháng từng tài khoản; thu khách, thu cọc, hoàn cọc, thu khác; chi vận hành, chi nhân sự, tạm ứng (riêng), rút vốn; chuyển nội bộ (hiển thị, loại khỏi tổng); dòng tiền theo ngày; cảnh báo doanh thu lớn mà tiền thu nhỏ.

# 8. NHÂN SỰ, CA LÀM, CHẤM CÔNG

- Hồ sơ nhân viên: mã, họ tên, liên hệ, ngày vào/nghỉ, cơ sở, vai trò, trạng thái, lương cứng và % hoa hồng theo giai đoạn, ngày nghỉ được hưởng, cách nhận lương, quyền dùng app.
- **Ca làm:** mỗi người **1 ca fulltime 9:00–21:00 mỗi ngày** = **1 công** (A01, C05). Ca sáng/chiều để dành cho sau; cách tính công khi đó còn chờ.
- Lịch quán đóng cửa (Tết, sửa chữa) do Linh khai báo.
- Ba lớp dữ liệu: ca dự kiến / giờ chấm thực tế / công được duyệt. Quên check-in không tự trừ lương.
- Nút **Vào ca / Ra ca** trên điện thoại; Nhung duyệt công; bổ sung công phải có lý do.
- **Nhung tự duyệt công và ngày nghỉ của mình** (Q27), ghi audit log.
- **Nghỉ không phép** (Q28): như nghỉ thường, vượt số ngày được hưởng thì trừ 1 ngày lương/ngày, không phạt thêm.
- **Ngày quán đóng cửa** (Q29): không tính là ngày nghỉ, trả lương như đi làm.
- **Làm ngày lễ** (Q30): như ngày thường; hệ số ngày lễ là cấu hình (mặc định 1,0).
- Không tự trừ đi muộn/về sớm, không tự tính tăng ca.

# 9. TÍNH LƯƠNG VÀ THƯỞNG

## 9.1. Công thức

- `ngay_thang` = số ngày lịch của tháng; `nghi_huong` = 3 (Nhung 4).
- `cong_chuan = ngay_thang − nghi_huong`; `luong_ngay = luong_cung / cong_chuan`.
- `nghi_thuc_te` = mọi ngày vắng trên bảng công đã duyệt (có phép và không phép), không tính ngày quán đóng cửa; ngày trước khi vào làm và sau khi nghỉ việc tính là ngày vắng.
- `dieu_chinh_cong = (nghi_huong − nghi_thuc_te) × luong_ngay`
- `hoa_hong = Σ commission_base_amount của đơn Đã xác nhận trong tháng × 25%`. **Không gồm cọc khách bỏ hẹn** (C04).
- `thuong_KPI_Nhung` theo bậc trên **doanh thu quán** = doanh thu thuần sau giảm giá và hoàn tiền, gồm phụ thu, không gồm tip, **không gồm cọc khách bỏ hẹn**, chỉ đơn Đã xác nhận (Q11, Q33, C04).
- `luong_phai_tra = luong_cung + dieu_chinh_cong + hoa_hong + thuong_KPI + thuong_them − khau_tru_hop_le`
- `con_lai_chi_tra = luong_phai_tra − tam_ung_da_chi − luong_da_chi_truoc`

Ví dụ: tháng 31 ngày nhân viên thường chia 28, Nhung 27; nghỉ 2 ngày → +1 ngày lương; vào làm 16/10 đủ 16 ngày (Chin) → 4.000.000 ÷ 28 × 16 ≈ 2.285.714đ; Tết đóng 5 ngày không nghỉ thêm → +3 ngày lương; KPI 85.000.000đ → 850.000đ.

## 9.2. Đổi chính sách

Đổi lương cứng hoặc % hoa hồng **chỉ từ ngày 1 của tháng** (Q36). Không tính lại kỳ đã khóa.

## 9.3. Tạm ứng (Q37, Q38, A05)

- **Chỉ Linh duyệt.** Mở đề nghị từ ngày 1 hằng tháng.
- **Tối đa bằng lương cứng** của người đó (Nhung tối đa 7.000.000đ). App chặn đề nghị vượt mức này.
- Trong hạn mức, xin ứng nhiều hơn số đã làm được thì Linh quyết từng trường hợp; app hiện lương tạm tính để tham khảo.
- Tạm ứng không phải chi phí; trừ vào `con_lai_chi_tra`.

## 9.4. Quy trình bảng lương

1. Trong tháng: lương tạm tính tự cập nhật.
2. **Ngày 05** tháng sau: app tạo bản nháp.
3. Linh kiểm tra; Nhung xem toàn bộ để đối chiếu, không sửa, không chốt.
4. Linh **Khoá bảng lương** → bản chốt có đủ tham số.
5. **Ngày 10 trả lương** (Q41) bằng chuyển khoản hoặc tiền mặt theo từng người.
6. Sai lệch sau khi khóa: phiếu điều chỉnh vào kỳ đang mở kế tiếp.

Quyền xem: Linh toàn bộ; Nhung xem toàn bộ trên app, không tải (Q40); thợ xem của mình (Q39).

# 10. KHÁCH HÀNG (CRM tối giản, D10-B)

- Chỉ có **tên**, **SĐT** (không bắt buộc), **lịch sử đơn**. Không ngày sinh, sở thích, ảnh móng, VIP.
- Nhiều khách dùng chung SĐT được; app nhắc số đã có (Q06).
- Lịch hẹn liên kết khách có sẵn hoặc chỉ lưu tên hiển thị (module lịch đặt §10).
- Khiếu nại là nghiệp vụ đơn hàng: phiếu xử lý gắn đơn gốc, kiểm hạn bảo hành (6.7); lỗi kỹ thuật sửa miễn phí; khách đổi ý tính phí; khách không đồng ý sửa → ưu đãi 10–20% bill sau, quán chịu.

# 11. BÁO CÁO

**Hằng ngày:** lịch hẹn (tổng, Mới đặt, đã đến, huỷ, không đến); đơn Đã xác nhận, chờ xác nhận, huỷ/hoàn; lượt khách; doanh thu gộp, giảm giá, doanh thu thuần; doanh thu theo thợ (Linh, Nhung); tiền thu theo tài khoản; còn phải thu; cọc đang giữ, cọc chờ xác nhận; tip giữ hộ; thu chi; chốt quỹ; danh sách Cần xem lại (Linh).

**Hằng tháng:** doanh thu theo ngày, dịch vụ, thợ; doanh thu cọc bỏ hẹn (tách riêng); thu chi và số dư; lợi nhuận ước tính (Linh); lương phải trả, đã trả, tạm ứng; KPI quản lý; lịch hẹn huỷ và không đến; khách mới/quay lại; xuất CSV/XLSX/PDF; báo cáo đã chốt không bị đổi ngược.

# 12. NGUYÊN TẮC DỮ LIỆU

**Chuỗi xử lý:** `Appointment` (+ cọc) → `Order + OrderItem + StaffAllocation` → Làm xong → **Xác nhận** → doanh thu theo ngày làm dịch vụ → `Payment` → `CashLedger` → `Payroll` → `CRM` → `Reports`.

## 12.1. Bảng dữ liệu chính

Bảng lịch hẹn, cọc, thông báo, Web Push: xem **module lịch đặt §11**. Các bảng còn lại:

| Bảng | Trường quan trọng |
|---|---|
| `organizations`, `branches` | timezone, currency; giờ mở/đóng cửa |
| `users` / `roles` / `role_permissions` | quyền theo cơ sở |
| `staff`, `staff_policy_versions` | `effective_month` luôn là ngày 1; lương cứng, % hoa hồng, ngày nghỉ, KPI, `advance_max` = lương cứng |
| `customers` | name, phone (không unique) |
| `services`, `price_versions` | category, `price_mode` (list/custom), `unit` (lần/ngón/hình/cái), `price_min`, `price_max`, `has_hardening`, `warranty_days`, từ khoá tìm kiếm không dấu |
| `combos`, `combo_items` | giá cố định, các dịch vụ thành phần |
| `orders` | `service_date`, service_status, payment_status (tính ra), `appointment_id`, confirmed_by/at, `needs_owner_review`, `warranty_until` |
| `order_items` | `line_type` (service/custom/surcharge/combo), service_id hoặc combo_id, giá niêm yết, khoảng giá, giá áp dụng, số lượng, `out_of_range`, net_amount |
| `order_discounts` | kind (preset_5/preset_10/birthday/manual/below_list/complaint_compensation), percent, amount, shop_borne, reason, applied_by, approved_by, approval_level |
| `order_staff_allocations` | `allocated_net_amount`, `commission_base_amount` |
| `payments` | method (cash/transfer), money_account_id, reconciliation_status, idempotency_key, deposit_id |
| `tip_holdings` | staff_id, amount, paid_out_entry_id |
| `money_accounts` | type, `manager_can_view_balance` |
| `cash_ledger_entries` | entry_type (opening/payment/deposit_in/deposit_refund/deposit_forfeit/expense/transfer/tip_payout/advance/payroll), amount_signed, reference |
| `revenue_entries` | loại doanh thu (dịch vụ / cọc bỏ hẹn), `owner_staff_id`, `in_commission_base`, `in_kpi_base` |
| `expense_requests`, `expense_approval_rules` | hạn mức 1.000.000đ, 4 nhóm Linh-only |
| `discount_rules` | tổng ≤ 10% thợ, ≤ 20% Nhung, > 20% Linh |
| `shop_closed_days`, `shift_templates`, `attendance`, `leave_requests` | ca Fulltime 9:00–21:00 |
| `employee_advances` | amount ≤ advance_max, approved_by (Linh) |
| `payroll_settings`, `payroll_periods`, `payroll_lines` | draft_day 5, pay_day 10 |
| `order_service_tickets` | đơn gốc, trong/hết hạn bảo hành, kết quả |
| `audit_logs` | append-only |

Tiền là **số nguyên VND**. Làm tròn có tổng kiểm soát.

## 12.2. Invariant phía máy chủ

1. Σ `allocated_net_amount` ≤ doanh thu thuần của đơn; phần chưa phân bổ có lý do.
2. Σ thanh toán (kể cả cọc đã trừ) − hoàn ≤ số phải thu; tip tách riêng.
3. Khoá idempotency cho thanh toán, tạo lịch, tạo đơn từ lịch.
4. Không sửa trực tiếp thanh toán đã đối soát.
5. Không đổi số dư bằng sửa số.
6. Báo cáo theo cơ sở, múi giờ `Asia/Ho_Chi_Minh`.
7. Kỳ đã khoá chỉ điều chỉnh qua bút toán/phiên bản mới.
8. Chỉ người có `payroll.read_all_branch` đọc lương người khác.
9. Chi chưa duyệt/chưa chi không làm giảm số dư.
10. CRM không có trường ngoài tên/SĐT/lịch sử đơn.
11. Chỉ đơn `confirmed` vào doanh thu, hoa hồng, KPI; ngày tính là `service_date`.
12. Σ `commission_base_amount` = Σ `allocated_net_amount` + Σ giảm giá `shop_borne`.
13. **Tổng % giảm** của dòng/bill quyết định người phải duyệt (≤ 10% / ≤ 20% / > 20%); API từ chối nếu thiếu người duyệt đúng cấp.
14. Phiếu chi > 1.000.000đ hoặc thuộc 4 nhóm Linh-only chỉ người có `expense.approve_above_limit` duyệt.
15. `staff_policy_versions.effective_month` là ngày 1.
16. Cọc không phải doanh thu khi đang giữ; mỗi lần chuyển trạng thái cọc là một bút toán.
17. **Doanh thu cọc bỏ hẹn** luôn `in_commission_base = false`, `in_kpi_base = false`.
18. Tạm ứng ≤ lương cứng; chỉ người có `advance.approve` duyệt; không ghi vào chi phí lương.
19. Lịch hẹn không có `staff_id` và không sinh doanh thu.
20. `warranty_until` = `service_date` + 7 ngày nếu đơn có dòng cứng móng, + 3 ngày nếu không.

# 13. HÀNH TRÌNH NGƯỜI DÙNG

**A. Khách có lịch hẹn đến làm:** nhân viên mở lịch → **Khách đã đến** → **Tạo đơn từ lịch** (đơn nháp mang tên, SĐT, cọc nếu có) → tích chọn dịch vụ, app tự điền tiền → gán thợ → giảm giá nếu có → **Làm xong** → Nhung xác nhận bill, ghi tiền còn lại → đơn vào doanh thu; lịch tự “Hoàn thành”.

**A1. Khách vãng lai:** thợ bấm “+ Tạo đơn” → khách lẻ hoặc tìm theo SĐT → như trên.

**A2. Đặt lịch:** xem module lịch đặt §5. Mùa Tết: ghi cọc 100.000đ/khách, Nhung xác nhận tiền.

**B. Trả thiếu:** đơn 500.000đ thu 300.000đ → doanh thu 500.000đ ngày làm; hôm sau thu 200.000đ chỉ tăng tiền.

**C. Mua vật tư:** đề nghị chi 650.000đ → Nhung duyệt → khi chi, tài khoản giảm 650.000đ.

**D. Chốt ngày** sau 21:00: xem đơn chờ xác nhận, thiếu tiền, tip giữ hộ, cọc chờ xác nhận, chuyển khoản chưa đối soát → nhập tiền mặt đếm → xử lý chênh lệch → khoá ngày.

**E. Lương:** ngày 05 bản nháp → Nhung xem → Linh khoá → ngày 10 chi lương.

**F. Khách quay lại sửa móng:** tìm đơn gốc → phiếu xử lý → app báo còn/hết bảo hành (7 hoặc 3 ngày) → lỗi kỹ thuật trong hạn sửa miễn phí; khách đổi ý hoặc hết hạn tính phí; khách không đồng ý sửa → ưu đãi bill sau, quán chịu.

# 14. MÀN HÌNH

| Mã | Màn hình | Thành phần chính | Vai trò |
|---|---|---|---|
| UI01 | Đăng nhập & chọn cơ sở | SĐT/email, mật khẩu | Mọi người |
| UI02 | Tổng quan | Số liệu, lịch hôm nay, cần xử lý, Cần xem lại (Linh) | Linh, Nhung; thợ bản của mình |
| UI03 | Danh sách đơn | Tìm, lọc, trạng thái | Linh, Nhung; thợ đơn của mình |
| UI04 | Tạo/sửa đơn | **Danh sách tích chọn có tìm kiếm thông minh**, tự điền tiền, số lượng theo ngón, combo, phụ thu, phân bổ thợ (nhập tay cho combo), giảm giá theo quyền, Làm xong | Thợ, Nhung, Linh |
| UI05 | Chi tiết & xác nhận đơn | Dòng thời gian, phân bổ, giảm giá, thanh toán (tiền mặt/chuyển khoản/cọc), hạn bảo hành, Xác nhận | Nhung, Linh |
| UI06 | Thu chi & sổ tiền | 2 tài khoản, giao dịch, chứng từ | Linh; Nhung theo quyền |
| UI07 | Chốt ngày | Đếm quỹ, chênh lệch, việc còn treo | Nhung, Linh |
| UI08 | Ca làm & ngày nghỉ | Ca fulltime, check-in/out, nghỉ, ngày đóng cửa | Mọi người theo quyền |
| UI09 | Bảng công & nhân viên | Công, hồ sơ, chính sách theo tháng | Linh, Nhung |
| UI10 | Bảng lương | Tạm tính, chốt, tạm ứng, phiếu lương | Linh, Nhung (xem), thợ (của mình) |
| UI11–12 | Khách | Tìm tên/SĐT, lịch sử đơn | Người có quyền |
| UI13 | Báo cáo | Lọc, xuất file | Linh; Nhung theo quyền |
| UI14 | Cài đặt | Danh mục dịch vụ và combo, giá, tài khoản tiền, quyền, chính sách, hạn mức, giờ mở cửa, mùa cọc, ngày đóng cửa | Linh |
| UI15 | **Lịch hẹn** | Theo module lịch đặt §7 | Mọi người theo quyền |
| UI16 | Duyệt chi & tạm ứng | Đề nghị chi, tạm ứng (≤ lương cứng, Linh duyệt) | Linh, Nhung, người đề nghị |
| UI17 | Thông báo | Trung tâm thông báo, bật/tắt Web Push từng máy, hướng dẫn trên iPhone | Mọi người |

Không cuộn ngang trên iPhone ở các màn tạo đơn, nhận tiền, lịch, báo cáo.

# 15. KỸ THUẬT

- **Nền tảng: chưa chốt.** Đề xuất ở `docs/TECH_STACK.md`; cần chốt trước khi code.
- PWA cho **Safari iPhone**: manifest, service worker, HTTPS, vùng an toàn, ô nhập ≥ 16px, bàn phím số cho ô tiền. Web Push chỉ chạy khi app đã thêm ra màn hình chính (iOS 16.4+), và app ghim có phiên đăng nhập riêng với Safari.
- Giao diện theo `design/`, đủ sáng và tối.
- PostgreSQL; kiểm tra quyền ở máy chủ; phân quyền theo dòng dữ liệu; audit log append-only.
- Giao dịch đơn–thanh toán–sổ quỹ trong transaction; thay đổi lịch + lịch sử + sự kiện thông báo trong một transaction (outbox); push gửi nền.
- Cập nhật tức thời cho lịch hẹn (SSE hoặc WebSocket), tự tải lại khi mất kết nối.
- Tìm kiếm tiếng Việt không dấu và gõ tắt cho danh mục dịch vụ và khách.
- Sao lưu tự động, thử khôi phục; không đưa khoá bí mật vào frontend; import/export CSV.
- VND `1.250.000đ`; `Asia/Ho_Chi_Minh`; `dd/mm/yyyy`. Không có offline ở V1.
- **Thuế** ngoài phạm vi app; app xuất được doanh thu theo tháng để kê khai.

# 16. DỮ LIỆU CŨ

- Lịch hẹn: **nhập tay** các lịch sắp tới từ Apple Calendar, chọn một ngày chuyển hẳn (B15).
- Google Sheets 2025–2026: nhập **sau khi app chạy ổn** (Q42), làm nhãn “không rõ dịch vụ / chưa biết đã thu tiền” khi thiếu dữ liệu, không tạo tiền giả, không đụng số dư quỹ. Chạy song song ít nhất một kỳ.

# 17. LỘ TRÌNH

| Đợt | Nội dung | Ghi chú |
|---|---|---|
| **0 — Nền móng** | Chốt nền tảng; đăng nhập, cơ sở, quyền theo tài khoản, audit log, khung giao diện theo `design/`, thanh điều hướng, PWA + Web Push | Dùng chung cho mọi đợt |
| **1 — Lịch đặt khách** | Module lịch đặt v1.2 trừ tiền cọc và tạo đơn từ lịch | Thay Apple Calendar ngay khi xong |
| **2 — Đơn hàng** | Danh mục dịch vụ, combo; tạo đơn (tích chọn, tìm kiếm thông minh); chia thợ; giảm giá theo tổng %; phụ thu; bảo hành; xác nhận bill; thanh toán; khách; tạo đơn từ lịch; Tổng quan và báo cáo doanh thu | Thay tab doanh thu Sheets |
| **3 — Sổ tiền và cọc Tết** | 2 tài khoản, bút toán mở sổ, duyệt chi, tip giữ hộ, chốt quỹ; **tiền cọc mùa Tết** | **Phải xong trước 19 tháng Chạp (khoảng cuối tháng 1/2027)** |
| **4 — Công và lương** | Ca fulltime, check-in/out, duyệt công, ngày đóng cửa; tạm ứng; lương tạm tính, nháp ngày 5, khoá, chi ngày 10 | Đối chiếu bảng lương Sheets cùng tháng |
| **5 — Hoàn thiện** | Báo cáo tháng đầy đủ, xuất dữ liệu, nhập dữ liệu cũ | |

P2 (sau): nhắc hẹn tự động, đặt lịch online, cảnh báo sức chứa, vật tư/tồn kho, sổ nợ nhà cung cấp, VIP, dự báo dòng tiền. P3: mở chuỗi.

# 18. TIÊU CHÍ NGHIỆM THU

Lịch hẹn: 36 test ở **module lịch đặt §13**. Phần còn lại:

1. Bill 348.000đ chia Nhung 239.000đ, Chin 109.000đ → doanh thu quán 348.000đ.
2. Trả 200.000đ chuyển khoản + 148.000đ tiền mặt → hai tài khoản tăng đúng, công nợ 0.
3. Đơn 500.000đ thu 300.000đ hôm nay, 200.000đ mai → doanh thu ngày đầu 500.000đ, ngày sau chỉ có thu tiền.
4. Giảm 10% đơn nhiều thợ → tổng phân bổ khớp doanh thu thuần.
5. Hoàn 100.000đ trong kỳ mở → có lý do, chứng từ, điều chỉnh đúng kỳ.
6. Chuyển 2.000.000đ tiền mặt sang ngân hàng → tổng không đổi.
7. Góp vốn 20.000.000đ → tăng quỹ, không tăng doanh thu.
8. Chi vật tư 650.000đ → giảm đúng một lần.
9. Tháng 31 ngày, nghỉ 2 ngày → +1 ngày lương chia 28.
10. Nhung tháng 31 ngày nghỉ 4 → không đổi; chia 27.
11. Doanh thu 84.999.999đ → KPI 0; 85.000.000đ → 1%; 102.000.000đ → 1,5%.
12. Thợ chỉ đọc được lương của mình; Nhung đọc toàn bộ nhưng không sửa/khóa/chi/tải.
13. Đổi hoa hồng từ 01/11 không đổi bản lương tháng 10 đã chốt.
14. Khoá ngày, khoá lương không xoá âm thầm được.
15. Khách lẻ không SĐT vẫn lập đơn.
16. Khách quay lại thấy lịch sử; không tự gộp vì trùng tên.
17. Bấm lưu thanh toán hai lần → một khoản thu.
18. Số dư cuối tháng = đầu + thu − chi từng tài khoản.
19. Xuất dữ liệu, sao lưu, khôi phục được.
20. Không cuộn ngang trên iPhone.
21. Thợ bấm Làm xong được, không xác nhận bill được.
22. Đề nghị chi chưa duyệt → số dư không đổi.
23. Quên check-in không tự bị trừ lương.
24. (Thay bằng test module lịch đặt.)
25. Hoàn tiền đơn tháng đã khoá lương → điều chỉnh kỳ đang mở.
26. Khách ở hai cơ sở: hồ sơ chung, đơn đúng cơ sở.
27. Nhung xem số dư 2 tài khoản, không xem lợi nhuận.
28. Giảm giá có lý do, người duyệt; không tự kích hoạt voucher/VIP.
29. Nhập lịch sử không sinh tiền vào quỹ.
30. Làm xong → Chờ xác nhận, chưa vào doanh thu; xác nhận → vào doanh thu ngày làm.
31. Đơn làm 31/10, xác nhận 01/11 → doanh thu tháng 10.
32. Thợ áp 10% → được; 15% → cần Nhung; Nhung 20% → được; 25% → cần Linh.
33. Ưu đãi bù khiếu nại 20% bill 500.000đ của Chin → doanh thu 400.000đ, hoa hồng 125.000đ.
34. Phụ thu 50.000đ của Trang → hoa hồng +12.500đ, doanh thu KPI +50.000đ.
35. Cọc 100.000đ, khách đến làm bill 500.000đ → còn phải thu 400.000đ; ngày nhận cọc không có doanh thu.
36. **Cọc 100.000đ, khách không đến → doanh thu “cọc khách bỏ hẹn” 100.000đ phần của Linh; hoa hồng Linh không đổi; doanh thu KPI của Nhung không đổi.**
37. Phiếu chi 1.200.000đ hoặc phiếu sửa chữa 300.000đ → Nhung không duyệt được.
38. Tết đóng 5 ngày, không nghỉ thêm → không trừ lương, +3 ngày lương.
39. Hết 3 ngày nghỉ, nghỉ không phép 1 ngày → −1 ngày lương.
40. Hiệu lực hoa hồng 15/11 → không lưu được; 01/12 → được.
41. Hoàn 100.000đ bill tháng 10 sau khi khoá → tháng 11 giảm; tháng 10 không đổi.
42. Thợ hoặc Nhung duyệt tạm ứng → bị chặn.
43. Hai khách khác tên cùng SĐT → lưu được, có nhắc.
44. Tip 50.000đ chuyển vào Tài khoản cs HTK → phải trả Chin; cuối ngày chi tiền mặt; doanh thu không đổi.
45. Đơn của Nhung do Nhung tự xác nhận → vào danh sách Cần xem lại của Linh.
46. **Phá móng cũ (20–50k): tự điền 20.000đ; sửa 35.000đ → bình thường; 15.000đ → thành giảm giá cần lý do và Nhung duyệt; 60.000đ → lưu được, nhãn “vượt khoảng”.**
47. **Thợ áp 5% + sinh nhật 10% = 15% → cần Nhung duyệt.**
48. **Sinh nhật 10% trên combo 199k → 179.100đ.**
49. **Combo 139k do Chin và Trang làm, nhập 80.000đ + 59.000đ → lưu được; nhập lệch tổng → không lưu được.**
50. **Bill có Cứng móng (2 lớp) làm ngày 10/11 → bảo hành đến 17/11; bill chỉ Sơn gel trơn → đến 13/11.**
51. **Gõ “son gel” hoặc “tdc” trong danh sách dịch vụ → ra Sơn gel trơn, Tẩy da chết.**
52. **Mắt mèo 10 ngón → tự điền 10 × 7.000đ = 70.000đ.**
53. **Chin (lương cứng 4.000.000đ) đề nghị ứng 4.500.000đ → bị chặn.**
54. **Đơn tạo từ lịch, có cọc 200.000đ đã xác nhận, bill 500.000đ → thanh toán cọc 200.000đ tự có, còn phải thu 300.000đ.**

# 19. SỔ QUYẾT ĐỊNH

## 19.1. D01–D17

| Mã | Quyết định |
|---|---|
| D01 — A | Thợ tạo đơn nháp; Nhung xác nhận bill/thanh toán; Linh duyệt ngoại lệ |
| D02 — A | Chia doanh thu theo dịch vụ; có nhập nhanh tổng bill rồi chia tay |
| D03 — A | Hoa hồng trên doanh thu thuần sau giảm giá; không gồm tip |
| D04 — A | Hoàn/sửa trong kỳ mở; kỳ đã khóa điều chỉnh kỳ sau |
| D05 — A | Nhiều quỹ/tài khoản; đối soát, chuyển quỹ |
| D06 — A | Nhân viên đề nghị chi; Nhung duyệt trong hạn mức; Linh duyệt khoản lớn |
| D07 — A | Số dư đầu kỳ; công nợ đầu kỳ |
| D08 — A | Lịch ca, check-in/out, Nhung duyệt công; không tự phạt |
| D09 — A | Giữ lương, KPI bảng tháng 10/2026; có ngày hiệu lực |
| D10 — B | CRM chỉ tên, SĐT, lịch sử đơn |
| D11 — A | Lịch hẹn có ngay bản đầu |
| D12 — A | Giảm giá thủ công có lý do/duyệt; voucher, VIP để sau |
| D13 — A+ | Nhung xem lương toàn quán, chỉ xem |
| D14 — A | Nhập dữ liệu 2025–2026 để tra cứu |
| D15 — A | PWA mobile-first; thử với Linh, Nhung trước |
| D16 — A | Nhiều cơ sở từ đầu |
| **D17** | Lịch đặt không phân thợ; lịch chung, thông báo, Web Push ở P1; Linh/Nhung/Chin quản lý mọi lịch |

## 19.2. Q01–Q44, G01–G26, B01–B15

Bảng đầy đủ: PRD v1.1 §19.2 (Q), §19.3 (G); `docs/surveys/03-phieu-lich-dat.md` (B). Các mục đã được làm rõ thêm: Q09 → A04, C15; Q16 → A02, B01, C01–C04; Q26 → A01, C05; Q38 → A05.

## 19.3. A01–A05, C01–C16

| Mã | Đã chốt |
|---|---|
| A01 / C05 | 1 ca fulltime 9:00–21:00 mỗi ngày = 1 công |
| A02 / C02 | Cọc 100.000đ × số khách |
| A03 / C04 | Cọc bị giữ: doanh thu quán, phần của Linh, không hoa hồng, không KPI |
| A04 | Thợ giảm 5% hoặc 10%; sinh nhật 10% |
| A05 | Tạm ứng tối đa bằng lương cứng |
| B01 / C01 | Mùa cọc 19–28 tháng Chạp, theo ngày tạo lịch |
| C03 | Hoàn cọc khi báo huỷ trước ≥ 12 tiếng |
| C06 | Nhặt da 40.000đ |
| C07 | Combo bán đúng giá niêm yết |
| C08 | “Sơn trơn” = Sơn gel trơn |
| C09 | Danh sách tích chọn có tìm kiếm thông minh, tự điền tiền |
| C10 | Combo nhiều thợ: nhập tay số tiền |
| C11 | Giảm giá áp lên combo, cộng dồn được |
| C12 | Bảo hành 7 ngày (có cứng móng) / 3 ngày |
| C13 | Instagram @lindy.nailashstudio |
| C14 | Giá khoảng: tự điền giá thấp nhất; thấp hơn = giảm giá; cao hơn được, có nhãn |
| C15 | Cộng dồn % trên giá gốc; ≤ 10% thợ, ≤ 20% Nhung, > 20% Linh |
| C16 | Chủ đồng ý cách hiểu C01, C07, C12 |

## 19.4. Tham số đã có

Giờ mở cửa 9:00–21:00; ca fulltime 9:00–21:00; hạn mức Nhung duyệt chi 1.000.000đ; 4 nhóm chi Linh-only; giảm giá theo tổng %; ngày nháp lương 5, ngày trả 10; thời lượng lịch mặc định 120 phút; mùa cọc và mức cọc; danh mục dịch vụ và combo (`data/`); lương, hoa hồng, ngày nghỉ (`data/staff.csv`).

## 19.5. Còn chờ trước khi chạy thật

| Tham số | Ghi chú |
|---|---|
| **Nền tảng kỹ thuật** | Chặn việc bắt đầu code; xem `docs/TECH_STACK.md` |
| Ngày chuyển hẳn khỏi Apple Calendar | Chọn khi module lịch đặt chạy thử xong |
| Khoảng ngày dương lịch mùa cọc Tết 2027 | Linh nhập trong Cài đặt |
| Tháng mở sổ; số dư mở sổ 2 tài khoản | Nhập đúng ngày mở sổ |
| Lịch quán đóng cửa Tết 2027 | Trước kỳ lương liên quan |
| Từng người nhận lương chuyển khoản hay tiền mặt | Hồ sơ nhân viên |
| Ca nửa ngày tính mấy công | Chỉ cần khi có người làm nửa ca |
| Thời lượng từng dịch vụ | Không bắt buộc; lịch dùng mặc định 120 phút |
| Thuế, hóa đơn điện tử | Chủ hỏi kế toán; ngoài phạm vi app |
| Logo mới | Ngoài phạm vi app |

## 19.6. Definition of Done

- Đạt toàn bộ test mục 18 và module lịch đặt §13.
- Mọi nút tiền, duyệt, xác nhận có kiểm thử phân quyền và chống gửi trùng.
- Chạy thử bằng dữ liệu mẫu; chỉ vận hành thật khi Linh xác nhận tháng mở sổ, tài khoản, số dư.
- Giao diện đạt bộ giao diện LINDY OS ở sáng và tối trên iPhone; Web Push đã thử trên iPhone thật.

# 20. PROMPT BÀN GIAO CHO AI LẬP TRÌNH

> Bạn là senior full-stack engineer. Dùng **LINDY OS — Đặc tả V1.2**, **module Lịch đặt khách v1.2** và **bộ giao diện LINDY OS** làm nguồn yêu cầu; đọc `README.md`, `CLAUDE.md`, `docs/DECISIONS.md` trước. Làm theo đợt ở mục 17, bắt đầu từ Đợt 0 và Đợt 1 (lịch đặt). **Không code toàn bộ app một lần.** Mỗi đợt chạy được trên iPhone (Safari, PWA) và có kiểm thử tự động cho test nghiệm thu liên quan. Tiền là số nguyên VND, có lịch sử và ngày hiệu lực. Các quyết định D, Q, G, A, B, C đã chốt, không hỏi lại; điểm ở mục 19.5 phải hỏi trước đợt liên quan, không tự đoán. Đặc biệt: chỉ đơn Đã xác nhận mới vào doanh thu, tính theo ngày làm dịch vụ; lịch hẹn không phân thợ; giảm giá duyệt theo tổng %; cọc bị giữ không vào hoa hồng và KPI; Nhung đọc lương toàn quán nhưng không sửa, khóa, trả, tải và không xem lợi nhuận.

---

**Kết luận:** LINDY OS bắt đầu từ lịch đặt khách để thay Apple Calendar, rồi nối đơn hàng → tiền → công, lương → khách hàng; ưu tiên số liệu đúng, phân quyền đúng và ít bước bấm trên iPhone.
