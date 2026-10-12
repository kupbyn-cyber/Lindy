# Bảng giá dịch vụ LINDY (CS HTK)

Chép từ ảnh menu của quán (`assets/bang-gia/`), ngày 12/10/2026, bổ sung theo câu trả lời C06–C13 (`docs/DECISIONS.md`). Bản để nhập vào app: `services.csv` và `combos.csv`.

Ký hiệu trên menu: `k` = nghìn đồng; `/n` = mỗi ngón; `/c` = mỗi cái; `/hình` = mỗi hình.

## Cơ bản

| Dịch vụ | Giá |
|---|---|
| Cắt sửa | 40.000đ |
| Sơn gel trơn | 70.000đ |
| Cứng móng (2 lớp) | 50.000đ |
| Cứng móng tạo cầu | 70.000đ |
| Sơn gel >3 màu | 80.000đ |
| Sơn nhũ | 80.000đ |
| Phá móng cũ | 20.000–50.000đ |
| Nhặt da | 40.000đ (không có trên ảnh menu; C06) |

## Design (theo ngón, trừ thú nổi)

| Dịch vụ | Giá |
|---|---|
| Mắt mèo | 7.000–10.000đ/ngón |
| Ombre | 8.000–10.000đ/ngón |
| Tráng gương | 8.000–10.000đ/ngón (menu ghi “8-10kn”) |
| French (menu ghi “Fench”) | 10.000–12.000đ/ngón |
| Loang | 8.000–12.000đ/ngón |
| Vẽ cơ bản | 5.000–30.000đ/ngón |
| Thú nổi | 30.000–50.000đ/hình |

## Phụ kiện

| Dịch vụ | Giá |
|---|---|
| Đá các loại | 4.000–50.000đ/ngón |
| Sticker | 5.000–20.000đ/ngón |
| Charm | 10.000–50.000đ/cái |
| Phụ kiện | 4.000–30.000đ/ngón |

## Móng giả

| Dịch vụ | Giá |
|---|---|
| Úp keo | 90.000đ |
| Úp base | 110.000đ |
| Nối móng + đắp gel | 220.000đ |
| Fill gel | 100.000đ |

## Chăm sóc

| Dịch vụ | Giá |
|---|---|
| Dưỡng móng | 30.000đ |
| Tẩy da chết, chà gót chân (menu ghi “Tdc”) | 80.000–100.000đ |
| Lấy khoé | 30.000–70.000đ |

## Mi

| Dịch vụ | Giá |
|---|---|
| Uốn mi Collagen | 180.000đ |
| Uốn mi phủ đen | 220.000đ |

## Combo nail

| Combo | Giá | Gồm | Menu ghi |
|---|---|---|---|
| Móng thật 99k | 99.000đ | Nhặt da + cắt sửa + sơn trơn | Tiết kiệm 10k |
| Móng thật 139k | 139.000đ | Nhặt da + cắt sửa + sơn trơn + cứng móng | Tiết kiệm 10k |
| Móng giả 179k | 179.000đ | Nhặt da + cắt sửa + úp keo + sơn trơn | Tiết kiệm 20k |
| Móng giả 199k | 199.000đ | Nhặt da + cắt sửa + úp base + sơn trơn | Tiết kiệm 20k |

“Sơn trơn” trong combo là Sơn gel trơn (C08). App bán combo **đúng giá niêm yết** (C07) và không dùng dòng “tiết kiệm”. Với nhặt da 40.000đ, số tiết kiệm thực tế là 51.000–61.000đ, khác số ghi trên menu.

## Bảo hành (C12)

Áp cho mọi dịch vụ, tính từ ngày làm dịch vụ: bill có **cứng móng** (Cứng móng 2 lớp, Cứng móng tạo cầu, Combo 139k) bảo hành **7 ngày**; bill không có cứng móng bảo hành **3 ngày**. Trong hạn: lỗi kỹ thuật sửa miễn phí, khách đổi ý tính phí (Q12).

Chân trang menu cũ ghi “LINDY bảo hành 7 ngày để nàng yên tâm làm đẹp nha!” và Instagram `@lindynailashstudio`; Instagram đúng là **@lindy.nailashstudio** (C13).

## Ghi chú khi đưa vào app

- Màn tạo đơn mở **danh sách tích chọn** các hạng mục như menu, có **tìm kiếm thông minh** (gõ không dấu, gõ tắt); chọn xong app **tự điền tiền** (C09). Linh thêm hạng mục mới trong Cài đặt.
- Dịch vụ giá cố định: `price_mode = list`. Dịch vụ giá khoảng: `price_mode = custom`; số tự điền và cách xử lý khi sửa ra ngoài khoảng còn chờ (OPEN_QUESTIONS câu 1).
- Dịch vụ tính theo ngón/hình/cái: dòng đơn có **số lượng** × **đơn giá**. Ví dụ mắt mèo 10 ngón × 8.000đ = 80.000đ.
- Combo bán như một dòng giá cố định; nhiều thợ cùng làm thì **nhập tay số tiền** từng thợ, tổng bằng giá combo (C10).
- Giảm giá áp được lên combo và được cộng dồn (C11); cách cộng còn chờ (OPEN_QUESTIONS câu 2).
- Chưa có thời lượng từng dịch vụ; lịch đặt dùng mặc định 120 phút (B09).
