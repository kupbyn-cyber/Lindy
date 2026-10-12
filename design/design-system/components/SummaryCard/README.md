# SummaryCard

Thẻ số liệu chính của màn Tổng quan: một nhãn, một số tiền lớn và vài dòng giải thích bên dưới.

- Truyền `label` (ví dụ “Doanh thu thuần”), `value` (số nguyên VND), `rows` gồm `{ label, value, tone? }` và `footnote` một dòng tóm tắt.
- Mỗi màn hình chỉ một SummaryCard, vì số lớn dùng `display-money`. Số liệu phụ khác đặt trong thẻ thường hoặc danh sách.
- Không trộn các khái niệm: doanh thu thuần, tiền đã thu và còn khách nợ là ba dòng riêng, đúng tên như bản đặc tả.
- Số liệu luôn của cơ sở và ngày đang chọn; thợ chỉ thấy thẻ với số của chính mình.
