# AppBar

Thanh trên cùng của mọi màn hình, gồm chữ LINDY OS và tên cơ sở đang xem.

- Truyền `branch` (ví dụ “CS 31/49 HTK”). `name` mặc định là “LINDY OS”; chỉ đổi khi có logo mới.
- `right` nhận một hoặc hai nút biểu tượng (tìm kiếm, lọc). Không đặt nút chữ ở đây.
- Tiêu đề màn hình không nằm trong AppBar: đặt ngay bên dưới, kiểu `screen-title`.
- Đã chừa vùng tai thỏ bằng `env(safe-area-inset-top)`.
