# OrderRow

Một dòng trong danh sách đơn: mã đơn, khách, giờ và thợ bên trái; số tiền và trạng thái bên phải.

- Truyền `code` (“#0142”), `customer` (bỏ trống với khách lẻ), `time`, `staff` (tên thợ, cách nhau bằng dấu phẩy), `amount`, `status` và `onClick` để mở chi tiết.
- Đặt các dòng liền nhau, ngăn bằng `line`; không bọc từng dòng trong thẻ.
- Trạng thái hiện một chip: ưu tiên trạng thái cần xử lý. Đơn chưa xác nhận hiện `awaiting`; đơn đã xác nhận hiện trạng thái thu tiền (`paid`, `partial`, `unpaid`).
- Thợ chỉ thấy dòng của đơn có phần mình làm.
