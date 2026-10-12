# LINDY OS
## ĐẶC TẢ SẢN PHẨM V1.0 — CÁC QUYẾT ĐỊNH DISCOVERY ĐÃ CHỐT

**Đơn vị sử dụng:** LINDY NAIL / Lindy Nailash Studio  
**Ngày soạn:** 10/10/2026  
**Trạng thái:** Đã chốt 16/16 quyết định discovery ngày 10/10/2026; các tham số thực tế còn thiếu được liệt kê tại mục 19.2. Đây là yêu cầu nghiệp vụ đã duyệt, không phải xác nhận đã có app.  
**Thiết bị ưu tiên:** Điện thoại (web mobile-first/PWA); vẫn sử dụng tốt trên máy tính  
**Phạm vi:** Bản đầu vận hành cho cơ sở 31/49 Huỳnh Thúc Kháng; kiến trúc hỗ trợ nhiều cơ sở ngay từ đầu  
**Đối tượng nhận:** Chủ cửa hàng, quản lý vận hành, người thiết kế và người vibe code ứng dụng

> MỤC TIÊU TRUNG TÂM: Mỗi giao dịch được nhập một lần và tự chảy vào đơn hàng, báo cáo doanh thu, sổ tiền, hiệu suất nhân viên, tính lương và lịch sử khách hàng. Không nhập lặp tại nhiều bảng tính.

---

# 1. BỐI CẢNH VÀ VẤN ĐỀ CẦN GIẢI QUYẾT

LINDY đang theo dõi doanh thu bằng các tab theo tháng trong Google Sheets; mỗi khách ghi một dòng và số tiền phân về từng thợ. Bảng lương riêng lấy doanh thu từng người, cộng hoa hồng, tính ngày nghỉ, thưởng, tạm ứng và KPI quản lý. Phần thu chi có dữ liệu cũ nhưng chưa tạo được bức tranh liên tục từ đơn hàng đến tiền thực còn trong quỹ.

Các hạn chế cần giải quyết: (1) thông tin phân tán; (2) khó xác định doanh thu có thu đủ tiền chưa; (3) không nhìn thấy được số dư quỹ tiền mặt/tài khoản theo thời gian; (4) lương cuối tháng phụ thuộc thao tác tay; (5) thiếu lịch sử dịch vụ, phản hồi và tần suất quay lại của từng khách; (6) khó chuẩn hoá khi mở cơ sở thứ hai.

**Điểm đích:** Chủ có thể nhìn trong 30 giây: hôm nay có bao nhiêu lượt khách; doanh thu thuần bao nhiêu; tiền đã thực thu bao nhiêu; tiền đã chi bao nhiêu; còn bao nhiêu tiền trong từng tài khoản; công nợ chưa thu; tổng lương tạm tính; tháng này đang lãi/lỗ vận hành ước tính ra sao.

# 2. QUY ƯỚC: THÔNG TIN ĐÃ BIẾT VÀ GIẢ ĐỊNH CẦN CHỐT

## 2.1. Đã biết từ quy trình LINDY

- Nhân sự xuất hiện ở bảng tháng 10/2026: **Linh, Nhung, Chin, Trang**. Danh sách phải chỉnh được, tuyệt đối không viết cố định tên vào code.
- Một khách có thể được nhiều thợ làm; doanh thu đơn hàng được chia về các thợ tương ứng.
- Hoa hồng hiện tại: **25% trên doanh thu cá nhân** cho cả bốn người.
- Bảng tháng 10 ghi lương cứng: **Linh 3.500.000đ; Nhung 7.000.000đ; Chin 4.000.000đ; Trang 3.500.000đ**. Đây là cấu hình ban đầu theo dữ liệu hiện có, cần xác nhận lại khi go-live.
- Ngày nghỉ được hưởng: nhân sự thông thường **3 ngày/tháng**, Nhung **4 ngày/tháng**.
- Công chuẩn = số ngày lịch trong tháng − số ngày nghỉ được hưởng. Ví dụ tháng 31 ngày: 28 công, Nhung 27 công; tháng 30 ngày: 27 công, Nhung 26 công.
- Ngày nghỉ thực tế ít hơn số ngày được hưởng thì được cộng tiền theo ngày; nghỉ nhiều hơn thì trừ tương ứng. Nửa ngày nghỉ tính 0,5 nếu được duyệt.
- Nhung nhận thưởng quản lý theo doanh thu toàn quán: doanh thu tháng **dưới 85 triệu: 0%; từ 85 triệu đến dưới 102 triệu: 1%; từ 102 triệu trở lên: 1,5%**. Các mức không cộng dồn và tỷ lệ áp dụng trên toàn doanh thu quán theo cách bảng hiện tại đang tính.
- Chủ tự nhập thưởng thêm và tạm ứng; kỳ trả lương được chuẩn bị/đối soát ngày **mùng 5 tháng sau**.
- Không dùng KPI doanh thu cá nhân trên màn hình hoạt động; các mục tiêu cá nhân cũ chỉ là dữ liệu giải thích, không dùng như tiêu chí thưởng/phạt.

## 2.2. Các quyết định đã được chủ cửa hàng chốt (áp dụng bắt buộc)

**Toàn bộ 16 câu discovery đã chốt ngày 10/10/2026.** D01–D09, D11–D12, D14–D16 chọn A; **D10 chọn B**; **D13 chọn A, với ngoại lệ bổ sung Nhung được xem lương toàn bộ nhân viên**. Ma trận từng câu nằm tại mục 19.1.

- **Đơn hàng:** Thợ tạo đơn nháp; Nhung xác nhận bill/thanh toán; Linh có quyền duyệt điều chỉnh đặc biệt. Ghi dịch vụ và doanh thu thợ theo từng dịch vụ; có chế độ nhập nhanh tổng bill và chia số tiền thủ công.
- **Ghi nhận doanh thu:** Doanh thu dịch vụ hoàn thành sau giảm giá là cơ sở tính 25% hoa hồng; không gồm tip; việc chưa thu đủ tiền không làm hoãn ghi nhận doanh thu. Hoàn tiền/điều chỉnh theo quy tắc đóng kỳ.
- **Tiền:** Theo dõi từng quỹ/tài khoản (kể cả tài khoản cá nhân nhận tiền quán); cho phép chuyển tiền giữa quỹ, thu nợ, thanh toán công nợ và nhập số dư đầu kỳ. Nhân viên yêu cầu chi, Nhung duyệt trong hạn mức do Linh thiết lập; trên hạn mức Linh duyệt.
- **Nhân sự:** Có lịch ca và check-in/check-out trên điện thoại, Nhung xác nhận bảng công; không tự động phạt đi muộn/về sớm khi chưa có quy chế rõ. Giữ chính sách lương bảng 10/2026, cho phép sửa có ngày hiệu lực.
- **CRM bản đầu (D10-B):** Chỉ lưu **tên khách, số điện thoại (không bắt buộc) và lịch sử đơn hàng**. Không triển khai hồ sơ 360°, ngày sinh, sở thích, ảnh móng, thợ yêu thích, tự động phân nhóm VIP, ghi chú chăm sóc nâng cao trong CRM bản đầu. Phản hồi/sửa dịch vụ nếu cần là phiếu nghiệp vụ gắn **đơn hàng**, không làm phình CRM.
- **Lịch hẹn:** Có lịch đặt cơ bản ngay bản đầu (ngày, giờ, dịch vụ, thợ, trạng thái); tích hợp đặt lịch tự động và nhắc qua kênh bên ngoài để giai đoạn sau.
- **Khuyến mãi:** Bản đầu nhập giảm giá và lý do, duyệt theo phân quyền; Happy Hours/VIP/voucher tự động hoá để giai đoạn sau.
- **Phân quyền D13:** Nhung xem vận hành/doanh thu của cơ sở, CRM cơ bản, bảng công, và **xem bảng lương đầy đủ của toàn bộ nhân viên trong cơ sở, gồm Linh nếu Linh có dòng lương**. Quyền này là **chỉ xem**: không cho sửa công thức, lương cứng, thưởng, tạm ứng, tự khóa bảng lương hoặc chi trả nếu Linh không cấp quyền riêng. Không mặc định xem lợi nhuận, số dư tài khoản chủ, hoặc dữ liệu tài chính ngoài phạm vi.
- **Khởi chạy:** Nhập dữ liệu lịch sử 2025–2026 phục vụ tra cứu/đối chiếu; chạy thử với Linh và Nhung trước; bản đầu là web PWA cần internet. CRM khách có thể dùng chung các cơ sở tương lai; dữ liệu dòng tiền, giá dịch vụ và chính sách lương phân theo cơ sở.

**Nguyên tắc:** Mọi chính sách có ngày hiệu lực; thay đổi trong tương lai không tính lại âm thầm dữ liệu đã chốt. Các trường cần điền như tên tài khoản, giờ ca, hạn mức duyệt chi và ngày bắt đầu chính thức vẫn là **tham số triển khai chưa được cung cấp**, không phải câu discovery chưa chốt.

# 3. TẦM NHÌN SẢN PHẨM VÀ CHỈ SỐ THÀNH CÔNG

Ứng dụng web nội bộ, đơn giản như app bán hàng nhưng có báo cáo quản trị sâu. Chủ dùng trên điện thoại là chính. Mục tiêu thiết kế là: **nhập đơn nháp 20–40 giây đối với giao dịch thông thường; ngày đóng sổ trong vài phút; kỳ lương tạm tính tự cập nhật; báo cáo dựa trên cùng một nguồn dữ liệu**.

Các chỉ số cần đo sau khi chạy: tỷ lệ đơn có phân bổ thợ đúng 100%; số đơn chưa thanh toán theo ngày; tỷ lệ đơn đã đối soát; thời gian chốt lương; tỷ lệ khách quay lại; độ lệch giữa số dư phần mềm và thực tế; số lần phải sửa giao dịch đã đóng.

# 4. VAI TRÒ VÀ PHÂN QUYỀN

| Vai trò | Được làm | Không được làm mặc định |
|---|---|---|
| **Chủ hệ thống – Linh** | Xem toàn hệ thống; duyệt sửa giao dịch; xem dòng tiền, chi phí, lương, CRM; thiết lập chính sách; khóa/mở kỳ | Không giới hạn theo cơ sở |
| **Quản lý cửa hàng – Nhung** | Xác nhận bill/thanh toán; phân ca, duyệt công; chốt ca; xem bảng lương **tất cả nhân viên trong cơ sở (kể cả Linh nếu có trong bảng lương)**; duyệt chi trong hạn mức; xử lý sửa dịch vụ theo quyền | Không xem lợi nhuận/số dư chủ; không sửa, khóa, chi hoặc xuất bảng lương toàn bộ nếu chưa được cấp quyền riêng |
| **Thu ngân / lễ tân (nếu có)** | Tạo đơn, nhận tiền, xem lịch sử thanh toán liên quan, chốt quỹ ca | Không sửa chính sách lương; không xoá vĩnh viễn lịch sử |
| **Nhân viên / thợ** | Tạo đơn nháp, xem lịch làm, check-in/out, đơn được giao, doanh thu và phiếu lương tạm tính của chính mình | Không xem doanh thu/lương của người khác, không xem dòng tiền cửa hàng |
| **Kế toán (tuỳ chọn)** | Xem sổ tiền, nhập chi phí, đối soát, xuất báo cáo và chấm công/lương nếu được cấp | Không đổi quyền admin, không chỉnh đơn đã khoá tùy ý |

Phân quyền chi tiết theo **hành động** (xem/tạo/sửa/duyệt/xuất) và **phạm vi** (của tôi/cơ sở/toàn hệ thống). Các quyền bắt buộc tách riêng: `payroll.read_all_branch` (Nhung: có), `payroll.edit` (Nhung: không), `payroll.approve_lock` (Nhung: không), `payroll.pay` (Nhung: không), `owner_accounts.read_balance` (Nhung: không), `expense.approve_within_limit` (Nhung: có), `expense.approve_above_limit` (Linh: có). Mọi lần xem/tải bảng lương toàn bộ phải ghi audit log; dữ liệu lương cũng phải được kiểm tra quyền ở API và cơ sở dữ liệu, không chỉ ẩn nút.

Nhung có thể xem **lương cứng, hoa hồng, công, thưởng, tạm ứng, thực lĩnh và lịch sử bảng lương** của tất cả nhân viên cùng cơ sở. Quyền đọc này không kéo theo quyền đổi chính sách, sửa số liệu lương hoặc chuyển khoản trả lương.

# 5. KIẾN TRÚC TRẢI NGHIỆM MOBILE

## 5.1. Thanh điều hướng chính (đề xuất 5 mục)

1. **Tổng quan** — các con số hôm nay/tháng, cảnh báo.
2. **Đơn hàng** — tạo đơn, đơn trong ngày, tìm khách, thu tiền.
3. **Lịch & Nhân sự** — lịch hẹn, ca làm, điểm danh, bảng công, nhân viên.
4. **Khách hàng** — tên, SĐT, lịch sử đơn; tìm khách nhanh.
5. **Thêm** — thu chi, báo cáo, lương, cài đặt, sổ tiền, xuất dữ liệu.

Nút hành động nổi **“+ Tạo đơn”** luôn ở vị trí dễ bấm trên di động; các nghiệp vụ sử dụng nhiều không bị chôn trong menu.

## 5.2. Ví dụ màn hình Tổng quan trên điện thoại

```text
LINDY OS                         [CS 31/49 HTK]
Hôm nay, 10/10/2026          [Hôm nay | Tháng]

DOANH THU THUẦN              8.450.000đ
Tiền đã thu                  7.900.000đ
Còn khách nợ                   550.000đ

12 đơn | 15 lượt dịch vụ | 2 đơn chưa thu đủ

[+ TẠO ĐƠN]      [GHI THU / CHI]

TIỀN TRONG QUỸ (thực thu–thực chi)
Tiền mặt                     3.500.000đ
Ngân hàng                   28.300.000đ
Tổng khả dụng               31.800.000đ

HIỆU SUẤT THỢ HÔM NAY
Nhung   3.100.000đ | Chin   2.450.000đ
Linh    1.800.000đ | Trang  1.100.000đ

CẦN XỬ LÝ
2 đơn thiếu tiền · 1 đề xuất nghỉ · 1 lịch hẹn cần xác nhận

[Tổng quan] [Đơn hàng] [Nhân sự] [Khách] [Thêm]
```

**Lưu ý:** Số liệu trên chỉ là ví dụ giao diện, không phải số liệu kinh doanh thật của LINDY.

## 5.3. Hướng thiết kế hình ảnh

Phong cách LINDY: nền trắng/ngà/kem rất nhạt, đường chia mảnh, chữ đen/xám; chữ tiêu đề serif thanh lịch, chữ giao diện sans-serif dễ đọc; nhiều khoảng thở. Giảm màu sắc trang trí, chỉ dùng một màu nhấn nhẹ cho hành động và màu trạng thái dễ nhận biết. Nút chạm và bảng nhập liệu phải phù hợp với tay khi dùng điện thoại; tránh bảng 15 cột như Excel trên mobile.

# 6. PHÂN HỆ ĐƠN HÀNG (TRÁI TIM DỮ LIỆU)

## 6.1. Tạo đơn

Luồng đã chốt: **Thợ tạo đơn nháp → chọn khách (hoặc khách lẻ) → chọn dịch vụ/hoặc nhập nhanh → phân bổ doanh thu từng thợ → nhập giảm giá kèm lý do → hoàn tất dịch vụ → Nhung xác nhận bill và thanh toán → hoàn thành/ghi nợ**. Linh được can thiệp/duyệt ngoại lệ. Không cho thợ tự chốt khoản thu khi thiếu quyền.

Thông tin cần lưu:
- Mã đơn sinh tự động, ngày giờ, cơ sở, người tạo, trạng thái dịch vụ, trạng thái thanh toán.
- Khách hàng: liên kết hồ sơ chỉ gồm tên, số điện thoại (nếu có) và lịch sử đơn; cho phép khách lẻ không SĐT. Không bắt buộc lưu nguồn khách trong CRM bản đầu.
- Các dòng dịch vụ: mã dịch vụ, tên tại thời điểm bán, giá niêm yết, số lượng, giảm giá và thành tiền thuần.
- Các thợ tham gia **theo từng dịch vụ** với số tiền được ghi nhận cho mỗi người; tuỳ chọn người phụ, người chịu trách nhiệm chính.
- Giảm giá theo dịch vụ hoặc cả đơn, ghi lý do và người duyệt; phụ thu; tip tách khỏi doanh thu tính hoa hồng; phiếu sửa dịch vụ riêng khi cần.
- Các lần thanh toán: số tiền, thời điểm, phương thức, tài khoản nhận, trạng thái đối soát.

## 6.2. Quy tắc phân bổ doanh thu

Không chia doanh thu bằng cách nhân đôi hoá đơn. **Tổng phần doanh thu phân cho thợ = doanh thu dịch vụ thuần của đơn** (nếu chính sách cho phép phần 'không phân bổ' thì phải hiển thị riêng và có lý do).

Ví dụ: khách làm tổng **348.000đ**, Nhung thực hiện phần **239.000đ**, Chin làm phần **109.000đ**. Doanh thu cửa hàng = 348.000đ, doanh thu cá nhân Nhung = 239.000đ, Chin = 109.000đ; hoa hồng tạm tính tương ứng **59.750đ** và **27.250đ**. Không có chuyện đơn này tạo doanh thu quán 696.000đ.

Đối với giảm giá cả đơn, mặc định **phân bổ giảm giá theo tỷ lệ thành tiền trước giảm** để tổng vẫn khớp; khi làm tròn chênh vài đồng, phần chênh được đưa vào dòng cuối có quy tắc rõ ràng. Bất kỳ sửa đổi chia tiền sau khi hoàn thành đều phải ghi nhận ai sửa, lúc nào và lý do.

## 6.3. Trạng thái và sửa đơn

- Trạng thái thực hiện: **Nháp / Đang làm / Đã hoàn thành / Huỷ**.
- Trạng thái thanh toán độc lập: **Chưa thu / Thu một phần / Đã thu đủ / Hoàn một phần / Hoàn toàn bộ**.
- Đơn đã hoàn thành vẫn có thể chưa được thanh toán đủ; hai trạng thái không được gộp thành một.
- Đơn đã chốt/đóng ngày không được xoá vĩnh viễn. Điều chỉnh bằng **phiếu hoàn tiền, điều chỉnh hoặc huỷ có lý do**, theo quyền duyệt. Nếu lương tháng đó đã khóa, mọi ảnh hưởng hoa hồng/KPI được phản ánh bằng **phiếu điều chỉnh ở kỳ lương đang mở kế tiếp**, không sửa ngầm kỳ cũ.
- Sửa móng do lỗi nhân viên có thể là **phiếu xử lý dịch vụ** gắn đơn gốc, miễn phí, không tự tăng doanh thu. Nếu phát sinh bán thêm thì lập phần thu bổ sung.

## 6.4. Đơn hàng mỗi ngày

Màn hình danh sách có lọc: hôm nay, hôm qua, ngày tùy chọn; trạng thái; nhân viên; số điện thoại/tên khách; phương thức trả tiền; cơ sở. Hiển thị tổng đơn, doanh thu theo thợ, số lần khách đến, số đơn hoàn tiền, công nợ chưa thu, chiết khấu và so sánh hôm qua.

# 7. TIỀN THU, TIỀN CHI, SỔ QUỸ VÀ DÒNG TIỀN

## 7.1. Các khái niệm bắt buộc không được đánh đồng

| Chỉ số | Ý nghĩa | Ví dụ |
|---|---|---|
| **Doanh thu gộp** | Giá dịch vụ trước giảm/hoàn | Dịch vụ 500.000đ |
| **Doanh thu thuần** | Doanh thu được ghi nhận sau giảm/hoàn | Giảm 50.000đ → 450.000đ |
| **Tiền thực thu** | Tiền đã thực sự nhận trong kỳ | Khách mới trả 300.000đ |
| **Phải thu khách** | Phần khách chưa thanh toán | 150.000đ |
| **Chi tiền** | Tiền thật đã rời tài khoản/quỹ | Trả vật tư 100.000đ |
| **Số dư quỹ/ngân hàng** | Số dư đầu kỳ + dòng tiền vào − dòng tiền ra, có chuyển khoản nội bộ cân bằng | Không thể tính bằng 'doanh thu − chi phí' |
| **Lợi nhuận tạm tính** | Doanh thu thuần − chi phí được tính cho kỳ (gồm chi phí lương đã phát sinh), theo quy tắc báo cáo | Không đồng nhất với số dư tiền |

## 7.2. Tài khoản tiền

Mỗi khoản tiền có tài khoản nhận/chi: **Quỹ tiền mặt tại quán / Ngân hàng của quán / Tài khoản khác**. Tên tài khoản là cấu hình, không cố định cứng. Nếu chủ dùng tài khoản cá nhân lẫn tiền shop thì phải gắn nhãn riêng và ghi rõ các khoản thuộc cửa hàng, tránh lấy toàn bộ số dư cá nhân làm tiền quán. Thiết lập từng số dư mở sổ theo ngày bắt đầu dùng app.

Một đơn có thể thanh toán **200.000đ chuyển khoản + 148.000đ tiền mặt**. Tạo hai giao dịch nhận tiền, tổng đơn vẫn 348.000đ.

**Chuyển tiền nội bộ** từ tiền mặt sang ngân hàng phải tạo cặp bút toán: quỹ mặt −X và tài khoản ngân hàng +X. Đây **không phải thu nhập hoặc chi phí mới**. Khách đặt cọc tạo tiền vào và nghĩa vụ trả hàng/dịch vụ; chỉ ghi nhận doanh thu khi dịch vụ hoàn tất/đủ điều kiện theo quy ước.

## 7.3. Danh mục thu chi

- **Thu từ đơn hàng:** thu đúng mã đơn, tự cập nhật công nợ.
- **Thu ngoài đơn:** vốn góp chủ, vay, hoàn tiền nhà cung cấp, khoản thu khác; phân loại để không thổi phồng doanh thu.
- **Chi vận hành:** thuê nhà, điện nước, internet, vật tư nail, công cụ, sửa chữa, marketing, vệ sinh, đào tạo, phí chuyển khoản, phí nền tảng, chi khác.
- **Chi nhân sự:** tạm ứng, thanh toán lương, thưởng, hoàn ứng/chi hộ; gắn mã nhân viên, kỳ liên quan.
- **Chuyển tiền nội bộ:** chuyển giữa quỹ/tài khoản, không ảnh hưởng kết quả kinh doanh.
- **Rút tiền chủ / góp vốn chủ:** theo dõi riêng, không mặc định là chi phí kinh doanh.

Nhân viên chỉ tạo **đề nghị chi**, chưa ghi giảm quỹ. Nhung được duyệt khoản chi không vượt **hạn mức do Linh đặt**; khoản vượt hạn mức chuyển Linh duyệt. Chỉ khi có nghiệp vụ xác nhận thanh toán mới ghi tiền ra (không ghi trùng khi duyệt và khi chi). Hạn mức số tiền cụ thể thuộc danh sách cấu hình còn cần cung cấp tại mục 19.2.

Mỗi phiếu thu chi lưu ngày giao dịch, ngày hạch toán kỳ báo cáo (nếu khác), số tiền, tài khoản tiền, danh mục, người lập, người duyệt, chứng từ ảnh/tệp, ghi chú, cơ sở, trạng thái, và lịch sử sửa. Cho phép chi phí phát sinh kỳ này nhưng trả kỳ sau (phải trả) ở phiên bản phù hợp.

## 7.4. Chốt ca và đối soát

Cuối ca: hệ thống tính **tiền mặt lý thuyết đầu ca + thu − chi − chuyển ra + chuyển vào**; người chốt nhập tiền đếm được; phần mềm ghi chênh lệch, lý do và người duyệt. Với chuyển khoản/QR: có cờ **đã đối soát với sao kê**. Cảnh báo thu thiếu đơn, giao dịch chưa đối soát, và chi tiền không rõ tài khoản.

## 7.5. Báo cáo dòng tiền tháng

- Số dư đầu tháng theo từng tài khoản.
- Thu tiền từ khách trong tháng; thu khác.
- Chi nhà cung cấp; chi nhân sự; chi vận hành; rút vốn.
- Chuyển khoản nội bộ (hiển thị nhưng loại khỏi tổng thu chi toàn hệ thống).
- Số dư cuối tháng, từng tài khoản và toàn hệ thống.
- Dòng tiền vào/ra theo ngày, biểu đồ xu hướng; so sánh kế hoạch với thực tế (giai đoạn 2).
- **Cảnh báo:** nếu doanh thu lớn nhưng tiền thu nhỏ, hoặc quỹ thực tế không khớp, phải nổi bật vấn đề.

# 8. NHÂN SỰ, CA LÀM VÀ CHẤM CÔNG

## 8.1. Hồ sơ nhân viên

Mã nhân viên, họ tên, số liên hệ, ngày bắt đầu/kết thúc, cơ sở, vai trò, trạng thái làm việc, loại hợp đồng nếu cần, lương cứng từng giai đoạn, % hoa hồng từng giai đoạn, số ngày nghỉ hưởng tháng, tài khoản nhận lương, quyền sử dụng app.

## 8.2. Xếp ca

Lịch tuần/tháng, một hoặc nhiều ca trong ngày; quy định giờ bắt đầu/kết thúc và thời lượng nghỉ giữa ca; ngày nghỉ được yêu cầu trước, phê duyệt bởi quản lý/chủ; đổi ca có lịch sử. Giao diện theo lịch dễ xem trên điện thoại.

## 8.3. Chấm công

Đề xuất có ba kiểu dữ liệu tách biệt: **ca dự kiến / giờ chấm thực tế / công được duyệt để tính lương**. Điều này tránh nhầm việc nhân viên quên check-in thành tự động bị trừ lương.

Phiên bản đầu **bắt buộc có nút Vào ca/Ra ca trên điện thoại**, Nhung xem danh sách thiếu chấm công và phê duyệt công cuối ngày hoặc cuối kỳ. Quản lý có thể bổ sung công có lý do và audit log. Cho phép đi muộn, về sớm, nghỉ 0,5 ngày, làm ngày nghỉ, ca đổi, nghỉ có phép và không phép. Quy định trừ đi muộn, tăng ca, lễ tết sẽ để thành chính sách cấu hình **nếu chủ xác nhận**, không tự bịa công thức.

# 9. TÍNH LƯƠNG VÀ THƯỞNG LINDY

## 9.1. Quy tắc mẫu từ bảng hiện tại

Với tháng M, nhân viên E:

- `ngay_thang = số ngày lịch thực tế của tháng M`
- `nghi_huong = 3` (Nhung = 4), có hiệu lực theo chính sách của kỳ.
- `cong_chuan = ngay_thang - nghi_huong`
- `luong_ngay = luong_cung / cong_chuan`
- `dieu_chinh_cong = (nghi_huong - nghi_thuc_te_duoc_duyet) × luong_ngay`
- `hoa_hong = doanh_thu_ca_nhan_thuan × 25%`
- `thuong_KPI_Nhung = 0` nếu doanh thu quán dưới 85.000.000đ; `1% × doanh_thu_quan` khi đạt 85.000.000đ và dưới 102.000.000đ; `1,5% × doanh_thu_quan` khi từ 102.000.000đ. Ngưỡng phải cấu hình theo từng cơ sở và thời kỳ.
- `luong_phai_tra = luong_cung + dieu_chinh_cong + hoa_hong + thuong_KPI + thuong_them - cac_khoan_khau_tru_hop_le`
- `con_lai_chi_tra = luong_phai_tra - tam_ung_da_chi - luong_da_chi_truoc`

Công thức trên là **mô hình theo bảng hiện tại**, không thay thế việc chủ xác nhận các khoản khấu trừ khác (bảo hiểm, thuế TNCN, phạt hợp lệ, phụ cấp). Nếu không áp dụng thì để 0, không tự trừ.

**Tháng 31 ngày:** nhân viên thường chia lương ngày cho 28, Nhung cho 27. **Tháng 30 ngày:** lần lượt chia 27 và 26. Nếu không nghỉ ngày nào, phần điều chỉnh dương bằng 3 hoặc 4 ngày lương tương ứng. Tháng 28/29 ngày tự tính theo lịch.

**Chú ý về ngưỡng quản lý (đã chốt):** Tháng doanh thu 85 triệu → Nhung được thưởng KPI 850.000đ; tháng 102 triệu → 1.530.000đ. Đây là cơ chế nhảy bậc theo **toàn doanh thu quán**, không phải chỉ phần vượt. Đã được chủ chốt tại D09; khi triển khai cần nhập chính xác cấu hình KPI cho từng cơ sở, có lịch sử thay đổi.

## 9.2. Quy trình bảng lương

1. Trong tháng, hiển thị **lương tạm tính** theo doanh thu đã hoàn thành và công đã duyệt.
2. Cuối tháng, phần mềm đối chiếu doanh thu, hoàn tiền và ngày nghỉ. Chủ nhập/duyệt thưởng thêm, khoản trừ, tạm ứng.
3. Ngày **05 tháng kế tiếp**: tạo bản nháp lương tháng trước để chủ kiểm tra (có thể cấu hình lịch chạy). **Không tự thanh toán lương.**
4. Chủ ấn **Khoá bảng lương** → sinh bản chốt có toàn bộ tham số, số liệu và thời điểm duyệt.
5. Khi thực chi lương, sinh giao dịch tiền ra từ tài khoản; cập nhật còn nợ lương. **Không tính chi phí lương hai lần** chỉ vì có nghiệp vụ trả tiền sau ngày chốt.
6. Nếu phát hiện sai lệch sau khi đã khóa kỳ, tạo **phiếu điều chỉnh vào kỳ tiếp theo còn mở** (tham chiếu kỳ gốc, lý do và người duyệt); không ghi đè kỳ cũ.

Màn hình lương có hai chế độ: tổng hợp toàn cơ sở **cho Linh và Nhung (Nhung chỉ xem)**; phiếu lương cá nhân dành cho người lao động. Xuất bảng lương chỉ chủ có quyền mặc định; nếu cần cho Nhung tải phải cấp `payroll.export_all_branch` riêng. Có PDF/export bảng lương kỳ.

# 10. CRM — KHÁCH HÀNG LINDY (D10-B, ĐÃ CHỐT)

## 10.1. Hồ sơ khách ở phiên bản đầu: tối giản

CRM chỉ cần **ba nhóm thông tin**: (1) **tên khách**, (2) **số điện thoại** nếu khách cung cấp (không bắt buộc), (3) **lịch sử đơn hàng** được tạo tự động từ giao dịch. Mỗi khách có mã nội bộ kỹ thuật để liên kết. Không yêu cầu khách đăng ký, tạo mật khẩu hoặc điền biểu mẫu dài.

- Màn hình danh sách: tìm nhanh theo tên/SĐT, danh sách lượt ghé gần đây; bấm vào tên xem các đơn, thời gian, dịch vụ và số tiền của từng đơn.
- Khách không muốn cho SĐT vẫn lập đơn bình thường. Cùng tên **không tự suy ra cùng một người**; việc gộp hồ sơ cần xác minh và người có quyền thực hiện.
- Không tạo trường ngày sinh, sở thích/màu móng, ảnh bộ móng, thợ yêu thích, phân hạng VIP, nhắc chăm sóc, marketing automation hay thống kê nguồn khách bắt buộc ở CRM bản đầu. Những phần này là gợi ý mở rộng **chưa được yêu cầu triển khai**.
- Khách đi nhiều cơ sở: sử dụng **mã khách chung cấp tổ chức** và có bộ lọc lịch sử từng cơ sở, phân quyền theo cơ sở khi xem.

## 10.2. Số liệu khách hàng có thể suy ra từ các đơn

Có thể hiển thị **số khách mới, khách quay lại, số đơn/khách, tổng tiền đơn đã hoàn tất và lần đến gần nhất**, chỉ bằng cách tổng hợp lịch sử đơn mà không thêm dữ liệu CRM. Khách không định danh (khách lẻ không tên/SĐT) chỉ đếm theo đơn/lượt, không đưa vào tỷ lệ quay lại theo định danh.

## 10.3. Xử lý khiếu nại là nghiệp vụ đơn hàng, không phải mở rộng CRM

Khi khách yêu cầu sửa, quản lý lập **phiếu xử lý gắn mã đơn gốc**; không cần hồ sơ chăm sóc khách phức tạp. Giữ chính sách đã duyệt: **lỗi do nhân viên → sửa miễn phí; khách đổi màu theo ý mình → sửa có phí; nếu khách không đồng ý sửa, Nhung có thể đề xuất ưu đãi 10–20% bill sau** theo quyền hạn. Những ưu đãi tương lai cần chủ xem chính sách trước khi áp dụng; bản đầu nhập giảm giá có lý do và duyệt.

**Ngoài phạm vi V1:** sinh nhật, sở thích cá nhân, thư viện ảnh khách, nhắc quay lại, thẻ VIP, điểm thưởng, voucher tự động, gửi tin nhắn marketing.

# 11. BÁO CÁO QUẢN TRỊ

## 11.1. Báo cáo hàng ngày

- Đơn hoàn thành, đơn huỷ/hoàn, lượt khách, doanh thu gộp, chiết khấu, doanh thu thuần.
- Doanh thu theo nhân viên: phần tham gia của thợ nào cộng cho người đó, không trùng tổng quán.
- Tiền thực thu theo phương thức/tài khoản; còn phải thu; thu từ đơn ngày trước.
- Tổng thu khác, tổng chi theo nhóm; biến động sổ quỹ.
- Khách mới/quay lại (chỉ khi nhận diện được hồ sơ), sự cố dịch vụ gắn đơn; không yêu cầu báo cáo kênh marketing giai đoạn đầu.
- So sánh với hôm qua, cùng thứ tuần trước, bình quân 7 ngày (khi có đủ dữ liệu).

## 11.2. Báo cáo tháng

- Doanh thu từng ngày, cơ cấu dịch vụ, thợ, cơ sở; chiết khấu/hoàn tiền.
- Tổng thu/chi và số dư đầu–cuối tháng; tiền mặt và ngân hàng tách biệt.
- Chi phí nhóm cố định/biến đổi; **lợi nhuận vận hành ước tính**, bảng giải thích cách tính.
- Lương phải trả, lương đã trả, lương còn nợ, tạm ứng còn cần cấn trừ.
- KPI quản lý, hiệu quả nhân viên theo ngày công, số đơn và doanh thu.
- Khách mới, khách quay lại được xác định từ lịch sử đơn, top thợ, top dịch vụ; chưa có phân khúc VIP ở phiên bản đầu.
- Xuất CSV/XLSX/PDF; báo cáo chốt tháng không bị biến động ngược khi chỉnh dữ liệu đã khoá.

## 11.3. Dự báo dòng tiền (giai đoạn 2)

Dự báo 7/30 ngày từ số dư hiện tại, khoản phải thu, tiền cần trả lương, tiền nhà, chi phí cố định và các khoản phải trả dự kiến. Hiển thị **tình huống dự báo**, không tự coi doanh thu tương lai là tiền chắc chắn sẽ thu.

# 12. NGUYÊN TẮC DỮ LIỆU — MỘT NGUỒN SỰ THẬT

**Chuỗi xử lý chuẩn:** `Appointment` (nếu có) → `Order + OrderItem + StaffAllocation` → Nhung xác nhận → tính doanh thu → `Payment` sinh dòng tiền → `CashLedger` phản ánh tài khoản → `Payroll` lấy phần doanh thu cá nhân đã được duyệt → `CRM` chỉ liên kết tên/SĐT với lịch sử đơn → `Reports` tổng hợp từ các nguồn gốc này.

Không được nhập một khoản doanh thu riêng vào 3 màn hình. Không được lưu con số tổng lương cố định mà thiếu chi tiết tạo nên nó. Không dùng Google Sheets làm cơ sở dữ liệu cập nhật hai chiều trong vận hành chính thức.

## 12.1. Các bảng dữ liệu lõi đề xuất

| Bảng | Trường quan trọng (rút gọn) |
|---|---|
| `organizations` | id, name, timezone, currency |
| `branches` | id, organization_id, name, status |
| `users` / `roles` / `role_permissions` | account, branch_scope, permission, status |
| `staff` | id, user_id?, branch_id, name, status, hire_date |
| `staff_policy_versions` | staff_id, effective_from/to, base_salary, commission_rate, allowed_leave_days, KPI configuration |
| `customers` | id, organization_id, name, phone? (unique không bắt buộc), created_at; không lưu ảnh/ngày sinh/sở thích bản đầu |
| `services` / `price_versions` | id, name, category, price, effective_from/to |
| `orders` | id, branch_id, customer_id?, service_status, payment_status, completed_at, created_by |
| `order_items` | id, order_id, service_id, quantity, unit_price_snapshot, discount, net_amount |
| `order_staff_allocations` | id, order_item_id, staff_id, allocated_net_amount, allocation_type |
| `payments` | id, order_id?, amount, paid_at, method, money_account_id, reconciliation_status |
| `money_accounts` | id, branch_id, name, type, opening_balance, currency |
| `cash_ledger_entries` | id, entry_type, account_id, amount_signed, occurred_at, reference_type/id, reversal_of_id? |
| `expenses` / `payables` | id, branch_id, category, accrued_at, paid_at?, amount, status, receipt_url? |
| `shifts` / `attendance` / `leave_requests` | branch_id, staff_id, scheduled times, check_in/out timestamps, approved_work_units, approved_by |
| `payroll_periods` / `payroll_lines` | year_month, staff_id, snapshot, approved_at, status, amount_due, amount_paid, adjustment_origin_id? |
| `order_service_tickets` | id, order_id, complaint_type, resolution, status; phiếu xử lý gắn đơn, không bắt buộc gắn hồ sơ CRM |
| `appointments` | id, branch_id, customer_id?, staff_id?, service_id?, start_at, end_at?, status, created_by |
| `expense_requests` / `expense_approvals` | requester_id, approver_id, limit_rule_snapshot, amount, status, approved_at |
| `audit_logs` | actor, action, entity, before/after, timestamp, reason; bao gồm truy cập bảng lương toàn cơ sở |

Chú ý kỹ thuật: số tiền lưu bằng **số nguyên VND** (không dùng floating point) hoặc decimal chính xác; chia tiền phải xử lý làm tròn có tổng kiểm soát. Tất cả bảng giao dịch có khoá ngoại, dấu thời gian, cơ sở, người tạo/cập nhật và trạng thái xoá mềm nếu cần.

## 12.2. Những invariant cần kiểm tra phía máy chủ

1. Tổng `order_staff_allocations` không vượt doanh thu thuần được phân bổ; trường hợp thấp hơn phải được đánh dấu khoản chưa phân bổ và lý do.
2. Tổng `payments` đã xác nhận trừ tiền hoàn ≤ số phải thu hợp lệ, trừ khi là tiền tip/đặt cọc được lưu tách biệt.
3. Không tạo hai khoản thu trùng do khách bấm thanh toán hai lần: dùng khóa chống gửi trùng/idempotency.
4. Không sửa trực tiếp thanh toán đã đối soát; dùng nghiệp vụ đảo/hoàn/điều chỉnh có lịch sử.
5. Không thể thay đổi số dư quỹ bằng sửa số hiển thị; mọi thay đổi phải qua giao dịch/chốt quỹ có lý do.
6. Mọi báo cáo có cơ sở, múi giờ và quy ước ngày; mặc định `Asia/Ho_Chi_Minh`.
7. Kỳ lương đã khoá và kỳ tài chính đã khoá chỉ được điều chỉnh qua phiên bản/bút toán mới.
8. Chỉ Nhung có quyền `payroll.read_all_branch` theo cơ sở và Linh có quyền toàn tổ chức; nhân viên không thể gọi API để đọc lương người khác.
9. Một khoản chi chưa được duyệt/chi thực tế không được tự giảm số dư quỹ.
10. CRM bản đầu không phát sinh trường hay chức năng chăm sóc khách ngoài tên/SĐT/lịch sử đơn; lịch hẹn và ticket sửa là các phân hệ riêng.

# 13. HÀNH TRÌNH NGƯỜI DÙNG (USER FLOW)

### A. Khách đến làm nail

Thợ tạo đơn nháp → chọn khách cũ theo SĐT hoặc tạo khách lẻ → thêm dịch vụ/nhập nhanh → gán thợ → Nhung duyệt/hoàn tất → Nhung xác nhận tiền trả theo phương thức → in/gửi hóa đơn nếu cần → đơn xuất hiện trong doanh thu ngày; số dư quỹ tăng theo tiền thực thu; hoa hồng thợ tạm tăng; lịch sử CRM cập nhật.

### A2. Đặt lịch trước khi đến

Linh/Nhung/thợ được cấp quyền tạo lịch hẹn cơ bản → chọn ngày giờ/dịch vụ/thợ → xác nhận/hủy → khi khách đến chuyển lịch thành đơn nháp → Nhung xác nhận khi dịch vụ hoàn tất. Lịch hẹn chưa hoàn thành không tự ghi doanh thu và tiền.

### B. Khách trả thiếu / trả sau

Đơn hoàn tất 500.000đ, thu trước 300.000đ → doanh thu ngày hoàn thành 500.000đ, tiền thu 300.000đ, phải thu 200.000đ. Hôm sau thu 200.000đ → **không tăng doanh thu ngày hôm sau**, chỉ tăng dòng tiền và giảm công nợ.

### C. Quán mua vật tư

Người có quyền tạo phiếu chi 650.000đ, chọn 'Vật tư', chọn tài khoản ngân hàng, đính kèm chứng từ, duyệt → số dư ngân hàng giảm 650.000đ; chi phí được tính vào kỳ theo quy tắc kế toán quản trị. Nếu đã ghi nhận phải trả trước đó thì việc chi tiền chỉ tất toán công nợ, không tự nhân đôi chi phí.

### D. Chốt ngày

Quản lý mở màn hình Chốt ngày → xem đơn chưa thanh toán, thanh toán chưa đối soát, quỹ tiền mặt thực đếm, phiếu chi chưa duyệt → xử lý chênh lệch → khoá ngày. Chủ vẫn xem được báo cáo, và việc sửa sau chốt phải theo quyền.

### E. Mùng 5 chốt lương

Hệ thống tổng hợp tháng trước → Nhung được xem toàn bộ bảng lương để đối chiếu nhưng **không sửa hay chốt** → Linh kiểm tra công, doanh thu, thưởng, tạm ứng → duyệt bản lương → xuất phiếu lương → khi chuyển tiền đánh dấu đã chi để giảm quỹ; người lao động xem phiếu của mình nếu mở quyền.

### F. Khách phàn nàn hoặc yêu cầu sửa

Nhung tìm đơn gốc → tạo phiếu chăm sóc → phân loại lỗi nhân viên hoặc khách đổi ý → chỉ định sửa miễn phí/có phí/đề xuất ưu đãi kỳ sau → theo dõi đến hoàn tất; không xoá doanh thu đơn cũ khi chưa có nghiệp vụ hoàn/giảm thực tế.

# 14. THIẾT KẾ CÁC MÀN HÌNH CẦN VIBE CODE

| Mã | Màn hình | Thành phần không được thiếu | Vai trò |
|---|---|---|---|
| UI01 | Đăng nhập & chọn cơ sở | SĐT/email, đăng nhập, cơ sở, quyền | Mọi người |
| UI02 | Tổng quan ngày/tháng | Doanh thu, tiền thu, chi, số dư, công nợ, cảnh báo | Chủ / quản lý (theo quyền) |
| UI03 | Danh sách đơn hàng | Tìm kiếm, lọc, số đơn, trạng thái, nhân viên | Người được phân quyền |
| UI04 | Tạo/sửa đơn | Khách, dịch vụ, phân bổ thợ, giảm giá, tiền thu | Thu ngân / quản lý |
| UI05 | Chi tiết đơn | Timeline trạng thái, phân bổ, thanh toán, hoàn/sửa, audit | Người được phân quyền |
| UI06 | Thu chi & sổ tiền | Tài khoản, giao dịch, chứng từ, danh mục | Chủ / kế toán |
| UI07 | Chốt ca & đối soát | Đếm quỹ, chênh lệch, đơn chưa thu, chuyển khoản | Quản lý / thu ngân |
| UI08 | Lịch ca & ngày nghỉ | Lịch tuần/tháng, check-in/out, duyệt nghỉ/đổi ca và công | Nhân viên / quản lý |
| UI09 | Bảng công & nhân viên | Công dự kiến/thực tế/duyệt, hồ sơ, chính sách | Chủ / quản lý |
| UI10 | Bảng lương | Tạm tính, chốt, lịch sử kỳ, khoản ứng, xuất phiếu; Nhung chỉ xem lương tất cả nhân viên | Chủ (sửa/chốt), Nhung (xem), nhân viên (xem của mình) |
| UI11 | Danh sách khách | Tìm tên/SĐT; xem lịch sử đơn hàng cơ bản | Nhân viên có quyền |
| UI12 | Hồ sơ khách | Tên, điện thoại (nếu có), lịch sử đơn; không có CRM nâng cao | Nhân viên có quyền |
| UI13 | Báo cáo | Bộ lọc ngày/tháng/cơ sở/nhân viên; xuất file | Chủ / quản lý |
| UI14 | Cài đặt | Dịch vụ, giá, cơ sở, quyền, chính sách, hạn mức duyệt chi, sao lưu | Chủ |
| UI15 | Lịch hẹn | Lịch ngày/tuần, đặt lịch, thợ, dịch vụ, xác nhận/hủy, tạo đơn từ lịch | Chủ / Nhung / thợ theo quyền |
| UI16 | Duyệt chi | Đề nghị chi của nhân viên, hạn mức Nhung được duyệt, chuyển Linh duyệt chi lớn | Chủ / Nhung / người đề nghị |

Trên mobile, ưu tiên **card dạng tóm tắt**, bảng dài có trang riêng và lọc, ô nhập tiền có bàn phím số. Các nút nguy hiểm như “Huỷ đơn”, “Hoàn tiền”, “Khoá lương” cần xác nhận rõ.

# 15. THIẾT KẾ KỸ THUẬT ĐỀ XUẤT (KHÔNG RÀNG BUỘC NHÀ CUNG CẤP)

- **Frontend:** Next.js/React với TypeScript, giao diện responsive, triển khai dạng PWA để ghim lên điện thoại.
- **Backend/database:** PostgreSQL; có thể dùng Supabase cho xác thực, cơ sở dữ liệu, lưu chứng từ và phân quyền hàng dữ liệu, hoặc một backend tương đương có kiểm soát đầy đủ.
- **Bảo mật:** kiểm tra quyền ở phía máy chủ với tất cả API, không chỉ ẩn nút; mật khẩu không lưu dạng rõ; phiên đăng nhập an toàn; nhân viên chỉ truy cập dữ liệu được cấp phép; lịch sử truy cập và sửa số tiền.
- **Độ tin cậy:** sao lưu tự động, kiểm thử khôi phục, môi trường thử nghiệm riêng với dữ liệu ẩn danh, cấu hình môi trường, không đưa khóa bí mật vào frontend. Có import/export CSV.
- **Giao dịch:** các thao tác liên quan đơn–thanh toán–sổ quỹ phải chạy trong transaction có ràng buộc. Hoàn tiền phải có bản ghi đảo, không xoá mất dấu.
- **Hiệu năng:** màn hình hôm nay/tháng tải nhanh trên 4G; danh sách chia trang, tìm khách nhanh; dashboard có thời điểm dữ liệu cập nhật.
- **Quy ước:** VND; hiển thị `1.250.000đ`; múi giờ `Asia/Ho_Chi_Minh`; định dạng `dd/mm/yyyy`; đầu kỳ tháng theo giờ Việt Nam.
- **Khả năng offline:** KHÔNG giả định có offline ở V1; nếu cần nhập đơn lúc mất mạng phải thiết kế hàng đợi đồng bộ/chống trùng riêng, không chỉ gọi PWA là đã offline.
- **Tích hợp tương lai:** Google Sheets (nhập dữ liệu ban đầu hoặc xuất báo cáo), QR ngân hàng/đối soát sao kê, Zalo OA, lịch đặt hẹn, nhiều chi nhánh. Tích hợp tự động cần API/đối tác và quyền truy cập thực tế.

# 16. DI CHUYỂN DỮ LIỆU TỪ GOOGLE SHEETS

Nguồn tham chiếu hiện có: **LINDY - Doanh thu & Lương - CS 31/49 HTK** (Google Sheets) gồm tab tháng 10/2026, bảng lương, lưu doanh thu 2025/2026 và thu chi cũ.

Kế hoạch nhập dữ liệu:
1. Trích dữ liệu gốc và **sao lưu bản bất biến** trước khi xử lý.
2. Mapping tên thợ, tên khách, ngày/tháng, từng khoản doanh thu theo thợ thành `orders` + `order_staff_allocations`; CRM chỉ nhận tên/SĐT nếu có và lịch sử đơn.
3. Phát hiện bản ghi trống, trùng, sai ngày, sai tổng tiền, tên khách gần giống; lập danh sách lỗi để người quản lý duyệt.
4. Dữ liệu cũ thiếu chi tiết dịch vụ/thanh toán → để nhãn **“không rõ dịch vụ / chưa biết đã thu tiền”**, KHÔNG tự suy luận doanh thu cũ = đã thu tiền.
5. Lương cũ có thể nhập dạng bản chốt lịch sử, không tự tạo lại phiếu chi ngân hàng nếu không có dữ liệu chứng minh đã trả.
6. Nhập số dư quỹ đầu kỳ đã đối soát vào một **ngày bắt đầu dùng app**; tránh cộng chồng với giao dịch quá khứ.
7. Chạy song song báo cáo app và bảng tính trong ít nhất một kỳ kiểm thử; sau đó quyết định nguồn vận hành chính để dừng nhập trùng.

# 17. LỘ TRÌNH PHÁT TRIỂN — TRÁNH CODE DÀN TRẢI

## P0 — Nền móng bắt buộc

Tài khoản, cơ sở, quyền, danh mục nhân viên/dịch vụ/khách, cấu hình chính sách có lịch sử, cơ sở dữ liệu, audit log, nhập dữ liệu thử. Dựng khung giao diện mobile và menu.

## P1 — MVP thực sự chạy quán (ưu tiên cao nhất)

**Thợ tạo đơn nháp + Nhung xác nhận + chia thợ + thanh toán nhiều lần + sổ tiền + đề nghị/duyệt chi + dashboard ngày/tháng + lịch hẹn cơ bản + check-in/out và duyệt công + tính lương tạm/chốt + Nhung xem lương toàn bộ + CRM tên/SĐT/lịch sử đơn + báo cáo + chốt ngày + xuất dữ liệu.**

Đây là tập tính năng chủ chốt, dù có thể phát hành theo nhiều nhịp nhỏ. Tuyệt đối không xây biểu đồ đẹp trước khi chốt được định nghĩa doanh thu, tiền và lương.

## P2 — Nâng cao vận hành

Nhắc hẹn tự động, đặt lịch online, quản lý vật tư/tồn kho và giá vốn theo tiêu hao, công nợ nhà cung cấp, phiếu bảo hành/sửa lại nâng cao, khách VIP/thẻ liệu trình, chăm sóc tự động khi có đồng ý, dự báo dòng tiền, cảnh báo KPI.

## P3 — Mở chuỗi

Dashboard tập đoàn/cơ sở, phân quyền nhiều tầng, kho và chuyển vật tư giữa các cơ sở, nhân viên làm liên cơ sở, tính doanh thu và hoa hồng theo địa điểm thực hiện, bảng tiêu chuẩn đồng bộ và so sánh cơ sở.

# 18. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE TESTS)

1. Một khách tổng 348.000đ chia Nhung 239.000đ và Chin 109.000đ → doanh thu quán 348.000đ, không nhân đôi.
2. Cùng đơn nhận 200.000đ QR và 148.000đ tiền mặt → hai tài khoản tăng đúng, công nợ bằng 0.
3. Đơn 500.000đ thu 300.000đ hôm nay, 200.000đ ngày mai → doanh thu ngày đầu 500.000đ; ngày sau chỉ có thu tiền 200.000đ, không thêm doanh thu.
4. Giảm 10% trên đơn nhiều dịch vụ/thợ → tổng phân bổ sau giảm khớp doanh thu thuần 100%, không lệch do làm tròn.
5. Hoàn tiền 100.000đ sau khi chốt đơn → có lý do và chứng từ, báo cáo doanh thu/hoa hồng và dòng tiền điều chỉnh theo đúng chính sách kỳ.
6. Chuyển 2.000.000đ tiền mặt sang ngân hàng → tổng tiền toàn cửa hàng không đổi, không tăng doanh thu hay chi phí.
7. Thu tiền vốn góp 20.000.000đ → tăng quỹ nhưng không tăng doanh thu dịch vụ.
8. Chi mua vật tư 650.000đ → giảm tài khoản được chọn; nếu mua nợ rồi mới trả thì không trùng chi phí.
9. Tháng 31 ngày, nhân viên hưởng 3 nghỉ và nghỉ thực tế 2 ngày → cộng 1 ngày lương theo chia 28.
10. Nhung tháng 31 ngày hưởng 4 nghỉ, nghỉ thực tế 4 → không tăng/giảm lương công; lương ngày chia 27.
11. Toàn quán đạt 84.999.999đ → không có thưởng KPI Nhung; đạt 85.000.000đ → 1%; đạt 102.000.000đ → 1,5% trên toàn doanh thu quán.
12. Nhân viên chỉ xem được doanh thu và phiếu lương của chính mình (nếu được bật); không gọi API để đọc lương người khác. **Nhung xem được toàn bộ bảng lương nhân viên của cơ sở, kể cả Linh nếu Linh có dòng lương, nhưng không sửa/khóa/chuyển tiền lương được**.
13. Thay tỷ lệ hoa hồng vào tháng 11 không đổi bản lương đã chốt của tháng 10.
14. Khoá ngày và khoá lương xong không thể xoá âm thầm; có bản điều chỉnh, người thực hiện và lý do.
15. Khách lẻ không SĐT vẫn lập và thanh toán đơn; không tạo hồ sơ giả bắt buộc.
16. Khách quay lại tìm thấy lịch sử từ nhiều lần giao dịch; không tự gộp hồ sơ chỉ vì tên giống. CRM chỉ có tên, điện thoại và lịch sử đơn; không yêu cầu ảnh, sinh nhật, sở thích hay VIP.
17. Nhấn lưu thanh toán hai lần do mạng chập chờn không tạo hai khoản thu.
18. Số dư cuối tháng = số dư đầu + thu thực − chi thực theo từng tài khoản, chuyển nội bộ không làm sai tổng.
19. Xuất dữ liệu về máy được; sao lưu được; thử khôi phục thành công.
20. Màn hình tạo đơn, nhận tiền, xem báo cáo không phải cuộn ngang bảng trên điện thoại.
21. Thợ tạo đơn nháp thành công nhưng không thể tự đánh dấu đã nhận đủ tiền; Nhung xác nhận hoặc Linh xử lý ngoại lệ.
22. Nhân viên gửi đề nghị chi 300.000đ; chưa được duyệt và chưa thanh toán thì số dư không đổi. Nhung chỉ duyệt nếu nằm trong hạn mức; vượt hạn mức phải có Linh.
23. Nhân viên check-in/out, Nhung duyệt công; nhân viên quên check-in không tự động bị trừ lương nếu chưa được xác minh.
24. Khách đặt lịch cơ bản, chọn dịch vụ, thợ và thời gian; thay đổi/hủy có trạng thái, không làm phát sinh doanh thu khi chưa hoàn thành dịch vụ.
25. Đơn đã chốt lương sau đó mới hoàn 100.000đ: ghi nhận phiếu điều chỉnh ở kỳ lương mở tiếp theo, kỳ cũ không đổi.
26. Khách có giao dịch ở cơ sở 1 và cơ sở 2: hồ sơ tên/SĐT chung tổ chức, đơn vẫn gắn đúng cơ sở; dữ liệu tiền và lương không nhập lẫn.
27. Nhung không thể xem số dư tài khoản cá nhân/chủ hoặc lãi ròng qua API dù có quyền xem bảng lương cơ sở.
28. Khoản giảm giá bản đầu có lý do và người duyệt; không tự kích hoạt Happy Hours, voucher, điểm thưởng hoặc VIP.
29. Khi nhập lịch sử, các bill cũ thiếu bằng chứng thanh toán không tự sinh giao dịch tăng quỹ; ngày mở sổ không cộng đúp số dư.

# 19. SỔ QUYẾT ĐỊNH DISCOVERY ĐÃ CHỐT VÀ THAM SỐ CHỜ ĐIỀN

## 19.1. Quyết định của chủ cửa hàng — CHỐT 16/16 (10/10/2026)

| Mã | Quyết định đã chốt | Phạm vi chính |
|---|---|---|
| **D01 — A** | Thợ tạo đơn nháp; Nhung xác nhận bill/thanh toán; Linh duyệt ngoại lệ | Đơn hàng, quyền |
| **D02 — A** | Chia doanh thu thợ theo dịch vụ; có nhập nhanh tổng bill rồi chia thủ công | Đơn, hoa hồng |
| **D03 — A** | Hoa hồng theo doanh thu thuần sau giảm giá của dịch vụ hoàn thành; không gồm tip; chưa thu đủ vẫn ghi doanh thu | Doanh thu, lương |
| **D04 — A** | Hoàn/sửa trong kỳ còn mở; kỳ lương đã khóa thì điều chỉnh ở kỳ kế tiếp | Đơn, audit, lương |
| **D05 — A** | Quản lý nhiều quỹ/tài khoản, kể cả tài khoản cá nhân nhận tiền quán; đối soát và chuyển quỹ | Thu chi, sổ tiền |
| **D06 — A** | Nhân viên đề nghị chi; Nhung duyệt trong hạn mức; Linh duyệt khoản lớn | Thu chi, quyền |
| **D07 — A** | Nhập số dư đầu kỳ, công nợ khách và nhà cung cấp đầu kỳ | Sổ tiền, công nợ |
| **D08 — A** | Lịch ca, nhân viên check-in/out trên điện thoại, Nhung duyệt công; không tự phạt đi muộn | Ca, công |
| **D09 — A** | Giữ lương công thức và KPI từ bảng tháng 10/2026; chốt qua Linh sau ngày 5; quy tắc có ngày hiệu lực | Lương, KPI |
| **D10 — B** | **CRM chỉ gồm tên khách, SĐT (nếu có), lịch sử đơn.** Không làm CRM 360° ở bản đầu | CRM |
| **D11 — A** | Lịch hẹn cơ bản có ngay bản đầu; nhắc tự động tích hợp sau | Lịch hẹn |
| **D12 — A** | Giảm giá thủ công có lý do/duyệt ở bản đầu; Happy Hours/VIP/voucher tự động để sau | Khuyến mãi |
| **D13 — A + bổ sung** | **Nhung được XEM lương toàn bộ nhân viên cơ sở**. Không tự sửa/chốt/chi lương; không mặc định thấy lãi ròng/số dư chủ | Quyền, lương |
| **D14 — A** | Đưa dữ liệu 2025–2026 vào hệ thống dạng lịch sử/đối chiếu; chuyển sang app là nguồn chính khi go-live | Nhập dữ liệu |
| **D15 — A** | Mobile-first web PWA; thử cùng Linh & Nhung trước, sau mở cho thợ; V1 yêu cầu internet | Triển khai |
| **D16 — A** | Thiết kế hỗ trợ nhiều cơ sở ngay từ đầu; CRM có thể dùng chung, tiền/lương/giá/KPI tách theo cơ sở | Kiến trúc |

**Ưu tiên khi có mâu thuẫn trong tài liệu cũ:** Các quyết định D01–D16 ở bảng này là nguồn sự thật có hiệu lực. Các ý tưởng CRM nâng cao, tính năng VIP, automation, ảnh bộ móng là tương lai, **không được tự thêm vào MVP**. Vai trò Nhung có quyền đọc bảng lương toàn bộ cơ sở dù chính sách mặc định phân quyền quản lý thông thường có thể khác.

## 19.2. Dữ liệu thực tế cần điền vào màn hình cấu hình trước khi vận hành

Đây không phải các lựa chọn discovery còn mở; chủ đã chốt cách ứng dụng hoạt động. Người triển khai cần thu thập các **giá trị thực tế** trước lúc chạy dữ liệu thật:

| Tham số | Trạng thái và cách xử lý |
|---|---|
| Ngày bắt đầu dùng app chính thức và kỳ đối soát số dư | Chưa cung cấp. Thiết kế ô cấu hình; không tự đặt ngày mở sổ |
| Danh sách quỹ nhận/chi, quỹ cá nhân sử dụng cho tiền quán, số dư đầu kỳ | Chưa cung cấp. Tạo danh mục trống để Linh nhập; không được bịa số dư |
| Công nợ khách/nhà cung cấp tại thời điểm mở sổ | Chưa cung cấp. Nhập danh sách có chứng từ/nguồn; có thể đánh dấu chưa đối soát |
| Hạn mức tiền Nhung được duyệt và danh mục khoản chi cần Linh duyệt | Chưa cung cấp. Không mở quyền duyệt chi tiền thật nếu cấu hình chưa hoàn tất |
| Giờ mở cửa, tên/giờ ca, xử lý nghỉ lễ/đổi ca, cách sửa chấm công | Chưa cung cấp. Lịch ca để cấu hình, không tự phạt hoặc giả định giờ công |
| Danh mục dịch vụ, bảng giá, khuyến mãi đang áp dụng | Chưa cung cấp. Có giao diện quản lý danh mục, nhập dữ liệu trước go-live |
| Lương cứng từng nhân viên và danh sách nhân sự tại ngày go-live | Đang tham khảo Sheets tháng 10/2026: Linh 3,5tr; Nhung 7tr; Chin 4tr; Trang 3,5tr; hoa hồng 25%. Xác nhận thay đổi nếu có khi go-live |
| Thiết lập bảo mật khi Nhung xem lương của mọi người (tải về hay không, thời hạn truy cập) | Mặc định chỉ xem; **không được xuất toàn bộ** nếu Linh chưa cấp riêng; ghi lịch sử xem |
| Dữ liệu 2025–2026 thiếu SĐT, dịch vụ hay thanh toán | Nhập các trường có bằng chứng; phần thiếu để không rõ và không tạo tiền giả |

## 19.3. Định nghĩa hoàn tất chốt sản phẩm (Definition of Done)

- Bắt buộc hoàn thành toàn bộ test chính từ mục 18; đặc biệt D10 và D13.
- Mọi nút chuyển tiền/duyệt chi/thanh toán phải có kiểm thử phân quyền và xử lý gửi trùng.
- Phải dùng dữ liệu mẫu/giả lập khi chạy thử. Chỉ bật vận hành thật sau khi Linh xác nhận ngày mở sổ, tài khoản tiền và số dư.
- Mọi giao diện và API phải thể hiện đúng phạm vi quyền của Linh, Nhung, thợ và theo cơ sở.

# 20. PROMPT BÀN GIAO CHO NGƯỜI VIBE CODE

> Bạn là senior full-stack engineer và product engineer. Hãy sử dụng tài liệu **LINDY OS — Đặc tả sản phẩm V1.0** làm nguồn yêu cầu nghiệp vụ. Đầu tiên hãy lập cấu trúc hệ thống, schema dữ liệu, ma trận vai trò–quyền, và kế hoạch triển khai theo thứ tự P0 → P1 → P2. **Không code toàn bộ ứng dụng trong một lần.** Ưu tiên luồng đơn hàng → phân bổ doanh thu nhân viên → thanh toán → sổ tiền → bảng công/lương → CRM → báo cáo. Cần phát hành từng module có giao diện mobile-first và kiểm thử tự động với các tình huống nghiệm thu. Mọi số tiền và chính sách lương phải dùng phép tính chính xác, có lịch sử và ngày hiệu lực; tuyệt đối không lưu tổng doanh thu ở nhiều nguồn độc lập. Các quyết định D01–D16 tại mục 19.1 đã chốt, không hỏi lại. Chỉ thu thập tham số triển khai ở mục 19.2 trước khi sử dụng dữ liệu thật; không tự suy đoán giá trị tiền, hạn mức, giờ ca. Đặc biệt CRM V1 chỉ gồm tên/SĐT/lịch sử đơn; Nhung được đọc lương toàn cơ sở nhưng không được sửa, khóa, trả lương, không được truy cập lợi nhuận và số dư chủ. Hãy triển khai màn lịch hẹn cơ bản ở P1, chưa làm tự động gửi tin hoặc VIP.

---

**Kết luận:** LINDY OS kết nối đơn hàng → tiền → công, lương → CRM; ưu tiên số liệu chính xác và phân quyền đúng trước khi bổ sung tính năng nâng cao.
