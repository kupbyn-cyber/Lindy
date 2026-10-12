LINDY OS là app quản lý nội bộ của Lindy Nailash Studio, dùng chủ yếu trên iPhone. Giao diện theo phong cách **Ngà & mực**: nền ngà, chữ mực ấm ngả nâu, tiêu đề và số tiền lớn dùng chữ có chân thanh lịch, nội dung dùng chữ không chân dễ đọc, một màu mận duy nhất cho hành động chính. Ba từ khoá: **tối giản, hiện đại, dịu nhẹ**. Người dùng ghét nhất là phải bấm nhiều bước mới xong việc, nên mỗi màn hình phục vụ một việc và việc đó xong bằng ít lần chạm nhất.

## Nguyên tắc

- Số liệu trước, trang trí sau. Không ảnh minh hoạ; màn hình là chữ, số và đường kẻ mảnh.
- Một màu nhấn. `accent` chỉ cho hành động chính (`Fab` “+ Tạo đơn”, `Button` primary) và mục đang chọn. Không tô `accent` lên mảng nền lớn.
- Viền mảnh thay bóng. Thẻ và dòng dùng `line`. Bóng chỉ cho thứ nổi trên màn hình: `Fab` (`shadow-fab`), `Toast` và bottom sheet (`shadow-lg`).
- Mật độ dày nhưng chạm thoải mái: mọi vùng chạm cao ít nhất `tap-min`.
- Ít bước: tạo đơn, xác nhận bill, ghi tiền không quá ba lần chạm kể từ màn hình đang mở. Một màn hình chỉ có một `Button` primary.

## Giọng văn

- Ngắn gọn, trung tính, không xưng hô. Nút bắt đầu bằng động từ: “Tạo đơn”, “Làm xong”, “Xác nhận bill”, “Ghi tiền”, “Chốt ngày”.
- Báo kết quả bằng một câu, kết bằng dấu chấm: “Đã lưu đơn #0142.”, “Đã xác nhận bill.”. Không dấu chấm than, không emoji.
- Lỗi nói rõ sai gì và cần làm gì: “Giảm giá vượt 10%. Cần Nhung duyệt.”, “Phiếu chi trên 1.000.000đ. Cần Linh duyệt.”
- Dùng đúng tên nghiệp vụ của quán: đơn, bill, thợ, khách lẻ, chờ xác nhận, chốt ngày, tạm ứng. Không dùng từ kỹ thuật.
- Số tiền luôn đầy đủ dạng `8.450.000đ`: dấu chấm ngăn nghìn, chữ đ liền sau. Số âm dùng dấu trừ “−”. Ngày `dd/mm/yyyy`, giờ `14:20`.

## Màu

- Nền trang `surface`; thẻ, dòng, thanh dưới, ô nhập `surface-raised`; nền phân đoạn và dòng đang nhấn `surface-sunken`.
- Chữ chính `ink`, chữ phụ `ink-muted`. Cả hai đọc được trên ba nền surface ở cả hai giao diện.
- Đường kẻ `line`. Viền ô nhập và nút phụ `line-strong` (đạt 3:1).
- Nút chính: nền `accent`, chữ `on-accent`. Nền nhạt sau chữ `accent`: `accent-soft`.
- Trạng thái tiền có cặp màu riêng và **luôn có chữ đi kèm**, không bao giờ chỉ là chấm màu: Đã thu đủ `success` trên `success-soft`; Thu một phần `warning` trên `warning-soft`; Chưa thu `danger` trên `danger-soft`. `danger` còn dùng cho số âm, chênh lệch quỹ và nút nguy hiểm.
- Giao diện tự đổi sáng/tối theo cài đặt của iPhone. Mọi màu lấy từ token; không viết màu cứng. Trên `accent` luôn dùng `on-accent`, vì giao diện tối cần chữ tối.
- Màu thương hiệu be, nâu, trắng nằm trong các màu trung tính: `surface` (ngà), `line-strong` (nâu xám), `ink` (nâu đen).

## Chữ

- Cormorant Garamond (họ `display`) chỉ cho ba kiểu: `display-money` (tối đa một lần mỗi màn hình), `screen-title`, `wordmark`.
- Be Vietnam Pro (họ `sans`) cho mọi thứ còn lại: `body`, `body-strong`, `amount`, `label`, `caption`, `overline`, `button-label`, `input-text`, `nav-label`. Cả hai họ chữ có đủ dấu tiếng Việt và tải từ Google Fonts.
- Số tiền dùng `font-variant-numeric: lining-nums tabular-nums` để các cột số thẳng hàng; `Money` đã đặt sẵn.
- Ô nhập luôn dùng `input-text` (16px) để Safari không tự phóng to khi chạm.
- `overline` viết hoa bằng CSS, cho nhãn nhóm trên số liệu như “DOANH THU THUẦN”.

## Bố cục trên iPhone

- Lề hai bên `space-4`. Giữa các thẻ `space-3`, giữa các nhóm `space-6`.
- Trên cùng: `AppBar` với chữ LINDY OS và tên cơ sở. Dưới cùng: `BottomNav` 5 mục (Tổng quan, Đơn hàng, Lịch, Khách, Thêm), biểu tượng kèm chữ, cao `nav-h` cộng vùng an toàn thanh home.
- `Fab` “+ Tạo đơn” nổi góc phải dưới, cách thanh dưới `space-4`, có trên mọi màn hình trừ khi đang nhập đơn. Cuối danh sách chừa `space-8` để dòng cuối không nằm dưới `Fab`.
- Danh sách dùng `OrderRow` liền nhau, ngăn bằng `line`; không bọc từng dòng trong thẻ riêng.
- Không có bảng cuộn ngang trên điện thoại; bảng dài chuyển thành danh sách dòng.
- Luôn chừa `env(safe-area-inset-top)` và `env(safe-area-inset-bottom)` cho tai thỏ và thanh home.

## Bo góc, viền, bóng

- `radius-md` cho nút, thẻ, ô nhập, `Toast`; `radius-sm` cho chip; `radius-lg` cho bottom sheet và hộp xác nhận; `radius-full` cho `Fab`, huy hiệu số và nhãn cơ sở.
- Vòng focus bàn phím là `focus-ring`: khe màu nền 2px rồi vòng `accent` 2px, đạt 3:1 trên mọi nền surface.

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

- Thành phần React nằm ở `components/bundle.js` dưới tên `window.LindyOS`, cần React 18 và stylesheet `components/bundle.css` nạp sau token.
- Tải phông: `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=Cormorant+Garamond:wght@600&display=swap`.
- Giao diện tối: đặt `data-theme="dark"` lên thẻ `html` khi `matchMedia('(prefers-color-scheme: dark)')` khớp, và lắng nghe sự kiện `change` để đổi theo máy. Không có nút bật/tắt riêng.
- Định dạng tiền bằng `LindyOS.formatVND(n)`; đọc số từ ô nhập bằng `LindyOS.parseVND(text)`. Tiền luôn là số nguyên VND.
