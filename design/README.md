# Giao diện LINDY OS

- **Bản gốc (có xem trước trực tiếp):** https://claude.ai/artifact/AVWhQDVKgZyiq6ig5VgpP3
- **Bản sao trong thư mục này:** `design-system/`, sao ngày 12/10/2026. Nếu bản gốc được sửa trên trang, bản gốc là chuẩn; sao lại về đây khi bắt đầu code.

## Tóm tắt lựa chọn (phiếu 2, G01–G26)

- Phong cách **Ngà & mực**: nền ngà, chữ mực ấm ngả nâu, một màu nhấn mận.
- Tiêu đề và số tiền lớn: Cormorant Garamond. Nội dung: Be Vietnam Pro. Cỡ chữ vừa, mật độ dày, ô nhập 16px.
- Sáng/tối tự đổi theo cài đặt iPhone.
- Trạng thái tiền: xanh (đã thu đủ), cam (thu một phần), đỏ (chưa thu), luôn kèm chữ.
- Thanh điều hướng dưới 5 mục, biểu tượng nét mảnh kèm chữ; nút tròn “+ Tạo đơn” ở góc phải dưới.
- Biểu tượng app: chữ L trắng trên nền mận (tạm, chờ logo mới).

## Trong `design-system/`

| File | Nội dung |
|---|---|
| `README.md` | Quy tắc dùng màu, chữ, bố cục, giọng văn |
| `tokens.json` | 16 màu (sáng + tối), 12 kiểu chữ, khoảng cách, bo góc, kích thước vùng chạm, bóng |
| `components/bundle.js`, `bundle.css`, `index.d.ts` | 12 thành phần React (`window.LindyOS`) |
| `components/<Tên>/README.md` | Hướng dẫn từng thành phần |
| `assets/Brand/lindy-os-app-icon.svg` | Biểu tượng app |

Lưu ý: file `preview.html` trong từng thành phần chạy trong trang Design System trên claude.ai (được nạp sẵn token và React), không mở trực tiếp được.
