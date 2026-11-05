# Brief: Gói sửa — người tạo sửa đơn, chặn giảm thành tiền, món Kìm

- Trạng thái: Đã duyệt (05/11/2026)
- Chế độ: Đầy đủ
- Dự án: LINDY OS (`E:\AI - Vibecode\Lindy`)

## Vấn đề
Từ S41 thợ bấm Làm xong là đơn thành Đã xác nhận luôn. Sau đó người tạo không sửa được nữa (K10), nên một lỗi nhỏ như quên thêm món cũng phải nhờ Nhung hoặc Linh. Muốn mở quyền sửa cho người tạo đơn, nhưng không để thợ tự hạ tiền của bill. Quán còn bán cây kìm cho khách: món này không giảm giá, không tính % cho ai.

## Người dùng
Thợ và Nhung, Linh lên đơn trên iPhone (Safari/PWA) tại quầy, ngay khi làm xong cho khách.

## Hướng đã chọn
1. **Người tạo sửa đơn trong ngày làm dịch vụ**, kể cả đơn đã Làm xong hoặc đã xác nhận. Sửa đơn đã xác nhận phải ghi lý do, có lưu lịch sử. Qua ngày thì chỉ Nhung, Linh sửa.
2. **Từ lúc bấm Làm xong, chỉ Linh và Quản lý được sửa làm thành tiền thấp đi.** Người khác sửa mà thành tiền mới nhỏ hơn thành tiền cũ thì app chặn và báo: "Thành tiền giảm từ X xuống Y, cần Nhung hoặc Linh sửa." Khi đơn còn Đang làm thì vẫn thêm, bớt món tự do.
3. **Thêm món Kìm 110.000đ vào menu** (dạng món hàng bán). Kìm không nhận bất kỳ khoản giảm nào và không cần chọn thợ. Tiền kìm vào doanh thu quán nhưng không vào hoa hồng của thợ nào, cũng không vào doanh thu dùng để tính KPI của Nhung.

Không chọn: nút "Nhờ sửa" gửi thông báo (M) và lưu bản sửa chờ duyệt (L). Đơn đã vào doanh thu, nên làm bản chờ duyệt phức tạp hơn nhiều mà bản đầu chưa cần.

## Phạm vi bản đầu
- [ ] Quyền sửa: người tạo sửa đơn chưa huỷ trong ngày làm dịch vụ. Kiểm ở giao diện, API và trigger DB.
- [ ] Chặn giảm thành tiền sau Làm xong với người không phải Linh hoặc Quản lý. Kiểm ở API và trigger DB.
- [ ] Người tạo sửa đơn đã xác nhận mà phần tiền chia cho thợ thay đổi thì đơn vào **Cần xem lại** của Linh. Thêm món hoặc tăng giá thì không.
- [ ] Món Kìm trong danh mục, 110.000đ, có cờ "không giảm giá, không chia %".
- [ ] Tính tiền: không cho giảm trên dòng kìm. Giảm cả bill chỉ tính và chia trên các dòng không phải kìm.
- [ ] Bảng lương: kìm không vào cơ sở hoa hồng, không vào doanh thu tính KPI của Nhung.
- [ ] Ghi quyết định mới vào `docs/DECISIONS.md` (sửa K10, K14, P31 phần Cần xem lại).

## Để sau
- Nút "Nhờ Nhung/Linh sửa" gửi thông báo khi bị chặn.
- Màn Cài đặt để Linh tự đánh dấu món khác là "không giảm giá, không chia %".
- Theo dõi tồn kho kìm.
- Báo cáo riêng tiền bán kìm.
- Cho thợ được chia phần (không phải người tạo) sửa đơn.
- Bỏ dòng bảo hành trên bill chỉ có kìm (hiện vẫn in "bảo hành 3 ngày").

## Tiêu chí xong
- Trang tạo đơn rồi bấm Làm xong, đơn sang Đã xác nhận. Cùng ngày, Trang thêm 1 dịch vụ và ghi lý do: lưu được, lịch sử có bản trước và sau, đơn **không** vào Cần xem lại.
- Trên cùng đơn, Trang bỏ một dịch vụ: app báo "Thành tiền giảm từ … xuống …, cần Nhung hoặc Linh sửa" và không lưu. Nhung làm đúng thao tác đó thì lưu được.
- Trang đổi tiền chia giữa hai thợ mà giữ nguyên tổng: lưu được, đơn vào Cần xem lại của Linh.
- Sang ngày hôm sau, đơn của hôm qua không còn nút Sửa đơn cho Trang. Gọi thẳng API sửa đơn đó cũng bị từ chối.
- Đơn còn Đang làm: Trang bỏ món chọn nhầm vẫn lưu bình thường.
- Chin không phải người tạo đơn thì vẫn không sửa được, như hiện nay.
- Menu tạo đơn có Kìm 110.000đ. Dòng kìm không có nút giảm giá và không báo "chưa chọn thợ".
- Bill gồm Sơn gel 200.000đ + Kìm 110.000đ, giảm cả bill 10%: tổng là **290.000đ** (giảm 20.000đ).
- Gửi giảm giá trên dòng kìm qua API thì bị từ chối. Thợ gửi bản sửa làm giảm thành tiền qua API thì bị trigger DB chặn.
- Phiếu lương tháng: hoa hồng của thợ và doanh thu tính KPI của Nhung đều không có khoản kìm. Doanh thu quán trên trang chủ và trong báo cáo có khoản kìm.
- `bun run check` chạy xanh, có test cho các trường hợp trên.

## Ràng buộc
- Stack / hosting: TanStack Start, PostgreSQL 16, RLS và trigger DB. Chạy local trước; lên Vibe Host Mắt Bão khi anh yêu cầu.
- Dữ liệu / tích hợp: **có migration**, gồm cờ trên danh mục, món Kìm, trigger sửa đơn và cách tính KPI. Tiền lưu số nguyên VND. Đơn cũ không tính lại.
- Hạn chót: chưa có.

## Giả định
- "Quản lý" là vai trò Quản lý (Nhung). Chin có quyền lịch mở rộng nhưng vẫn tính là thợ.
- "Thành tiền cũ" là thành tiền ngay trước lần sửa đó. Thành tiền mới bằng hoặc lớn hơn thì người tạo lưu được.
- "Trong ngày làm dịch vụ" là đến 23:59 của ngày làm dịch vụ trên đơn, giờ Việt Nam. Sau Làm xong, người tạo không đổi được ngày làm dịch vụ, để không tự kéo dài hạn sửa.
- Luật cũ giữ nguyên: sửa đơn đã xác nhận phải có lý do; không sửa xuống thấp hơn số tiền đã thu (phần trả lại khách thì dùng Hoàn tiền); giảm giá trên 10% vẫn cần duyệt (C15, K12).
- "Phần tiền chia cho thợ thay đổi" nghĩa là một thợ đang có trên đơn bị giảm tiền hoặc bị bỏ khỏi dòng. Thêm dòng mới không tính là thay đổi.
- Kìm thuộc nhóm mới "Sản phẩm", tính theo cái, chọn được số lượng. Không sửa giá trên đơn; muốn đổi giá thì Linh sửa ở Danh mục. Kìm không nằm trong combo nào.
- Bill chỉ có kìm thì không thêm được giảm giá. Khách chỉ mua kìm vẫn tạo lịch rồi tạo đơn như khách vãng lai (S16), và vẫn đếm là 1 lượt khách (K13).
- Dòng kìm không gắn thợ, nên không vào doanh thu cá nhân và doanh thu theo thợ.

## Câu hỏi còn mở
- Cần kiểm tra trên app thật xem Linh đã tự thêm món nào tên "Kìm" chưa. Nếu có thì dùng lại món đó, không thêm món trùng.
- Hiện KPI của Nhung tính trên tiền thuần cả đơn. `vibe-plan` cần tìm cách tách riêng phần kìm mà không làm đổi số của tháng đã khoá lương (K24).
