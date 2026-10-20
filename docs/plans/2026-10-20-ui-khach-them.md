# Kế hoạch: làm gọn hai tab Khách và Thêm

Ngày 20/10/2026. Trạng thái: **anh duyệt A–C ngày 20/10/2026, đã code xong 21/10/2026.** `bun run check` 368 test qua; build, quét bundle qua. Đã thử trên local (375px, sáng và tối) với Linh, Nhung, Trang.

## Đánh giá hiện trạng

### Tab Khách (`src/routes/_app/khach/index.tsx`)

1. **Tên khách lẫn SĐT, giờ, dịch vụ.** 30 khách gần đây trên bản thật (20/10/2026): 8 tên có SĐT, 10 tên có giờ hoặc ngày, 11 tên dài hơn 30 ký tự. Ví dụ "Tú - 0969038498 - tay móng thường - 19/10 1:30…". Nguyên nhân: nhân viên dán cả tiêu đề lịch kiểu Apple Calendar vào ô **Tên khách** của form lịch, dù form đã có ô SĐT và Dịch vụ riêng. Đây là vấn đề lớn nhất, không sửa được chỉ bằng giao diện.
2. **SĐT lộ đủ số trong tên**, trong khi dòng dưới lại che (0949•••958): vừa rối, vừa trái quy tắc che SĐT trên danh sách [P34].
3. **"lần gần nhất 20/10/2026" lặp lại ở mọi dòng.** Danh sách đã xếp theo ngày, nên ngày nên là tiêu đề nhóm.
4. **Thiếu thông tin hữu ích:** không biết khách quen hay khách mới (số lần làm). Hồ sơ có số này nhưng danh sách thì không.
5. **Ô tìm kiếm** có nhãn "Tìm tên hoặc SĐT" đặt trên ô cao: tốn chỗ, không có biểu tượng tìm kiếm, cuộn xuống là mất.
6. Hồ sơ khách: khối **Thay đổi hồ sơ** dùng kiểu hộp khác hẳn phần còn lại và luôn mở.

### Tab Thêm (`src/routes/_app/them/index.tsx`)

1. **Một danh sách phẳng 18 mục** (tài khoản Linh), không chia nhóm: Thông báo, Đổi mật khẩu (cá nhân) nằm trên cùng; Tài khoản (quản trị) xen giữa; việc hằng ngày (Chốt quỹ, Thu chi) lẫn với việc vài tháng mới làm (Nhập dữ liệu cũ, Dữ liệu dùng thử).
2. **Thứ tự không theo tần suất dùng.** Việc làm mỗi ngày phải cuộn tìm.
3. **Gợi ý dưới tên bị cắt** ("…hoa hồng theo t…"), có gợi ý lặp lại tên mục.
4. **Không có số việc chờ**: Cần xem lại, Thu chi chờ duyệt, Chấm công chưa duyệt chỉ thấy ở Tổng quan.
5. Đầu trang chỉ có tên ("Linh"), không có vai trò, cơ sở.

## Mục tiêu và thế nào là xong

- Thêm: mục chia nhóm theo việc, việc hằng ngày ở trên, cá nhân và đăng xuất ở cuối; gợi ý không bị cắt trên iPhone 375px; mục có việc chờ hiện số.
- Khách: danh sách nhóm theo ngày, mỗi dòng có tên, SĐT che, số lần làm; ô tìm có biểu tượng, gọn.
- Tên khách mới không còn lẫn SĐT (nếu anh duyệt phần C).
- Thợ, Nhung, Linh mỗi người chỉ thấy nhóm có mục mình được dùng (quyền giữ nguyên).
- `bun run check`, `bun run build` qua; thử trên local ở khổ 375px, cả giao diện sáng và tối.

## Phạm vi

**Không làm:** không đổi quyền, không đổi đường dẫn các màn, không thêm trường cho khách (CRM giữ tên, SĐT, lịch sử đơn), không tự sửa tên khách cũ, không thêm biểu tượng cho từng dòng (theo design system: chữ, số, đường kẻ).

## Phần A — Tab Thêm

Sáu nhóm, nhóm nào không có mục theo quyền thì ẩn:

| Nhóm | Mục (theo thứ tự) | Linh | Nhung | Thợ |
|---|---|---|---|---|
| Hằng ngày | Chốt quỹ, Thu chi, Chấm công, Cần xem lại | 4 | 3 | 2 |
| Tiền và báo cáo | Sổ tiền, Báo cáo doanh thu, Lương, Tạm ứng | 4 | 4 | 2 |
| Nhân sự | Nhân viên, Tài khoản | 2 | 1 | — |
| Cài đặt quán | Danh mục dịch vụ, Cài đặt lịch, Máy in bill | 3 | — | — |
| Dữ liệu | Xuất dữ liệu, Nhập dữ liệu cũ, Dữ liệu dùng thử | 3 | — | — |
| Cá nhân | Thông báo, Đổi mật khẩu, nút Đăng xuất | 2 | 2 | 2 |

(Bản phác trong cuộc trò chuyện gộp vài dòng cho gọn; app thật vẫn mỗi mục một dòng.)

- A1. Chia nhóm như bảng, tiêu đề nhóm kiểu `overline` như các màn khác.
- A2. Gợi ý rút còn một dòng ngắn (≤ 30 ký tự), ví dụ Nhân viên: "Ngày vào làm, lương cứng"; Thu chi của thợ: "Đề nghị chi".
- A3. Số việc chờ bên phải mục: Cần xem lại, Thu chi (chờ duyệt / chờ chi), Chấm công (ngày chưa duyệt, đơn nghỉ), Tạm ứng, Chốt quỹ ("Chưa chốt 19/10"). Lấy lại đúng số của thẻ Cần xử lý ở Tổng quan, không tính thêm.
- A4. Đầu trang: "Linh · Chủ · CS 31/49 HTK" (thêm tên vai trò vào phiên đăng nhập).

## Phần B — Tab Khách

- B1. Ô tìm có biểu tượng kính lúp, chữ gợi ý trong ô, bỏ nhãn phía trên; ô dính ở đầu khi cuộn.
- B2. Chưa gõ tìm: nhóm theo ngày gần nhất ("Hôm nay · 20/10", "Hôm qua · 19/10", "18/10"); bỏ "lần gần nhất…" ở từng dòng. Đầu trang ghi "30 khách có đơn gần đây".
- B3. Dòng phụ: SĐT che · số lần làm ("lần đầu", "3 lần"). Server đếm đơn chưa huỷ, trong phạm vi người xem thấy (K09).
- B4. Kết quả tìm kiếm: giữ dạng một danh sách, dòng phụ thêm ngày gần nhất (vì không nhóm theo ngày).
- B5. Trên danh sách, SĐT nằm lẫn trong tên cũng được che (giống dòng phụ). Hồ sơ khách vẫn hiện tên đầy đủ để sửa.
- B6. Hồ sơ khách: khối Thay đổi hồ sơ thu gọn thành một dòng "Lịch sử sửa hồ sơ (2)", bấm mới mở, cùng kiểu dòng với phần còn lại.

## Phần C — Chặn tên lộn xộn từ gốc (cần anh quyết)

- C1. Form tạo/sửa lịch và ô khách khi tạo đơn: ô Tên có SĐT mà ô SĐT đang trống thì **tự chuyển SĐT sang ô SĐT**, bỏ khỏi tên, báo một dòng "Đã chuyển 0969038498 sang ô SĐT." Tên dài trên 30 ký tự hoặc có giờ, ngày thì nhắc "Ô tên chỉ ghi tên khách; giờ, dịch vụ có ô riêng." (nhắc, không chặn lưu).
- C2. Dọn tên cũ: trên danh sách Khách, Linh và Nhung (quyền `customers.edit`) thấy nhãn **Sửa tên** ở khách có SĐT hoặc giờ trong tên; bấm vào hồ sơ → Sửa như hiện nay. App không tự sửa tên.

## File sẽ sửa

| File | Phần |
|---|---|
| `src/routes/_app/them/index.tsx` | A1–A4 |
| `src/server/auth/session.ts`, `src/lib/me.ts` | A4: tên vai trò trong phiên |
| `src/routes/_app/khach/index.tsx` | B1–B5, C2 |
| `src/server/customers/service.ts` | B3 số lần làm, B5 che SĐT trong tên, C2 cờ tên cần sửa |
| `src/routes/_app/khach/$id.tsx` | B6 |
| `src/components/lich/AppointmentForm.tsx`, `src/components/don-hang/pickers.tsx`, `src/lib/phone.ts` | C1 |
| `tests/integration/customers.test.ts`, `tests/unit/lib.test.ts` | Test B3, B5, C1 (tách SĐT khỏi tên) |
| `docs/DECISIONS.md` (S40), `docs/CHAY_LOCAL.md` | Ghi lại sau khi duyệt |

## Các bước

- [x] 1. Thêm: chia nhóm, rút gợi ý (A1, A2). Kiểm: local đăng nhập Linh, Nhung, Trang ở khổ 375px, đúng nhóm theo quyền, không chữ bị cắt.
- [x] 2. Thêm: số việc chờ, đầu trang có vai trò (A3, A4). Kiểm: test phiên có tên vai trò; local số khớp thẻ Cần xử lý.
- [x] 3. Khách: server số lần làm, che SĐT trong tên (B3, B5). Kiểm: test `customers.test.ts` (thợ chỉ đếm đơn trong phạm vi K09).
- [x] 4. Khách: ô tìm, nhóm theo ngày, dòng phụ, hồ sơ (B1, B2, B4, B6). Kiểm: local, sáng và tối.
- [x] 5. Phần C (nếu duyệt): tách SĐT khỏi tên ở form, nhãn Sửa tên. Kiểm: test hàm tách SĐT; local gõ "Tú - 0969038498 - tay 13h".
- [x] 6. `bun run check`, `bun run build`, quét bundle; ghi S40; commit từng bước, không push.

## Rủi ro và cách quay lại

- Thêm có số việc chờ cần dữ liệu Cần xử lý: dùng lại truy vấn đã có (cùng khoá cache với Tổng quan), không thêm truy vấn nặng.
- C1 tự chuyển SĐT có thể bắt nhầm dãy số không phải SĐT: chỉ bắt số đúng dạng SĐT Việt Nam (đã có `normalizePhone`), và báo rõ để người nhập sửa lại được.
- Không migration, không đổi dữ liệu: quay lại bằng `git revert`.
