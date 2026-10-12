# Toast

Thông báo ngắn sau một thao tác, hiện vài giây ở phía dưới, trên `BottomNav`.

- `children` là một câu ngắn kết bằng dấu chấm: “Đã lưu đơn #0142.”. Không dấu chấm than, không emoji.
- `tone="success"` (mặc định) báo đã xong. `tone="error"` báo lỗi kèm việc cần làm: “Giảm giá vượt 10%. Cần Nhung duyệt.”
- Lỗi chặn thao tác (thiếu quyền, thiếu dữ liệu) hiện ngay tại ô nhập hoặc trong hộp xác nhận; Toast chỉ để báo kết quả.
- Mỗi lần chỉ một Toast.
