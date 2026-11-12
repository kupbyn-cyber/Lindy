# Brief: Hiện dịch vụ trên ô lịch

- Trạng thái: Đã duyệt (12/11/2026)
- Chế độ: Đầy đủ
- Dự án: LINDY OS (`kupbyn-cyber/lindy`)

## Vấn đề
Nhìn màn Lịch không biết khách đặt dịch vụ gì: ô lịch chỉ có số khách, tên, SĐT, giờ (S10). Ô "Dịch vụ dự kiến" ẩn sau nút mở thêm trong form, nên nhân viên ít điền hoặc gõ lẫn vào ô tên ("Nga tay ch…", "Ngọc Chi - …"). Thợ cần biết để chuẩn bị, Linh/Nhung cần xem tải khung giờ, lễ tân cần biết khi khách tới.

## Người dùng
Toàn bộ nhân viên (thợ, lễ tân, Linh, Nhung), dùng Safari trên iPhone, xem lịch nhiều lần trong ca và tạo lịch nhanh khi khách nhắn.

## Hướng đã chọn
Ô lịch thay dòng SĐT bằng dịch vụ. Form lịch hiện sẵn ô Dịch vụ, có chip chạm nhanh, vẫn gõ tự do; Linh tự sửa bộ chip. Không chọn "chọn từ danh mục giá" vì nhập chậm và đổi dữ liệu lịch; không chọn "thêm dòng thứ 4" vì ô lịch 1 tiếng không đủ chỗ.

## Phạm vi bản đầu
- [ ] Ô lịch màn Ngày và Tuần hiện theo thứ tự: (số khách ·) Tên → Dịch vụ → Giờ; bỏ SĐT khỏi ô (thay một phần S10). Dấu chưa cọc, màu S31 giữ nguyên.
- [ ] Chi tiết lịch và màn Danh sách vẫn hiện SĐT như cũ.
- [ ] Form lịch mới / sửa: ô Dịch vụ hiện sẵn (không ẩn sau nút), có hàng chip; chạm chip là nối vào ô, chạm lại là bỏ; gõ tự do vẫn được; giữ giới hạn 200 ký tự.
- [ ] Bộ chip theo cơ sở; Linh (người có quyền cài đặt quán) sửa ở Thêm → Cài đặt quán: thêm, xoá, đổi tên, đổi thứ tự. Mặc định: Tay · Chân · Gel · Móng giả · Design · Mi · Chăm sóc.
- [ ] Ghi quyết định mới (S65) vào `docs/DECISIONS.md`.

## Để sau
- Chọn đúng dịch vụ trong bảng giá và mang sang đơn
- Tô màu ô lịch theo nhóm dịch vụ
- Tự tách dịch vụ khỏi tên ở lịch cũ
- Lọc / thống kê lịch theo dịch vụ
- Bộ chip trong tool MCP

## Tiêu chí xong
- Tạo lịch có dịch vụ "Tay + Chân · Gel" chỉ bằng chạm chip, không gõ phím, ô Dịch vụ thấy ngay khi mở form.
- Trên iPhone, màn Ngày có 5 lịch trùng giờ: ô lịch 2 tiếng đọc được tên và đầu dòng dịch vụ; không còn SĐT trên ô.
- Bấm vào ô lịch → chi tiết vẫn có SĐT và nút gọi; màn Danh sách vẫn có SĐT.
- Linh thêm chip "Úp móng" ở Cài đặt quán → mở form lịch mới thấy chip đó; tài khoản thợ không vào được trang sửa chip (server từ chối).
- Lịch cũ chưa có dịch vụ: ô lịch không hiện dòng trống thừa.
- lint, typecheck, test, build đều qua.

## Ràng buộc
- Stack / hosting: TanStack Start + PostgreSQL 16 theo `docs/TECH_STACK.md`; chạy local trước, triển khai Vibe Host khi anh yêu cầu.
- Dữ liệu / tích hợp: `appointments.service_summary` giữ là chữ tự do; bộ chip cần nơi lưu theo cơ sở (có thể thêm migration). Phân quyền kiểm ở server và DB.
- Hạn chót: chưa đặt.

## Giả định
- Màn Tuần cũng thay SĐT bằng dịch vụ như màn Ngày (anh đồng ý theo phạm vi).
- Chip nối bằng " + " (vd "Tay + Chân + Gel"); vị trí ô Dịch vụ ngay dưới ô Tên/SĐT.
- Ô quá hẹp thì dịch vụ cắt "…" một dòng; ô lịch đủ cao thì cho xuống tối đa 2 dòng.
- Thông báo màn hình khoá không đổi.
- Lịch cũ có dịch vụ lẫn trong tên: không tự sửa (theo S40).

## Câu hỏi còn mở
- Không còn: đã kiểm dữ liệu thật 29/10–12/11/2026 qua MCP: 166 lịch, chỉ 16 (10%) có điền Dịch vụ, khoảng 121 lịch gõ dịch vụ lẫn trong tên ("Tay chân emcuniuy", "Phương - tay - 17h30 29/10"). Chip là phần chính, không chỉ hiển thị.
- Quyền sửa chip: dùng quyền cài đặt quán sẵn có hay chỉ Chủ — vibe-plan đối chiếu bảng quyền hiện tại.
