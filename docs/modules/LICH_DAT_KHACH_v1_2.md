# LINDY OS — MODULE LỊCH ĐẶT KHÁCH

**Phiên bản:** 1.2, ngày 12/10/2026. Thay thế bản 1.1 (`LICH_DAT_KHACH_v1_1.md`, giữ lại để tra lịch sử).  
**Mức ưu tiên:** **P1 — làm đầu tiên.** Module đứng riêng được, thay Apple Calendar ngay khi xong.  
**Nguồn:** module v1.1 + quyết định B01–B15 (phiếu 3), A02–A03, C01–C04, C16 trong `docs/DECISIONS.md`.  
**Đối tượng:** người phát triển, AI vibe coding, người kiểm thử, chủ cửa hàng.  
**Phạm vi:** lịch đặt khách nội bộ: lịch chung, quyền thao tác, cảnh báo, tiền cọc mùa Tết, thông báo trong app và Web Push, liên kết đơn hàng. Không làm kế toán, lương hay CRM nâng cao trong module này.

> **NGUYÊN TẮC ĐÃ CHỐT:** Lịch hẹn **không phân thợ**. Mọi nhân viên được tạo lịch, đánh dấu khách đến và tạo đơn từ lịch. **Linh, Nhung, Chin** sửa, chốt, huỷ mọi lịch. Nhân viên khác sửa và **tự huỷ lịch do mình tạo khi còn “Mới đặt”** (bắt buộc lý do); lịch khác thì chỉ bấm **“Khách báo huỷ”**. Lịch hẹn không sinh doanh thu, hoa hồng hay chấm công.

---

## 0. Thay đổi so với v1.1

| Mục | Thay đổi | Nguồn |
|---|---|---|
| 4 | Nhân viên thường được: đánh dấu khách đến, tạo đơn từ lịch, tự huỷ lịch mình tạo khi còn “Mới đặt”, bấm “Khách báo huỷ” | B05, B06, B07 |
| 5 | Linh, Nhung, Chin có nút **“Tạo và chốt”**. Tên hiển thị: **Mới đặt / Đã chốt lịch**. Thời lượng mặc định **120 phút** | B03, B04, B09 |
| 5.4 | Trạng thái lịch tự đồng bộ theo đơn hàng tạo từ lịch | Đề xuất kỹ thuật, chủ đồng ý |
| 6 (mới) | **Tiền cọc mùa Tết**: lịch tạo từ 19 đến 28 tháng Chạp, 100.000đ/khách, Nhung xác nhận tiền; hoàn cọc khi khách báo trước ≥ 12 tiếng; cọc bị giữ là doanh thu phần của Linh, không hoa hồng, không KPI | B01, A02, A03, C01–C04 |
| 8 | Chồng giờ chỉ hiện dòng thông tin; cảnh báo ngoài giờ 9:00–21:00; nghi trùng khách khi cùng SĐT **và** trùng giờ; **chưa bật** cảnh báo sức chứa | B10, B11, B12 |
| 9 | Nhân viên thường nhận: lịch mới, đổi giờ, huỷ. **Không có giờ yên lặng.** Người thao tác không nhận thông báo của chính mình | B13, B14 |
| 7 | Mọi nhân viên xem SĐT đầy đủ trong chi tiết lịch | B08 |
| 15 | Chuyển từ Apple Calendar bằng **nhập tay**, không nhập file `.ics` | B15 |

## 1. Bối cảnh

- Quán đang dùng **Apple Calendar** làm lịch chung, xem khung 08:00–21:00. Nhiều lịch diễn ra cùng lúc; có lịch nhóm 2–3 khách. Quán mở cửa **9:00–21:00 mọi ngày**.
- Lịch thường được ghi nhanh: tên khách, SĐT nếu có, dịch vụ hoặc “tay/chân”, giờ hẹn, ghi chú. Có lịch chỉ ghi “Khách”.
- Quán làm cả móng và **mi** (uốn mi).
- Chủ muốn mọi người thao tác lịch trực tiếp trong LINDY OS trên iPhone, thay Apple Calendar.
- Lịch hẹn **không phải đơn hàng**. Chỉ đơn hàng đã được Nhung (hoặc Linh) xác nhận mới sinh doanh thu và hoa hồng.
- Bản đầu dùng tại **CS 31/49 Huỳnh Thúc Kháng, Hà Nội**; mọi bảng có `branch_id` để mở thêm cơ sở.

## 2. Mục tiêu

1. Mọi nhân viên xem cùng một lịch, cập nhật gần như tức thời giữa các máy đang mở app.
2. Tạo lịch nhanh trên iPhone, ít bước; **không có bước chọn thợ**.
3. Lịch trùng giờ hiển thị song song như Apple Calendar; không cấm, vì quán nhận nhiều khách cùng lúc.
4. Xem theo **ngày, tuần, danh sách**; tìm theo tên hoặc SĐT; lịch nhóm dễ nhận ra.
5. Nhân viên được thông báo khi có lịch mới, đổi giờ, huỷ; Linh, Nhung, Chin nhận thêm các việc cần xử lý. Thông báo lưu trong app và đẩy Web Push khi máy đã cho phép.
6. Truy được **ai tạo, ai sửa, sửa gì, lúc nào, ai huỷ, vì sao**; không xoá vĩnh viễn lịch.
7. Mùa Tết: ghi tiền cọc trên lịch, có người xác nhận tiền, hoàn hoặc giữ cọc đúng quy tắc.
8. Tạo đơn từ lịch; thợ thực làm chỉ ghi trên đơn.

## 3. Phạm vi

### P1 — làm ngay

- Đăng nhập, phân quyền lịch theo cơ sở.
- Lịch ngày, tuần, danh sách; tìm kiếm; lọc trạng thái.
- Tạo, “Tạo và chốt”, xem, sửa, chốt, huỷ, tự huỷ lịch mình tạo, “Khách báo huỷ”, đánh dấu khách đến, khách không đến; lý do và lịch sử thay đổi.
- Lịch nhóm (`guest_count`); giờ bắt đầu/kết thúc; mặc định 120 phút.
- Cảnh báo: ngoài giờ mở cửa; nghi trùng khách (cùng SĐT, trùng giờ). Thông tin “cùng giờ có N lịch khác”.
- Tiền cọc mùa Tết (mục 6). **Phải xong trước 19 tháng Chạp** (khoảng cuối tháng 1/2027).
- Trung tâm thông báo, Web Push, bật/tắt nhận thông báo trên từng máy.
- Cập nhật tức thời hoặc tự làm mới an toàn; chống ghi đè khi nhiều người cùng sửa; chống tạo trùng khi bấm lưu hai lần.
- Liên kết khách (tên, SĐT không bắt buộc, lịch sử đơn) và tạo đơn nháp từ lịch (khi module đơn hàng đã có).
- Lưu vết, bảo vệ dữ liệu cá nhân, xử lý lỗi mạng.

### Không làm ở P1

- Chọn thợ, phân công thợ, lọc lịch theo thợ, tự gán thợ, xếp lịch theo tay nghề.
- **Cảnh báo vượt sức chứa** (B11: chủ chưa cần). Giữ trường cấu hình để trống; làm khi chủ yêu cầu bật.
- **Giờ yên lặng** cho thông báo (B14).
- **Nhập file `.ics`** từ Apple Calendar (B15); đồng bộ Apple Calendar hai chiều.
- Website cho khách tự đặt lịch, tài khoản khách.
- Gửi tin nhắc lịch cho khách qua SMS, Zalo, email.
- CRM nâng cao: VIP, sở thích, ảnh móng, marketing.

Có thể hiển thị **lịch ca, ngày nghỉ của nhân viên** thành một lớp tham khảo riêng khi module nhân sự có; không gán nhân viên vào lịch hẹn.

## 4. Vai trò và quyền

| Việc | Linh, Nhung, Chin (quyền lịch mở rộng) | Nhân viên thường |
|---|---|---|
| Xem lịch chung trong cơ sở | Có | Có |
| Tạo lịch (“Mới đặt”) | Có | Có |
| **Tạo và chốt** một bước | Có | Không |
| Sửa lịch | Mọi lịch | Chỉ lịch **do mình tạo** và còn **“Mới đặt”** |
| Chốt lịch | Có | Không |
| Huỷ lịch | Mọi lịch | Chỉ lịch **do mình tạo**, còn **“Mới đặt”**, **chưa có cọc đã xác nhận**; bắt buộc lý do |
| **Khách báo huỷ** (ghi chú + báo người có quyền) | Có | Có, với mọi lịch |
| **Khách đã đến** | Có | Có |
| **Tạo đơn từ lịch** | Có | Có |
| Khách không đến | Có | Không |
| Ghi khoản cọc | Có | Có (chờ xác nhận) |
| Xác nhận tiền cọc đã vào | Nhung, Linh | Không |
| Hoàn cọc, giữ cọc | Có | Không |
| Xem lịch sử thay đổi | Có | Lịch do mình tạo |
| Cài đặt mùa cọc, giờ mở cửa, thời lượng mặc định | Linh | Không |

- Quyền gán cho **tài khoản** theo cơ sở, không viết theo tên người trong code. “Quyền lịch mở rộng” của Chin **không** kéo theo quyền lương, thu chi, lợi nhuận hay xác nhận bill.
- Kiểm tra quyền ở **server và database**; ẩn nút chỉ là phụ.
- Không có quyền xoá vĩnh viễn. Huỷ là đổi trạng thái, có lưu vết.
- Người có quyền sửa lịch của người khác vẫn ghi `updated_by` và phát thông báo theo mục 9.

**Danh sách quyền:**

```text
appointments.read_branch
appointments.create
appointments.update_own_pending
appointments.cancel_own_pending
appointments.report_customer_cancel
appointments.mark_arrived
appointments.create_order
appointments.manage_all          # sửa mọi lịch, đánh dấu không đến
appointments.confirm_all         # chốt lịch, "Tạo và chốt"
appointments.cancel_all
appointments.audit_read
deposits.record
deposits.confirm                 # Nhung, Linh
deposits.resolve                 # hoàn / giữ cọc: Linh, Nhung, Chin
booking_settings.manage          # Linh
```

**Quy tắc thực thi:**

```text
own_pending  := appt.created_by == user.id && appt.status == 'pending'
can_read     := user.branch_access.includes(appt.branch_id)
can_update   := can_read && (has('appointments.manage_all') || (own_pending && has('appointments.update_own_pending')))
can_confirm  := can_read && has('appointments.confirm_all') && appt.status == 'pending'
can_cancel   := can_read && (
                  has('appointments.cancel_all') ||
                  (own_pending && has('appointments.cancel_own_pending') && !appt.has_confirmed_deposit)
                ) && reason.trim() != ''
can_report_customer_cancel := can_read && has('appointments.report_customer_cancel')
                              && appt.status in ('pending','confirmed')
can_mark_arrived := can_read && has('appointments.mark_arrived') && appt.status in ('pending','confirmed')
can_no_show  := can_read && has('appointments.manage_all') && appt.status in ('pending','confirmed')
```

## 5. Tạo lịch

### 5.1. Trường thông tin

| Trường | Bắt buộc | Quy tắc |
|---|---|---|
| Cơ sở | Có | Tự chọn nếu chỉ có một cơ sở |
| Tên hiển thị | Có | Nhập tự do (“Mai Anh”, “Nhóm 3 khách”); không bắt buộc tạo hồ sơ khách |
| Ngày hẹn | Có | Múi giờ `Asia/Ho_Chi_Minh` |
| Giờ bắt đầu | Có | Chạm vào trục giờ hoặc nhập; bước 15 phút |
| Giờ kết thúc | Có | Tự điền **bắt đầu + 120 phút** (B09); sửa được; `end_at > start_at`; cùng ngày |
| Số khách | Có, mặc định 1 | Số nguyên ≥ 1 |
| SĐT | Không | Chuẩn hoá trước khi lưu: bỏ khoảng trắng, dấu chấm; `+84` → `0` |
| Dịch vụ dự kiến | Không | Chọn từ danh mục hoặc ghi tự do (“sơn gel tay + chân”) |
| Ghi chú nội bộ | Không | Không bao giờ đưa vào thông báo màn hình khoá |
| Tiền cọc | Theo mục 6 | Chỉ hiện khi lịch được tạo trong mùa cọc |
| Trạng thái | Hệ thống | `pending` (“Mới đặt”), hoặc `confirmed` khi dùng “Tạo và chốt” |
| Người tạo, thời điểm tạo | Hệ thống | Không nhập tay |

**Không có** trường thợ làm, thợ phụ trách, nhân viên thực hiện, `staff_id`.

### 5.2. Luồng tạo nhanh

1. Mở **Lịch hẹn** → chọn ngày → chạm vào khung giờ trống hoặc bấm `+`.
2. Nhập tên, số khách; giờ kết thúc tự điền 120 phút; thêm dịch vụ, SĐT, ghi chú nếu có.
3. App kiểm tra và hiện cảnh báo (mục 8). Cảnh báo **không chặn lưu**.
4. Nhân viên thường bấm **Lưu** → “Mới đặt”. Linh, Nhung, Chin thấy thêm nút **Tạo và chốt** → “Đã chốt lịch”, ghi người chốt.
5. Các máy khác thấy lịch mới và nhận thông báo theo mục 9.

Mục tiêu: một lịch thông thường xong trong **không quá 4 lần chạm** sau khi chạm vào khung giờ.

### 5.3. Trạng thái

| Mã | Hiển thị | Ý nghĩa |
|---|---|---|
| `pending` | **Mới đặt** | Chờ Linh, Nhung hoặc Chin đồng ý nhận khách vào giờ đó (B02) |
| `confirmed` | **Đã chốt lịch** | Quản lý đã đồng ý nhận |
| `arrived` | Khách đã đến | Khách có mặt |
| `in_progress` | Đang làm | Có đơn tạo từ lịch đang làm |
| `completed` | Hoàn thành | Đơn tạo từ lịch đã được xác nhận |
| `cancelled` | Đã huỷ | Có lý do, người huỷ, thời điểm |
| `no_show` | Khách không đến | Khác với huỷ |

Cờ riêng, không phải trạng thái: **“Khách báo huỷ”** (`customer_cancel_reported_at`, `_by`, `_note`). Lịch vẫn giữ trạng thái cũ, hiện nhãn “Khách báo huỷ”, cho đến khi Linh, Nhung hoặc Chin huỷ chính thức.

Không tự chuyển `cancelled` hay `no_show` sang trạng thái khác. Lịch huỷ và không đến được giữ lại để thống kê.

### 5.4. Đồng bộ với đơn hàng

Để không ai phải cập nhật hai nơi:

- Bấm **Tạo đơn từ lịch** → lịch tự sang `arrived` (nếu chưa).
- Đơn tạo từ lịch chuyển sang Đang làm → lịch `in_progress`. Đơn được xác nhận → lịch `completed`.
- **Trước khi có module đơn hàng:** người có quyền bấm tay “Hoàn thành”; nhân viên thường chỉ bấm được “Khách đã đến”.

## 6. Tiền cọc mùa Tết

### 6.1. Khi nào cần cọc

- Quán chỉ nhận cọc **dịp Tết, từ 19 đến 28 tháng Chạp (âm lịch)** (B01).
- Tính theo **ngày khách đặt lịch**: lịch **được tạo** trong mùa cọc thì cần cọc, bất kể ngày hẹn (C01).
- Ngày âm lịch đổi sang dương lịch mỗi năm khác nhau. Linh nhập **khoảng ngày dương lịch** của mùa cọc mỗi năm trong Cài đặt. App không tự đổi lịch âm.
- Số cọc gợi ý = **100.000đ × số khách** (A02, C02). Mức 100.000đ là cấu hình của mùa cọc, sửa được.
- Ngoài mùa cọc, form không hiện phần cọc.

### 6.2. Ghi và xác nhận cọc

1. Nhân viên ghi cọc trên lịch: số tiền, hình thức (tiền mặt / chuyển khoản), tài khoản nhận (Tiền mặt cs HTK / Tài khoản cs HTK). Trạng thái cọc: **Chờ xác nhận**.
2. **Nhung** (hoặc Linh) kiểm tra tiền đã vào rồi bấm xác nhận. Trạng thái: **Đã nhận cọc**. Chưa xác nhận thì không tính là tiền đã vào.
3. Cọc **không phải doanh thu** khi đang giữ cho khách.

### 6.3. Hoàn cọc và giữ cọc

| Tình huống | Xử lý | Người làm |
|---|---|---|
| Khách báo huỷ **trước giờ hẹn từ 12 tiếng trở lên** | **Hoàn cọc** (phiếu hoàn có lý do, ghi tiền ra) | Linh, Nhung, Chin |
| Khách báo huỷ **muộn hơn 12 tiếng** trước giờ hẹn | **Giữ cọc** | Linh, Nhung, Chin |
| Khách **không đến** | **Giữ cọc** | Linh, Nhung, Chin |
| **Quán** huỷ hoặc dời lịch mà khách không đồng ý | Hoàn cọc | Linh, Nhung, Chin |
| Khách đến làm | Cọc **trừ vào bill** như một khoản thanh toán của đơn | Tự động khi tạo đơn từ lịch |

- Mốc 12 tiếng tính từ **giờ bắt đầu lịch hẹn** đến **thời điểm khách báo huỷ** (thời điểm nhân viên bấm “Khách báo huỷ” hoặc huỷ). App tự tính và gợi ý hoàn hay giữ; người có quyền bấm xác nhận.
- **Cọc bị giữ** là doanh thu quán, loại **“cọc khách bỏ hẹn”**, ghi **phần của Linh**, **không tính hoa hồng, không tính vào doanh thu KPI** của Nhung (A03, C04).
- Lịch có cọc đã xác nhận chỉ Linh, Nhung, Chin huỷ được, vì liên quan tiền.

## 7. Giao diện trên điện thoại

### 7.1. Màn lịch chính

- Đầu trang: **Lịch hẹn** · cơ sở · nút `+` · tìm kiếm · thông báo.
- Thanh ngày kéo ngang; chuyển **Ngày / Tuần / Danh sách**.
- **Ngày:** trục giờ dọc; mỗi lịch là một khối từ giờ bắt đầu đến giờ kết thúc; lịch trùng giờ thành cột song song, không mất lịch nào trên màn hình hẹp. Khung ngoài 9:00–21:00 tô nền khác.
- Mỗi khối: **tên hiển thị, giờ, dịch vụ rút gọn, số khách, trạng thái**, và nhãn “Cọc” hoặc “Khách báo huỷ” nếu có. **Không** hiện SĐT trên ô lịch.
- Chạm khối → chi tiết. Chạm khoảng trống → tạo lịch tại giờ đó.
- Bộ lọc: Tất cả / Mới đặt / Đã chốt lịch / Khách báo huỷ / Đã huỷ / Không đến. Lịch huỷ ẩn khỏi lịch đang hoạt động trừ khi bật lọc.
- Danh sách **Cần xử lý** cho Linh, Nhung, Chin: lịch “Mới đặt” chưa chốt, lịch “Khách báo huỷ”, cọc chờ xác nhận, lịch đã qua giờ mà chưa đánh dấu đến/không đến.

### 7.2. Chi tiết lịch

Tên, **SĐT đầy đủ** (mọi nhân viên xem được, B08; có nút gọi), số khách, dịch vụ dự kiến, ghi chú, thời gian, trạng thái, cọc. Nút hiện theo quyền: `Sửa`, `Chốt lịch`, `Huỷ`, `Khách báo huỷ`, `Khách đã đến`, `Tạo đơn`, `Khách không đến`, `Xác nhận cọc`. Hiện người tạo, người sửa gần nhất, tab lịch sử. Nút không có quyền thì ẩn, và server vẫn từ chối gọi trực tiếp.

### 7.3. Hướng thiết kế

Theo bộ giao diện LINDY OS (`design/`): phong cách Ngà & mực, sáng/tối theo máy, mật độ dày, ô nhập 16px, vùng chạm ≥ 44px, chữ tiếng Việt ngắn gọn. Tốc độ thao tác hơn trang trí. Chạy tốt trên Safari iPhone (app ghim ra màn hình chính).

## 8. Cảnh báo

### 8.1. Chồng giờ

Hai lịch A, B cùng cơ sở trùng giờ khi `A.start_at < B.end_at AND B.start_at < A.end_at`. Không tính `cancelled`, `no_show`.

- Chồng giờ **không phải lỗi**. Chỉ hiện **một dòng thông tin** trong form: “Cùng giờ có N lịch khác”. Không bật hộp cảnh báo, để mọi người không quen tay bỏ qua cảnh báo.

### 8.2. Nghi trùng khách

- Chỉ nhắc khi **cùng SĐT (đã chuẩn hoá) và trùng giờ** (B12): “Có thể trùng khách với lịch lúc 14:00”. Có nút mở lịch kia. Không tự gộp, không tự xoá.
- Không có SĐT thì không nhắc trùng; trùng tên không phải là trùng khách.

### 8.3. Ngoài giờ mở cửa

- Lịch có phần nằm ngoài **9:00–21:00** vẫn lưu được, kèm cảnh báo **“Ngoài giờ mở cửa”** (B10). Giờ mở cửa là cấu hình của cơ sở.

### 8.4. Sức chứa

- **Chưa bật** (B11). Trường `max_concurrent_guests` để trống. Khi chủ yêu cầu, bật theo thiết kế v1.1 §7.2 (cộng `guest_count` các lịch giao nhau, cảnh báo và cần người có quyền xem lại).

### 8.5. Ghi đồng thời và bấm hai lần

- Mỗi lịch có `version`. Sửa phải gửi `version` hiện tại; lệch thì trả **409**, máy đến sau xem bản mới nhất rồi chọn tải lại hoặc sửa tiếp. Không ghi đè.
- Tạo lịch gửi kèm **mã yêu cầu** do máy tạo (idempotency key). Bấm lưu hai lần hoặc mạng gửi lại không tạo hai lịch.
- Mọi cảnh báo tính lại ở server lúc lưu; kiểm tra trên máy chỉ để hướng dẫn.

## 9. Thông báo

### 9.1. Ai nhận gì

| Sự kiện | Linh, Nhung, Chin | Nhân viên thường |
|---|---|---|
| Lịch mới | Có | Có |
| Đổi ngày giờ | Có | Có |
| Huỷ lịch | Có | Có |
| Chốt lịch | Có | Không |
| Khách báo huỷ | Có | Không |
| Cọc chờ xác nhận | Nhung, Linh | Không |
| Lịch đã qua giờ chưa đánh dấu | Có | Không |

- **Người vừa thao tác không nhận thông báo của chính mình.**
- **Không có giờ yên lặng** (B14): thông báo đẩy mọi lúc.
- Mỗi người tự tắt bớt nhóm thông báo trong Cài đặt.

### 9.2. Luồng

1. Thao tác lịch lưu thành công vào database.
2. Cùng giao dịch: ghi lịch sử thay đổi và một `notification_event` (mã duy nhất, người thao tác, mã lịch).
3. Xác định người nhận theo cơ sở, quyền, cài đặt cá nhân; bỏ người thao tác.
4. Ghi vào **Trung tâm thông báo** (đánh dấu đã đọc được), cập nhật tức thời.
5. Đưa vào hàng đợi Web Push cho các máy đã đăng ký; theo dõi thành công, lỗi, gửi lại.
6. Chạm thông báo → đăng nhập nếu cần → mở đúng chi tiết lịch, kiểm tra quyền ở server.

Gửi lại không sinh thêm lịch hay thêm sự kiện nguồn.

### 9.3. iPhone

- Web chạy **HTTPS**, có manifest PWA và service worker.
- Web Push trên iPhone chỉ chạy khi app đã **Thêm vào Màn hình chính** (iOS 16.4 trở lên) và người dùng tự bấm cho phép trong app.
- App ghim ra màn hình chính có **phiên đăng nhập riêng**, tách khỏi Safari: mỗi người đăng nhập lại trong app đã ghim, rồi mới bật thông báo. Cần màn hướng dẫn từng bước.
- Không được cấp quyền, máy không hỗ trợ, mất mạng: **vẫn có thông báo trong app**. Không hứa push đến mọi máy mọi lúc.
- Màn hình khoá **không hiện SĐT hay ghi chú**: “Lịch 14:30 đã đổi giờ — mở app xem”.
- Quản lý đăng ký từng máy; dọn đăng ký hết hạn; ngừng gửi cho người đã bị thu quyền.

## 10. Liên kết khách và đơn hàng

- Tạo lịch có thể chọn khách có sẵn theo tên hoặc SĐT. Chỉ có tên thì lưu `customer_display_name`, không bắt tạo hồ sơ khách.
- **Tạo đơn từ lịch** (mọi nhân viên, B05): tạo **đơn nháp** gắn `appointment_id`, mang tên, SĐT, dịch vụ dự kiến (chỉ tham khảo; giá và dịch vụ thật chọn ở đơn). Cọc đã xác nhận chuyển thành khoản thanh toán của đơn.
- Thợ thực làm và chia tiền **chỉ có trên đơn**.
- Chống tạo hai đơn khi bấm hai lần. Lịch nhóm cần nhiều đơn thì có thao tác **“Tạo thêm đơn”** có xác nhận.
- Huỷ lịch không tự xoá hay hoàn tiền đơn đã tạo; app cảnh báo nếu có đơn liên kết.
- Lịch chưa làm dịch vụ: doanh thu 0, hoa hồng 0.

## 11. Dữ liệu

Tên trường có thể đổi khi code; **không có `staff_id` trong lịch hẹn**.

### `appointments`

| Trường | Ghi chú |
|---|---|
| `id` (UUID), `branch_id` | Bắt buộc lọc theo cơ sở |
| `customer_id` (null được), `customer_display_name`, `phone` (null được, đã chuẩn hoá) | |
| `start_at`, `end_at` | Lưu UTC; hiển thị giờ Việt Nam; cùng ngày |
| `guest_count` | ≥ 1 |
| `service_summary`, `notes` | Null được |
| `status` | `pending / confirmed / arrived / in_progress / completed / cancelled / no_show` |
| `confirmed_by`, `confirmed_at` | |
| `customer_cancel_reported_at`, `_by`, `_note` | Cờ “Khách báo huỷ” |
| `cancelled_by`, `cancelled_at`, `cancel_reason` | |
| `outside_hours` | Cờ tính lúc lưu |
| `needs_capacity_review` | Giữ cho sau; P1 luôn `false` |
| `created_by`, `updated_by`, `created_at`, `updated_at`, `version` | |
| `create_request_id` | Duy nhất theo người tạo; chống tạo trùng |

### Bảng liên quan

- `appointment_deposits`: `id`, `appointment_id`, `branch_id`, `amount`, `method` (cash/transfer), `money_account_id`, `status` (`recorded` / `confirmed` / `refunded` / `forfeited` / `applied`), `recorded_by/at`, `confirmed_by/at`, `resolved_by/at`, `resolve_reason`, `order_id` (khi trừ vào bill).
- `deposit_seasons`: `branch_id`, `name` (“Tết 2027”), `start_date`, `end_date` (dương lịch, Linh nhập), `amount_per_guest` (100.000), `refund_notice_hours` (12), `is_active`.
- `branch_booking_settings`: `branch_id`, `open_time` (09:00), `close_time` (21:00), `default_duration_min` (120), `max_concurrent_guests` (null).
- `appointment_audit_events`: `id`, `appointment_id`, `branch_id`, `actor_user_id`, `action`, `before_json`, `after_json`, `reason`, `occurred_at`. Chỉ thêm, không sửa, không xoá.
- `notification_events`, `notification_recipients`, `push_subscriptions`, `notification_deliveries`, `notification_preferences` (người dùng tắt nhóm nào).
- `orders.appointment_id` (null được) ở module đơn hàng.

**Ràng buộc:** `end_at > start_at`; `guest_count >= 1`; index `(branch_id, start_at, end_at)` và trên `phone`; tiền cọc là số nguyên VND > 0.

## 12. API gợi ý

```text
GET    /api/appointments?branchId=&from=&to=&status=&q=
POST   /api/appointments                      # body có create_request_id; confirm=true cho "Tạo và chốt"
GET    /api/appointments/:id
PATCH  /api/appointments/:id                  # bắt buộc version
POST   /api/appointments/:id/confirm
POST   /api/appointments/:id/cancel           # lý do bắt buộc
POST   /api/appointments/:id/report-customer-cancel
POST   /api/appointments/:id/arrived
POST   /api/appointments/:id/no-show
POST   /api/appointments/:id/create-order
GET    /api/appointments/:id/audit
POST   /api/appointments/:id/deposits         # ghi cọc
POST   /api/deposits/:id/confirm
POST   /api/deposits/:id/refund
POST   /api/deposits/:id/forfeit
GET/PUT /api/booking-settings                 # giờ mở cửa, thời lượng, mùa cọc (Linh)
GET    /api/notifications
POST   /api/notifications/:id/read
POST   /api/push/subscriptions
DELETE /api/push/subscriptions/:id
```

- Danh tính lấy từ phiên đăng nhập ở server; **không tin** `created_by`, vai trò hay người thao tác do máy gửi lên.
- Thay đổi lịch + lịch sử + sự kiện thông báo nằm trong **một giao dịch** (outbox). Push gửi nền, lỗi push không làm mất lịch.
- Mã lỗi: 403 thiếu quyền, 404 ngoài phạm vi, 409 lệch version, 422 thiếu lý do. Thông báo lỗi tiếng Việt, nói rõ cần làm gì.
- Cập nhật tức thời qua SSE hoặc WebSocket tuỳ nền tảng; mất kết nối thì tự tải lại khoảng ngày đang xem.

## 13. Kiểm thử nghiệm thu

| # | Tình huống | Kết quả bắt buộc |
|---|---|---|
| 01 | Trang tạo lịch 09:00, 2 khách | Lưu “Mới đặt”, **không có trường thợ**, giờ kết thúc tự là 11:00 |
| 02 | Trang sửa lịch mình tạo còn “Mới đặt” | Được; lịch sử lưu trước/sau |
| 03 | Trang sửa lịch mình tạo đã “Đã chốt lịch” | Bị chặn ở giao diện **và API** |
| 04 | Trang sửa lịch do Chin tạo | Bị chặn |
| 05 | Trang huỷ lịch mình tạo còn “Mới đặt”, có lý do | Được; lưu người huỷ, lý do |
| 06 | Trang huỷ lịch mình tạo nhưng bỏ trống lý do | Bị chặn (422) |
| 07 | Trang huỷ lịch đã chốt hoặc lịch người khác tạo | 403; app gợi ý dùng “Khách báo huỷ” |
| 08 | Trang bấm “Khách báo huỷ” trên lịch đã chốt | Lịch giữ trạng thái, có nhãn “Khách báo huỷ”; Linh, Nhung, Chin nhận thông báo |
| 09 | Chin đổi giờ hoặc huỷ lịch do Trang tạo | Được; ghi đúng người; Trang nhận thông báo |
| 10 | Nhung bấm “Tạo và chốt” | Lịch “Đã chốt lịch” ngay, `confirmed_by` = Nhung |
| 11 | Hai lịch khác khách cùng 10:00–11:30 | Hiện song song; dòng “Cùng giờ có 1 lịch khác”; không chặn, không hộp cảnh báo |
| 12 | Lịch 09:00–10:00 và 10:00–11:00 | Không tính là trùng giờ |
| 13 | Hai lịch cùng SĐT, trùng giờ | Nhắc “Có thể trùng khách” |
| 14 | Hai lịch cùng SĐT, khác giờ trong cùng ngày | Không nhắc |
| 15 | Lịch 20:30–22:30 | Lưu được, cảnh báo “Ngoài giờ mở cửa” |
| 16 | Hai người cùng sửa một lịch | Người lưu sau nhận 409, không ghi đè |
| 17 | Bấm lưu hai lần khi mạng chập chờn | Chỉ có một lịch |
| 18 | Huỷ lịch đã chốt | Lịch còn trong database, có lịch sử; ẩn khỏi lịch đang hoạt động mặc định |
| 19 | Tạo, đổi giờ, huỷ | Mỗi thao tác đúng một sự kiện thông báo; người thao tác không nhận |
| 20 | Nhân viên thường khi Nhung chốt lịch | Không nhận thông báo chốt |
| 21 | iPhone chưa cho phép Web Push | App vẫn chạy, có thông báo trong app và hướng dẫn bật |
| 22 | iPhone đã ghim app và cho phép | Nhận push; chạm mở đúng lịch (phụ thuộc hệ điều hành, mạng) |
| 23 | Push trên màn hình khoá | Không có SĐT, không có ghi chú |
| 24 | Nhân viên bị thu quyền cơ sở | Không đọc, sửa lịch; không nhận push của cơ sở đó |
| 25 | Trang bấm “Khách đã đến” trên lịch do Chin tạo | Được; lịch “Khách đã đến” |
| 26 | Tạo đơn từ lịch | Đơn nháp có `appointment_id`; lịch tự “Khách đã đến”; chưa có doanh thu |
| 27 | Đơn tạo từ lịch được Nhung xác nhận | Lịch tự “Hoàn thành” |
| 28 | Bấm tạo đơn từ lịch hai lần | Không ra hai đơn; lịch nhóm có “Tạo thêm đơn” có xác nhận |
| 29 | Ngoài mùa cọc | Form không có phần cọc |
| 30 | Mùa cọc đã cài; lịch 2 khách được tạo trong mùa (ngày hẹn sau mùa) | Form yêu cầu cọc, gợi ý 200.000đ |
| 31 | Trang ghi cọc 200.000đ chuyển khoản | Cọc “Chờ xác nhận”; Nhung, Linh nhận thông báo; chưa phải doanh thu |
| 32 | Trang hoặc Chin bấm xác nhận cọc | Bị chặn; chỉ Nhung, Linh xác nhận được |
| 33 | Khách báo huỷ 13 tiếng trước giờ hẹn | App gợi ý hoàn cọc; người có quyền xác nhận → phiếu hoàn, tiền ra |
| 34 | Khách báo huỷ 11 tiếng trước, hoặc không đến | App gợi ý giữ cọc; doanh thu “cọc khách bỏ hẹn” ghi cho Linh; **hoa hồng 0, không vào doanh thu KPI** |
| 35 | Khách có cọc 200.000đ đến làm, bill 500.000đ | Cọc thành khoản thanh toán của đơn; còn phải thu 300.000đ |
| 36 | Trang huỷ lịch mình tạo còn “Mới đặt” nhưng đã có cọc xác nhận | Bị chặn; cần Linh, Nhung, Chin |

## 14. Thứ tự làm

1. **Nền móng:** đăng nhập, cơ sở, quyền theo tài khoản, bảng lịch, lịch sử thay đổi, cài đặt cơ sở.
2. **Thao tác lịch:** tạo, tạo và chốt, sửa, chốt, huỷ, tự huỷ, khách báo huỷ, khách đến, không đến; tìm kiếm.
3. **Màn lịch:** ngày, tuần, danh sách; lịch song song; danh sách Cần xử lý.
4. **Cảnh báo và đồng thời:** ngoài giờ, nghi trùng khách, dòng thông tin chồng giờ, version/409, chống tạo trùng.
5. **Thông báo:** trung tâm thông báo, Web Push, màn hướng dẫn bật thông báo trên iPhone.
6. **Chạy thử nội bộ** với Linh, Nhung, Chin → mở cho mọi người → nhập tay lịch sắp tới → chuyển hẳn khỏi Apple Calendar.
7. **Tiền cọc mùa Tết** (mục 6). Xong trước 19 tháng Chạp.
8. **Tạo đơn từ lịch** khi module đơn hàng có.

## 15. Chuyển từ Apple Calendar

- **Nhập tay** các lịch sắp tới (B15). Không kết nối Apple ID, iCloud; không lưu mật khẩu Apple.
- Chọn **một ngày chuyển hẳn**. Trước ngày đó nhập tay các lịch tương lai, đối chiếu số lịch và giờ với Apple Calendar. Từ ngày đó chỉ ghi lịch vào LINDY OS.

## 16. Tham số

| Tham số | Giá trị |
|---|---|
| Giờ mở cửa | 9:00–21:00 mọi ngày (Q25) |
| Thời lượng mặc định | 120 phút (B09) |
| Đặt ngoài giờ | Cho phép, có cảnh báo (B10) |
| Sức chứa | Chưa bật (B11) |
| Xem SĐT đầy đủ | Mọi nhân viên (B08) |
| Giờ yên lặng | Không có (B14) |
| Mùa cọc | 19–28 tháng Chạp, theo ngày tạo lịch; 100.000đ/khách; hoàn khi báo trước ≥ 12 tiếng |
| **Còn chờ** | Ngày dương lịch của mùa cọc Tết 2027 (Linh nhập); ngày chuyển hẳn khỏi Apple Calendar; nền tảng kỹ thuật (`docs/TECH_STACK.md`) |

## 17. Chỉ dẫn cho AI lập trình

**Bài toán:** xây module Lịch đặt khách P1 của LINDY OS: database, API, phân quyền, giao diện mobile-first, cập nhật tức thời, Web Push, tiền cọc mùa Tết, kiểm thử. Giao diện tiếng Việt theo `design/`. Trước khi code, đọc `README.md`, `CLAUDE.md`, `docs/DECISIONS.md` và nền tảng đã chốt.

**Không được tự đổi:**

1. Lịch **không phân thợ**: không có ô chọn nhân viên, không tự gán, không tính trùng thợ.
2. Quyền đúng mục 4: Linh, Nhung, Chin sửa, chốt, huỷ mọi lịch; nhân viên thường sửa và tự huỷ lịch mình tạo khi còn “Mới đặt”, bấm được “Khách báo huỷ”, “Khách đã đến”, “Tạo đơn từ lịch”.
3. Lịch hẹn không sinh doanh thu, công nợ, hoa hồng, chấm công. Cọc bị giữ là doanh thu phần của Linh, **không hoa hồng, không KPI**.
4. Thông báo trong app và Web Push thuộc P1.
5. Không làm sức chứa, giờ yên lặng, nhập `.ics` khi chủ chưa yêu cầu.
6. Không tự đoán thông số chưa có.
7. Mọi sửa, huỷ, thao tác tiền cọc có lưu vết và kiểm tra quyền ở server; không ghi đè khi nhiều người cùng sửa.

**Đầu ra:** kiến trúc module → schema và migration → API, phân quyền → giao diện → cập nhật tức thời, thông báo → bộ kiểm thử theo mục 13 → hướng dẫn chạy thử trên iPhone → danh sách việc còn thiếu. Làm từng bước, báo rõ phần xong và chưa xong. Không nói Web Push chạy tốt nếu chưa thử trên iPhone thật.
