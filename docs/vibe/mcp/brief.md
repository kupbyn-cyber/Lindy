# Brief: MCP cho LINDY OS

- Trạng thái: Nháp
- Chế độ: Đầy đủ
- Dự án: LINDY OS (`kupbyn-cyber/Lindy`)

## Vấn đề
Anh và Linh muốn xem và thao tác Lindy (lịch, đơn, tiền, nhân sự) bằng cách nói chuyện với Claude hoặc ChatGPT, không phải mở app từng màn. Quan trọng nhất: AI đọc được đủ số liệu tài chính, khách hàng, nhân sự để đưa nhận định, gợi ý giúp Linh kinh doanh.

## Người dùng
- Anh Đức và Linh, đăng nhập bằng **một tài khoản chung: tài khoản Chủ của Linh**.
- Dùng từ Claude (claude.ai, app Claude) và ChatGPT, trên điện thoại hoặc máy tính.

## Hướng đã chọn
**Chép khung MCP của CEN WORK sang Lindy** (`/api/mcp` trên lindy.aiduocviec.com). Đăng nhập OAuth 2.1 + PKCE, có đăng ký client tự động, nên cả Claude lẫn ChatGPT đều kết nối được. Tool đọc trả số liệu ngay. Tool ghi đi 2 bước: `lindy_preview_*` tạo bản xem trước, lưu ở DB, cấp mã dùng một lần; `lindy_*` chỉ thực hiện mã đó sau khi người dùng đồng ý, chạy đúng một lần, kiểm tra lại quyền trước khi ghi. Mọi tool gọi lại service sẵn có trong `src/server/*`, không viết lại nghiệp vụ, phân quyền vẫn ở server và RLS.
- Không chọn khoá API cố định: connector của claude.ai không nhận khoá dán tay, và lộ khoá là lộ toàn bộ sổ tiền.
- Không chọn bản chỉ đọc: anh cần ghi ngay bản đầu.

## Phạm vi bản đầu
**Nền tảng**
- [ ] Đăng nhập OAuth (metadata, đăng ký client, màn "Cho phép" dùng phiên đăng nhập Lindy, cấp/gia hạn/thu hồi token)
- [ ] Chỉ tài khoản vai trò **Chủ** được kết nối; tài khoản khác bị từ chối ở màn "Cho phép" và ở mọi lần gọi
- [ ] Ghi lịch sử mọi lần gọi tool (không ghi token)
- [ ] Tool `lindy_get_me`

**Đọc**
- [ ] Lịch hẹn theo ngày/khoảng ngày, chi tiết một lịch, danh sách cần chú ý
- [ ] Đơn hàng theo ngày/khoảng ngày, chi tiết một đơn
- [ ] Báo cáo ngày, báo cáo tháng (doanh thu, theo thợ), tổng quan
- [ ] Lợi nhuận tháng
- [ ] Sổ tiền: số dư các tài khoản, bút toán theo khoảng ngày
- [ ] Thu chi (đề nghị chi và trạng thái)
- [ ] Cọc và mùa cọc
- [ ] Khách hàng: tìm kiếm, chi tiết kèm lịch sử đơn
- [ ] Bảng công tháng, bảng công ngày
- [ ] Bảng lương tháng, tạm ứng
- [ ] Danh sách "Cần xem lại"

**Ghi (xem trước → đồng ý)**
- [ ] Tạo, sửa, huỷ lịch hẹn; bấm "Khách báo huỷ"
- [ ] Ghi đề nghị chi
- [ ] Duyệt công ngày
- [ ] Duyệt / từ chối nghỉ
- [ ] Duyệt / từ chối tạm ứng
- [ ] Sửa tên, SĐT khách

## Để sau
- Tạo đơn, ghi tiền thu đơn
- Ghi cọc, hoàn tiền, huỷ đơn đã xác nhận
- Chốt quỹ, góp/rút vốn, khoá và chi lương
- Sửa danh mục dịch vụ, quản lý tài khoản, xuất file, sao lưu, nhập dữ liệu cũ, in bill
- Tài khoản Chủ riêng cho anh (để lịch sử tách được anh và Linh)
- Mở MCP cho Quản lý / Thợ

## Tiêu chí xong
- Trong claude.ai: thêm connector `https://lindy.aiduocviec.com/api/mcp` → đăng nhập tài khoản Linh → bấm Cho phép → hỏi "hôm nay quán có bao nhiêu lịch?" ra đúng số như màn Lịch trong app.
- Làm lại y như trên với ChatGPT (Developer mode): kết nối và gọi `lindy_get_me` được.
- Hỏi "phân tích doanh thu, lợi nhuận và khách quay lại tháng này" → AI lấy được số liệu và con số khớp màn Báo cáo, Lợi nhuận trong app.
- Nhờ "tạo lịch cho chị Hoa 15h mai, 2 khách": AI đưa bản xem trước; chưa đồng ý thì app chưa có lịch; đồng ý thì lịch hiện trong app, có lịch sử. Gọi lại cùng mã lần nữa không sinh lịch thứ hai.
- Đăng nhập bằng tài khoản Thợ hoặc Quản lý ở màn Cho phép → bị chặn, không kết nối được.
- `bun run check` và `bun run build` đều đạt.

## Ràng buộc
- Stack / hosting: TanStack Start + Nitro + PostgreSQL 16, Vibe Host Mắt Bão (gói Starter 512 MB RAM, 1 GB lưu trữ chung). Push `main` xong phải bấm **Triển khai lại** (chưa tự triển khai). Container tự chạy migration khi khởi động.
- Dữ liệu / tích hợp: cần migration mới (bảng OAuth client/grant/code/token, bảng intent ghi). Chỉ lưu SHA-256 của token và mã. Tool gọi service sẵn có, giữ mọi quy tắc trong `CLAUDE.md` (tiền số nguyên VND, chỉ đơn Đã xác nhận vào doanh thu, không xoá vĩnh viễn…).
- Mẫu tham khảo: CEN `src/lib/mcp/` (oauth, write-intents, mcp-handler), `docs/cen-mcp-oauth.md`, migrations 0158–0161.
- Hạn chót: không có.

## Giả định
- Scope gọn hơn CEN vì chỉ một tài khoản: `lindy:read` (mặc định) và `lindy:write` (phải đồng ý thêm khi gọi tool ghi lần đầu), cộng `offline_access`.
- Access token 1 giờ, refresh token 30 ngày xoay vòng; mã ghi hết hạn sau 15 phút — như CEN.
- Lindy hiện một cơ sở; tool tự lấy cơ sở mặc định, không bắt AI chọn.
- SĐT khách trả về đầy đủ, vì chỉ Chủ dùng (CEN che SĐT ở Telesale, Lindy không cần).
- Rate limit trong bộ nhớ tiến trình như CEN (Lindy chạy 1 container).
- Không dùng thư viện MCP SDK, viết tay JSON-RPC như CEN để ảnh Docker nhẹ.
- Tool đọc trả số liệu thô đã gộp; phần nhận định do AI tự làm, Lindy không có tool "phân tích".

## Câu hỏi còn mở
- Dùng chung tài khoản Linh nên lịch sử thao tác không tách được anh hay Linh làm. vibe-plan cần ghi tên app (Claude/ChatGPT) vào lịch sử để phân biệt phần nào.
- Màn "Cho phép" cần giao diện theo design system Lindy; vibe-plan quyết dùng lại khung màn Đăng nhập.
- Kiểm tra RAM 512 MB còn đủ khi thêm MCP (CEN chạy được trên cấu hình tương tự?).
