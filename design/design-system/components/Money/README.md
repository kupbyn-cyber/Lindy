# Money

Hiển thị một số tiền VND theo đúng quy ước `8.450.000đ`, chữ số thẳng cột.

- Truyền `value` là số nguyên VND. Không tự ghép chuỗi tiền ở nơi khác; dùng Money hoặc `LindyOS.formatVND`.
- `size`: `xl` (chữ có chân `display-money`, tối đa một lần mỗi màn hình), `md` (mặc định, `amount`), `sm` (`label`).
- `tone`: `muted` cho số phụ, `negative` cho số âm và chênh lệch thiếu (màu `danger`), `positive` khi cần nhấn số dương (`success`). Màu không thay chữ: số âm luôn có dấu “−”.
- `sign` thêm dấu “+” cho số dương, dùng ở dòng biến động quỹ.
