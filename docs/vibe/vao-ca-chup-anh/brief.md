# Brief: Vào ca bằng ảnh có giờ, tự duyệt công

- Trạng thái: Đã duyệt (04/11/2026)
- Chế độ: Đầy đủ
- Dự án: LINDY OS

## Vấn đề
Hiện Vào ca chỉ là một nút bấm, không có bằng chứng, nên Nhung/Linh phải duyệt công mỗi ngày. Anh muốn thay bước duyệt bằng một ảnh chụp lúc vào ca có in giờ thật: có ảnh là ngày đó tự thành "Đi làm". Ảnh chỉ để xem lại khi nghi ngờ, nén nhỏ và tự xoá sau 35 ngày cho nhẹ DB.

## Người dùng
- Mọi người có hồ sơ nhân viên (thợ, Nhung, Linh): vào ca trên iPhone (Safari hoặc app trên màn hình chính), lúc tới quán.
- Linh, Nhung: xem ảnh của mọi người ở Duyệt công / Bảng công; đổi quyết định khi thấy sai.
- Nhân viên: xem ảnh của mình ở tab Của tôi.

## Hướng đã chọn
**Camera ngay trong app, kiểu Timemark.** Bấm Vào ca → màn chụp trong app, đồng hồ theo giờ máy chủ chạy từng giây đè lên khung hình. Bấm chụp → ảnh đóng dấu giờ, nén, gửi lên; máy chủ ghi giờ vào ca và tự duyệt "Đi làm".
Không dùng AI hay so mặt (anh chọn "chỉ cần ảnh + giờ"): không tốn phí API, không lưu dữ liệu khuôn mặt. Không chọn hướng mở camera gốc iPhone vì lúc chụp không thấy giờ và kém đúng ý "thời gian thực trên ảnh".

## Phạm vi bản đầu
- [ ] Màn chụp vào ca: camera trước, đồng hồ giờ máy chủ chạy từng giây, không chọn được ảnh có sẵn.
- [ ] Ảnh đóng dấu: giờ:phút:giây, thứ, ngày, tên nhân viên, "Vào ca", LINDY.
- [ ] Nén ảnh ở iPhone trước khi gửi (mục tiêu ≤ 150KB); máy chủ chặn ảnh quá lớn hoặc không phải ảnh.
- [ ] Vào ca có ảnh → ngày đó tự thành **Đi làm**, ghi lịch sử "tự duyệt khi vào ca có ảnh"; không vào mục chưa duyệt, Cần xử lý.
- [ ] Không mở được camera / gửi ảnh lỗi → nút **Vào ca không ảnh**: giờ vẫn theo máy chủ, ngày đó chờ Nhung/Linh duyệt như hiện nay.
- [ ] Xem ảnh: Linh, Nhung xem mọi người; nhân viên chỉ xem ảnh của mình. Kiểm quyền ở API và DB.
- [ ] Tự xoá ảnh sau 35 ngày (job nền hằng ngày, xoá hẳn dữ liệu ảnh); dòng chấm công và giờ vào giữ nguyên, màn hiện "Ảnh đã xoá sau 35 ngày".
- [ ] Ra ca giữ nguyên nút bấm như cũ. Linh, Nhung vẫn đổi được ngày đã tự duyệt (có lý do, có lịch sử).

## Để sau
- So mặt đúng người; kiểm wifi hoặc GPS của quán.
- Chụp ảnh khi Ra ca.
- Đánh dấu, cảnh báo đi muộn.
- Thông báo cho Linh khi có người vào ca; nhắc vào ca lúc 9:00.
- Màn album ảnh, tải ảnh về máy.
- Cài đặt số ngày giữ ảnh (bản đầu cố định 35 ngày).

## Tiêu chí xong
- Trên iPhone, thợ bấm Vào ca → màn camera mở, giờ chạy từng giây; chụp xong trong ≤ 5 giây thẻ báo "Đã vào 8:57", Bảng công hiện ngày đó **Đi làm** ngay, Cần xử lý không có ngày đó.
- Chỉnh giờ điện thoại sai 1 tiếng → giờ trên ảnh và giờ vào ca vẫn đúng giờ máy chủ.
- Màn chụp không có lối chọn ảnh từ thư viện.
- Từ chối quyền camera → hiện **Vào ca không ảnh**; bấm → ngày đó "Chưa duyệt", Nhung duyệt được như cũ.
- Linh, Nhung chạm một người ở Duyệt công thấy ảnh; thợ thấy ảnh mình ở Của tôi; thợ gọi API xem ảnh người khác → 403.
- Ảnh lưu trong DB ≤ 150KB.
- Test giả lập ngày: ảnh cũ hơn 35 ngày bị xoá ở lần chạy job kế tiếp; dòng chấm công, giờ vào, trạng thái vẫn còn.
- Linh/Nhung đổi một ngày tự duyệt thành Nghỉ không phép có lý do → lương tạm tính đổi theo.
- `bun run check`, test, build đạt.

## Ràng buộc
- Stack / hosting: TanStack Start, PostgreSQL 16, Vibe Host Mắt Bão (ảnh Docker ≤ 1GB → không thêm thư viện xử lý ảnh nặng ở máy chủ; nén và đóng dấu làm ở trình duyệt).
- Phải đổi header `Permissions-Policy` cho phép camera của chính app (hiện đang chặn `camera=()`).
- Ảnh vào ca nằm bảng riêng: bảng `attachments` hiện chặn DELETE, và ảnh chứng từ vẫn giữ quy tắc không xoá.
- Job xoá chạy trong worker nền sẵn có (`src/server/worker.ts`).
- Hạn chót: chưa có.

## Giả định
- Áp dụng cho mọi người có hồ sơ nhân viên, kể cả Nhung, Linh; giữ điều kiện vào ca hiện có (chỉ hôm nay, trong thời gian làm việc).
- Giờ vào ca chính thức do DB ghi lúc nhận ảnh; giờ in trên ảnh lấy theo giờ máy chủ (app đo độ lệch đồng hồ khi mở màn chụp), có thể chênh vài giây do mạng.
- Mỗi người mỗi ngày một ảnh. Đã vào ca (có hay không ảnh) thì không chụp lại, không bổ sung ảnh sau.
- Camera trước mặc định, có nút đổi sang camera sau.
- 35 ngày tính từ ngày vào ca; job chạy mỗi ngày một lần.
- Ngày có người vào ca không ảnh vẫn dùng "Duyệt N người đã vào ca" như cũ.
- Bản sao lưu của Vibe Host vẫn chứa ảnh cũ cho tới khi bản sao lưu đó bị thay.

## Câu hỏi còn mở
- Đã ghi quyết định S59–S61 vào `DECISIONS.md` (04/11/2026): tự duyệt công khi có ảnh, quyền xem ảnh, ngoại lệ xoá ảnh sau 35 ngày.
- App mở từ màn hình chính iPhone có thể hỏi quyền camera nhiều lần: phải thử trên iPhone thật.
- Lưu ý: ảnh ngày 1 bị xoá khoảng ngày 5 tháng sau, trước hoặc đúng lúc khoá lương (ngày 5–10). Giờ vào ca vẫn còn, chỉ mất ảnh để đối chiếu.
