# Phiếu 4 — Gói chỉnh sửa sau Đợt 5

- Link phiếu: https://claude.ai/artifact/K9F9cy9JDZGeie4xgbvM8o
- Người trả lời: chủ cửa hàng. Xuất lúc 14/10/2026 23:09. Câu 28 anh nhắn thêm: "theo gợi ý". Câu 29, 30 (không bắt buộc) bỏ trống.
- Đã ghi vào `docs/DECISIONS.md` dưới mã S01–S14. Bản dưới đây là câu trả lời gốc, giữ nguyên để đối chiếu.

---

PHIẾU CHỐT GÓI CHỈNH SỬA LINDY OS
Xuất lúc: 14/10/2026 23:09

PHẦN 1. XOÁ TÀI KHOẢN

Câu 1. Xoá tài khoản chủ yếu để làm gì?
→ Cả hai

Câu 2. Tài khoản đã có đơn, chấm công, lương thì xoá thế nào?
→ Chưa có dữ liệu thì xoá hẳn. Đã có dữ liệu thì xoá thông tin đăng nhập và ẩn khỏi danh sách

PHẦN 2. CHI TIẾT LỊCH: CHỈ CÒN SỬA LỊCH, TẠO ĐƠN, HUỶ LỊCH

Câu 3. Bước “Chốt lịch” (Mới đặt → Đã chốt lịch) để ở đâu?
→ Bỏ hẳn bước chốt: lịch tạo ra là chốt luôn

Câu 4. Khách không đến thì ghi thế nào?
→ Gộp vào Huỷ lịch: khi huỷ chọn lý do Khách báo huỷ, Khách không đến hoặc Lý do khác

Câu 5. Nhân viên thường bấm Huỷ lịch với lịch đã chốt thì sao?
→ Vẫn hiện nút Huỷ lịch; bấm xong app gửi yêu cầu cho Linh, Nhung, Chin huỷ chính thức

Câu 6. Bỏ nút “Thôi”, thay bằng nút X ở góc: áp dụng ở đâu?
→ Mọi hộp hỏi lại và bảng trượt trong app

PHẦN 3. LỊCH NHIỀU KHÁCH VÀ SỐ ĐƠN

Câu 7. Lịch 2 khách, bấm “Tạo đơn” thì sao?
→ App tạo luôn 2 đơn ngang nhau: Khách 1, Khách 2

Câu 8. Đơn của khách thứ 2 ghi tên ai?
→ Khi tạo đơn, app hỏi tên từng khách (SĐT không bắt buộc)

Câu 9. Cọc Tết của lịch nhóm (ví dụ 200.000đ cho 2 khách) trừ vào đơn nào?
→ Chia đều: mỗi đơn trừ 100.000đ

Câu 10. Khách đến khác số đã đặt thì sao?
→ Số đơn luôn bằng số khách của lịch

Câu 11. “1 khách không thể có nhiều hơn 1 lịch” nghĩa là gì?
→ Ý là trong lịch nhóm, mỗi khách chỉ có 1 đơn

Câu 12. Khi một khách bị trùng lịch như câu trên, app làm gì?
→ Chỉ cảnh báo, vẫn cho lưu

PHẦN 4. MÀN LỊCH

Câu 13. Thu nhỏ lịch đến mức nào?
→ Nhỏ hơn hiện nay một chút, vẫn cuộn để xem cả ngày
   Ghi chú: Có thể to nhỏ linh động lúc ấn thao tác zoom to và nhỏ bằng 2 ngón tay

Câu 14. Mỗi ô lịch trên khung giờ hiện những gì?
→ Giờ, tên khách, số khách (nếu đi nhóm), dấu “chưa cọc” nếu có
   Ghi chú: Thứ tự như sau: số khách- tên khách- sđt - giờ

Câu 15. Có cần thêm kiểu xem 3 ngày liền nhau như Google Calendar không?
→ Không, Ngày, Tuần, Danh sách là đủ

Câu 16. Bỏ nút tạo lịch: hiểu thế nào cho đúng?
→ (chưa chọn)
   Nếu không tạo lịch trong app nữa, lịch sẽ vào app bằng cách nào?: Ý là bỏ nút tạo đơn không phải là bỏ tạo lịch

PHẦN 5. DỮ LIỆU DÙNG THỬ

Câu 17. Dữ liệu dùng thử đặt ở đâu?
→ Trên app thật của quán, để cả quán bấm thử trên iPhone

Câu 18. Trong app hiện đã có ai nhập dữ liệu thật chưa (đơn, lịch, sổ tiền, chấm công)?
→ Chưa, trong app toàn là dữ liệu thử

Câu 19. Khi bắt đầu dùng thật, xoá những gì?
→ Xoá sạch mọi dữ liệu: lịch, đơn, khách, sổ tiền, thu chi, chấm công, lương, tạm ứng, báo cáo, thông báo

Câu 20. Xoá bằng cách nào?
→ Nút chỉ Chủ thấy: Thêm → Dữ liệu dùng thử → “Xoá, bắt đầu dùng thật”

Câu 21. Mọi người thử bằng tài khoản nào?
→ Tài khoản thật của từng người

Câu 22. Gói dữ liệu thử gồm bao nhiêu?
→ Khoảng 2 tuần lịch, 40–60 đơn, sổ tiền, thu chi, chấm công, lương tạm tính tháng này

PHẦN 6. KIỂU CHỮ

Câu 23. Chọn kiểu chữ không chân cho cả app
→ Be Vietnam Pro cho cả app

Câu 24. Chữ LINDY trên đầu app
→ Giữ chữ có chân như hiện nay, làm dấu hiệu thương hiệu

PHẦN 7. TRANG CHỦ

Câu 25. Làm lại trang chủ ưu tiên cho ai?
→ Mọi người, kể cả thợ

Câu 26. Chọn tối đa 6 chỉ số hiện chữ số to ở đầu trang chủ
→ Doanh thu hôm nay
→ Số khách hôm nay
→ Tiền đã thu và tiền khách còn nợ
→ Tiền mặt trong két và tiền trong tài khoản
→ Doanh thu tháng đến hôm nay

Câu 27. Có muốn thêm so sánh hoặc biểu đồ không?
→ Biểu đồ doanh thu 30 ngày

Câu 28. Danh sách “Cần xử lý” (đơn chờ xác nhận, chi chờ duyệt, ngày công chưa duyệt…)
→ Gộp thành một thẻ đếm số việc; bấm vào mới xem chi tiết (anh nhắn: "28 theo gợi ý")
