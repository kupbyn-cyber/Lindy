# Kế hoạch — Ảnh thành phẩm có khung (S18–S21)

**Ngày:** 15/10/2026 · **Trạng thái:** CHỜ DUYỆT. Mẫu khung: https://claude.ai/artifact/Ckn7GoA2hmRMWF7w3oE9ST

## 1. Hiểu yêu cầu

Thợ bấm Làm xong → có nút **Chụp ảnh** → chụp (hoặc chọn ảnh có sẵn) → app ghép khung → **Lưu / Chia sẻ** để lưu vào Ảnh hoặc đăng Instagram, Zalo. Hai kiểu khung: Đăng Instagram và Nội bộ (kiểu Timemark). Khổ 4:5. Ảnh không lưu vào app.

## 2. Cách làm

- **Chỉ làm ở trình duyệt**, không đổi DB, không API mới. Ảnh không rời điện thoại.
- Chụp: `<input type="file" accept="image/*" capture="environment">` (mở camera iPhone) và một input không `capture` cho "Chọn ảnh có sẵn". Không dùng camera trực tiếp trong trang (app ghim ra màn hình chính hay hỏi lại quyền, dễ lỗi).
- Đọc ảnh bằng `createImageBitmap(file, { imageOrientation: 'from-image' })` để đúng chiều ảnh iPhone; lỗi thì dùng `<img>`.
- Vẽ khung bằng canvas 1080 × 1350, đúng mã của mẫu artifact. Chờ font tải xong trước khi vẽ. Chữ LINDY dùng Cormorant Garamond, mọi chữ khác Be Vietnam Pro (dấu tiếng Việt đầy đủ).
- Lưu: `navigator.share({ files: [jpg] })` mở bảng chia sẻ iPhone (Lưu hình ảnh, Instagram, Zalo). Máy không hỗ trợ chia sẻ tệp thì mở ảnh ở trang riêng, nhấn giữ để lưu.
- Thông tin trên khung lấy từ đơn: dịch vụ (tên các dòng, cắt gọn), thợ (tên những người được chia phần), ngày làm dịch vụ; khung nội bộ thêm mã đơn, "Khách 2/2", tên khách che bớt, giờ chụp.

## 3. Phạm vi

**Làm:** bảng "Ảnh thành phẩm" mở sau khi bấm Làm xong thành công và từ nút "Chụp ảnh" ở chi tiết đơn (đơn chưa huỷ, người xem được đơn). Chọn kiểu khung, xem trước, chụp lại, Lưu / Chia sẻ.

**Không làm:** lưu ảnh vào app (S21); camera trực tiếp có khung lúc ngắm; sửa, lọc màu ảnh; tỉ lệ 9:16.

## 4. File

| File | Việc |
|---|---|
| `src/lib/photo-frame.ts` (mới) | Hàm vẽ hai khung, che tên khách, đọc ảnh đúng chiều, xuất JPEG |
| `src/components/don-hang/PhotoSheet.tsx` (mới) | Bảng chụp / chọn ảnh, chọn khung, xem trước, Lưu / Chia sẻ |
| `src/components/don-hang/OrderView.tsx` | Nút "Chụp ảnh"; mở bảng sau khi Làm xong |
| `tests/unit/photo-frame.test.ts` (mới) | Che tên khách, cắt chữ dài, chọn dòng thông tin theo kiểu khung |

## 5. Các bước

- [ ] **7.1** `photo-frame.ts` + test đơn vị (che tên, thông tin khung không có tên khách / giá ở kiểu Instagram). *Kiểm:* `bun run test`.
- [ ] **7.2** `PhotoSheet` + nút trong `OrderView`. *Kiểm:* trình duyệt local cỡ 375px: chọn ảnh, đổi khung, xem trước; ảnh xuất đúng 1080 × 1350.
- [ ] **7.3** `bun run check`, `bun run build`. Anh thử trên iPhone: chụp, chọn ảnh HEIC trong thư viện, Lưu / Chia sẻ, đăng thử Instagram.

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Ảnh HEIC trong thư viện không đọc được trên iPhone đời cũ | Báo "Không đọc được ảnh này, chụp mới hoặc chọn ảnh khác". Camera trong app trả JPEG nên chụp mới luôn được. |
| Bảng chia sẻ không có trên máy tính | Mở ảnh ở trang riêng để tải hoặc nhấn giữ lưu. |
| Ảnh lớn (48MP) làm chậm máy | Vẽ thẳng xuống 1080 × 1350, không giữ ảnh gốc trong bộ nhớ lâu. |
