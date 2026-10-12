# LINDY OS
## ĐẶC TẢ SẢN PHẨM V1.1 — BỔ SUNG QUY TẮC VẬN HÀNH VÀ ĐỊNH HƯỚNG GIAO DIỆN

**Đơn vị sử dụng:** LINDY NAIL / Lindy Nailash Studio  
**Phiên bản:** 1.1, ngày 12/10/2026. Thay thế bản 1.0 (10/10/2026).  
**Trạng thái:** 16 quyết định discovery D01–D16 chốt ngày 10/10/2026. 44 quy tắc vận hành (Q01–Q44) và 26 lựa chọn giao diện (G01–G26) chốt qua hai phiếu ngày 12/10/2026. Các điểm còn chờ nằm ở mục 19.4. Đây là yêu cầu nghiệp vụ đã duyệt, không phải xác nhận đã có app.  
**Thiết bị:** Toàn bộ nhân sự dùng **iPhone**. Bản đầu là web mobile-first/PWA chạy trên Safari iOS, ghim ra màn hình chính; vẫn dùng được trên máy tính.  
**Phạm vi:** Cơ sở 31/49 Huỳnh Thúc Kháng (gọi tắt **CS HTK**); kiến trúc hỗ trợ nhiều cơ sở ngay từ đầu.  
**Đối tượng nhận:** Chủ cửa hàng, quản lý vận hành, người thiết kế và người vibe code ứng dụng.  
**Tài liệu đi kèm:** Hệ thống giao diện LINDY OS (màu, chữ, khoảng cách, thành phần): https://claude.ai/artifact/AVWhQDVKgZyiq6ig5VgpP3 — xem mục 5.3.

> MỤC TIÊU TRUNG TÂM: Mỗi giao dịch được nhập một lần và tự chảy vào đơn hàng, báo cáo doanh thu, sổ tiền, hiệu suất nhân viên, tính lương và lịch sử khách hàng. Không nhập lặp tại nhiều bảng tính.

---

# 0. THAY ĐỔI SO VỚI V1.0

| Mục | Thay đổi | Nguồn |
|---|---|---|
| 6.1, 6.3 | Thêm trạng thái **Chờ xác nhận**. Chỉ đơn Nhung (hoặc Linh) đã xác nhận mới vào doanh thu, hoa hồng, KPI. Doanh thu ghi theo **ngày làm dịch vụ**, không theo ngày xác nhận | Q01, Q02 |
| 4, 6.1 | Ngày Nhung nghỉ, Linh xác nhận bill và chốt sổ. Không có thu ngân riêng | Q03, Q05 |
| 6.1, 11 | Đơn có phần doanh thu của Nhung do Nhung tự xác nhận được gom vào danh sách **Cần xem lại** cho Linh | Q04 |
| 6.5 (mới) | Quy tắc giá: bảng giá + phần vẽ/đính đá **giá theo mẫu**; hạn mức giảm giá theo vai trò; phụ thu; ưu đãi bù khiếu nại do quán chịu | Q07–Q12 |
| 6.6 (mới) | Tip và tiền cọc lịch hẹn | Q14–Q16 |
| 7 | Hai tài khoản tiền: **Tiền mặt cs HTK** và **Tài khoản cs HTK**. Không dùng tài khoản cá nhân. Nhung xem được số dư cả hai | Q17, Q18 |
| 7.3 | Hạn mức Nhung duyệt chi **1.000.000đ/phiếu**; 4 nhóm chi luôn cần Linh. **Không làm sổ nợ nhà cung cấp ở V1** | Q19–Q22 |
| 8 | Mở cửa 9:00–21:00 mọi ngày; hai ca sáng/chiều; nghỉ không phép trừ như nghỉ thường; ngày quán đóng cửa vẫn trả lương; Nhung tự duyệt công của mình | Q25–Q30 |
| 9 | Quy tắc giữa tháng, đổi chính sách, KPI, hoàn tiền sau khóa, tạm ứng; **trả lương ngày 10** | Q31–Q41 |
| 14 | Sửa cột vai trò cho khớp D01 (thợ tạo đơn; Nhung xử lý thu chi) | Rà soát v1.0 |
| 5, 15 | Định hướng giao diện **Ngà & mực**, tự đổi sáng/tối theo điện thoại, ưu tiên iPhone | G01–G26 |
| 16, 17 | Nhập dữ liệu cũ **sau khi app chạy ổn**; P1 chia thành 4 nhịp phát hành | Q42 |
| 12, 18 | Bổ sung bảng dữ liệu, invariant và test nghiệm thu 30–45 cho các quy tắc mới | Tổng hợp |

**Nguyên tắc đọc tài liệu:** khi v1.0 và v1.1 khác nhau, v1.1 có hiệu lực. Quyết định Q/G không làm thay đổi D01–D16; chúng làm rõ cách áp dụng.

# 1. BỐI CẢNH VÀ VẤN ĐỀ CẦN GIẢI QUYẾT

LINDY đang theo dõi doanh thu bằng các tab theo tháng trong Google Sheets; mỗi khách ghi một dòng và số tiền phân về từng thợ. Bảng lương riêng lấy doanh thu từng người, cộng hoa hồng, tính ngày nghỉ, thưởng, tạm ứng và KPI quản lý. Phần thu chi có dữ liệu cũ nhưng chưa tạo được bức tranh liên tục từ đơn hàng đến tiền thực còn trong quỹ.

Các hạn chế cần giải quyết: (1) thông tin phân tán; (2) khó xác định doanh thu đã thu đủ tiền chưa; (3) không thấy số dư quỹ tiền mặt/tài khoản theo thời gian; (4) lương cuối tháng phụ thuộc thao tác tay; (5) thiếu lịch sử đơn của từng khách; (6) khó chuẩn hoá khi mở cơ sở thứ hai.

**Điểm đích:** Chủ nhìn trong 30 giây: hôm nay có bao nhiêu lượt khách; doanh thu thuần bao nhiêu; tiền đã thực thu bao nhiêu; đã chi bao nhiêu; còn bao nhiêu tiền trong từng tài khoản; công nợ khách chưa thu; tổng lương tạm tính; tháng này lãi/lỗ vận hành ước tính ra sao.

# 2. THÔNG TIN ĐÃ BIẾT VÀ QUYẾT ĐỊNH ĐÃ CHỐT

## 2.1. Thông tin thực tế của quán

- Nhân sự tại bảng tháng 10/2026: **Linh, Nhung, Chin, Trang**. Danh sách phải chỉnh được, không viết cố định tên vào code.
- Lương cứng và chính sách khi go-live **giữ nguyên bảng tháng 10/2026** (Q31): Linh 3.500.000đ; Nhung 7.000.000đ; Chin 4.000.000đ; Trang 3.500.000đ; hoa hồng 25% cho cả bốn người; ngày nghỉ được hưởng 3 ngày/tháng, Nhung 4 ngày/tháng. **Linh có dòng lương** như bảng tính (Q32).
- Thưởng KPI quản lý của Nhung: doanh thu quán dưới 85.000.000đ: 0%; từ 85.000.000đ đến dưới 102.000.000đ: 1%; từ 102.000.000đ: 1,5%. Nhảy bậc trên **toàn doanh thu quán**, không cộng dồn.
- Một khách có thể được nhiều thợ làm; doanh thu đơn chia về các thợ tương ứng.
- Quán mở cửa **9:00–21:00 tất cả các ngày** (Q25); nhân viên làm theo **hai ca sáng/chiều** (Q26, giờ ca còn chờ, mục 19.4).
- Quán nhận tiền bằng **tiền mặt** và **chuyển khoản/QR** (Q13). Không quẹt thẻ, không ví điện tử.
- Hai tài khoản tiền (Q17): **Tiền mặt cs HTK** và **Tài khoản cs HTK** (ngân hàng của quán). **Không dùng tài khoản cá nhân** cho tiền quán (Q18).
- Không có lễ tân/thu ngân riêng; Nhung kiêm (Q05).
- Quán là **hộ kinh doanh**, **chưa dùng hóa đơn điện tử** hay máy tính tiền kết nối cơ quan thuế (Q43, Q44).
- Thương hiệu: logo hiện có nhưng **muốn làm mới** (G01); màu chủ đạo **be, nâu, trắng** (G02); Instagram **@lindy.nailashstudio** (G03).
- Toàn bộ nhân sự dùng **iPhone** (G23).
- Không dùng KPI doanh thu cá nhân trên màn hình hoạt động; mục tiêu cá nhân cũ chỉ là dữ liệu giải thích.

## 2.2. Quyết định discovery D01–D16 (10/10/2026, giữ nguyên)

D01–D09, D11–D12, D14–D16 chọn A; **D10 chọn B**; **D13 chọn A, kèm ngoại lệ Nhung được xem lương toàn bộ nhân viên**. Ma trận đầy đủ ở mục 19.1. Tóm tắt:

- **Đơn hàng:** thợ tạo đơn nháp; Nhung xác nhận bill/thanh toán; Linh duyệt điều chỉnh đặc biệt. Ghi dịch vụ và doanh thu thợ theo từng dịch vụ; có chế độ nhập nhanh tổng bill rồi chia tay.
- **Ghi nhận doanh thu:** doanh thu dịch vụ hoàn thành sau giảm giá là cơ sở tính 25% hoa hồng; không gồm tip; chưa thu đủ tiền vẫn ghi doanh thu. Hoàn tiền/điều chỉnh theo quy tắc đóng kỳ.
- **Tiền:** theo dõi từng quỹ/tài khoản; chuyển tiền giữa quỹ, thu nợ, số dư đầu kỳ. Nhân viên đề nghị chi, Nhung duyệt trong hạn mức Linh đặt; trên hạn mức Linh duyệt.
- **Nhân sự:** lịch ca, check-in/check-out trên điện thoại, Nhung xác nhận bảng công; không tự động phạt đi muộn/về sớm. Giữ chính sách lương bảng 10/2026, sửa có ngày hiệu lực.
- **CRM (D10-B):** chỉ tên khách, số điện thoại (không bắt buộc) và lịch sử đơn.
- **Lịch hẹn:** lịch đặt cơ bản ngay bản đầu; nhắc tự động để sau.
- **Khuyến mãi:** bản đầu nhập giảm giá có lý do, duyệt theo quyền; Happy Hours/VIP/voucher để sau.
- **Phân quyền D13:** Nhung xem bảng lương đầy đủ của toàn bộ nhân viên cơ sở (kể cả Linh), chỉ xem; không sửa, khóa, chi, xuất; không xem lợi nhuận.
- **Khởi chạy:** dữ liệu 2025–2026 nhập để tra cứu/đối chiếu; chạy thử với Linh và Nhung trước; PWA cần internet. CRM dùng chung các cơ sở; tiền, giá, lương phân theo cơ sở.

## 2.3. Quyết định bổ sung Q01–Q44 và G01–G26 (12/10/2026)

Bảng đầy đủ ở mục 19.2 và 19.3. Các quy tắc được áp vào từng phân hệ bên dưới, đánh dấu mã câu trong ngoặc.

**Nguyên tắc:** mọi chính sách có ngày hiệu lực; thay đổi không tính lại âm thầm dữ liệu đã chốt. Không tự suy đoán giá trị tiền, hạn mức, giờ ca khi chưa được cung cấp.

# 3. TẦM NHÌN SẢN PHẨM VÀ CHỈ SỐ THÀNH CÔNG

Ứng dụng web nội bộ, đơn giản như app bán hàng nhưng có báo cáo quản trị sâu. Dùng trên iPhone là chính. Mục tiêu: **nhập đơn nháp 20–40 giây với giao dịch thông thường; ít bước bấm nhất có thể (G24: điều khó chịu nhất là phải bấm nhiều bước); chốt ngày trong vài phút; lương tạm tính tự cập nhật; mọi báo cáo dùng cùng một nguồn dữ liệu**.

Chỉ số đo sau khi chạy: tỷ lệ đơn có phân bổ thợ đúng 100%; số đơn chờ xác nhận cuối ngày; số đơn chưa thu đủ; độ lệch quỹ tiền mặt khi chốt ngày; thời gian chốt lương; tỷ lệ khách quay lại; số lần phải sửa giao dịch đã đóng; số bước bấm để tạo một đơn thông thường.

# 4. VAI TRÒ VÀ PHÂN QUYỀN

| Vai trò | Được làm | Không được làm |
|---|---|---|
| **Chủ hệ thống – Linh** | Xem toàn hệ thống; xác nhận bill và chốt sổ (thay Nhung ngày Nhung nghỉ, Q03); duyệt giảm giá trên 20%; duyệt chi trên 1.000.000đ và 4 nhóm chi riêng; duyệt tạm ứng (chỉ Linh, Q37); thiết lập chính sách; khóa/mở kỳ; xem danh sách **Cần xem lại** (Q04) | Không giới hạn theo cơ sở |
| **Quản lý cửa hàng – Nhung** | Xác nhận bill và thanh toán (kể cả đơn có phần của mình, Q04); duyệt giảm giá đến 20% (Q10); phân ca, duyệt công và ngày nghỉ của mọi người **kể cả của chính mình** (Q27); chốt quỹ cuối ngày; duyệt chi đến 1.000.000đ/phiếu trừ 4 nhóm riêng (Q19, Q20); xem số dư **cả hai tài khoản quán** (Q17); xem bảng lương toàn quán trên app, mọi lúc (Q40) | Không xem lợi nhuận; không sửa, khóa, chi hoặc tải bảng lương; không duyệt tạm ứng; không đổi chính sách |
| **Nhân viên / thợ** | Tạo đơn nháp, bấm **Làm xong** để chuyển đơn sang chờ xác nhận; áp giảm giá **5% hoặc 10%** kèm lý do (Q09); đề nghị chi, đề nghị tạm ứng; xem lịch làm, check-in/out; xem **doanh thu, lương tạm tính và phiếu lương đã chốt của chính mình** (Q39) | Không xác nhận bill hay thanh toán; không xem doanh thu/lương người khác; không xem dòng tiền cửa hàng |
| **Thu ngân / Kế toán** | Giữ vai trò trong mô hình quyền cho tương lai | **Không cấu hình ở V1** (Q05) |

Phân quyền theo **hành động** (xem/tạo/sửa/duyệt/xuất) và **phạm vi** (của tôi/cơ sở/toàn hệ thống). Quyền gán cho tài khoản qua vai trò, không viết theo tên người trong code. Các quyền bắt buộc tách riêng:

| Quyền | Linh | Nhung | Thợ |
|---|---|---|---|
| `order.create_draft` | Có | Có | Có |
| `order.confirm` (xác nhận bill, ghi thanh toán) | Có | Có | Không |
| `discount.apply_preset` (5% / 10%) | Có | Có | Có |
| `discount.approve_up_to_20pct` | Có | Có | Không |
| `discount.approve_any` | Có | Không | Không |
| `payroll.read_all_branch` | Có | Có (chỉ xem) | Không |
| `payroll.read_own` | Có | Có | Có |
| `payroll.edit` / `payroll.approve_lock` / `payroll.pay` / `payroll.export_all_branch` | Có | Không | Không |
| `money_accounts.read_balance` | Có | Có (2 tài khoản quán) | Không |
| `profit.read` | Có | Không | Không |
| `expense.request` | Có | Có | Có |
| `expense.approve_within_limit` (≤ 1.000.000đ, ngoài 4 nhóm riêng) | Có | Có | Không |
| `expense.approve_above_limit` | Có | Không | Không |
| `advance.approve` | Có | Không | Không |
| `attendance.approve` | Có | Có (mọi người, kể cả mình) | Không |
| `review_queue.read` (danh sách Cần xem lại) | Có | Không | Không |

Mọi lần xem bảng lương toàn quán và mọi lần tự duyệt (đơn có phần của mình, công của mình) phải ghi audit log. Quyền phải được kiểm tra ở API và cơ sở dữ liệu, không chỉ ẩn nút.

# 5. KIẾN TRÚC TRẢI NGHIỆM MOBILE

## 5.1. Thanh điều hướng

Thanh điều hướng dưới cùng, **biểu tượng nét mảnh kèm chữ** (G16, G17), 5 mục:

1. **Tổng quan** — số hôm nay/tháng, cảnh báo, danh sách cần xử lý.
2. **Đơn hàng** — tạo đơn, đơn trong ngày, chờ xác nhận, thu tiền.
3. **Lịch & Nhân sự** — lịch hẹn, ca làm, điểm danh, bảng công.
4. **Khách** — tên, SĐT, lịch sử đơn.
5. **Thêm** — thu chi, báo cáo, lương, cài đặt, xuất dữ liệu.

Nút **“+ Tạo đơn”**: nút tròn nổi ở **góc phải dưới**, phía trên thanh điều hướng, hiện ở mọi màn hình (G18).

## 5.2. Ví dụ màn hình Tổng quan (Linh và Nhung)

```text
LINDY OS                         [CS 31/49 HTK]
Hôm nay, 10/10/2026          [Hôm nay | Tháng]

DOANH THU THUẦN              8.450.000đ
Tiền đã thu                  7.900.000đ
Còn khách nợ                   550.000đ

12 đơn | 15 lượt dịch vụ | 2 chưa thu đủ | 1 chờ xác nhận

TIỀN TRONG QUỸ
Tiền mặt cs HTK              3.500.000đ
Tài khoản cs HTK            28.300.000đ
Tổng                        31.800.000đ

DOANH THU THỢ HÔM NAY   (chỉ Linh và Nhung thấy)
Nhung   3.100.000đ | Chin   2.450.000đ
Linh    1.800.000đ | Trang  1.100.000đ

CẦN XỬ LÝ
1 đơn chờ xác nhận · 2 đơn thiếu tiền · 1 đề xuất nghỉ
[Linh] 3 đơn Nhung tự xác nhận cần xem lại

[Tổng quan] [Đơn hàng] [Lịch & NS] [Khách] [Thêm]   (+)
```

Số liệu trên chỉ là ví dụ giao diện. Thợ mở Tổng quan chỉ thấy số của chính mình (doanh thu, lương tạm tính, lịch làm hôm nay).

## 5.3. Định hướng giao diện (G01–G26)

Phong cách **Ngà & mực**: nền ngà, chữ mực ấm, tiêu đề và số tiền lớn dùng chữ có chân thanh lịch, nội dung dùng chữ không chân dễ đọc, **một màu nhấn mận** cho hành động chính. Màu trung tính ngả be–nâu để gần màu thương hiệu (be, nâu, trắng). Chi tiết token và thành phần nằm trong tài liệu **Hệ thống giao diện LINDY OS** (https://claude.ai/artifact/AVWhQDVKgZyiq6ig5VgpP3): 16 màu cho hai giao diện sáng/tối, 12 kiểu chữ, khoảng cách, bo góc, kích thước vùng chạm, và 12 thành phần React (`window.LindyOS`): AppBar, BottomNav, Fab, Button, SegmentedControl, Money, SummaryCard, OrderRow, StatusChip, Toast, TextField, Icon.

| Chủ đề | Đã chọn |
|---|---|
| Cảm giác | Tối giản, hiện đại, dịu nhẹ (G05) |
| Màu nhấn / nền / chữ tiêu đề / góc bo | Giữ theo phong cách Ngà & mực (G07, G08, G11, G14) |
| Giao diện tối | **Tự đổi theo cài đặt sáng/tối của điện thoại** (G09), nên phải thiết kế đủ cả hai bộ màu |
| Màu trạng thái tiền | Rõ ràng: xanh (đã thu đủ), cam (thu một phần), đỏ (chưa thu) (G10) |
| Cỡ chữ | Vừa (G12); ô nhập tối thiểu 16px để Safari iOS không tự phóng to |
| Số tiền | Luôn đầy đủ dạng `8.450.000đ` (G13) |
| Mật độ | **Dày**: nhiều số liệu trên một màn hình, dòng sát nhau hơn (G15); vẫn giữ vùng chạm tối thiểu 44×44px |
| Biểu tượng app | Chữ **L** trên nền màu nhấn (G19); tên dưới biểu tượng: **LINDY OS** (G04) |
| Ảnh | Gần như không dùng ảnh, tập trung số liệu (G20) |
| Chuyển động | Tối thiểu (G21) |
| Giọng văn | Ngắn gọn: “Đã lưu đơn #0142.” (G22) |
| Tham khảo | Instagram (G25): thao tác nhanh, ít bước, thanh dưới quen tay |

Trên mobile ưu tiên **thẻ tóm tắt**; bảng dài có trang riêng và lọc; ô nhập tiền mở bàn phím số. Nút nguy hiểm (“Huỷ đơn”, “Hoàn tiền”, “Khoá lương”) cần xác nhận rõ.

# 6. PHÂN HỆ ĐƠN HÀNG (TRÁI TIM DỮ LIỆU)

## 6.1. Tạo và xác nhận đơn

Luồng đã chốt: **Thợ tạo đơn nháp → chọn khách (hoặc khách lẻ) → chọn dịch vụ hoặc nhập nhanh → phân bổ doanh thu từng thợ → giảm giá (nếu có, kèm lý do) → bấm Làm xong → đơn ở trạng thái Chờ xác nhận → Nhung xác nhận bill và ghi thanh toán → Đã xác nhận**. Ngày Nhung nghỉ, **Linh xác nhận** (Q03).

- **Chỉ đơn Đã xác nhận** mới được tính vào doanh thu, hoa hồng, KPI và báo cáo (Q01).
- Doanh thu ghi vào **ngày làm dịch vụ** (`service_date`), không phải ngày xác nhận (Q02). Ví dụ: đơn làm tối 31/10, sáng 01/11 mới xác nhận → doanh thu tháng 10.
- Nếu đơn được xác nhận sau khi kỳ lương của tháng làm dịch vụ đã khóa, phần hoa hồng/KPI phát sinh ghi bằng phiếu điều chỉnh vào kỳ lương đang mở kế tiếp (theo D04).
- **Đơn Nhung tự xác nhận** mà có phần doanh thu của Nhung: vẫn xác nhận được, đồng thời tự vào danh sách **Cần xem lại** để Linh xem khi rảnh; Linh đánh dấu đã xem (Q04). Danh sách này không chặn luồng vận hành.

Thông tin cần lưu:
- Mã đơn tự sinh, ngày giờ, ngày làm dịch vụ, cơ sở, người tạo, người xác nhận và thời điểm, trạng thái thực hiện, trạng thái thanh toán.
- Khách: liên kết hồ sơ tên/SĐT/lịch sử đơn; cho phép khách lẻ không SĐT.
- Dòng đơn: loại dòng (dịch vụ theo bảng giá / phần giá theo mẫu / phụ thu), mã dịch vụ, tên tại thời điểm bán, giá niêm yết, giá áp dụng, số lượng, giảm giá, thành tiền thuần.
- Phân bổ thợ **theo từng dòng** với số tiền ghi nhận cho mỗi người.
- Giảm giá theo dòng hoặc cả đơn: loại, tỷ lệ/số tiền, lý do, người áp, người duyệt.
- Các lần thanh toán: số tiền, thời điểm, phương thức (tiền mặt / chuyển khoản), tài khoản nhận, trạng thái đối soát; khoản cọc đã trừ (nếu có).

## 6.2. Quy tắc phân bổ doanh thu

Không chia doanh thu bằng cách nhân đôi hoá đơn. **Tổng phần doanh thu phân cho thợ = doanh thu thuần của đơn** (nếu cho phép phần “không phân bổ” thì hiển thị riêng và có lý do).

Ví dụ: khách làm tổng **348.000đ**, Nhung làm phần **239.000đ**, Chin làm **109.000đ**. Doanh thu quán 348.000đ; hoa hồng tạm tính Nhung **59.750đ**, Chin **27.250đ**. Đơn này không tạo doanh thu 696.000đ.

Giảm giá cả đơn mặc định **phân bổ theo tỷ lệ thành tiền trước giảm**; chênh lệch làm tròn đưa vào dòng cuối theo quy tắc cố định. Mọi sửa chia tiền sau khi xác nhận phải ghi ai sửa, lúc nào, lý do.

**Cơ sở tính hoa hồng** của mỗi thợ = phần doanh thu thuần được phân bổ, **cộng lại phần giảm giá do quán chịu** (ưu đãi bù khiếu nại, mục 6.5). Vì vậy mỗi dòng phân bổ lưu hai số: `allocated_net_amount` (vào doanh thu quán) và `commission_base_amount` (tính hoa hồng).

## 6.3. Trạng thái và sửa đơn

- Trạng thái thực hiện: **Nháp / Đang làm / Chờ xác nhận / Đã xác nhận / Huỷ**.
- Trạng thái thanh toán **tự tính** từ các khoản thu và hoàn, không chọn tay: **Chưa thu / Thu một phần / Đã thu đủ / Hoàn một phần / Hoàn toàn bộ**.
- Đơn đã xác nhận vẫn có thể chưa thu đủ tiền; hai trạng thái độc lập.
- Đơn đã xác nhận hoặc đã chốt ngày không được xoá vĩnh viễn. Điều chỉnh bằng phiếu hoàn tiền, điều chỉnh hoặc huỷ có lý do, theo quyền duyệt.
- **Hoàn tiền sau khi kỳ lương đã khóa** (Q34): khoản hoàn tính vào **tháng phát sinh hoàn**. Tháng cũ giữ nguyên doanh thu, KPI và hoa hồng; tháng phát sinh hoàn giảm doanh thu, KPI và hoa hồng của thợ tương ứng.
- Sửa móng do lỗi nhân viên: **phiếu xử lý dịch vụ** gắn đơn gốc, miễn phí, không tăng doanh thu. Nếu bán thêm thì lập phần thu bổ sung.

## 6.4. Đơn hàng mỗi ngày

Danh sách có lọc: hôm nay, hôm qua, ngày tùy chọn; trạng thái (đặc biệt **Chờ xác nhận**); nhân viên; SĐT/tên khách; phương thức trả tiền. Hiển thị tổng đơn, doanh thu theo thợ (Linh và Nhung), số đơn hoàn tiền, công nợ chưa thu, giảm giá và so sánh hôm qua.

## 6.5. Giá, giảm giá, phụ thu và khiếu nại (mới)

**Giá (Q07, Q08):**
- Dịch vụ có **bảng giá cố định**, cộng thêm phần **vẽ, đính đá tính theo mẫu**. Danh mục dịch vụ có cờ `price_mode`: `list` (theo bảng giá) hoặc `custom` (giá theo mẫu: thợ nhập giá, Nhung kiểm khi xác nhận).
- Với dịch vụ giá cố định, thợ nhập giá thấp hơn bảng giá thì **tính là giảm giá**: bắt buộc lý do, Nhung duyệt khi xác nhận bill.

**Hạn mức giảm giá theo vai trò (Q09, Q10):**

| Người áp | Được áp | Cần duyệt |
|---|---|---|
| Thợ | Chọn **5% hoặc 10%**, kèm lý do | Không cần duyệt thêm; Nhung vẫn thấy khi xác nhận bill |
| Nhung | Đến **20%** một bill | Không |
| Trên 20% | | **Linh** duyệt |

Cách hiểu “5% và 10%” ở trên cần chủ xác nhận lại (mục 19.4).

**Phụ thu (Q11):** tính như doanh thu dịch vụ: là một dòng đơn, phân bổ cho thợ, **có hoa hồng** và **tính vào doanh thu KPI**.

**Ưu đãi bù khiếu nại (Q12):** khi khách khiếu nại, Nhung có thể đề xuất ưu đãi 10–20% cho bill sau. Khoản giảm này có loại `complaint_compensation`, **do quán chịu**: doanh thu quán giảm, nhưng **hoa hồng của thợ làm bill sau không giảm** (tính trên số trước ưu đãi). Ví dụ: bill sau 500.000đ do Chin làm, ưu đãi 20% → doanh thu quán 400.000đ; hoa hồng Chin 25% × 500.000đ = 125.000đ.

## 6.6. Tip và tiền cọc (mới)

**Tip (Q14, Q15):**
- Khách thường **đưa tiền mặt trực tiếp cho thợ**. Khoản này không vào quỹ quán, app **không ghi**.
- Trường hợp khách chuyển tip vào tài khoản quán: ghi **tip giữ hộ** (khoản quán phải trả thợ), không tính doanh thu, không hoa hồng. **Cuối ngày Nhung trả tiền mặt cho thợ** và ghi phiếu chi tip từ Tiền mặt cs HTK. Bill nhiều thợ chia tip theo phần tiền mỗi người làm, trừ khi khách chỉ định.

**Tiền cọc lịch hẹn (Q16):**
- Quán **nhận cọc** khi khách đặt lịch. Cọc làm tăng quỹ nhận tiền ngay, nhưng **chưa phải doanh thu**; ghi là khoản cọc đang giữ của khách.
- Khách đến làm: cọc được **trừ vào bill** như một khoản thanh toán của đơn; doanh thu vẫn ghi đủ giá trị đơn vào ngày làm dịch vụ.
- **Khách bỏ hẹn: quán giữ tiền cọc.** Phân loại khoản này còn chờ chốt (mục 19.4). Đề xuất mặc định: **thu khác**, không hoa hồng, không tính KPI.
- Quán chủ động huỷ hẹn: hoàn cọc bằng phiếu hoàn có lý do.
- Mức cọc và thời hạn khách báo huỷ được hoàn cọc còn chờ chốt (mục 19.4).

# 7. TIỀN THU, TIỀN CHI, SỔ QUỸ VÀ DÒNG TIỀN

## 7.1. Các khái niệm không được đánh đồng

| Chỉ số | Ý nghĩa | Ví dụ |
|---|---|---|
| **Doanh thu gộp** | Giá dịch vụ trước giảm/hoàn | Dịch vụ 500.000đ |
| **Doanh thu thuần** | Doanh thu ghi nhận sau giảm/hoàn | Giảm 50.000đ → 450.000đ |
| **Tiền thực thu** | Tiền đã thực sự nhận trong kỳ | Khách mới trả 300.000đ |
| **Phải thu khách** | Phần khách chưa thanh toán | 150.000đ |
| **Cọc đang giữ** | Tiền khách đặt trước, chưa thành doanh thu | Cọc 100.000đ cho lịch hẹn ngày mai |
| **Chi tiền** | Tiền thật đã rời quỹ | Trả vật tư 100.000đ |
| **Số dư quỹ** | Số dư mở sổ + tiền vào − tiền ra | Không tính bằng “doanh thu − chi phí” |
| **Lợi nhuận tạm tính** | Doanh thu thuần − chi phí của kỳ (gồm lương phát sinh) | Không đồng nhất với số dư tiền |

## 7.2. Tài khoản tiền

Cấu hình ban đầu của CS HTK (Q17, Q18):

| Tài khoản | Loại | Nhận tiền khách | Nhung xem số dư |
|---|---|---|---|
| **Tiền mặt cs HTK** | Tiền mặt tại quán | Tiền mặt | Có |
| **Tài khoản cs HTK** | Ngân hàng của quán | Chuyển khoản / QR | Có |

Tên tài khoản là cấu hình, không cố định trong code. Mô hình dữ liệu vẫn hỗ trợ loại “tài khoản cá nhân dùng cho quán” (D05) nhưng **không dùng ở V1**. Số dư mở sổ nhập bằng **bút toán mở sổ** vào đúng ngày mở sổ, không lưu thành con số sửa tay trên tài khoản.

Một đơn có thể trả **200.000đ chuyển khoản + 148.000đ tiền mặt**: hai khoản thu, tổng đơn vẫn 348.000đ. **Chuyển tiền nội bộ** từ tiền mặt sang ngân hàng tạo cặp bút toán −X/+X, không phải thu nhập hay chi phí.

## 7.3. Danh mục thu chi và duyệt chi

- **Thu từ đơn hàng:** gắn mã đơn, tự cập nhật công nợ.
- **Thu cọc lịch hẹn:** gắn lịch hẹn; trừ vào bill khi khách đến.
- **Thu ngoài đơn:** vốn góp chủ, vay, hoàn tiền nhà cung cấp, cọc bỏ hẹn (theo phân loại chốt), thu khác.
- **Chi vận hành:** thuê nhà, điện nước, internet, vật tư nail, công cụ, sửa chữa, marketing, vệ sinh, đào tạo, phí chuyển khoản, chi khác.
- **Chi nhân sự:** thanh toán lương, thưởng, tip trả thợ (khi tip vào tài khoản quán).
- **Tạm ứng nhân viên:** là **khoản nhân viên nợ quán**, không phải chi phí; trừ vào lương kỳ. Không được tính vào chi phí lương lần nữa.
- **Chuyển tiền nội bộ; rút tiền chủ / góp vốn chủ:** theo dõi riêng, không phải chi phí kinh doanh.

**Duyệt chi (Q19, Q20):**
- Nhân viên chỉ tạo **đề nghị chi**; chưa duyệt và chưa chi thì số dư không đổi.
- Nhung tự duyệt phiếu chi **đến 1.000.000đ/phiếu**.
- Trên 1.000.000đ, hoặc thuộc một trong 4 nhóm sau, **luôn cần Linh duyệt dù số tiền nhỏ**: **tiền nhà; lương, thưởng, tạm ứng; mua máy móc, thiết bị; sửa chữa**.
- Chỉ khi xác nhận đã chi mới ghi tiền ra (không ghi trùng lúc duyệt và lúc chi).

**Công nợ nhà cung cấp (Q21, Q22):** quán hầu như trả tiền ngay, nên **V1 không làm sổ nợ nhà cung cấp**; chi phí ghi khi trả tiền. Ngày mở sổ không có công nợ khách hay nhà cung cấp. Sổ nợ nhà cung cấp chuyển sang P2 nếu sau này cần.

Mỗi phiếu thu chi lưu: ngày giao dịch, ngày hạch toán (nếu khác), số tiền, tài khoản, danh mục, người lập, người duyệt, chứng từ ảnh/tệp, ghi chú, cơ sở, trạng thái, lịch sử sửa.

## 7.4. Chốt quỹ cuối ngày

**Một quỹ tiền mặt, chốt một lần cuối ngày** sau 21:00 (Q23). Người chốt: Nhung; ngày Nhung nghỉ: Linh. App tính **tiền mặt lý thuyết = đầu ngày + thu tiền mặt − chi tiền mặt − chuyển ra + chuyển vào**; người chốt nhập số đếm được; app ghi chênh lệch, lý do và người duyệt. Khoản chuyển khoản/QR có cờ **đã đối soát với sao kê**. Cảnh báo: đơn chờ xác nhận, đơn thu thiếu, tip giữ hộ chưa trả, giao dịch chưa đối soát.

## 7.5. Báo cáo dòng tiền tháng

- Số dư đầu tháng từng tài khoản.
- Thu tiền khách; thu cọc; thu khác.
- Chi vận hành; chi nhân sự; tạm ứng (tách riêng, không phải chi phí); rút vốn.
- Chuyển nội bộ (hiển thị, loại khỏi tổng thu chi).
- Số dư cuối tháng từng tài khoản và toàn quán.
- Dòng tiền vào/ra theo ngày.
- **Cảnh báo:** doanh thu lớn nhưng tiền thu nhỏ, hoặc quỹ thực tế không khớp.

# 8. NHÂN SỰ, CA LÀM VÀ CHẤM CÔNG

## 8.1. Hồ sơ nhân viên

Mã nhân viên, họ tên, số liên hệ, ngày bắt đầu/kết thúc, cơ sở, vai trò, trạng thái, lương cứng theo giai đoạn, % hoa hồng theo giai đoạn, số ngày nghỉ được hưởng/tháng, cách nhận lương (chuyển khoản hoặc tiền mặt, Q41), quyền dùng app.

## 8.2. Giờ mở cửa và ca làm

- Quán mở **9:00–21:00 mọi ngày trong tuần** (Q25).
- **Hai ca: sáng và chiều** (Q26). Giờ từng ca, số ca mỗi người làm/ngày và cách quy đổi ca thành ngày công **còn chờ chốt** (mục 19.4). Không tự giả định giờ ca hay công.
- Lịch tuần/tháng xem tốt trên điện thoại; nghỉ phải đăng ký trước và được duyệt; đổi ca có lịch sử.
- **Lịch quán đóng cửa** (Tết, sửa chữa…) do Linh khai báo theo ngày.

## 8.3. Chấm công

Ba lớp dữ liệu tách biệt: **ca dự kiến / giờ chấm thực tế / công được duyệt để tính lương**. Quên check-in không tự động bị trừ lương.

- Nút **Vào ca / Ra ca** trên điện thoại. Nhung xem danh sách thiếu chấm công và duyệt công cuối ngày hoặc cuối kỳ; bổ sung công phải có lý do và audit log.
- **Nhung tự duyệt công và ngày nghỉ của chính mình** (Q27). Mỗi lần tự duyệt ghi audit log.
- **Nghỉ không phép** (Q28): tính là ngày vắng như nghỉ thường; vượt số ngày được hưởng thì trừ 1 ngày lương mỗi ngày, **không phạt thêm**.
- **Ngày quán đóng cửa** (Q29): **không tính là ngày nghỉ** của nhân viên, trả lương như ngày đi làm.
- **Làm ngày lễ** (Q30): **như ngày thường**, không trả thêm. App lưu hệ số ngày lễ là tham số cấu hình (mặc định 1,0) để đổi sau mà không sửa code.
- Không tự trừ đi muộn/về sớm, không tự tính tăng ca.

# 9. TÍNH LƯƠNG VÀ THƯỞNG LINDY

## 9.1. Công thức

Với tháng M, nhân viên E:

- `ngay_thang` = số ngày lịch của tháng M.
- `nghi_huong` = 3 (Nhung = 4), theo chính sách có hiệu lực của kỳ.
- `cong_chuan = ngay_thang − nghi_huong`
- `luong_ngay = luong_cung / cong_chuan`
- `nghi_thuc_te` = **mọi ngày vắng** trên bảng công đã duyệt, **gồm cả có phép và không phép** (Q28), **không tính ngày quán đóng cửa** (Q29). Ngày trước ngày vào làm và sau ngày nghỉ việc tính là ngày vắng (Q35).
- `dieu_chinh_cong = (nghi_huong − nghi_thuc_te) × luong_ngay`
- `hoa_hong = Σ commission_base_amount của các đơn Đã xác nhận trong tháng × 25%`
- `thuong_KPI_Nhung`: 0 nếu doanh thu quán < 85.000.000đ; 1% × doanh thu quán nếu từ 85.000.000đ đến dưới 102.000.000đ; 1,5% × doanh thu quán nếu từ 102.000.000đ. **Doanh thu quán** = doanh thu thuần sau giảm giá và hoàn tiền, **gồm phụ thu, không gồm tip** (Q11, Q33), chỉ tính đơn Đã xác nhận.
- `luong_phai_tra = luong_cung + dieu_chinh_cong + hoa_hong + thuong_KPI + thuong_them − khau_tru_hop_le`
- `con_lai_chi_tra = luong_phai_tra − tam_ung_da_chi − luong_da_chi_truoc`

Khấu trừ khác (bảo hiểm, thuế TNCN, phạt) chỉ áp dụng khi chủ xác nhận; nếu không thì bằng 0.

**Ví dụ:**
- Tháng 31 ngày: nhân viên thường chia 28, Nhung chia 27. Tháng 30 ngày: 27 và 26.
- Nhân viên thường nghỉ 2 ngày trong tháng 31 ngày → +1 ngày lương (chia 28).
- **Vào làm giữa tháng** (Q35): Chin lương 4.000.000đ, vào làm 16/10, đi đủ 16 ngày → 4.000.000 ÷ 28 × 16 ≈ 2.285.714đ. Công thức trên cho đúng kết quả này, không cần quy tắc riêng.
- **Tết** (Q29): quán đóng 5 ngày, nhân viên không nghỉ thêm → `nghi_thuc_te = 0` → +3 ngày lương (nhân viên thường).
- **Nghỉ không phép** (Q28): đã dùng hết 3 ngày, nghỉ không phép thêm 1 ngày → −1 ngày lương, không phạt thêm.
- KPI Nhung: doanh thu quán 85.000.000đ → 850.000đ; 102.000.000đ → 1.530.000đ; 84.999.999đ → 0đ.

**Chưa chốt:** cách tính công khi nhân viên chỉ làm một trong hai ca (mục 19.4).

## 9.2. Đổi chính sách

- Đổi lương cứng hoặc % hoa hồng **chỉ có hiệu lực từ ngày 1 của tháng** (Q36). App không cho lưu ngày hiệu lực giữa tháng.
- Thay đổi không tính lại kỳ đã khóa.

## 9.3. Tạm ứng (Q37, Q38)

- **Chỉ Linh duyệt** tạm ứng.
- Theo ghi chú của chủ: **chỉ cho ứng trên phần lương cứng, từ ngày 1 hằng tháng**. Cách hiểu đang áp dụng: số tiền ứng tối đa tính trên lương cứng, không ứng trên hoa hồng; đề nghị ứng mở từ ngày 1 của tháng. Cách hiểu này cần chủ xác nhận (mục 19.4).
- Trường hợp xin ứng vượt số đã làm được: **Linh quyết từng trường hợp**; app hiện số lương tạm tính đến hiện tại để Linh tham khảo.
- Tạm ứng không phải chi phí; tự trừ vào `con_lai_chi_tra` của kỳ lương.

## 9.4. Quy trình bảng lương

1. Trong tháng: **lương tạm tính** tự cập nhật theo đơn Đã xác nhận và công đã duyệt.
2. **Ngày 05 tháng sau:** app tạo bản nháp lương tháng trước. Không tự thanh toán.
3. Linh kiểm tra công, doanh thu, thưởng, tạm ứng; Nhung xem toàn bộ để đối chiếu nhưng không sửa, không chốt.
4. Linh bấm **Khoá bảng lương** → sinh bản chốt kèm toàn bộ tham số, số liệu và thời điểm duyệt.
5. **Ngày 10: trả lương** (Q41) bằng chuyển khoản hoặc tiền mặt theo từng nhân viên. Khi chi, sinh giao dịch tiền ra và cập nhật còn nợ lương. Không tính chi phí lương hai lần.
6. Sai lệch phát hiện sau khi khóa: **phiếu điều chỉnh vào kỳ đang mở kế tiếp**, tham chiếu kỳ gốc; không ghi đè kỳ cũ.

**Quyền xem:** Linh xem và sửa toàn bộ; **Nhung xem toàn bộ trên app, mọi lúc, không tải file** (Q40); thợ xem doanh thu, lương tạm tính và phiếu lương đã chốt **của chính mình** (Q39). Mọi lần xem bảng toàn quán ghi audit log. Xuất PDF/file bảng lương toàn quán chỉ Linh.

# 10. CRM — KHÁCH HÀNG LINDY (D10-B)

## 10.1. Hồ sơ khách tối giản

CRM chỉ có: (1) **tên khách**, (2) **số điện thoại** nếu có, (3) **lịch sử đơn** tự tạo từ giao dịch. Mỗi khách có mã nội bộ.

- Tìm nhanh theo tên/SĐT; bấm vào khách xem các đơn, thời gian, dịch vụ, số tiền.
- Khách không cho SĐT vẫn lập đơn bình thường.
- **Nhiều khách được dùng chung một SĐT** (mẹ con, chị em). Khi nhập SĐT đã có, app **nhắc số này đã tồn tại** và cho chọn khách có sẵn hoặc tạo khách mới (Q06). SĐT **không** là khoá duy nhất.
- Cùng tên không tự suy ra cùng người; gộp hồ sơ cần người có quyền.
- Không có ngày sinh, sở thích, ảnh móng, thợ yêu thích, VIP, nhắc chăm sóc, marketing ở V1.
- Khách đi nhiều cơ sở: mã khách chung cấp tổ chức, lọc lịch sử theo cơ sở.

## 10.2. Số liệu khách suy ra từ đơn

Khách mới, khách quay lại, số đơn/khách, tổng tiền đơn, lần đến gần nhất — chỉ tổng hợp từ đơn Đã xác nhận. Khách lẻ không định danh chỉ đếm theo đơn.

## 10.3. Khiếu nại là nghiệp vụ đơn hàng

Khách yêu cầu sửa: lập **phiếu xử lý gắn mã đơn gốc**. Lỗi nhân viên → sửa miễn phí; khách đổi ý → sửa có phí; khách không đồng ý sửa → Nhung có thể đề xuất **ưu đãi 10–20% bill sau** (quán chịu, mục 6.5).

# 11. BÁO CÁO QUẢN TRỊ

## 11.1. Hằng ngày

- Đơn Đã xác nhận, đơn chờ xác nhận, đơn huỷ/hoàn; lượt khách; doanh thu gộp, giảm giá (tách ưu đãi bù khiếu nại), doanh thu thuần.
- Doanh thu theo thợ (Linh và Nhung xem), không trùng tổng quán.
- Tiền thực thu theo phương thức/tài khoản; còn phải thu; cọc đang giữ; tip giữ hộ chưa trả.
- Thu khác, chi theo nhóm; biến động quỹ; kết quả chốt quỹ.
- **Danh sách Cần xem lại (chỉ Linh):** đơn Nhung tự xác nhận có phần doanh thu của Nhung (Q04).
- So sánh với hôm qua, cùng thứ tuần trước, bình quân 7 ngày.

## 11.2. Hằng tháng

- Doanh thu từng ngày, theo dịch vụ, theo thợ; giảm giá/hoàn tiền.
- Thu/chi và số dư đầu–cuối tháng từng tài khoản.
- Chi phí cố định/biến đổi; **lợi nhuận vận hành ước tính** (chỉ Linh) kèm giải thích cách tính.
- Lương phải trả, đã trả, còn nợ; tạm ứng chưa cấn trừ.
- KPI quản lý; hiệu quả nhân viên theo ngày công, số đơn, doanh thu.
- Khách mới/quay lại, top thợ, top dịch vụ.
- Xuất CSV/XLSX/PDF; báo cáo tháng đã chốt không bị đổi ngược.

## 11.3. Dự báo dòng tiền (giai đoạn 2)

Dự báo 7/30 ngày từ số dư, phải thu, lương phải trả ngày 10, tiền nhà, chi cố định. Hiển thị dạng tình huống, không coi doanh thu tương lai là tiền chắc chắn.

# 12. NGUYÊN TẮC DỮ LIỆU — MỘT NGUỒN SỰ THẬT

**Chuỗi xử lý:** `Appointment` (+ cọc) → `Order + OrderItem + StaffAllocation` → Làm xong → **Xác nhận** → doanh thu theo ngày làm dịch vụ → `Payment` sinh dòng tiền → `CashLedger` → `Payroll` lấy phần doanh thu cá nhân của đơn đã xác nhận → `CRM` liên kết tên/SĐT với lịch sử đơn → `Reports` tổng hợp từ các nguồn gốc này.

Không nhập một khoản doanh thu ở 3 màn hình. Không lưu tổng lương cố định thiếu chi tiết. Không dùng Google Sheets làm cơ sở dữ liệu hai chiều.

## 12.1. Bảng dữ liệu lõi

| Bảng | Trường quan trọng (rút gọn) |
|---|---|
| `organizations` | id, name, timezone, currency |
| `branches` | id, organization_id, name, open_time, close_time, status |
| `users` / `roles` / `role_permissions` | account, branch_scope, permission, status |
| `staff` | id, user_id?, branch_id, name, status, hire_date, end_date, salary_payout_method |
| `staff_policy_versions` | staff_id, **effective_month** (luôn là ngày 1), base_salary, commission_rate, allowed_leave_days, KPI configuration |
| `customers` | id, organization_id, name, phone? (**không unique**), created_at |
| `services` / `price_versions` | id, name, category, **price_mode** (list/custom), price, effective_from/to |
| `orders` | id, branch_id, customer_id?, **service_date**, service_status (draft/in_progress/**awaiting_confirmation**/confirmed/cancelled), payment_status (tính ra), created_by, **confirmed_by, confirmed_at**, **needs_owner_review** |
| `order_items` | id, order_id, **line_type** (service/custom/surcharge), service_id?, list_price_snapshot, applied_price, quantity, net_amount |
| `order_discounts` | id, order_id, order_item_id?, **kind** (normal/below_list/complaint_compensation), percent?, amount, **shop_borne**, reason, applied_by, approved_by, approval_level |
| `order_staff_allocations` | id, order_item_id, staff_id, **allocated_net_amount**, **commission_base_amount**, allocation_type |
| `payments` | id, order_id?, amount, paid_at, method (cash/transfer), money_account_id, reconciliation_status, idempotency_key, deposit_id? |
| `appointments` | id, branch_id, customer_id?, staff_id?, service_id?, start_at, end_at?, status, created_by |
| `appointment_deposits` | id, appointment_id, amount, received_payment_id, **status** (held/applied/forfeited/refunded), resolved_at, resolved_by |
| `tip_holdings` | id, order_id?, staff_id, amount, received_payment_id, paid_out_entry_id?, status |
| `money_accounts` | id, branch_id, name, type (cash/bank/personal), **manager_can_view_balance**, currency |
| `cash_ledger_entries` | id, entry_type (opening/payment/deposit/expense/transfer/tip_payout/advance/payroll…), account_id, amount_signed, occurred_at, reference_type/id, reversal_of_id? |
| `expense_requests` / `expense_approvals` | requester_id, approver_id, category, amount, limit_rule_snapshot, status, approved_at, paid_entry_id? |
| `expense_approval_rules` | branch_id, manager_limit (1.000.000đ), **owner_only_categories** |
| `discount_rules` | branch_id, role, allowed_presets ([5, 10] cho thợ), max_percent (20 cho Nhung) |
| `shop_closed_days` | branch_id, date, reason |
| `shift_templates` / `shifts` / `attendance` / `leave_requests` | branch_id, staff_id, ca, giờ dự kiến, check-in/out, approved_work_units, approved_by, **self_approved** |
| `employee_advances` | staff_id, amount, requested_at, approved_by, payroll_period_id, status |
| `payroll_settings` | branch_id, draft_day (5), pay_day (10), holiday_multiplier (1,0) |
| `payroll_periods` / `payroll_lines` | year_month, staff_id, snapshot, approved_at, status, amount_due, amount_paid, adjustment_origin_id? |
| `order_service_tickets` | id, order_id, complaint_type, resolution, status |
| `audit_logs` | actor, action, entity, before/after, timestamp, reason; gồm xem bảng lương toàn quán và các lần tự duyệt |

Số tiền lưu bằng **số nguyên VND**. Chia tiền xử lý làm tròn có tổng kiểm soát. Bảng giao dịch có khoá ngoại, dấu thời gian, cơ sở, người tạo/cập nhật, xoá mềm khi cần.

## 12.2. Invariant kiểm tra phía máy chủ

1. Σ `allocated_net_amount` không vượt doanh thu thuần của đơn; phần chưa phân bổ phải có lý do.
2. Σ `payments` (kể cả cọc đã trừ) trừ tiền hoàn ≤ số phải thu hợp lệ; tip lưu tách riêng.
3. Không tạo hai khoản thu trùng do bấm hai lần: khoá idempotency.
4. Không sửa trực tiếp thanh toán đã đối soát; dùng nghiệp vụ đảo/hoàn/điều chỉnh.
5. Không đổi số dư quỹ bằng sửa số; mọi thay đổi qua bút toán hoặc chốt quỹ có lý do.
6. Mọi báo cáo có cơ sở, múi giờ `Asia/Ho_Chi_Minh` và quy ước ngày.
7. Kỳ lương và kỳ tài chính đã khoá chỉ điều chỉnh qua bút toán/phiên bản mới.
8. Chỉ người có `payroll.read_all_branch` đọc được lương người khác; thợ không gọi API đọc được.
9. Khoản chi chưa duyệt hoặc chưa chi không làm giảm số dư.
10. CRM không có trường ngoài tên/SĐT/lịch sử đơn.
11. **Chỉ đơn `confirmed`** được tính vào doanh thu, hoa hồng, KPI và báo cáo; ngày tính là `service_date`.
12. **Σ `commission_base_amount` = Σ `allocated_net_amount` + Σ giảm giá `shop_borne`** của đơn.
13. Thợ chỉ áp được giảm giá 5% hoặc 10%; Nhung tối đa 20%; vượt mức bị từ chối ở API nếu thiếu duyệt của Linh.
14. Phiếu chi > 1.000.000đ hoặc thuộc `owner_only_categories` không thể được duyệt bởi người không có `expense.approve_above_limit`.
15. `staff_policy_versions.effective_month` phải là ngày 1 của tháng.
16. Cọc không phải doanh thu; chỉ chuyển trạng thái `applied` (trừ vào bill), `forfeited` (bỏ hẹn) hoặc `refunded`, mỗi lần một bút toán.
17. Tạm ứng chỉ được duyệt bởi người có `advance.approve`; không ghi vào chi phí lương.

# 13. HÀNH TRÌNH NGƯỜI DÙNG

### A. Khách đến làm nail

Thợ tạo đơn nháp → tìm khách theo SĐT hoặc tạo khách lẻ → thêm dịch vụ (giá theo bảng hoặc giá theo mẫu) → gán thợ → giảm giá 5%/10% nếu cần, kèm lý do → bấm **Làm xong** → Nhung xem bill, duyệt giảm giá, ghi tiền khách trả (tiền mặt và/hoặc chuyển khoản) → **Xác nhận** → đơn vào doanh thu ngày làm dịch vụ; số dư quỹ tăng theo tiền thực thu; hoa hồng thợ tạm tăng; lịch sử khách cập nhật.

### A2. Đặt lịch có cọc

Linh/Nhung/thợ (theo quyền) tạo lịch hẹn: ngày giờ, dịch vụ, thợ → ghi tiền cọc vào tài khoản nhận → khách đến: chuyển lịch thành đơn nháp, cọc tự trừ vào bill → Nhung xác nhận. Khách bỏ hẹn: Nhung đánh dấu bỏ hẹn, cọc chuyển sang `forfeited`. Lịch hẹn chưa hoàn thành không ghi doanh thu.

### B. Khách trả thiếu / trả sau

Đơn xác nhận 500.000đ, thu 300.000đ → doanh thu ngày làm 500.000đ, tiền thu 300.000đ, phải thu 200.000đ. Hôm sau thu 200.000đ → không tăng doanh thu hôm sau, chỉ tăng tiền và giảm công nợ.

### C. Quán mua vật tư

Nhân viên đề nghị chi 650.000đ “Vật tư”, chọn tài khoản, đính kèm chứng từ → Nhung duyệt (≤ 1.000.000đ, không thuộc 4 nhóm riêng) → khi chi, số dư tài khoản giảm 650.000đ.

### D. Chốt ngày

Sau 21:00, Nhung (hoặc Linh) mở **Chốt ngày** → xem đơn chờ xác nhận, đơn thiếu tiền, tip giữ hộ chưa trả, chuyển khoản chưa đối soát, phiếu chi chưa duyệt → nhập tiền mặt đếm được → xử lý chênh lệch → khoá ngày.

### E. Lương tháng

Ngày 05: app tạo bản nháp lương tháng trước → Nhung xem toàn bộ để đối chiếu → Linh kiểm tra và **khoá** → **ngày 10** chi lương (chuyển khoản hoặc tiền mặt), đánh dấu đã chi → thợ xem phiếu lương của mình.

### F. Khách phàn nàn

Nhung tìm đơn gốc → tạo phiếu xử lý → phân loại lỗi nhân viên / khách đổi ý → sửa miễn phí / có phí / đề xuất ưu đãi 10–20% bill sau (quán chịu) → theo dõi đến xong.

# 14. MÀN HÌNH CẦN LÀM

| Mã | Màn hình | Thành phần không được thiếu | Vai trò |
|---|---|---|---|
| UI01 | Đăng nhập & chọn cơ sở | SĐT/email, mật khẩu, cơ sở | Mọi người |
| UI02 | Tổng quan | Doanh thu, tiền thu, chi, số dư 2 tài khoản, công nợ, cần xử lý; mục **Cần xem lại** cho Linh | Linh, Nhung; thợ thấy bản của mình |
| UI03 | Danh sách đơn | Tìm, lọc (Chờ xác nhận), trạng thái, nhân viên | Linh, Nhung; thợ thấy đơn của mình |
| UI04 | Tạo/sửa đơn | Khách, dịch vụ, giá theo mẫu, phụ thu, phân bổ thợ, giảm giá theo quyền, nút Làm xong | Thợ, Nhung, Linh |
| UI05 | Chi tiết & xác nhận đơn | Dòng thời gian trạng thái, phân bổ, giảm giá, thanh toán (tiền mặt/chuyển khoản/cọc), nút Xác nhận, hoàn/sửa, audit | Nhung, Linh; thợ chỉ xem đơn của mình |
| UI06 | Thu chi & sổ tiền | 2 tài khoản, giao dịch, chứng từ, danh mục | Linh; Nhung (xem số dư, lập/duyệt chi trong hạn mức) |
| UI07 | Chốt ngày | Đếm quỹ, chênh lệch, đơn chưa thu, tip giữ hộ, chuyển khoản chưa đối soát | Nhung, Linh |
| UI08 | Lịch ca & ngày nghỉ | Lịch tuần/tháng 2 ca, check-in/out, duyệt nghỉ/đổi ca, ngày quán đóng cửa | Nhân viên, Nhung, Linh |
| UI09 | Bảng công & nhân viên | Công dự kiến/thực tế/duyệt, hồ sơ, chính sách theo tháng | Linh, Nhung |
| UI10 | Bảng lương | Tạm tính, chốt, lịch sử kỳ, tạm ứng, phiếu lương | Linh (sửa/chốt/chi), Nhung (xem), thợ (của mình) |
| UI11 | Danh sách khách | Tìm tên/SĐT, cảnh báo SĐT trùng | Người có quyền |
| UI12 | Hồ sơ khách | Tên, SĐT, lịch sử đơn | Người có quyền |
| UI13 | Báo cáo | Lọc ngày/tháng/cơ sở/nhân viên; xuất file | Linh; Nhung theo quyền |
| UI14 | Cài đặt | Dịch vụ, giá, giá theo mẫu, tài khoản tiền, quyền, chính sách lương, hạn mức giảm giá và duyệt chi, ngày đóng cửa | Linh |
| UI15 | Lịch hẹn | Lịch ngày/tuần, đặt lịch, cọc, xác nhận/huỷ/bỏ hẹn, tạo đơn từ lịch | Linh, Nhung, thợ theo quyền |
| UI16 | Duyệt chi & tạm ứng | Đề nghị chi, hạn mức Nhung, chuyển Linh; đề nghị tạm ứng (chỉ Linh duyệt) | Linh, Nhung, người đề nghị |

Màn hình tạo đơn, nhận tiền, xem báo cáo **không cuộn ngang** trên iPhone.

# 15. THIẾT KẾ KỸ THUẬT

- **Nền tảng:** chưa chốt nhà cung cấp. Khuyến nghị chốt nền tảng chạy thật (hosting, database, đăng nhập) **trước P0** để không phải chuyển hạ tầng lần hai.
- **Frontend:** React + TypeScript, responsive, PWA. **Mục tiêu chính: Safari trên iPhone** (G23): “Thêm vào màn hình chính”, vùng an toàn tai thỏ/thanh home, ô nhập ≥ 16px, bàn phím số cho ô tiền. Thông báo đẩy trên iPhone chỉ chạy khi app đã được thêm ra màn hình chính (iOS 16.4 trở lên).
- **Giao diện:** theo **Hệ thống giao diện LINDY OS**; đủ hai bộ màu sáng/tối, tự đổi theo cài đặt điện thoại (G09).
- **Backend/database:** PostgreSQL; kiểm tra quyền ở máy chủ cho mọi API; phân quyền theo dòng dữ liệu.
- **Bảo mật:** mật khẩu không lưu rõ; phiên đăng nhập an toàn; lịch sử truy cập và sửa số tiền.
- **Độ tin cậy:** sao lưu tự động, thử khôi phục, môi trường thử với dữ liệu mẫu; không đưa khoá bí mật vào frontend; import/export CSV.
- **Giao dịch:** đơn–thanh toán–sổ quỹ chạy trong transaction có ràng buộc; hoàn tiền có bản ghi đảo.
- **Hiệu năng:** Tổng quan tải nhanh trên 4G; danh sách chia trang; có thời điểm cập nhật dữ liệu.
- **Quy ước:** VND, hiển thị `1.250.000đ`; `Asia/Ho_Chi_Minh`; `dd/mm/yyyy`.
- **Offline:** không có ở V1.
- **Thuế:** ngoài phạm vi app. Quán là hộ kinh doanh, chưa dùng hóa đơn điện tử, doanh thu khoảng 1–1,2 tỷ/năm; cần hỏi kế toán về nghĩa vụ hóa đơn/kê khai từ 2026. App cần xuất được số doanh thu theo tháng khớp với số kê khai.

# 16. DI CHUYỂN DỮ LIỆU TỪ GOOGLE SHEETS

Nguồn: **LINDY - Doanh thu & Lương - CS 31/49 HTK** (tab tháng 10/2026, bảng lương, doanh thu 2025/2026, thu chi cũ).

**Thời điểm (Q42): sau khi app chạy ổn ở quán**, không chặn ngày bắt đầu dùng.

1. Sao lưu bản bất biến trước khi xử lý.
2. Mapping thợ, khách, ngày, doanh thu theo thợ thành `orders` + `order_staff_allocations` ở trạng thái lịch sử; CRM chỉ nhận tên/SĐT nếu có.
3. Phát hiện bản ghi trống, trùng, sai ngày, sai tổng, tên gần giống; lập danh sách lỗi để quản lý duyệt.
4. Thiếu chi tiết dịch vụ/thanh toán → nhãn **“không rõ dịch vụ / chưa biết đã thu tiền”**; không tự suy ra đã thu.
5. Lương cũ nhập dạng bản chốt lịch sử; không tạo phiếu chi nếu không có bằng chứng.
6. Dữ liệu lịch sử không đụng vào số dư quỹ (số dư chỉ tính từ ngày mở sổ).
7. Chạy song song app và bảng tính ít nhất một kỳ trước khi dừng nhập bảng tính.

# 17. LỘ TRÌNH PHÁT TRIỂN

## P0 — Nền móng

Tài khoản, cơ sở, quyền (mục 4), danh mục nhân viên/dịch vụ/khách, chính sách có lịch sử, database, audit log, dữ liệu mẫu, khung giao diện theo Hệ thống giao diện LINDY OS, thanh điều hướng.

## P1 — MVP chạy quán, phát hành theo 4 nhịp

| Nhịp | Nội dung | Song song với bảng tính |
|---|---|---|
| **1** | Đơn nháp → Làm xong → Xác nhận; chia thợ; giảm giá theo quyền; phụ thu; giá theo mẫu; thanh toán tiền mặt/chuyển khoản; khách (tên/SĐT/lịch sử); Tổng quan và báo cáo doanh thu ngày/tháng; danh sách Cần xem lại | Thay tab doanh thu |
| **2** | Sổ tiền 2 tài khoản; bút toán mở sổ; đề nghị/duyệt chi; tip giữ hộ; chốt quỹ cuối ngày; báo cáo dòng tiền | Thay phần thu chi |
| **3** | Ca làm, check-in/out, duyệt công, ngày quán đóng cửa; tạm ứng; lương tạm tính, nháp ngày 5, khoá, chi ngày 10; phiếu lương | Đối chiếu bảng lương cùng tháng |
| **4** | Lịch hẹn và tiền cọc; xuất dữ liệu; nhập dữ liệu lịch sử 2025–2026 | — |

Không xây biểu đồ đẹp trước khi chốt định nghĩa doanh thu, tiền và lương.

## P2 — Nâng cao

Nhắc hẹn tự động, đặt lịch online, vật tư/tồn kho, sổ nợ nhà cung cấp (nếu cần), phiếu bảo hành nâng cao, khách VIP/thẻ liệu trình, dự báo dòng tiền, cảnh báo KPI.

## P3 — Mở chuỗi

Dashboard tập đoàn/cơ sở, phân quyền nhiều tầng, kho liên cơ sở, nhân viên liên cơ sở, so sánh cơ sở.

# 18. TIÊU CHÍ NGHIỆM THU

1. Khách 348.000đ chia Nhung 239.000đ, Chin 109.000đ → doanh thu quán 348.000đ, không nhân đôi.
2. Cùng đơn nhận 200.000đ chuyển khoản và 148.000đ tiền mặt → Tài khoản cs HTK +200.000đ, Tiền mặt cs HTK +148.000đ, công nợ 0.
3. Đơn 500.000đ thu 300.000đ hôm nay, 200.000đ ngày mai → doanh thu ngày đầu 500.000đ; ngày sau chỉ có thu tiền.
4. Giảm 10% trên đơn nhiều dịch vụ/thợ → tổng phân bổ khớp doanh thu thuần, không lệch do làm tròn.
5. Hoàn 100.000đ trong kỳ còn mở → có lý do, chứng từ; doanh thu, hoa hồng, dòng tiền điều chỉnh đúng kỳ.
6. Chuyển 2.000.000đ tiền mặt sang ngân hàng → tổng tiền không đổi, không đổi doanh thu/chi phí.
7. Góp vốn 20.000.000đ → tăng quỹ, không tăng doanh thu.
8. Chi vật tư 650.000đ → giảm tài khoản được chọn đúng một lần.
9. Tháng 31 ngày, nhân viên thường nghỉ 2 ngày → +1 ngày lương chia 28.
10. Nhung tháng 31 ngày nghỉ 4 ngày → không tăng/giảm; lương ngày chia 27.
11. Doanh thu quán 84.999.999đ → KPI 0; 85.000.000đ → 1%; 102.000.000đ → 1,5% trên toàn doanh thu.
12. Thợ chỉ xem doanh thu, lương tạm tính và phiếu lương của mình; không gọi API đọc lương người khác. Nhung xem toàn bộ bảng lương (kể cả Linh) nhưng không sửa/khóa/chi/tải.
13. Đổi tỷ lệ hoa hồng từ 01/11 không đổi bản lương đã chốt tháng 10.
14. Khoá ngày và khoá lương xong không thể xoá âm thầm; có bản điều chỉnh, người thực hiện, lý do.
15. Khách lẻ không SĐT vẫn lập và thanh toán đơn.
16. Khách quay lại thấy lịch sử nhiều lần; không tự gộp hồ sơ vì trùng tên.
17. Bấm lưu thanh toán hai lần do mạng chập chờn không tạo hai khoản thu.
18. Số dư cuối tháng = số dư đầu + thu − chi theo từng tài khoản; chuyển nội bộ không làm sai tổng.
19. Xuất dữ liệu được; sao lưu được; thử khôi phục thành công.
20. Tạo đơn, nhận tiền, xem báo cáo không cuộn ngang trên iPhone.
21. Thợ tạo đơn và bấm Làm xong được, nhưng không xác nhận bill hay ghi thanh toán được.
22. Đề nghị chi 300.000đ chưa duyệt và chưa chi → số dư không đổi.
23. Nhân viên quên check-in không tự bị trừ lương khi chưa xác minh.
24. Lịch hẹn đổi/huỷ có trạng thái, không phát sinh doanh thu khi chưa làm dịch vụ.
25. Hoàn 100.000đ cho đơn của tháng đã khoá lương → phiếu điều chỉnh ở kỳ đang mở, kỳ cũ không đổi.
26. Khách ở cơ sở 1 và 2: hồ sơ chung, đơn gắn đúng cơ sở; tiền và lương không lẫn.
27. Nhung xem được số dư 2 tài khoản quán nhưng **không xem được lợi nhuận** qua API.
28. Giảm giá bản đầu có lý do và người duyệt; không tự kích hoạt Happy Hours, voucher, VIP.
29. Nhập lịch sử: bill cũ thiếu bằng chứng thanh toán không sinh tiền vào quỹ; ngày mở sổ không cộng đúp số dư.
30. **Thợ bấm Làm xong → đơn Chờ xác nhận, chưa vào doanh thu/hoa hồng. Nhung xác nhận → vào doanh thu ngày làm dịch vụ.**
31. **Đơn làm 31/10, xác nhận 01/11 → doanh thu và hoa hồng tháng 10.**
32. **Thợ chọn giảm 10% → được; thợ nhập 15% → bị chặn; Nhung duyệt 20% → được; 25% → cần Linh.**
33. **Ưu đãi bù khiếu nại 20% trên bill 500.000đ của Chin → doanh thu quán 400.000đ; hoa hồng Chin 125.000đ.**
34. **Phụ thu 50.000đ gán Trang → hoa hồng Trang +12.500đ; doanh thu KPI +50.000đ.**
35. **Khách đặt cọc 100.000đ rồi đến làm bill 500.000đ → còn phải thu 400.000đ; doanh thu ngày làm 500.000đ; ngày nhận cọc không có doanh thu.**
36. **Khách đặt cọc 100.000đ rồi bỏ hẹn → quỹ đã tăng 100.000đ từ ngày nhận cọc; ngày đánh dấu bỏ hẹn ghi khoản theo phân loại đã chốt; không có hoa hồng.**
37. **Phiếu chi 1.200.000đ → Nhung không duyệt được. Phiếu sửa chữa 300.000đ → Nhung không duyệt được.**
38. **Quán đóng 5 ngày Tết, nhân viên thường không nghỉ thêm → không bị trừ lương; +3 ngày lương.**
39. **Đã dùng hết 3 ngày nghỉ, nghỉ không phép thêm 1 ngày → −1 ngày lương, không phạt thêm.**
40. **Đặt ngày hiệu lực hoa hồng 15/11 → app không cho lưu; 01/12 → lưu được.**
41. **Hoàn 100.000đ cho bill tháng 10 sau khi khoá lương tháng 10 → doanh thu, KPI, hoa hồng tháng 11 giảm tương ứng; tháng 10 không đổi.**
42. **Thợ hoặc Nhung duyệt tạm ứng → bị chặn; chỉ Linh duyệt được.**
43. **Hai khách khác tên cùng SĐT → lưu được cả hai; app hiện nhắc số đã tồn tại.**
44. **Khách chuyển 50.000đ tip cho Chin vào Tài khoản cs HTK → tài khoản +50.000đ, phải trả Chin 50.000đ; cuối ngày Nhung chi 50.000đ tiền mặt → Tiền mặt cs HTK −50.000đ; doanh thu không đổi.**
45. **Đơn có phần doanh thu của Nhung do Nhung tự xác nhận → xuất hiện trong danh sách Cần xem lại của Linh; thợ và Nhung không thấy danh sách này.**

# 19. SỔ QUYẾT ĐỊNH VÀ THAM SỐ

## 19.1. Quyết định discovery D01–D16 (10/10/2026)

| Mã | Quyết định | Phạm vi |
|---|---|---|
| **D01 — A** | Thợ tạo đơn nháp; Nhung xác nhận bill/thanh toán; Linh duyệt ngoại lệ | Đơn hàng, quyền |
| **D02 — A** | Chia doanh thu thợ theo dịch vụ; có nhập nhanh tổng bill rồi chia thủ công | Đơn, hoa hồng |
| **D03 — A** | Hoa hồng theo doanh thu thuần sau giảm giá; không gồm tip; chưa thu đủ vẫn ghi doanh thu | Doanh thu, lương |
| **D04 — A** | Hoàn/sửa trong kỳ còn mở; kỳ lương đã khóa thì điều chỉnh ở kỳ kế tiếp | Đơn, audit, lương |
| **D05 — A** | Quản lý nhiều quỹ/tài khoản; đối soát và chuyển quỹ | Thu chi, sổ tiền |
| **D06 — A** | Nhân viên đề nghị chi; Nhung duyệt trong hạn mức; Linh duyệt khoản lớn | Thu chi, quyền |
| **D07 — A** | Nhập số dư đầu kỳ, công nợ khách và nhà cung cấp đầu kỳ | Sổ tiền, công nợ |
| **D08 — A** | Lịch ca, check-in/out trên điện thoại, Nhung duyệt công; không tự phạt đi muộn | Ca, công |
| **D09 — A** | Giữ lương công thức và KPI bảng tháng 10/2026; quy tắc có ngày hiệu lực | Lương, KPI |
| **D10 — B** | CRM chỉ gồm tên khách, SĐT (nếu có), lịch sử đơn | CRM |
| **D11 — A** | Lịch hẹn cơ bản ngay bản đầu; nhắc tự động tích hợp sau | Lịch hẹn |
| **D12 — A** | Giảm giá thủ công có lý do/duyệt; Happy Hours/VIP/voucher để sau | Khuyến mãi |
| **D13 — A + bổ sung** | Nhung được XEM lương toàn bộ nhân viên cơ sở; không sửa/chốt/chi; không thấy lãi ròng | Quyền, lương |
| **D14 — A** | Đưa dữ liệu 2025–2026 vào dạng lịch sử/đối chiếu | Nhập dữ liệu |
| **D15 — A** | Mobile-first PWA; thử với Linh & Nhung trước; cần internet | Triển khai |
| **D16 — A** | Hỗ trợ nhiều cơ sở từ đầu; CRM dùng chung; tiền/lương/giá/KPI tách theo cơ sở | Kiến trúc |

## 19.2. Quy tắc vận hành Q01–Q44 (phiếu chốt thông tin, 12/10/2026)

| Mã | Câu hỏi | Đã chốt |
|---|---|---|
| Q01 | Doanh thu và hoa hồng tính từ lúc nào | Khi Nhung đã xác nhận bill |
| Q02 | Đơn sát cuối tháng tính vào ngày nào | Ngày làm dịch vụ |
| Q03 | Ngày Nhung nghỉ ai xác nhận, chốt sổ | Linh |
| Q04 | Đơn có phần của Nhung do Nhung tự xác nhận | Vẫn tự xác nhận; vào danh sách để Linh xem lại |
| Q05 | Lễ tân/thu ngân riêng | Không có, Nhung kiêm |
| Q06 | Nhiều khách chung SĐT | Cho phép, app nhắc số đã có |
| Q07 | Cách tính giá | Bảng giá + vẽ/đính đá theo mẫu |
| Q08 | Thợ nhập giá thấp hơn bảng giá | Tính là giảm giá, có lý do, Nhung duyệt |
| Q09 | Thợ tự giảm giá | Được, mức 5% và 10% |
| Q10 | Hạn mức Nhung duyệt giảm | 20%; trên mức Linh |
| Q11 | Phụ thu | Có; tính như doanh thu dịch vụ (hoa hồng, KPI) |
| Q12 | Ưu đãi bù khiếu nại ai chịu | Quán chịu |
| Q13 | Cách nhận tiền | Tiền mặt; chuyển khoản/QR |
| Q14 | Cách khách tip | Tiền mặt trực tiếp cho thợ |
| Q15 | Tip vào tài khoản quán | Cuối ngày Nhung trả tiền mặt cho thợ, ghi sổ |
| Q16 | Tiền cọc lịch hẹn | Có nhận cọc; bỏ hẹn thì quán giữ cọc |
| Q17 | Quỹ/tài khoản | Tiền mặt cs HTK; Tài khoản cs HTK; Nhung xem số dư cả hai |
| Q18 | Tài khoản cá nhân dùng cho quán | Không dùng |
| Q19 | Hạn mức Nhung duyệt chi | 1.000.000đ/phiếu |
| Q20 | Nhóm chi luôn cần Linh | Tiền nhà; lương/thưởng/tạm ứng; máy móc thiết bị; sửa chữa |
| Q21 | Mua vật tư trả sau | Hầu như trả ngay |
| Q22 | Công nợ lúc mở sổ | Không có |
| Q23 | Chốt tiền mặt | Một quỹ, chốt một lần cuối ngày |
| Q24 | Ngày mở sổ | Ngày 1 của một tháng, chốt tháng sau khi chạy thử |
| Q25 | Ngày giờ mở cửa | Mọi ngày, 9:00–21:00 |
| Q26 | Ca làm | Hai ca sáng/chiều |
| Q27 | Ai duyệt công, nghỉ của Nhung | Nhung tự duyệt |
| Q28 | Nghỉ không phép | Trừ như nghỉ thường, không phạt thêm |
| Q29 | Ngày quán đóng cửa | Không tính là nghỉ, trả lương như đi làm |
| Q30 | Làm ngày lễ | Như ngày thường |
| Q31 | Nhân sự, lương khi go-live | Giữ nguyên bảng 10/2026 |
| Q32 | Linh có dòng lương | Có |
| Q33 | Doanh thu tính KPI | Sau giảm giá và hoàn tiền, không gồm tip |
| Q34 | Hoàn tiền sau khóa lương | Tính vào tháng phát sinh hoàn |
| Q35 | Vào/nghỉ giữa tháng | Lương ngày × số ngày đi làm thực tế |
| Q36 | Đổi lương/hoa hồng | Từ ngày 1 của tháng |
| Q37 | Ai duyệt tạm ứng | Chỉ Linh |
| Q38 | Ứng vượt lương đã làm | Linh quyết từng trường hợp; chỉ ứng lương cứng, từ ngày 1 hằng tháng |
| Q39 | Thợ xem gì của mình | Doanh thu, lương tạm tính, phiếu lương đã chốt |
| Q40 | Nhung xem bảng lương | Chỉ xem trên app, mọi lúc |
| Q41 | Cách trả lương | Chuyển khoản hoặc tiền mặt; ngày 10 |
| Q42 | Nhập dữ liệu cũ | Sau khi app chạy ổn |
| Q43 | Hình thức kinh doanh | Hộ kinh doanh |
| Q44 | Hóa đơn điện tử | Chưa dùng |

## 19.3. Lựa chọn giao diện G01–G26 (phiếu phong cách, 12/10/2026)

| Mã | Chủ đề | Đã chọn |
|---|---|---|
| G01 | Logo | Có, muốn làm mới (ngoài phạm vi app) |
| G02 | Màu thương hiệu | Be, nâu, trắng |
| G03 | Mạng xã hội | Instagram @lindy.nailashstudio |
| G04 | Tên app | LINDY OS |
| G05 | Cảm giác | Tối giản, hiện đại, dịu nhẹ |
| G06 | Phong cách | Ngà & mực |
| G07 | Màu nhấn | Giữ theo phong cách (mận) |
| G08 | Màu nền | Giữ theo phong cách (ngà) |
| G09 | Giao diện tối | Tự đổi theo cài đặt điện thoại |
| G10 | Màu trạng thái tiền | Rõ: xanh, cam, đỏ |
| G11 | Chữ tiêu đề | Giữ theo phong cách (có chân, thanh lịch) |
| G12 | Cỡ chữ | Vừa |
| G13 | Số tiền | 8.450.000đ |
| G14 | Góc bo | Giữ theo phong cách (bo nhẹ) |
| G15 | Mật độ | Dày |
| G16 | Biểu tượng | Nét mảnh |
| G17 | Thanh điều hướng | Biểu tượng kèm chữ |
| G18 | Nút Tạo đơn | Tròn nổi góc phải dưới |
| G19 | Biểu tượng app | Chữ L |
| G20 | Ảnh | Gần như không dùng |
| G21 | Chuyển động | Tối thiểu |
| G22 | Giọng văn | Ngắn gọn |
| G23 | Thiết bị | iPhone |
| G24 | Điều khó chịu nhất | Phải bấm nhiều bước mới xong việc |
| G25 | App tham khảo | Instagram |
| G26 | Ghi chú thêm | Không có |

## 19.4. Còn chờ chốt hoặc chờ dữ liệu trước khi chạy thật

| Tham số | Trạng thái và cách xử lý |
|---|---|
| **Giờ từng ca** sáng/chiều; mỗi nhân viên làm mấy ca/ngày; **làm 1 ca tính bao nhiêu công** | Chưa có. Bắt buộc trước nhịp 3 (lương). Không tự giả định |
| **Cọc bị giữ khi khách bỏ hẹn** tính vào đâu | Đề xuất: thu khác, không hoa hồng, không KPI. Cần chủ xác nhận trước nhịp 4 |
| **Mức cọc** (số tiền cố định hay % bill) và **thời hạn báo huỷ** được hoàn cọc | Chưa có. Cần trước nhịp 4 |
| Cách hiểu **giảm giá của thợ “5% và 10%”** | Đang hiểu: thợ chọn một trong hai mức, kèm lý do. Cần chủ xác nhận trước nhịp 1 |
| Cách hiểu **tạm ứng “chỉ ứng lương cứng sau ngày 1”** | Đang hiểu: tối đa trên lương cứng, không ứng hoa hồng, mở từ ngày 1. Cần chủ xác nhận trước nhịp 3 |
| Tháng mở sổ cụ thể; số dư mở sổ 2 tài khoản | Chốt sau chạy thử; số dư nhập đúng ngày mở sổ |
| Bảng giá dịch vụ; danh sách dịch vụ giá theo mẫu | Chưa có. Cần ảnh menu hiện tại |
| Lịch quán đóng cửa (Tết 2027…) | Linh nhập trước kỳ lương liên quan |
| Nhân viên nhận lương bằng chuyển khoản hay tiền mặt (từng người) | Linh nhập trong hồ sơ nhân viên |
| Nền tảng kỹ thuật (hosting, database, đăng nhập) | Chưa chốt; nên chốt trước P0 |
| Thuế, hóa đơn điện tử | Ngoài phạm vi app; chủ hỏi kế toán |
| Logo mới | Ngoài phạm vi app; trong lúc chờ dùng biểu tượng chữ L |

## 19.5. Định nghĩa hoàn tất (Definition of Done)

- Đạt toàn bộ test mục 18; đặc biệt D10, D13 và test 30–45.
- Mọi nút chuyển tiền, duyệt chi, xác nhận bill, thanh toán có kiểm thử phân quyền và chống gửi trùng.
- Chạy thử bằng dữ liệu mẫu. Chỉ vận hành thật sau khi Linh xác nhận tháng mở sổ, tài khoản và số dư.
- Mọi giao diện và API thể hiện đúng phạm vi quyền của Linh, Nhung, thợ và theo cơ sở.
- Giao diện đạt Hệ thống giao diện LINDY OS ở cả chế độ sáng và tối trên iPhone.

# 20. PROMPT BÀN GIAO CHO NGƯỜI VIBE CODE

> Bạn là senior full-stack engineer và product engineer. Dùng **LINDY OS — Đặc tả sản phẩm V1.1** làm nguồn yêu cầu nghiệp vụ và **Hệ thống giao diện LINDY OS** làm nguồn giao diện. Trước hết lập cấu trúc hệ thống, schema dữ liệu theo mục 12, ma trận quyền theo mục 4 và kế hoạch theo P0 → P1 (4 nhịp) → P2. **Không code toàn bộ ứng dụng một lần.** Mỗi nhịp phát hành được trên iPhone (Safari, PWA) và có kiểm thử tự động cho các test nghiệm thu liên quan. Mọi số tiền dùng số nguyên VND, có lịch sử và ngày hiệu lực; không lưu tổng doanh thu ở nhiều nguồn độc lập. Các quyết định D01–D16, Q01–Q44, G01–G26 đã chốt, không hỏi lại. Các điểm ở mục 19.4 phải hỏi chủ trước nhịp liên quan; không tự suy đoán giá trị tiền, hạn mức, giờ ca. Đặc biệt: chỉ đơn **Đã xác nhận** mới vào doanh thu; doanh thu theo ngày làm dịch vụ; hoa hồng tính trên `commission_base_amount`; CRM chỉ tên/SĐT/lịch sử đơn; Nhung đọc lương toàn quán nhưng không sửa, khóa, trả, tải lương và không xem lợi nhuận.

---

**Kết luận:** LINDY OS kết nối đơn hàng → xác nhận → tiền → công, lương → khách hàng; ưu tiên số liệu chính xác, phân quyền đúng và ít bước bấm trên iPhone trước khi thêm tính năng nâng cao.
