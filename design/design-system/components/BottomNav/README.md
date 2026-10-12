# BottomNav

Thanh điều hướng dưới cùng với 5 mục cố định, biểu tượng nét mảnh kèm chữ.

- Mặc định 5 mục: Tổng quan, Đơn hàng, Lịch, Khách, Thêm. Truyền `active` (key mục đang mở) và `onChange`.
- `items[].badge` hiện số việc cần xử lý (ví dụ số đơn chờ xác nhận). Chỉ dùng cho việc phải làm, không dùng để quảng bá.
- Không thêm mục thứ sáu, không ẩn chữ: người mới dùng phải hiểu ngay.
- Mục đang chọn tô `accent`, các mục khác `ink-muted`. Đã chừa vùng thanh home bằng `env(safe-area-inset-bottom)`.
