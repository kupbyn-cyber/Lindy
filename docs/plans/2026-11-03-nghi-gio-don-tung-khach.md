# Gói sửa 03/11/2026 — nghỉ giờ, tạo đơn từng khách, duyệt chi

## Phạm vi được chủ duyệt
1. Bỏ chip giờ bắt đầu ở Lịch mới; giữ ô ngày/giờ và chip thời lượng.
2. Nghỉ theo giờ trừ lương riêng dù còn ngày nghỉ hưởng lương. Ca 09:00–21:00, 12 giờ. Lương giờ = lương cứng / (ngày tháng − ngày nghỉ hưởng) / 12. Tính phút thực tế, làm tròn VND sau khi cộng tổng tháng. Chỉ nghỉ đã duyệt mới trừ; Nhung, Linh duyệt.
3. Mọi nhân viên tạo đơn cho mọi khách cùng cửa hàng; giữ quyền đọc/sửa đơn hiện hành.
4. Mỗi lần tạo một đơn cho khách được chọn; Nhung tạo khách 1, Chin tạo khách 2. Mỗi khách tối đa một đơn chưa huỷ.
5. Chỉ Linh duyệt/từ chối chi mọi mức tiền; Nhung vẫn ghi đã chi sau duyệt và duyệt nghỉ.

## Phản biện trước triển khai
- Không chỉ ẩn nút: kiểm quyền tại API và DB; bỏ quyền duyệt chi của quản lý trong danh mục và dữ liệu vai trò.
- Nghỉ giờ không đánh dấu vắng cả ngày, không dùng phép hưởng. Chặn trùng giờ (cả gửi song song), trùng nghỉ cả ngày, giờ ngoài ca và ngày sai. Khoảng tiếp giáp được phép. Không trừ thêm nếu ngày đã tính nghỉ nguyên ngày hoặc quán đóng cửa.
- Khoản trừ giờ cập nhật khi duyệt/huỷ và chính sách lương thay đổi; đóng băng cùng phiếu khi khoá. Chặn thay đổi nghỉ trong tháng đã khoá. Không lộ lương người khác.
- Tạo đơn phải chọn khách, không tạo hết nhóm. Khoá lịch khi tạo; unique index chặn trùng; gửi lại cùng mã không sinh thêm đơn. Không dùng mã yêu cầu của khách này cho khách khác.
- Lịch chỉ tự hoàn thành khi đủ đơn theo số khách và tất cả đã xác nhận. Cọc chia theo số khách trong lịch, không theo số đơn đã tạo.
- Dữ liệu cũ giữ nguyên; migration mới có kiểm nâng cấp.

## Trình tự
Migration → API/quyền → giao diện → kiểm thử nghiệp vụ/quyền → lint, typecheck, toàn bộ test, build, nâng cấp DB từ 0032 → rà diff → commit và push origin/main theo yêu cầu.

## Xác minh
- Lint, typecheck, toàn bộ 402 kiểm thử (38 file): đạt.
- Build production: đạt.
- Nâng cấp từ migration 0032 lên 0033 trên DB tạm có lịch, đơn, thu tiền cũ: đạt; các luồng đơn, cọc, thu chi, công/lương, báo cáo, sao lưu, nhập dữ liệu cũ đều qua.
- Test đồng thời phát hiện nhánh “đủ đơn” có thể trả nhầm một đơn khác người bấm xem được; đã sửa: khách được chọn có đơn thì trả 409, không tạo hoặc mở nhầm.
- Khi giảm số khách sau khi huỷ đơn khách không làm, DB tính lại trạng thái lịch.
- Sửa ca thử báo cáo tháng dùng khoảng ngày cố định theo tháng, tránh hai ngày thử khác nhau rơi vào cùng tháng khi đổi ngày chạy.
- Quyền migration thu hẹp chính xác vai trò manager; phiếu chi và kỳ lương cũ giữ dữ liệu.
- Chưa kiểm tra trực tiếp trên iPhone thật.
