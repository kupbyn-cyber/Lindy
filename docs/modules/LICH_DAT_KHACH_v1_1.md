# LINDY OS — CONTEXT MODULE LỊCH ĐẶT KHÁCH

**Phiên bản:** 1.1 — tách riêng từ đặc tả LINDY OS V1.1  
**Ngày chốt nghiệp vụ:** 12/10/2026  
**Mức ưu tiên:** **MVP / P1 — triển khai ngay giai đoạn đầu**  
**Đối tượng sử dụng tài liệu:** Người phát triển sản phẩm, AI vibe coding, người kiểm thử, chủ cửa hàng.  
**Phạm vi:** Chỉ phân hệ lịch đặt khách nội bộ (Appointment Management), lịch chung, quyền thao tác, cảnh báo trùng/đầy lịch, thông báo và liên kết đơn hàng. **Không yêu cầu xây toàn bộ hệ thống kế toán, lương hay CRM nâng cao trong module này.**

> **NGUYÊN TẮC ĐÃ CHỐT:** Lịch hẹn được tạo **KHÔNG PHÂN CÔNG THỢ**. Mọi nhân viên được tạo lịch. **Linh, Nhung và Chin được sửa/hủy mọi lịch** thuộc cơ sở mình có quyền; nhân viên còn lại chỉ sửa lịch do chính mình tạo khi lịch **chưa xác nhận**, và **không được hủy**. Lịch chung, kiểm tra chồng giờ, thông báo trong app và thông báo đẩy Web Push **bắt buộc nằm ở MVP/P1**.

---

## 1. Bối cảnh thực tế

- LINDY NAIL đang dùng **Apple Calendar** làm lịch chung, nhìn theo khung giờ 08:00–21:00 (đây là cách xem hiện tại, **không phải quy định giờ mở cửa**). Có nhiều lịch diễn ra đồng thời và lịch đặt cho nhóm 2–3 người.
- Thông tin lịch hiện thường được nhập nhanh dưới dạng văn bản: tên khách, số điện thoại nếu có, dịch vụ/tay-chân, giờ hẹn và ghi chú. Có lịch chỉ ghi “Khách”, chưa đủ dữ liệu.
- Chủ muốn **làm việc trực tiếp trong web LINDY OS trên điện thoại**, nhiều nhân viên cùng thao tác, thay vì phải nhập lịch ở Apple Calendar.
- Một lịch hẹn **không phải đơn hàng**: chỉ khi tạo đơn, ghi dịch vụ hoàn thành và chốt theo quy trình bán hàng mới phát sinh doanh thu/hoa hồng. Không được lấy số lịch nhân với giá dự kiến làm doanh thu thực.
- Bản đầu dùng tại **cơ sở 31/49 Huỳnh Thúc Kháng, Hà Nội**. Thiết kế trường `branch_id` để mở thêm cơ sở mà không cần làm lại kiến trúc.

## 2. Mục tiêu & điều kiện thành công

1. Mọi nhân viên có quyền đều xem được cùng một lịch, được cập nhật gần như tức thời giữa các thiết bị đang trực tuyến.
2. Tạo lịch nhanh trên iPhone/Android/máy tính, ít thao tác; **không có bước chọn thợ**.
3. Lịch chồng giờ hiển thị song song như Apple Calendar; cảnh báo xung đột có ý nghĩa, **không mặc định cấm** vì salon nhận nhiều khách cùng lúc.
4. Có lịch theo **ngày, tuần và danh sách**; tìm theo tên/SĐT, xem lịch nhóm; thao tác xem/sửa dễ dàng trên màn hình nhỏ.
5. Nhân viên được thông báo khi có lịch tạo mới, đổi lịch, xác nhận hoặc hủy; thông báo có lưu trong hệ thống và có Web Push trên thiết bị được hỗ trợ/cấp quyền.
6. Hệ thống truy vết được **ai tạo, ai sửa, sửa gì, lúc nào, ai hủy**; không xóa vĩnh viễn lịch.
7. Có nút tạo đơn từ lịch hẹn, nhưng **thợ thực hiện chỉ được ghi nhận trong đơn hàng**, không ở lịch hẹn.

## 3. Phạm vi P1 (bắt buộc) và ngoài phạm vi

### P1 — phải có ngay

- Đăng nhập và phân quyền thao tác với lịch chung theo cơ sở.
- Xem lịch ngày, tuần, dạng danh sách; tìm kiếm và bộ lọc trạng thái.
- Tạo lịch; xem chi tiết; chỉnh sửa; xác nhận; hủy; lưu lý do/lịch sử thay đổi.
- Lịch nhóm (`guest_count`); khung giờ bắt đầu/kết thúc; nhiều lịch cùng lúc.
- Cảnh báo chồng giờ, cảnh báo khách trùng và cảnh báo vượt sức chứa **nếu** cơ sở đã được cấu hình mức sức chứa.
- Trung tâm thông báo trong ứng dụng; Web Push; thao tác đăng ký/hủy đăng ký nhận thông báo.
- Realtime hoặc cơ chế cập nhật tự động an toàn; chống ghi đè khi nhiều người cùng sửa.
- Liên kết lịch với hồ sơ khách **CRM cơ bản** (tên, số điện thoại không bắt buộc, lịch sử đơn) và chuyển lịch thành đơn nháp.
- Quy tắc bảo mật dữ liệu cá nhân, lưu vết/audit, xử lý lỗi mạng.

### Chưa thuộc P1 — không tự ý bổ sung

- **Chọn thợ, phân công thợ, lọc lịch theo “thợ làm”, tự động gán thợ**.
- Nhân viên tự phân công mình khi khách đặt lịch; thuật toán xếp lịch theo tay nghề.
- Website khách tự đặt lịch công khai hoặc tài khoản đăng nhập dành cho khách.
- Tin nhắn nhắc lịch **gửi cho khách** qua SMS/Zalo/email hoặc kết nối tự động với nền tảng nhắn tin.
- Đồng bộ Apple Calendar **hai chiều** liên tục.
- CRM nâng cao: VIP, sở thích, ảnh móng, tự động marketing hoặc công cụ loyalty.

**Lưu ý về “lịch theo thợ”:** Nhu cầu cũ được **thay thế** bởi quyết định mới nhất “không phân thợ khi đặt lịch”. Có thể hiển thị **lịch ca/ngày nghỉ của nhân viên thành một lớp riêng**, nhưng không gán `staff_id` vào booking, không tạo cột đặt lịch theo từng thợ.

## 4. Vai trò và quyền thao tác — D17 A điều chỉnh (đã chốt)

| Vai trò | Xem lịch chung trong cơ sở | Tạo lịch | Sửa lịch | Xác nhận lịch | Hủy lịch |
|---|---|---|---|---|---|
| **Linh — Chủ** | Có | Có | **Mọi lịch** | Có | **Mọi lịch** |
| **Nhung — Quản lý** | Có | Có | **Mọi lịch** | Có | **Mọi lịch** |
| **Chin — Quyền lịch mở rộng** | Có | Có | **Mọi lịch** | Có | **Mọi lịch** |
| **Nhân viên khác** | Có | Có | **Chỉ lịch do chính mình tạo và còn ở trạng thái `pending`** | Không | **Không** |

- Mọi quyền áp dụng trong **cơ sở được cấp truy cập**. Với nhiều cơ sở, không cho thao tác xuyên cơ sở nếu chưa được cấp riêng.
- Chin chỉ được mở rộng **quyền lịch**, **không** tự động có quyền lương, thu chi, xem lợi nhuận hay quản lý đơn hàng.
- Phân quyền phải kiểm tra **ở server/API và database**, không chỉ ẩn nút giao diện.
- Nhân viên thường khi muốn sửa lịch đã xác nhận hoặc hủy lịch cần nhờ Linh/Nhung/Chin; P1 không cần workflow xin duyệt phức tạp, có thể gợi ý liên hệ người có quyền.
- Không có quyền “xóa vĩnh viễn” đối với lịch đã tồn tại. Hủy = đổi trạng thái có lưu dấu vết.
- **Về quyền Linh/Nhung/Chin sửa cả lịch do người khác tạo:** thao tác được phép nhưng vẫn cần cập nhật `updated_by` và phát thông báo theo chính sách thông báo.

**Quyền có thể dùng khi code:**

```text
appointments.read_branch
appointments.create
appointments.update_own_pending
appointments.manage_all
appointments.confirm_all
appointments.cancel_all
appointments.audit_read
```

Quy tắc thực thi gợi ý:

```text
can_read    := user.branch_access.includes(appointment.branch_id)
can_create  := user.branch_access.includes(input.branch_id)
can_update  := can_read && (
                 user.has('appointments.manage_all') ||
                 (user.id == appointment.created_by && appointment.status == 'pending'
                  && user.has('appointments.update_own_pending'))
               )
can_confirm := can_read && user.has('appointments.confirm_all')
can_cancel  := can_read && user.has('appointments.cancel_all')
```

## 5. Form tạo lịch hẹn

### 5.1. Trường thông tin

| Trường hiển thị | Bắt buộc? | Quy tắc |
|---|---|---|
| Cơ sở | Có | Tự chọn cơ sở hiện tại nếu chỉ có một nơi được cấp quyền |
| Tên khách / tên hiển thị lịch | Có | Cho nhập tự do, ví dụ “Mai Anh” hoặc “Nhóm 3 khách”; không bắt buộc lập CRM |
| Ngày hẹn | Có | Theo múi giờ `Asia/Ho_Chi_Minh` |
| Giờ bắt đầu | Có | Chọn nhanh trên trục giờ hoặc nhập tay |
| Giờ kết thúc / thời lượng | Có | `end_at > start_at`; thời lượng có thể chỉnh tay |
| Số người | Có, mặc định `1` | Số nguyên ≥ 1, cho đặt nhóm nhiều người |
| SĐT khách | Không | Có thể bỏ trống; nếu nhập thì chuẩn hóa phục vụ tìm kiếm/trùng lặp |
| Dịch vụ dự kiến | Không | Một hoặc nhiều dịch vụ, hoặc mô tả tự do “sơn gel tay + chân” |
| Ghi chú nội bộ | Không | Không được đẩy toàn văn vào thông báo màn hình khóa |
| Trạng thái | Hệ thống đặt | Mặc định `pending` (“Chờ xác nhận”) |
| Người tạo, thời gian tạo | Hệ thống ghi | Không cho nhập tay |

**Không có các trường**: “Thợ làm”, “Thợ phụ trách”, “Nhân viên thực hiện”, “Gán Chin/Nhung/...”, `appointments.staff_id`.

### 5.2. Luồng tạo nhanh

1. Vào **Lịch hẹn** → chọn ngày → chạm vào khung giờ hoặc bấm `+ Tạo lịch`.
2. Nhập tên, số người, thời gian; dịch vụ/SĐT/ghi chú nếu có.
3. Hệ thống kiểm tra giờ và đưa cảnh báo nếu chồng lịch, nghi trùng khách hoặc vượt sức chứa cấu hình.
4. Người tạo xem cảnh báo và **vẫn được tạo lịch chờ xác nhận**. Nếu quá sức chứa, hiển thị rõ `Cần người có quyền xác nhận`; không tự coi đã được phép tiếp nhận vượt công suất.
5. Lưu lịch với mã duy nhất, người tạo, `pending`; các thiết bị khác nhận cập nhật và thông báo.
6. Linh/Nhung/Chin có thể xác nhận → `confirmed`.

### 5.3. Trạng thái lịch

- `pending` — Chờ xác nhận (mặc định khi tạo).
- `confirmed` — Đã xác nhận.
- `arrived` — Khách đã đến.
- `in_progress` — Đang phục vụ.
- `completed` — Hoàn thành cuộc hẹn.
- `cancelled` — Hủy lịch (có log; không xóa).
- `no_show` — Khách không đến (khác với hủy).

**Đề xuất triển khai, chưa được chủ xác nhận riêng:** Linh/Nhung/Chin quản lý các chuyển trạng thái ngoài `pending`; nút `Đã đến/Đang làm/Hoàn thành` có thể cấp cho nhân viên khác ở bước cấu hình thực tế. Trong khi chưa chốt, không ngầm nâng quyền nhân viên thường chỉ vì họ được xem lịch.

Cho phép cập nhật trạng thái bằng tác vụ rõ ràng, lưu thời gian và người thao tác. Không chuyển `cancelled` sang `completed` tự động. Lịch hủy và không đến được giữ lại để thống kê.

## 6. Giao diện mobile-first

### 6.1. Màn hình lịch chính

- Header: **Lịch hẹn** · chọn cơ sở (nếu có) · nút `+` · tìm kiếm · thông báo.
- Thanh ngày kéo ngang như Apple Calendar; chuyển **Ngày / Tuần / Danh sách**.
- **Ngày:** trục giờ dọc; lịch hẹn là các khối từ giờ bắt đầu đến giờ kết thúc; các lịch trùng giờ hiển thị thành các cột song song (hoặc cơ chế dễ đọc trên màn hình hẹp, không làm mất lịch).
- Mỗi khối: **tên hiển thị, giờ, dịch vụ rút gọn, số người, trạng thái**. Không hiện nguyên SĐT trên ô lịch chung để tránh chật và giảm lộ thông tin.
- Nhấn vào ô mở chi tiết; nhấn vào khoảng trống để tạo lịch tại giờ đó; tìm theo tên/SĐT.
- Có chỉ báo hiện tại, kéo tới “Hôm nay”, cuộn mượt; lịch nhóm cần dễ nhận diện.
- Có filter “Tất cả / Chờ xác nhận / Đã xác nhận / Hủy / Không đến”; lịch đã hủy không hiển thị giữa lịch đang hoạt động trừ khi bật bộ lọc.
- **Lịch ca/nghỉ** (nếu có module nhân sự) hiển thị dưới lớp phụ tùy chọn; không phải phân công thợ cho lịch khách.

### 6.2. Màn hình chi tiết lịch

Hiện tên, SĐT nếu được phép xem, số người, dịch vụ dự kiến, ghi chú, thời gian và trạng thái; các hành động được bật **theo quyền**: `Sửa`, `Xác nhận`, `Hủy`, `Tạo đơn`; cho thấy người tạo, người sửa gần nhất và tab lịch sử. Mọi nút không được phép phải ẩn/khóa và server cũng từ chối truy cập trực tiếp.

### 6.3. Hướng thiết kế

Theo nhận diện LINDY: nền trắng/kem, chữ đen/xám, khoảng thở rộng, tiêu đề serif tinh tế và chữ giao diện sans-serif rõ; ưu tiên **tốc độ thao tác hơn yếu tố trang trí**. Không bắt người dùng đi qua form dài mới lưu được lịch. Giao diện phải hoạt động tốt trên Safari iPhone và trình duyệt Android/desktop.

## 7. Logic cảnh báo chồng giờ và công suất

### 7.1. Chồng giờ

Hai lịch `A`, `B` trùng thời gian khi cùng `branch_id` và:

```text
A.start_at < B.end_at AND B.start_at < A.end_at
```

- Không tính các lịch có trạng thái `cancelled`; có thể loại `no_show` khỏi công suất đã sử dụng cho thời gian tương lai theo quy tắc cấu hình.
- **Cảnh báo** khi có lịch hoạt động giao thời gian. Lịch song song **không mặc định sai**, vì quán phục vụ nhiều người cùng lúc.
- Nếu SĐT khớp ở khoảng thời gian giao nhau: cảnh báo **“Có thể trùng khách”**; không tự gộp/xóa vì hai người có thể dùng cùng SĐT.
- Nếu không có SĐT: tên giống nhau chỉ là gợi ý kiểm tra, **không khẳng định trùng khách**.

### 7.2. Công suất tiếp nhận

- Có tham số cấu hình tùy chọn `max_concurrent_guests` theo từng cơ sở, có ngày hiệu lực.
- Khi tính công suất, tổng `guest_count` của **các lịch đang giao nhau tại từng đoạn thời gian** (bao gồm lịch đang tạo/sửa). Không chỉ đếm số lịch; phải xử lý đúng lúc các lịch bắt đầu/kết thúc khác nhau.
- Nếu **vượt giới hạn đã cấu hình**, hiển thị cảnh báo nổi bật và gắn cờ `needs_capacity_review` cho lịch chờ xác nhận. Người có quyền xác nhận phải thấy cảnh báo và thực hiện xác nhận có chủ đích; lưu người chấp thuận và thời điểm.
- **Chưa biết sức chứa thực tế LINDY:** nếu không cấu hình thì chỉ cảnh báo trùng giờ, không tự giả định 4 ghế, 5 thợ hay khóa lịch.
- Vì **không phân thợ ở booking**, tuyệt đối không tuyên bố biết chính xác thợ rảnh hay trùng thợ; lịch ca/nghỉ nếu có chỉ giúp con người tham khảo.

### 7.3. Cập nhật đồng thời

- Dùng `version` hoặc `updated_at` kèm kiểm tra điều kiện cập nhật (optimistic concurrency).
- Nếu hai thiết bị sửa cùng một lịch: thiết bị lưu sau nhận `409 Conflict`, xem bản mới nhất, chọn tải lại/chỉnh tiếp; **không tự ghi đè**.
- Việc tính cảnh báo công suất cần cập nhật lại trên server ngay tại thời điểm lưu/xác nhận; kiểm tra trên client chỉ là hướng dẫn giao diện.

## 8. Thông báo trong ứng dụng và Web Push — P1

### 8.1. Sự kiện tạo thông báo

- Tạo lịch mới.
- Đổi ngày/giờ, tên khách, số người, dịch vụ quan trọng.
- Xác nhận lịch.
- Hủy lịch.
- Cảnh báo xung đột/công suất cần người có quyền xử lý.

**Đề xuất mặc định:** Linh/Nhung/Chin nhận tất cả sự kiện quan trọng trong cơ sở; nhân viên khác nhận lịch mới, đổi giờ, hủy và có thể tắt nhóm thông báo ít quan trọng để hạn chế quá nhiều tin. Đây là mặc định phần mềm, cần cho phép điều chỉnh trong cài đặt thông báo.

### 8.2. Luồng thông báo

1. Thao tác lịch thành công và được lưu vào database.
2. Tạo một `notification_event` kèm `event_id` duy nhất, người thao tác và mã lịch.
3. Xác định người nhận theo cơ sở, quyền truy cập và cấu hình thông báo.
4. Ghi thông báo vào **Trung tâm thông báo** (có thể đánh dấu đã đọc), cập nhật realtime.
5. Với người nhận đã đăng ký push trên thiết bị hợp lệ: đưa sự kiện vào hàng đợi Web Push, theo dõi trạng thái thành công/lỗi/retry.
6. Chạm thông báo → đăng nhập nếu cần → mở **đúng chi tiết lịch** với kiểm tra quyền ở server.

Để chống lặp: dùng idempotency key cho sự kiện/thao tác gửi; thao tác retry không sinh thêm lịch hay thêm notification sự kiện nguồn. Một lịch nhiều người cùng xem không có nghĩa tạo nhiều lịch trong database.

### 8.3. iPhone/PWA

- Website chạy **HTTPS** và có PWA manifest + Service Worker để xử lý Push.
- Trên iPhone: hướng dẫn **Thêm vào Màn hình chính** rồi người dùng **chủ động cho phép thông báo** từ thao tác trong app. Hỗ trợ Web Push cho web app trên màn hình chính từ iOS/iPadOS 16.4 trở lên (trình duyệt và thiết bị cần tương thích).
- Nếu không được cấp quyền/thiết bị không hỗ trợ/mạng gián đoạn: **vẫn lưu thông báo trong app**. Không hứa chắc push đến mọi máy trong mọi trạng thái.
- Push màn hình khóa **không hiện đầy đủ số điện thoại hoặc ghi chú nhạy cảm của khách**; có thể dùng dạng “Lịch lúc 14:30 đã thay đổi — mở app xem”.
- Quản lý đăng ký thiết bị, hủy đăng ký, xóa subscription hết hạn, không tiếp tục gửi tới người bị thu hồi quyền.

### 8.4. Không thuộc P1

Không cần tích hợp dịch vụ SMS/Zalo gửi cho khách hoặc đồng bộ ngược Apple Calendar. Các kết nối đó chỉ triển khai khi có yêu cầu và tài khoản/dịch vụ tương ứng.

## 9. Liên kết CRM và đơn hàng

- Khi tạo lịch có thể chọn khách CRM hiện có bằng **tên hoặc SĐT**. Nếu chỉ có tên, **không bắt** tạo CRM mới; lưu `customer_display_name` trong lịch.
- CRM MVP chỉ gồm tên, SĐT tùy chọn, **lịch sử đơn hàng**; không tự tạo hồ sơ khách hàng giàu dữ liệu.
- Nút **“Tạo đơn từ lịch”** tạo đơn nháp với `appointment_id`, mang theo tên/SĐT, dịch vụ dự kiến ở mức tham khảo (giá và dịch vụ thực tế xác nhận ở đơn hàng).
- **Chỉ trên đơn hàng** mới phân bổ doanh thu cho Linh/Nhung/Chin/Trang hoặc người thực hiện khác; không gán nhân viên ở lịch hẹn.
- Chống bấm nút tạo đơn hai lần khiến phát sinh hai đơn nháp ngoài ý muốn. Nếu một lịch nhóm cần nhiều đơn, phải có thao tác tạo thêm **có chủ đích**.
- Hủy lịch không tự động xóa/hoàn tiền các đơn đã tạo; hệ thống hiển thị cảnh báo nếu có đơn liên kết để xử lý theo nghiệp vụ đơn hàng.
- Khách đã đặt lịch nhưng chưa thực hiện dịch vụ: **doanh thu = 0; hoa hồng = 0**.

## 10. Mô hình dữ liệu đề xuất

> Đây là schema logic để định hướng xây dựng, có thể điều chỉnh tên trường khi code; nhưng **không được thêm ràng buộc `staff_id NOT NULL` vào lịch hẹn**.

### `appointments`

| Trường | Ghi chú |
|---|---|
| `id` (UUID) | Mã lịch duy nhất |
| `branch_id` (UUID) | Cơ sở; bắt buộc |
| `customer_id` (nullable) | Liên kết CRM nếu có |
| `customer_display_name` | Tên trên lịch; bắt buộc |
| `phone` (nullable) | SĐT liên hệ, có thể không có |
| `start_at`, `end_at` | Timestamp lưu chuẩn UTC; hiển thị Asia/Ho_Chi_Minh |
| `guest_count` | Số người, mặc định 1; nguyên dương |
| `service_summary` (nullable) | Mô tả nhanh dịch vụ; có thể dùng bảng con dịch vụ dự kiến |
| `notes` (nullable) | Ghi chú nội bộ |
| `status` | `pending / confirmed / arrived / in_progress / completed / cancelled / no_show` |
| `needs_capacity_review` | Cờ cảnh báo vượt sức chứa đã cấu hình |
| `created_by`, `updated_by` | User ID |
| `cancelled_by`, `cancelled_at` (nullable) | Thông tin hủy |
| `version` | Khóa kiểm tra cập nhật đồng thời |
| `created_at`, `updated_at` | Timestamp hệ thống |

### Các bảng liên quan

- `appointment_audit_events`: `id`, `appointment_id`, `branch_id`, `actor_user_id`, `action`, `before_json`, `after_json`, `reason`, `occurred_at`.
- `branch_booking_capacity`: `branch_id`, `max_concurrent_guests` (nullable), `effective_from`, `effective_to` (nullable).
- `notification_events`: `id`, `branch_id`, `appointment_id`, `event_type`, `actor_user_id`, `payload_safe`, `created_at`.
- `notification_recipients`: `event_id`, `user_id`, `read_at`, `in_app_status`.
- `push_subscriptions`: `id`, `user_id`, `device_label`, `endpoint`, `keys_encrypted`, `is_active`, `created_at`, `last_seen_at`.
- `notification_deliveries`: `id`, `event_id`, `subscription_id`, `attempts`, `status`, `last_attempt_at`, `error_code`.
- `orders`: có `appointment_id` nullable (liên kết phía module đơn hàng, không đặt nhân viên trong booking).

**Ràng buộc quan trọng:** `end_at > start_at`; `guest_count >= 1`; index trên `(branch_id, start_at, end_at)` và các trường tìm kiếm thích hợp; bắt buộc lọc theo `branch_id`. Audit log append-only, không cho người dùng sửa/xóa.

## 11. API / hành động ứng dụng

Tên API dưới đây là gợi ý thiết kế, **không yêu cầu code đúng nguyên văn URL**.

```text
GET    /api/appointments?branchId=&from=&to=&status=&q=
POST   /api/appointments
GET    /api/appointments/:id
PATCH  /api/appointments/:id          # yêu cầu version hiện tại
POST   /api/appointments/:id/confirm
POST   /api/appointments/:id/cancel   # lý do + quyền
POST   /api/appointments/:id/status
POST   /api/appointments/conflicts/check
POST   /api/appointments/:id/create-order
GET    /api/appointments/:id/audit

GET    /api/notifications
POST   /api/notifications/:id/read
POST   /api/push/subscriptions
DELETE /api/push/subscriptions/:id
```

- API xác thực user từ session/token server; **không tin** `created_by`, `actor_user_id`, `role` do client tự gửi.
- Mỗi thay đổi lịch + audit + sự kiện thông báo cần nhất quán bằng giao dịch DB/outbox; chỉ báo thành công sau khi lưu được nghiệp vụ chính. Push được xử lý bất đồng bộ để lỗi push không làm mất lịch.
- Chỉ trả dữ liệu lịch của cơ sở được truy cập; lọc đầu vào; giới hạn tìm kiếm; phân trang/khoảng ngày hợp lý, hạn chế spam.
- HTTP 403 khi thiếu quyền, 404 nếu lịch không có trong phạm vi truy cập, 409 khi version xung đột; mọi lỗi có thông báo tiếng Việt dễ hiểu.
- Realtime có thể dùng Postgres realtime/WebSocket/SSE tùy stack; khi mất kết nối tự lấy lại dữ liệu và chống lặp event.

## 12. Tình huống kiểm thử chấp nhận (acceptance tests)

| # | Tình huống | Kết quả bắt buộc |
|---|---|---|
| 01 | Trang tạo lịch mới lúc 09:00, 2 khách, không chọn thợ | Tạo thành công `pending`, **không có trường thợ** |
| 02 | Nhân viên thường sửa lịch do mình tạo còn `pending` | Được sửa, audit lưu trước/sau |
| 03 | Nhân viên thường sửa lịch mình tạo đã `confirmed` | Bị chặn ở UI **và API** |
| 04 | Nhân viên thường sửa lịch do Chin tạo | Bị chặn |
| 05 | Nhân viên thường bấm hủy lịch | Không có quyền; API trả 403 |
| 06 | Chin sửa giờ hoặc hủy lịch do Trang tạo | Được thực hiện; ghi đúng người sửa/hủy, phát thông báo |
| 07 | Linh/Nhung xác nhận lịch do nhân viên thường tạo | Thành công; thay đổi trạng thái và thông báo |
| 08 | Hai lịch khác khách cùng từ 10:00–11:30 | Hiển thị song song, cảnh báo, **không tự cấm** |
| 09 | Lịch 09:00–10:00 và lịch 10:00–11:00 | Không được tính giao nhau |
| 10 | Cơ sở chưa đặt công suất tối đa | Không tự bịa giới hạn hoặc ngăn lưu lịch |
| 11 | Cơ sở cấu hình tối đa 4 khách, ba lịch giao nhau có số khách lần lượt 2+2+1 | Cảnh báo vượt công suất 5/4 tại đoạn giờ trùng; yêu cầu rà soát trước khi xác nhận |
| 12 | Khách dùng một số điện thoại đặt hai lịch sát nhau | Hệ thống cảnh báo nghi trùng khi thực sự chồng giờ, không tự xóa |
| 13 | Hai nhân viên cùng sửa một lịch | Lần cập nhật đến sau nhận 409, không ghi đè dữ liệu mới |
| 14 | Hủy lịch đã xác nhận | Lịch vẫn tồn tại trong database, audit đầy đủ; không có trong danh sách lịch đang hoạt động mặc định |
| 15 | Tạo, đổi giờ, hủy lịch trong quán | Trung tâm thông báo ghi đúng một sự kiện nguồn mỗi thao tác |
| 16 | iPhone chưa cấp quyền Web Push | App vẫn hoạt động, nhận thông báo trong app; có hướng dẫn bật Push |
| 17 | iPhone PWA đã cấp quyền Web Push | Có thể nhận push và mở đúng lịch khi chạm (phụ thuộc hệ điều hành/mạng) |
| 18 | Push trên màn hình khóa | Không lộ toàn văn ghi chú hoặc SĐT khách |
| 19 | Nhân viên mất quyền truy cập cơ sở | Không còn đọc/sửa lịch, không nhận push mới của cơ sở đó |
| 20 | Tạo đơn từ lịch | Đơn nháp có liên kết `appointment_id`; chưa sinh doanh thu/hoa hồng khi chỉ tạo lịch |
| 21 | Đơn hàng có nhiều thợ cùng làm | Ghi thợ và chia tiền trong **đơn**, không làm xuất hiện phân thợ ở lịch |
| 22 | Nhấn tạo đơn từ một lịch hai lần | Không sinh hai đơn không chủ đích; lịch nhóm vẫn hỗ trợ tạo thêm đơn có xác nhận |

## 13. Thứ tự triển khai gợi ý trong MVP

1. **Data + Auth:** Tạo bảng lịch, role/action permissions theo cơ sở, RLS/quyền API, audit log.
2. **Core CRUD:** Tạo/xem/sửa/xác nhận/hủy lịch; trạng thái; tìm theo tên/SĐT; đơn vị thời gian chuẩn.
3. **Calendar UI:** Giao diện trục giờ theo ngày, chế độ tuần/danh sách, lịch nhóm và lịch chồng song song trên mobile.
4. **Conflict & capacity:** Cảnh báo trùng/nhóm, cấu hình công suất optional, xử lý đồng thời `version`/409.
5. **Realtime & notifications:** Trung tâm thông báo, Web Push, hướng dẫn cấp quyền trên iPhone, gửi tin có chống trùng.
6. **Link to orders:** Tạo đơn nháp từ lịch; xác nhận không sinh doanh thu từ booking; kiểm thử toàn luồng.
7. **UAT nội bộ:** Linh, Nhung, Chin kiểm thử; sau đó cấp tài khoản cho nhân viên còn lại và chuyển dần từ Apple Calendar.

Các bước trên **đều thuộc P1**, không chuyển notification/cảnh báo/lịch chung sang phase 2.

## 14. Chuyển đổi từ Apple Calendar

- **Đề xuất, không phải yêu cầu đồng bộ P1:** Giai đoạn đầu có thể nhập lịch sắp tới từ tệp `.ics` do người quản trị xuất rồi kiểm tra thủ công trước khi ghi vào app.
- Lịch cũ có thể chứa tất cả thông tin trong ô “Tên sự kiện”; quá trình nhập không được tự nhận diện nhầm mọi dãy số thành SĐT hoặc tự tách sai dịch vụ, khách nhóm. Lịch không đủ thông tin đưa vào danh sách `Cần rà soát`.
- Tránh nhập song song hai nơi sau khi go-live. Khi chuyển đổi, chọn một ngày chốt, đối chiếu số lịch và giờ hẹn, sau đó dùng LINDY OS là nguồn lịch chính thức.
- **Không tự ý kết nối API Apple/iCloud**, đăng nhập Apple ID hoặc lưu mật khẩu Apple ID trong ứng dụng.

## 15. Thông số triển khai chưa được cung cấp (không tự bịa)

Các mục sau là **dữ liệu cần thiết lập khi triển khai**, không làm thay đổi những quyết định nghiệp vụ đã chốt:

- Giờ mở/đóng cửa thực tế và có cho phép đặt lịch ngoài giờ không.
- Thời lượng mặc định cho các loại dịch vụ nếu muốn chọn nhanh.
- Công suất đồng thời / số khách nhận cùng lúc mỗi cơ sở (nếu muốn kích hoạt cảnh báo vượt công suất).
- Ai được xem **SĐT đầy đủ** trong chi tiết lịch; mặc định kỹ thuật nên hạn chế hiển thị tại danh sách và push.
- Nhóm sự kiện thông báo nào bắt buộc cho mọi nhân viên và nhóm nào được tắt.
- Có cần hỗ trợ đặt lịch vượt qua nửa đêm không; nếu không, P1 có thể yêu cầu lịch trong cùng một ngày theo giờ địa phương.
- Có dùng import `.ics` ngay khi go-live hay nhập tay các lịch tương lai.

## 16. Chỉ dẫn khi dùng file này cho AI vibe coding

**Bài toán:** Xây **module Lịch đặt khách LINDY OS P1** trong ứng dụng web mobile-first/PWA hiện có (hoặc khởi tạo module độc lập nếu chưa có codebase). Hoàn thiện từ database, API, phân quyền, UI, realtime đến Web Push và test. Dùng tiếng Việt cho giao diện. Trước khi code, đọc codebase và xác định cách tích hợp authentication, branches, customers, orders và notifications.

**Không được tự thay đổi các quyết định đã chốt:**

1. **Booking không phân thợ.** Không hiển thị dropdown nhân viên, không tự gán, không tính “trùng thợ” từ dữ liệu không có.
2. Linh/Nhung/Chin **sửa và hủy mọi lịch** trong cơ sở. Nhân viên khác **chỉ sửa lịch tự tạo còn chờ xác nhận, không hủy**.
3. Lịch chung, cảnh báo chồng giờ/công suất (nếu cấu hình), thông báo trong app và Web Push đều ở **P1**, không bỏ qua để “làm sau”.
4. Một booking không làm phát sinh doanh thu, công nợ, hoa hồng hay chấm công.
5. Không đưa CRM nâng cao/booking online công khai/đồng bộ Apple hai chiều vào P1.
6. Không đoán các thông số cửa hàng chưa cung cấp (giờ mở cửa, sức chứa, duration dịch vụ).
7. Mọi sửa đổi/hủy phải truy vết và bảo vệ quyền tại server; tránh ghi đè dữ liệu cùng lúc.

**Đầu ra mong muốn từ AI coder:** Kiến trúc module → schema/migrations → API & phân quyền → UI responsive → realtime & thông báo → bộ kiểm thử → hướng dẫn chạy thử iPhone/Android → danh sách cấu hình còn thiếu. Triển khai từng bước, báo rõ phần đã hoàn thành/chưa hoàn thành, không tuyên bố Web Push chạy tốt nếu chưa test trên thiết bị thật.

---

**Nguồn nghiệp vụ:** Quyết định D11 (có lịch hẹn), D17 phiên bản chốt cuối (A điều chỉnh), yêu cầu nâng lịch chung/cảnh báo/thông báo vào P1, và cách sử dụng Apple Calendar thực tế đã được chủ cửa hàng cung cấp. File này ưu tiên các quyết định mới nhất; nếu tài liệu LINDY OS cũ ghi “lịch theo thợ” hoặc “thông báo để làm sau” thì **file này được ưu tiên cho riêng module đặt lịch**.
