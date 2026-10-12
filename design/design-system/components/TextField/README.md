# TextField

Ô nhập có nhãn, dùng cho chữ và cho số tiền.

- Truyền `label`, `value`, `onChange`. Với tiền, thêm `money`: bàn phím số trên iPhone, tự chèn dấu chấm ngăn nghìn, chữ “đ” ở cuối; nhận số nguyên qua `onValueChange`.
- `hint` là một dòng giúp đỡ (“Còn phải thu 152.000đ”); `error` thay hint khi sai và tô viền `danger`. Câu lỗi nói cần làm gì.
- Chữ trong ô luôn 16px (`input-text`) để Safari không tự phóng to.
- Nhãn luôn hiện phía trên ô; không dùng chữ mờ trong ô thay cho nhãn.
