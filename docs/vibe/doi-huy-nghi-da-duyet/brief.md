# Brief: Nhân viên xin đổi / huỷ ngày nghỉ đã duyệt

- Trạng thái: Đã duyệt (12/11/2026)
- Chế độ: Đầy đủ
- Dự án: LINDY OS (`kupbyn-cyber/lindy`)

## Vấn đề
Đơn nghỉ hiện không sửa được (`leave_guard`: "huỷ rồi đăng ký lại"), và nghỉ đã duyệt chỉ Nhung, Linh huỷ được. Nhân viên muốn chuyển ngày nghỉ hoặc không nghỉ nữa phải nhắn ngoài app, Nhung/Linh tự huỷ rồi nhân viên đăng ký lại, dễ sót và mất dấu vết.

## Người dùng
- Nhân viên (thợ, lễ tân, Nhung): gửi yêu cầu trên iPhone.
- Nhung hoặc Linh: duyệt / từ chối (giữ quyền duyệt nghỉ như Q27, S55).

## Hướng đã chọn
Yêu cầu đổi gắn vào đơn nghỉ đã duyệt: ngày nghỉ cũ **giữ hiệu lực** cho tới khi duyệt; duyệt thì app thay bằng ngày mới (hoặc huỷ) trong một giao dịch, có lịch sử; từ chối thì giữ ngày cũ. Không chọn "hai đơn rời" vì dễ duyệt một bỏ một gây lệch công, lương; không chọn "sửa thẳng về chờ duyệt" vì bị từ chối là mất luôn ngày nghỉ đã duyệt.

## Phạm vi bản đầu
- [ ] Trên đơn nghỉ **đã duyệt của chính mình**, còn ngày từ hôm nay trở đi, tháng chưa khoá lương: nút **Xin đổi ngày** (chọn ngày / giờ mới như form đăng ký, có lý do) và **Xin huỷ** (có lý do).
- [ ] Mỗi đơn tối đa 1 yêu cầu đang chờ; người gửi rút lại được khi chưa duyệt.
- [ ] Nhung, Linh nhận thông báo, thấy yêu cầu trong Cần xử lý; màn duyệt hiện **cũ → mới** và lý do; Duyệt / Từ chối.
- [ ] Duyệt: thay đơn cũ trong một giao dịch, kiểm lại trùng ngày, tháng đã khoá, ngày đã duyệt công; người gửi nhận thông báo kết quả.
- [ ] Nhung, Linh xin đổi cho chính mình thì duyệt luôn, có nhật ký (như Q27).
- [ ] Lịch sử đơn nghỉ ghi đủ: ai xin, cũ → mới, ai duyệt, lúc nào. Kiểm quyền ở server và DB.
- [ ] Ghi quyết định mới (S66) vào `docs/DECISIONS.md`.

## Để sau
- Hai người tráo ngày nghỉ cho nhau
- Huỷ riêng một ngày giữa đơn nghỉ nhiều ngày
- Duyệt yêu cầu đổi qua tool MCP
- Sửa đơn còn chờ duyệt (đã làm được bằng huỷ rồi đăng ký lại)
- Hạn phải báo trước bao nhiêu ngày

## Tiêu chí xong
- Thợ có nghỉ đã duyệt T5 13/11 → bấm Xin đổi ngày sang T2 17/11 trên iPhone trong dưới 1 phút; trước khi duyệt, màn Lịch ngày 13/11 vẫn hiện "Nghỉ: …".
- Linh mở Cần xử lý thấy "13/11 → 17/11" kèm lý do; bấm Duyệt → 13/11 hết nghỉ, 17/11 thành nghỉ đã duyệt; thợ nhận thông báo.
- Linh bấm Từ chối → 13/11 vẫn nghỉ đã duyệt, 17/11 không có gì.
- Xin huỷ được duyệt → ngày đó không còn nghỉ; bảng công, lương tạm tính cập nhật đúng.
- Không gửi được yêu cầu cho ngày đã qua, tháng đã khoá, hoặc trùng đơn nghỉ khác (báo lỗi rõ); gọi API của người khác bị server từ chối.
- lint, typecheck, test, build đều qua.

## Ràng buộc
- Stack / hosting: TanStack Start + PostgreSQL 16 theo `docs/TECH_STACK.md`; chạy local trước, triển khai Vibe Host khi anh yêu cầu.
- Dữ liệu / tích hợp: `leave_requests` + trigger `leave_guard`, `leave_after`; nghỉ theo giờ (S55); lương trừ giờ; `app.staff_off_on` cho đầu màn Lịch; thông báo push qua outbox. Không xoá dữ liệu nghiệp vụ.
- Hạn chót: chưa đặt.

## Giả định
- Đơn nghỉ nhiều ngày đã bắt đầu (vd 12–15/11, hôm nay 12/11): chỉ đổi được phần từ hôm nay trở đi; ngày đã qua giữ nguyên.
- Đổi ngày được chuyển giữa nghỉ cả ngày và nghỉ theo giờ (dùng chung form đăng ký).
- Ngày mới đang chờ duyệt hiện ở đầu màn Lịch như "… xin nghỉ, chờ duyệt" (S32).
- Từ chối không bắt buộc ghi lý do; huỷ / đổi thì người xin bắt buộc ghi lý do.
- Ngày cũ đã được duyệt công là "nghỉ" thì vẫn cho duyệt đổi, nhưng app báo Nhung/Linh duyệt lại công ngày đó.

## Câu hỏi còn mở
- Cách lưu: bảng yêu cầu đổi riêng hay cột trên `leave_requests` — vibe-plan chọn, giữ đúng "không xoá vĩnh viễn".
- Tương tác với tự duyệt công từ ảnh vào ca (S59–S61) khi ngày nghỉ bị huỷ sau khi đã tự duyệt — vibe-plan kiểm.
