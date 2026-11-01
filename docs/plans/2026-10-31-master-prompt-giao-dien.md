# MASTER PROMPT: LÀM MỚI GIAO DIỆN LINDY OS

Mở Claude Code tại thư mục `E:\AI - Vibecode\Lindy`, rồi dán toàn bộ nội dung dưới đây.

Mong muốn thêm của anh (để trống cũng được):
- Điều đang thấy chưa ổn:
- Trang hoặc app tham khảo:

---

## Nhiệm vụ

Em làm mới giao diện LINDY OS, app quản lý tổng hợp của Lindy Nailash Studio, theo 4 bước: **Phân tích → Đề xuất → Demo → Thực hiện**.

Xong Bước 1, 2, 3 thì dừng, báo anh và chờ anh nói "duyệt" mới sang bước sau. Sau khi chốt demo, em làm liền Bước 4 đến hết, chỉ dừng ở các điểm dừng bắt buộc.

App đang chạy thật: mọi người trong quán dùng hằng ngày trên iPhone, có dữ liệu thật. Mục tiêu là đẹp hơn và làm việc nhanh hơn, không bắt mọi người học lại.

Cách nghĩ: làm từ gốc ra ngọn. Quy định trước, token sau, rồi thành phần dùng chung, cuối cùng mới đến từng màn. Không sửa lẻ từng chỗ cho đẹp mắt.

## Điểm xuất phát

- Linh (chủ quán) đã chọn: tối giản, hiện đại, dịu nhẹ. Màu quán là be, nâu, trắng. Phong cách hiện tại là Ngà & mực, một màu nhấn mận.
- Điều Linh khó chịu nhất là **phải bấm nhiều bước** (G24). App Linh thấy đẹp và dễ dùng là Instagram (G25). Vì vậy số lần chạm quan trọng ngang với màu sắc.
- Không sao chép giao diện đen trắng của CEN WORK. LINDY OS chỉ học cách làm, vì thương hiệu và người dùng khác hẳn.

## Luật bắt buộc

1. Không đổi nghiệp vụ, quyền, API, dữ liệu, migration. Không thêm tính năng.
2. G01–G26 và S01–S44 đã chốt. Đề xuất được phép xin đổi, nhưng phải nêu đúng mã và lý do. Chỉ có hiệu lực khi Linh hoặc anh chốt, rồi ghi thành mã mới từ S45 trong `docs/DECISIONS.md`.
3. Nếu chưa có quyết định mới thì giữ nguyên:
   - Sáng, tối tự theo iPhone, không có nút chuyển (G09).
   - Trạng thái tiền xanh, cam, đỏ, luôn kèm chữ (G10). Màu ô lịch (S31) và vạch giờ hiện tại (S34).
   - Be Vietnam Pro cho cả app, chữ LINDY dùng Cormorant Garamond (S13).
   - 5 mục điều hướng có biểu tượng nét mảnh kèm chữ (G16, G17). Không có nút tròn Tạo đơn (S16).
   - Nút chính cố định ở chi tiết đơn (S30). Hộp thoại đóng bằng nút X (S05, ngoại lệ S22).
   - Nội dung và thứ tự đã chốt ở ô lịch (S10), đầu màn Lịch (S32), trang chủ (S14, S44), tab Khách và Thêm (S40).
   - Mật độ dày (G15), gần như không ảnh (G20), chuyển động tối thiểu (G21), giọng ngắn gọn, không emoji (G22).
4. Không đụng vào khung ảnh thành phẩm (S35), bill in và trạm in (S37, S38, `public/tram-in/`). Mã QR phải giữ tương phản cao để app ngân hàng quét được.
5. Không chạm production, không đổi biến môi trường, chỉ dùng DB local. Không đưa tên, SĐT khách thật vào demo, ảnh hay tài liệu. Không in mật khẩu, khoá bí mật.
6. Chưa chạy thì không nói là chạy được. Mọi báo cáo phải tách rõ phần đã kiểm và chưa kiểm.
7. Trao đổi bằng tiếng Việt, xưng em, gọi anh. Nội dung gửi Linh viết câu ngắn, không từ kỹ thuật, đọc tốt trên iPhone.

## Bước 1: Phân tích

Bước này không sửa code. Toàn bộ kết quả các bước ghi vào một file `docs/plans/YYYY-MM-DD-lam-moi-giao-dien.md` (ngày bắt đầu).

Đọc theo thứ tự:
- `CLAUDE.md`, `docs/DECISIONS.md`, `docs/surveys/02-phieu-phong-cach.md`.
- `design/design-system/README.md`, `design/design-system/tokens.json`.
- `src/styles/`, `src/components/ui/`, `src/routes/_app.tsx`.

`design/README.md` có chỗ đã cũ (nút tròn Tạo đơn, Cormorant cho tiêu đề). Khi lệch nhau thì `design-system/README.md` và `DECISIONS.md` mới đúng.

Chạy app thật ở local theo `docs/CHAY_LOCAL.md`, có dữ liệu demo. Xem mọi màn trong `src/routes/_app/`, cùng `/dang-nhap` và `/doi-mat-khau`, ở khổ 390 × 844, cả sáng và tối, đủ 4 vai trò: Chủ, Quản lý, Thợ có quyền lịch mở rộng, Thợ.

Làm 3 phép đo:
- **Số lần chạm** của việc hằng ngày: tạo lịch, tạo đơn từ lịch, làm xong, ghi tiền thu, in bill, chụp ảnh, vào ca, chốt quỹ. So với mục tiêu đã có: tạo lịch không quá 4 chạm; tạo đơn, xác nhận bill, ghi tiền không quá 3 chạm.
- **Độ tương phản**: chữ trên nền từ 4.5:1, viền ô nhập và vạch màu từ 3:1, ở cả sáng và tối.
- **Kiểm kê trạng thái**: mọi trạng thái của tiền, đơn, lịch, cọc, chấm công, lương, thu chi, tạm ứng. Ghi màu đang dùng, ý nghĩa, nơi dùng. Chỉ ra chỗ một màu mang nhiều nghĩa hoặc một nghĩa có nhiều màu.

Báo anh:
- Những gì đang tốt, phải giữ.
- Tối đa 10 vấn đề, xếp theo mức ảnh hưởng đến việc hằng ngày. Mỗi vấn đề ghi màn, vai trò, ảnh chụp, và nguyên nhân thuộc màu, chữ, bố cục hay số bước.
- Câu hỏi cần Linh trả lời, nếu có.

Dừng, chờ duyệt.

## Bước 2: Đề xuất

Chưa sửa code.

Viết **quy định giao diện** trước khi chọn màu cụ thể: mỗi màu một nghĩa, mức chữ, bề mặt, khoảng cách, bo góc, độ sâu.

Đưa 3 hướng:
- **A:** giữ Ngà & mực, chỉ tinh chỉnh.
- **B:** cao cấp hơn nhưng vẫn trong be, nâu, trắng.
- **C:** thay đổi mạnh nhất mà vẫn đúng thương hiệu.

Mỗi hướng ghi: cảm giác trong một câu; bảng màu sáng và tối có mã màu, tỷ lệ tương phản; chữ; hình khối; 3 màn đổi nhiều nhất; số lần chạm giảm được ở đâu; mã quyết định phải đổi; rủi ro; khối lượng việc.

Nếu dùng gradient hoặc hiệu ứng kính: gradient chỉ là một lớp tĩnh; kính chỉ dùng ở thanh dưới hoặc thanh trên; không dùng `background-attachment: fixed`; phải tính đến Safari iPhone cũ và máy yếu.

Khuyên rõ một hướng và nói lý do. Dừng, chờ anh chọn tối đa 2 hướng để làm demo.

## Bước 3: Demo

Chưa sửa `src/`.

Làm một trang HTML độc lập ở `design/demo/`, dựng lại từ màn thật, không phải bảng phối màu. Yêu cầu:
- Có đủ: Tổng quan (Toàn quán, Cá nhân), Lịch kiểu Ngày, Chi tiết đơn, hộp Ghi tiền thu, Khách, Thêm, Đăng nhập.
- Bấm chuyển màn được. Có nút xem thử sáng, tối và chuyển giữa các hướng, chỉ dùng trong demo.
- Đúng tên gọi của quán, đủ các trạng thái, tiền dạng `8.450.000đ`. Dữ liệu đều là giả.
- Đo tương phản trên nền thực tế của trang, tính cả lớp trong suốt và gradient.
- Cuối trang có phiếu ngắn cho Linh: chạm để chọn, ghi thêm góp ý, rồi chép kết quả thành một đoạn chữ gửi lại anh.

Xuất bản demo thành trang Artifact riêng tư và đưa link cho anh gửi Linh mở trên iPhone. Không xuất bản được thì đưa file HTML.

Dừng đến khi có kết quả chọn. Khi có, em ghi mã quyết định mới vào `docs/DECISIONS.md`, cập nhật dãy mã trong `CLAUDE.md`, xoá câu đã trả lời khỏi `docs/OPEN_QUESTIONS.md`.

## Bước 4: Thực hiện

### 4.1. Kế hoạch

Viết tiêu chí xong, phạm vi làm và không làm, file sẽ sửa, các gói, cách kiểm từng gói, cách quay lại.

### 4.2. Đội red team

Gọi 3 subagent phản biện kế hoạch độc lập. Họ chỉ đọc, không sửa code, mỗi phát hiện phải có bằng chứng `file:dòng`:
- **iPhone và PWA:** Safari, `dvh`, safe area, bàn phím che nút, phần tử cố định, app ghim màn hình chính, `theme-color`, vuốt đổi ngày và chụm phóng to ở Lịch.
- **Màu và thành phần:** trạng thái bị sót, token sai nghĩa, thiếu màu ở chế độ tối, tương phản, bản in ra giấy.
- **Nghiệp vụ và quyền:** bố cục mới có để lộ số của quán cho thợ không, SĐT khách có bị hiện thêm không, nút nguy hiểm có gần nút chính không, số tiền có hiện sai không.

Gộp kết quả thành kế hoạch bản 2. Ghi rõ điểm nào nhận, điểm nào bỏ và vì sao.

### 4.3. Lấy mốc

Trước dòng sửa đầu tiên, chạy và ghi lại kết quả của `bun run check`, `bun run build`, `bun scripts/scan-bundle.ts`.

### 4.4. Các gói

Mỗi gói một commit, gỡ độc lập được:

1. **Token và quy định:** sửa `design/design-system/tokens.json`, chạy `bun scripts/gen-tokens.ts`, cập nhật `design/design-system/README.md`. Không sửa tay `src/styles/tokens.css`.
2. **Thành phần dùng chung:** `src/styles/components.css`, `src/components/ui/`. App chạy từ `components.css`, không chạy từ `design/design-system/components/bundle.css`.
3. **Từng màn:** Lịch, Đơn hàng, Tổng quan, Khách, Thêm, rồi các màn còn lại.
4. **Phần ngoài trang:** `theme-color` trong `src/routes/__root.tsx`, `public/manifest.webmanifest`, phần `@media print` cho báo cáo và phiếu lương. Chỉ đổi biểu tượng app nếu đã có quyết định (`bun scripts/gen-icons.ts`).

### 4.5. Cổng kiểm tra

Sau mỗi gói: `bun run check` không được tệ hơn mốc.

Trước khi push, chạy bản build thật bằng `node --env-file=.env .output/server/index.mjs` và kiểm:
- Khổ 390 và 360, sáng và tối, 4 vai trò, mọi màn đã liệt kê ở Bước 1.
- Một luồng trọn vẹn: tạo lịch → tạo đơn → làm xong → ghi tiền thu → in bill.
- Vuốt đổi ngày, chụm phóng to lịch, mở bàn phím không che nút chính.
- Tải trực tiếp mỗi màn chính ít nhất 8 lần, không có trang trắng hay lỗi console mới.
- Đếm lại số lần chạm so với Bước 1. Đo lại tương phản.
- Quét màu viết cứng ngoài token và màu cũ còn sót. Ngoại lệ có chủ đích: mã QR, khung ảnh.
- Thợ vẫn không thấy doanh thu quán và quỹ (K09).
- Xem bản in báo cáo và phiếu lương.

### 4.6. Điểm dừng bắt buộc

Dừng và hỏi anh, không tự xử lý, khi:
- Cần migration, hoặc phải đổi API, quyền, nghiệp vụ.
- Cổng kiểm tra tệ hơn mốc mà chưa tìm ra nguyên nhân.
- Không dựng được app thật. Khi đó không được push.
- Phát hiện lỗi có sẵn ngoài phạm vi, trừ khi nó chặn cổng kiểm tra.

### 4.7. Git

- `git` có thể không nằm trong PATH. Khi đó dùng bản đi kèm GitHub Desktop.
- Thêm file theo tên, không dùng `git add .`. Không force-push.
- Không commit `src/routeTree.gen.ts` nếu không có route mới.
- Đạt đủ cổng thì push `main`. Push chưa làm app đổi, vì Mắt Bão chưa bật tự triển khai. Em không tự bấm Triển khai lại.

## Báo cáo cuối

Báo ngắn bằng tiếng Việt:
- Đã đổi gì. Trước và sau của số lần chạm, độ tương phản.
- Commit, kết quả lint, typecheck, test, build so với mốc.
- Đã kiểm gì và chưa kiểm được gì.
- Việc của anh: vào Mắt Bão bấm **Triển khai lại**; mở `https://lindy.n2.tinhgon.xyz/api/health` thấy `ready: true`; thử trên iPhone thật ở Safari và app đã ghim, cả sáng và tối, gồm Lịch, chi tiết đơn, ghi tiền thu.
- Cách quay lại: `git revert` các commit theo thứ tự ngược, push, rồi Triển khai lại. Không force-push.
