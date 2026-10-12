# SegmentedControl

Nút chuyển giữa hai đến bốn cách xem cùng một dữ liệu, ví dụ “Hôm nay | Tháng” trên Tổng quan.

- Truyền `options` (chuỗi hoặc `{ value, label }`), `value` và `onChange`.
- Chỉ dùng khi các lựa chọn loại trừ nhau và đổi ngay nội dung bên dưới. Cần lọc nhiều điều kiện thì dùng màn lọc riêng.
- Nhãn ngắn, tối đa hai từ mỗi mục.
