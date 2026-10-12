# StatusChip

Nhãn trạng thái ngắn của đơn hoặc của việc thu tiền, luôn có chữ chứ không chỉ có màu.

- `status` thu tiền: `paid` (Đã thu đủ, `success`), `partial` (Thu một phần, `warning`), `unpaid` (Chưa thu, `danger`), `refund_partial`, `refund_full`.
- `status` đơn: `draft`, `in_progress`, `awaiting` (Chờ xác nhận, `accent`), `confirmed`, `cancelled`.
- Chữ mặc định đúng tên trong bản đặc tả; chỉ truyền `children` khi cần chữ khác hẳn và vẫn giữ ý nghĩa của màu.
- Không dùng màu trạng thái cho trang trí, và không đặt hai chip cùng lúc trên một dòng.
