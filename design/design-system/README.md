LINDY OS là app quản lý nội bộ của Lindy Nailash Studio, dùng chủ yếu trên iPhone. Từ 01/11/2026 giao diện dùng **bộ màu Đen Ngọc Trai của CEN WORK** (S51): nền xám trắng hoặc gần đen, chữ đen trắng trung tính, nút chính đen ở sáng và dải ngọc trai ở tối, trạng thái theo màu nghĩa. Ba từ khoá: **tối giản, hiện đại, dịu nhẹ**. Người dùng ghét nhất là phải bấm nhiều bước mới xong việc, nên mỗi màn hình phục vụ một việc và việc đó xong bằng ít lần chạm nhất.

## Nguyên tắc

- Số liệu trước, trang trí sau. Không ảnh minh hoạ; màn hình là chữ, số và đường kẻ mảnh.
- Mỗi màu một nghĩa (bảng ở mục Màu). `accent` chỉ cho hành động và mục đang chọn, không dùng cho chip trạng thái.
- Viền mảnh cho thẻ. Bóng chỉ cho thứ nổi trên màn hình: `Toast`, bảng trượt, hộp thoại.
- Mật độ dày nhưng chạm thoải mái: mọi vùng chạm cao ít nhất `tap-min`, trừ ô lịch và ô bảng công.
- Ít bước: tạo đơn, xác nhận bill, ghi tiền không quá ba lần chạm kể từ màn hình đang mở. Một màn hình chỉ có một `Button` primary.
- Chỉ việc không hoàn tác được mới hỏi lại (S48). Không ghi chữ hướng dẫn lặp mỗi lần mở màn (S52); câu giữ tiền, giữ quyền thì giữ, rút gọn được.

## Giọng văn

- Ngắn gọn, trung tính, không xưng hô. Nút bắt đầu bằng động từ: “Tạo đơn”, “Làm xong”, “Xác nhận bill”, “Ghi tiền”, “Chốt ngày”.
- Báo kết quả bằng một câu, kết bằng dấu chấm: “Đã lưu đơn #0142.”, “Đã xác nhận bill.”. Không dấu chấm than, không emoji.
- Lỗi nói rõ sai gì và cần làm gì: “Giảm giá vượt 10%. Cần Nhung duyệt.”, “Phiếu chi trên 1.000.000đ. Cần Linh duyệt.”
- Dùng đúng tên nghiệp vụ của quán: đơn, bill, thợ, khách lẻ, chờ xác nhận, chốt ngày, tạm ứng. Không dùng từ kỹ thuật.
- Số tiền luôn đầy đủ dạng `8.450.000đ`: dấu chấm ngăn nghìn, chữ đ liền sau. Số âm dùng dấu trừ “−”. Ngày `dd/mm/yyyy`, giờ `14:20`.

## Màu

- Nền trang `surface` kèm ánh sáng tĩnh `page-glow`; thẻ, dòng, thanh trên, ô nhập `surface-raised`; nền chìm, nút tắt, chip xám `surface-sunken`.
- Chữ chính `ink`, chữ phụ `ink-muted`. Cả hai đọc được trên ba nền surface ở cả hai giao diện.
- Đường kẻ `line`. Viền ô nhập và nút phụ `line-strong` (đạt 3:1).
- Nút chính: `accent` + gradient `accent-fill`, chữ `on-accent`. Mục đang chọn màu đặc `accent`; trong bảng trượt, hộp thoại dùng `accent-soft` + `ink`.
- `accent` trùng màu chữ nên link dùng `.lo-link` (gạch chân), số ngày hôm nay dùng `cal-now`.
- Mỗi màu một nghĩa, **luôn có chữ đi kèm** (G10). Bảng trạng thái → tone nằm ở `src/lib/status-tone.ts`, không viết tone tay ở màn.

| Nghĩa | Tone | Ví dụ |
|---|---|---|
| Đang làm | `progress` xanh dương | Đang làm, Khách đã đến, Tạm tính |
| Đang chờ ai đó | `waiting` tím | Chờ xác nhận, Chờ duyệt, Chưa duyệt, Đã duyệt chờ chi, Cọc chờ xác nhận, Cần xem lại |
| Chưa đủ, cần chú ý | `warning` cam | Thu một phần, Chưa cọc, Vượt khoảng giá, Sửa tên |
| Tiền chưa về, hỏng | `danger` đỏ | Chưa thu, số âm, Từ chối, Khách không đến, nút Huỷ |
| Xong và đúng | `success` xanh lá | Đã thu đủ, Đã xác nhận, Đã chi, Đi làm |
| Còn lại | `neutral` xám | Đã huỷ, Hoàn thành, Quán đóng cửa, Nghỉ có phép |

- Giao diện tự đổi sáng/tối theo cài đặt của iPhone. Mọi màu lấy từ token; không viết màu cứng. Trên `accent` luôn dùng `on-accent`, vì giao diện tối cần chữ tối. In ra giấy luôn dùng màu sáng.
- Kính chỉ ở thanh dưới (`nav-fill`, 86%, trong `@supports`). Gradient chỉ ở nút chính và `page-glow`, tĩnh.
- Ô lịch kiểu lịch iPhone (S31): nền màu nhạt `cal-*-bg`, vạch trái 4px `cal-*-bar`, chữ đậm `cal-*-ink`, chữ phụ `cal-*-sub`. Theo trạng thái: **hồng mận** `cal-booked` = đã chốt; **xanh** `cal-active` = khách đã đến, đang làm; **xám** `cal-done` = xong; **xám mờ, gạch ngang** `cal-cancel` = huỷ, không đến. Chưa cọc, cọc chờ xác nhận, yêu cầu huỷ: vạch trái **cam** `cal-deposit-bar`, chữ trạng thái `cal-deposit-ink`. Màn Danh sách dùng cùng màu vạch ở đầu dòng. Ngoài chip trạng thái, đây là chỗ duy nhất tô mảng màu; màu luôn đi kèm chữ trạng thái. Vạch giờ hiện tại (S34) dùng `cal-now`, chữ giờ trên nhãn `on-cal-now`. Ngoài giờ mở cửa dùng `cal-closed`.
- Độ tương phản (WCAG 2.x, đo lại 01/11/2026): mọi cặp chữ/nền ≥ 4.5:1, viền ô nhập và vạch màu ≥ 3:1 ở cả hai giao diện (trừ vạch `cal-cancel` cố ý mờ). Thêm màu mới phải đo lại trước khi dùng.

## Chữ

- Be Vietnam Pro (họ `sans`) cho cả app (S13, 14/10/2026), kể cả `display-money` và `screen-title` (đậm 700): `body`, `body-strong`, `amount`, `label`, `caption`, `overline`, `button-label`, `input-text`, `nav-label`.
- Cormorant Garamond (họ `brand`) chỉ còn cho `wordmark` (chữ LINDY OS), làm dấu hiệu thương hiệu. Cả hai họ chữ có đủ dấu tiếng Việt và tải từ Google Fonts.
- Số tiền dùng `font-variant-numeric: lining-nums tabular-nums` để các cột số thẳng hàng; `Money` đã đặt sẵn.
- Ô nhập luôn dùng `input-text` (16px) để Safari không tự phóng to khi chạm.
- `overline` là nhãn nhóm trên số liệu như “Doanh thu thuần”, 13px chữ thường (bỏ chữ hoa giãn vì gãy dòng). Chữ nhỏ nhất trên nội dung là 13px; 11px chỉ cho thanh dưới.
- `heading` 17px cho tiêu đề màn con và số phụ.

## Bố cục trên iPhone

- Lề hai bên `space-4`. Giữa các thẻ `space-3`, giữa các nhóm `space-6`.
- Trên cùng: `AppBar` với chữ LINDY OS và tên cơ sở. Dưới cùng: `BottomNav` 5 mục (Tổng quan, Đơn hàng, Lịch, Khách, Thêm), biểu tượng kèm chữ, cao `nav-h` cộng vùng an toàn thanh home.
- Không có `Fab` “+ Tạo đơn” (S16, 14/10/2026): mọi đơn tạo từ lịch.
- Hộp xác nhận và bottom sheet đóng bằng nút X ở góc phải trên (S05); không có nút “Thôi”, “Đóng”.
- Danh sách dùng `OrderRow` liền nhau, ngăn bằng `line`; không bọc từng dòng trong thẻ riêng.
- Không có bảng cuộn ngang trên điện thoại; bảng dài chuyển thành danh sách dòng.
- Luôn chừa `env(safe-area-inset-top)` và `env(safe-area-inset-bottom)` cho tai thỏ và thanh home.

## Bo góc, viền, bóng

- `radius-sm` cho ô lịch, ô bảng công; `radius-md` cho nút, ô nhập, `Toast`; `radius-lg` cho thẻ; `radius-xl` cho bảng trượt, hộp thoại; `radius-full` cho chip trạng thái, phân đoạn, huy hiệu, ô tích.
- Vòng focus bàn phím là `focus-ring`: khe màu nền 2px rồi vòng 2px, đạt 3:1 trên mọi nền surface.

## Chuyển động

Tối thiểu. Chỉ mờ dần hoặc trượt ngắn 120–160ms khi mở sheet hay `Toast`; nút co 4% khi nhấn. Tắt hết khi iPhone bật Giảm chuyển động.

## Biểu tượng

- Nét mảnh 1.7px, đầu và góc tròn, khung 24px, màu theo chữ. Không emoji.
- `Icon` có sẵn: home, receipt, calendar, user, more, plus, check, chevron-right, search, wallet, alert.
- Cần thêm thì dùng bộ Lucide (cùng kiểu nét mảnh), đặt stroke-width 1.7. Quán chưa có bộ biểu tượng riêng nên đây là bộ thay thế.

## Logo và biểu tượng app

- Logo quán đang được làm mới. Trong lúc chờ, chỗ đặt logo dùng chữ “LINDY OS” kiểu `wordmark`; không vẽ lại logo cũ.
- Biểu tượng ngoài màn hình chính: chữ L trắng trên nền mận (nhóm Brand, `lindy-os-app-icon.svg`), tên dưới biểu tượng là “LINDY OS”. Thay bằng logo mới khi có.

## Ảnh

Gần như không dùng ảnh: không ảnh minh hoạ, không ảnh nền. Màn đăng nhập cũng chỉ có chữ.

## Dùng trong app

- App chạy từ `src/styles/components.css` và `src/components/ui/`. `components/bundle.js`, `bundle.css` là bộ gốc Ngà & mực, chỉ để tra lịch sử.
- Tải phông: `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Cormorant+Garamond:wght@600&display=swap`.
- Giao diện tối theo `prefers-color-scheme`, sinh trong `src/styles/tokens.css`. Không có nút bật/tắt riêng.
- Định dạng tiền bằng `formatVND` ở `src/lib/money`. Tiền luôn là số nguyên VND.
