# Sổ quyết định LINDY OS

File này ghi các quyết định **mới hơn PRD v1.1**. Khi soạn PRD v1.2, gộp toàn bộ mục ở đây vào PRD rồi đánh dấu "đã gộp".

**Thứ tự ưu tiên khi tài liệu khác nhau:**
1. File này (mục mới nhất thắng).
2. Tài liệu module trong `docs/modules/`, chỉ trong phạm vi module đó.
3. `docs/prd/LINDY_OS_PRD_v1_1.md`: D01–D16 (§19.1), Q01–Q44 (§19.2), G01–G26 (§19.3).
4. `docs/prd/LINDY_OS_PRD_v1_0.md` (chỉ để tra lịch sử).

---

## D17 — Lịch đặt khách (12/10/2026)

Nguồn: `docs/modules/LICH_DAT_KHACH_v1_1.md`. Tài liệu module thắng PRD v1.1 cho phần lịch hẹn.

- Lịch hẹn **không phân thợ**: không có `staff_id`, không chọn thợ, không kiểm tra trùng thợ. Thợ thực làm chỉ ghi trên đơn hàng.
- Mọi nhân viên được tạo lịch. **Linh, Nhung, Chin** sửa, xác nhận, huỷ mọi lịch trong cơ sở. Nhân viên khác chỉ sửa lịch do mình tạo khi còn `pending`, không được huỷ.
- Chin chỉ được mở rộng **quyền lịch**; không có quyền lương, thu chi, lợi nhuận, quản lý đơn.
- Lịch chung, cảnh báo chồng giờ/sức chứa, trung tâm thông báo trong app và Web Push đều thuộc **P1, làm ngay giai đoạn đầu**.
- Lịch hẹn không sinh doanh thu, công nợ, hoa hồng hay chấm công.
- Đang dùng Apple Calendar; sẽ chuyển hẳn sang LINDY OS sau một ngày chốt.

**Thay thế trong PRD v1.1:** trường `staff_id` của bảng `appointments` (§12.1), lịch hẹn ở nhịp 4 (§17), vai trò trong mục 4 chưa có quyền lịch mở rộng.

## A01–A05 — Câu trả lời các điểm chờ của PRD v1.1 §19.4 (12/10/2026)

| Mã | Chủ đề | Câu trả lời của chủ | Thay đổi so với PRD v1.1 |
|---|---|---|---|
| **A01** | Ca làm và ngày công | Mỗi người làm **1 ca/ngày**. Hiện tất cả nhân viên làm **ca fulltime**. | Làm rõ Q26: 1 ca fulltime = 1 công. Giờ ca và cách tính ca nửa ngày vẫn chờ (OPEN_QUESTIONS). |
| **A02** | Tiền cọc | Chỉ thu cọc **dịp Tết, từ ngày 18 tháng Chạp (âm lịch)**. **100.000đ mỗi khách.** Ngoài dịp này không thu cọc. | Làm rõ Q16: cọc là cấu hình theo mùa, tính theo số khách của lịch (`guest_count × 100.000đ`). **Khoảng ngày đã được B01 thay: 19–28 tháng Chạp.** |
| **A03** | Cọc bị giữ khi khách bỏ hẹn | Tính vào **doanh thu quán**, ghi là **phần của Linh**. | Thay đề xuất "thu khác" ở PRD §6.6. Ảnh hưởng hoa hồng Linh và KPI Nhung còn chờ xác nhận. |
| **A04** | Giảm giá của thợ | Đúng cách hiểu: thợ chọn **5% hoặc 10%**. **Sinh nhật cố định 10%.** | Thêm lý do giảm có sẵn "Sinh nhật" = 10%. CRM vẫn **không lưu ngày sinh** (D10): nhân viên tự kiểm tra rồi chọn lý do. |
| **A05** | Tạm ứng | Ứng tối đa bằng **lương cứng** (ví dụ Nhung lương cứng 7.000.000đ thì tối đa 7.000.000đ). | Làm rõ Q38: hạn mức ứng = lương cứng tháng; vẫn chỉ Linh duyệt, mở từ ngày 1 hằng tháng. |

## B01–B15 — Phiếu 3, lịch đặt khách (12/10/2026 23:15)

Nguồn: `surveys/03-phieu-lich-dat.md`. Các mục này thắng `docs/modules/LICH_DAT_KHACH_v1_1.md` khi khác nhau.

| Mã | Chủ đề | Đã chốt | Thay đổi so với module v1.1 |
|---|---|---|---|
| **B01** | Tiền cọc | Có nhận cọc, **chỉ dịp Tết từ 19 đến 28 tháng Chạp (âm lịch)**. Nhân viên ghi khoản cọc trên lịch; **Nhung xác nhận** tiền đã vào. Mức cọc giữ theo A02: 100.000đ/khách. | Module v1.1 chưa có cọc: thêm khoản cọc vào lịch hẹn, có trạng thái chờ Nhung xác nhận. Ngày bắt đầu đổi từ 18 (A02) sang 19. |
| **B02** | Nghĩa của “xác nhận lịch” | Quản lý đồng ý nhận khách vào giờ đó. | Không đổi. |
| **B03** | Tạo và chốt | Linh, Nhung, Chin có nút **“Tạo và chốt”**: lưu là chốt luôn. | Thêm thao tác tạo lịch ở trạng thái `confirmed` ngay, ghi người chốt. |
| **B04** | Tên trạng thái | `pending` hiển thị **“Mới đặt”**, `confirmed` hiển thị **“Đã chốt lịch”**. | Đổi chữ hiển thị để không trùng “Chờ xác nhận” của bill. |
| **B05** | Khách đến | Nhân viên thường **được** bấm “Khách đã đến / Tạo đơn từ lịch”. | Thêm quyền cho mọi nhân viên: chuyển `arrived`, tạo đơn nháp từ lịch. |
| **B06** | Huỷ lịch tự tạo | Nhân viên thường **được tự huỷ lịch do mình tạo** khi còn “Mới đặt”, **bắt buộc ghi lý do**. | Thay quy tắc “nhân viên khác không được huỷ” của D17 cho đúng trường hợp này. |
| **B07** | Khách báo huỷ | Nhân viên thường bấm **“Khách báo huỷ”** kèm ghi chú; app báo cho Linh, Nhung, Chin để huỷ chính thức. Trạng thái giữ nguyên đến khi họ xử lý. | Thêm cờ “khách đã báo huỷ” và sự kiện thông báo mới. |
| **B08** | Xem SĐT | **Mọi nhân viên** xem được SĐT đầy đủ trong chi tiết lịch. Ô lịch chung và thông báo màn hình khoá vẫn không hiện SĐT. | Chốt tham số module §15. |
| **B09** | Thời lượng mặc định | **120 phút**; sửa được từng lịch. | Chốt tham số module §15. |
| **B10** | Ngoài giờ | Cho đặt ngoài 9:00–21:00, app hiện cảnh báo **“ngoài giờ mở cửa”**. | Chốt tham số module §15. |
| **B11** | Sức chứa | **Chưa bật** cảnh báo vượt sức chứa; chỉ xem các lịch song song. | `max_concurrent_guests` để trống; tính năng vẫn có sẵn để bật sau. |
| **B12** | Nghi trùng khách | Chỉ nhắc khi **cùng SĐT và trùng giờ**. | Giữ như module v1.1. |
| **B13** | Thông báo nhân viên thường | Lịch mới, đổi giờ, huỷ lịch. | Chốt mặc định module §8.1. |
| **B14** | Giờ yên lặng | **Không cần**. | Không làm giờ yên lặng. |
| **B15** | Chuyển từ Apple Calendar | **Nhập tay** các lịch sắp tới. | Không làm nhập file `.ics` ở P1. |

**Quyền lịch hẹn sau B05–B07** (bổ sung vào danh sách quyền của module §4):

| Quyền | Linh, Nhung, Chin | Nhân viên thường |
|---|---|---|
| `appointments.mark_arrived`, `appointments.create_order` | Có | Có |
| `appointments.cancel_own_pending` (kèm lý do) | Có (đã có `cancel_all`) | Có |
| `appointments.report_customer_cancel` | Có | Có |
| `appointments.confirm_all`, `appointments.cancel_all`, `appointments.manage_all` | Có | Không |

## P01–P03 — Từ bảng giá và menu combo của quán (12/10/2026)

Nguồn: `assets/bang-gia/01-price-list.jpg`, `assets/bang-gia/02-combo-nail.jpg`. Chép lại ở `data/bang-gia-dich-vu.md`, `data/services.csv`, `data/combos.csv`.

- **P01 — Danh mục dịch vụ:** 6 nhóm (Cơ bản, Design, Phụ kiện, Móng giả, Chăm sóc, Mi) và 4 combo. Nhiều dịch vụ có **giá khoảng** và tính **theo ngón**, **theo hình** hoặc **theo cái**. Danh mục cần trường đơn vị tính và giá tối thiểu/tối đa.
- **P02 — Bảo hành 7 ngày:** menu ghi "LINDY bảo hành 7 ngày". Phiếu xử lý dịch vụ (PRD §6.3, §10.3) cần biết đơn gốc còn trong hạn bảo hành không. Chi tiết còn chờ.
- **P03 — Quán có dịch vụ mi** (uốn mi collagen, uốn mi phủ đen). Liên quan sức chứa (giường làm mi) ở module lịch đặt.

## C01–C13 — Trả lời các câu còn chờ (12/10/2026)

| Mã | Chủ đề | Câu trả lời của chủ | Áp dụng trong app |
|---|---|---|---|
| **C01** | Mùa cọc tính theo ngày nào | **Ngày khách đặt lịch.** | Lịch **được tạo** trong khoảng 19–28 tháng Chạp thì cần cọc, bất kể ngày hẹn. |
| **C02** | Cọc lịch nhóm | Đúng: **100.000đ × số khách**. | Số cọc gợi ý = `guest_count × 100.000đ`. |
| **C03** | Hoàn cọc | Khách báo huỷ **trước giờ hẹn từ 12 tiếng trở lên** thì **hoàn cọc**. | Báo huỷ muộn hơn 12 tiếng hoặc bỏ hẹn thì quán giữ cọc. App tự tính mốc 12 tiếng từ giờ hẹn. |
| **C04** | Cọc bị giữ | **Không tính hoa hồng, không tính KPI.** | Ghi là doanh thu quán loại “cọc khách bỏ hẹn”, phần của Linh (A03), nằm ngoài cơ sở hoa hồng và ngoài doanh thu tính KPI của Nhung. |
| **C05** | Ca làm | Ca fulltime **9:00–21:00**. | 1 ca fulltime = 1 công (A01). |
| **C06** | Nhặt da làm lẻ | **40.000đ.** | Thêm vào danh mục (CB08). |
| **C07** | Combo 139k | “Tính theo giá đúng.” | Hiểu là **bán đúng giá niêm yết** của combo (99k, 139k, 179k, 199k). Dòng “tiết kiệm” trên menu không dùng để tính. |
| **C08** | “Sơn trơn” trong combo | Đúng là Sơn gel trơn. | Combo gồm CB02. |
| **C09** | Chọn dịch vụ khi lên đơn | Màn tạo đơn mở **danh sách tích chọn các hạng mục như menu, có tìm kiếm thông minh**; danh mục thêm được sau; chọn xong **app tự điền tiền**. | Tìm được khi gõ không dấu và gõ tắt (ví dụ “son gel”, “tdc”). Dịch vụ tính theo ngón/hình/cái có ô số lượng. Linh thêm mục mới trong Cài đặt. |
| **C10** | Combo nhiều thợ làm | **Nhập tay số tiền** cho từng thợ. | Theo chế độ chia tay của D02; tổng phần chia phải bằng giá combo. |
| **C11** | Giảm giá trên combo, cộng dồn | **Có** (được áp lên combo và được cộng dồn). | Cách cộng và mức duyệt khi cộng dồn còn chờ xác nhận (OPEN_QUESTIONS). |
| **C12** | Bảo hành | Áp cho **tất cả dịch vụ**: dịch vụ có **cứng móng bảo hành 7 ngày**, dịch vụ **không có cứng móng bảo hành 3 ngày**. | Hạn bảo hành của một bill = 7 ngày nếu bill có dòng cứng móng (CB03, CB04, combo 139k), còn lại 3 ngày, tính từ ngày làm dịch vụ. Trong hạn vẫn theo Q12/§10.3: lỗi kỹ thuật sửa miễn phí, khách đổi ý tính phí. |
| **C13** | Instagram | **@lindy.nailashstudio** | Ảnh menu cũ ghi `@lindynailashstudio`; dùng tên mới. |
| **C14** | Dịch vụ giá khoảng | Đồng ý đề xuất: **tự điền giá thấp nhất**; thợ sửa thoải mái trong khoảng; **thấp hơn khoảng** = giảm giá, phải ghi lý do và Nhung duyệt (Q08); **cao hơn khoảng** được phép, Nhung thấy khi xác nhận bill. | Ô giá hiện khoảng min–max ngay dưới; giá vượt khoảng có nhãn cảnh báo trên bill chờ xác nhận. |
| **C15** | Cộng dồn giảm giá | Đồng ý đề xuất: **cộng phần trăm trên giá gốc** (5% + sinh nhật 10% = 15%). Tổng **đến 10%** thợ tự áp; **trên 10% đến 20%** cần Nhung; **trên 20%** cần Linh. | Tổng % gồm mọi khoản giảm trên cùng dòng hoặc bill, kể cả ưu đãi bù khiếu nại. Trên combo, giá gốc là giá combo. |
| **C16** | Xác nhận cách hiểu | Chủ đồng ý ba cách hiểu: cọc theo **ngày tạo lịch** (C01); combo **bán đúng giá niêm yết** (C07); bảo hành **theo cả bill**, có cứng móng 7 ngày, không có 3 ngày (C12). | Không đổi. |

**Trạng thái:** toàn bộ D17, A01–A05, B01–B15, C01–C16 đã gộp vào `prd/LINDY_OS_PRD_v1_2.md` và `modules/LICH_DAT_KHACH_v1_2.md` ngày 12/10/2026. Quyết định mới từ đây ghi tiếp bên dưới.

## T01 — Nền tảng kỹ thuật (12/10/2026, anh chốt)

- **Kiến trúc như CEN WORK** (phương án A trong `TECH_STACK.md`): TanStack Start (React 19, SSR), TanStack Router/Query, Vite, Tailwind v4, Nitro Node server, PostgreSQL 16, đăng nhập phiên cookie tự viết, RLS qua transaction đặt role, migration runner SQL, Web Push qua hàng đợi outbox.
- **Hosting chạy thật: Vibe Hosting của Mắt Bão.** Tên miền mua sau; anh tự cấu hình.
- **Làm và chạy local trước**, xong mới đồng bộ lên GitHub.
- **Code đặt ngay tại `E:\AI - Vibecode\Lindy`** (gốc repo; tài liệu nằm trong `docs/`, `design/`, `data/`).
- Repo, database, tên miền, khoá VAPID riêng cho LINDY; không dùng chung với CEN WORK.

## K01–K06 — Chốt trước Đợt 0 (13/10/2026, anh chốt)

Nguồn: kế hoạch `docs/plans/2026-10-12-dot-0-dot-1.md` mục 11, sau phản biện.

| Mã | Chủ đề | Đã chốt | Áp dụng trong app |
|---|---|---|---|
| **K01** | Thử iPhone ở local | Dùng **mkcert** (HTTPS trong mạng nhà), anh có iPhone để thử. | Cài chứng chỉ gốc chỉ lên iPhone thử, gỡ profile sau khi thử xong; `rootCA-key.pem` để ngoài thư mục dự án, không commit. |
| **K02** | Lịch đã qua giờ chưa đánh dấu | Tính từ **lúc qua giờ kết thúc** mà chưa bấm Khách đã đến / Khách không đến. | Vào danh sách Cần xử lý và báo **một lần** cho người có quyền lịch mở rộng (module §7.1, §9.1). |
| **K03** | Git | Cài Git for Windows, commit local từng bước. | Không push khi anh chưa yêu cầu. |
| **K04** | Mật khẩu nhân viên | Tối thiểu **8 ký tự**, chặn mật khẩu phổ biến. | Kiểm ở server khi đặt và đổi mật khẩu. |
| **K05** | Số khách tối đa một lịch | **4 khách.** | `guest_count` từ 1 đến 4, kiểm ở form, API và ràng buộc DB. Cọc gợi ý Đợt 3 tối đa 4 × 100.000đ. |
| **K06** | Chuẩn hoá SĐT | Mở rộng module §5.1: bỏ **mọi ký tự không phải số** (trừ `+` ở đầu), `+84` → `0`; còn ký tự lạ thì báo lỗi. | Dùng cho lưu, tìm kiếm và nhắc trùng khách. |

## T02 — Đổi nơi chạy thật (13/10/2026, anh chốt)

- **Hosting chạy thật: Vibe Hosting của Nhân Hòa** (nhanhoa.com), thay Mắt Bão ở T01. Các ý khác của T01 giữ nguyên.
- Tên miền tạm: `lindy.vibe.vnws.com`. Nguồn code: repo private `github.com/kupbyn-cyber/Lindy`, nhánh `main`.

## K07–K08 — Triển khai lên Vibe Hosting (13/10/2026, anh duyệt)

| Mã | Chủ đề | Đã chốt | Áp dụng |
|---|---|---|---|
| **K07** | Thử iPhone | **Bỏ mkcert** (thay K01). Thử Web Push trên iPhone thật ngay ở `https://lindy.vibe.vnws.com` (hosting tự cấp HTTPS). | Không cài chứng chỉ gốc lên iPhone. |
| **K08** | Tài khoản trên hosting | Hosting không có dòng lệnh → app tự chuẩn bị DB khi khởi động (role, migration, dữ liệu nền, tài khoản Chủ đầu tiên từ biến môi trường) và có màn **Thêm → Tài khoản** cho Chủ. | Quyền mới `users.manage`, chỉ vai trò Chủ. Chi tiết: `docs/TRIEN_KHAI.md`. |

## T03 — Chuyển sang Vibe Host Mắt Bão (13/10/2026, anh chốt)

- **Hosting chạy thật: Vibe Host của Mắt Bão** (bảng quản lý `https://v2.tinhgon.xyz`), thay Nhân Hòa ở T02. Nguồn code giữ repo `github.com/kupbyn-cyber/Lindy`, nhánh `main`, kết nối bằng Git URL + mã truy cập.
- Tên miền tạm do Vibe Host cấp, dạng `*.n2.tinhgon.xyz`. K07 áp dụng cho tên miền này.

## T04 — Dựng bằng Dockerfile như CEN WORK (13/10/2026, anh duyệt)

- Lindy có `Dockerfile` 2 tầng (dựng bằng Bun, chạy bằng `node:24-slim`); chuẩn bị DB trước khi bật server, lỗi thì Vibe Host giữ bản đang chạy. Lý do: ảnh Nixpacks 1,2 GB vượt hạn mức 1 GB của gói, không triển khai lại được.
- Xoá website cũ, tạo lại từ đầu. Dự định dùng DB mới, nhưng gói tính cả website là dịch vụ nên không tạo được DB thứ hai: dùng lại `linhdy-db` (giữ dữ liệu, tài khoản cũ).
- Chi tiết: `docs/TRIEN_KHAI.md`, `docs/BAI_HOC_TRIEN_KHAI.md`.

## K09–K11 — Đơn hàng, trước Đợt 2 (13/10/2026, đã chốt)

Nguồn: hỏi khi lập kế hoạch `docs/plans/2026-10-13-dot-2-don-hang.md`.

| Mã | Chủ đề | Đã chốt | Áp dụng trong app |
|---|---|---|---|
| **K09** | Thợ xem đơn nào | Thợ thấy đơn **mình tạo** và đơn **có phần mình làm**. Linh, Nhung thấy mọi đơn trong cơ sở. | Kiểm ở API và RLS. Danh sách đơn, chi tiết, lịch sử khách, Tổng quan của thợ chỉ gồm các đơn này; không thấy doanh thu tổng hợp của thợ khác. |
| **K10** | Sửa đơn sau Làm xong | Đơn đã bấm **Làm xong** (Chờ xác nhận) thì **chỉ Nhung, Linh sửa**; thợ không sửa được nữa. | Kiểm ở API và trigger DB. Mỗi lần sửa lưu nội dung trước/sau, người sửa, thời điểm. |
| **K11** | Trạng thái Đang làm | **Tạo đơn là Đang làm luôn**, không có nút bắt đầu riêng. "Nháp" chỉ là đơn đang soạn trên máy, chưa lưu. | Trạng thái đơn: Đang làm → Chờ xác nhận → Đã xác nhận; Huỷ có lý do. Đơn tạo từ lịch → lịch sang "Đang làm" ngay. Thay "Nháp" ở PRD §6.3; mã quyền `order.create_draft` giữ nguyên, nghĩa là "tạo đơn". |
| **K12** | Sửa giá thấp hơn khoảng hoặc niêm yết (Q-A) | Khoản giảm do sửa giá thấp hơn giá thấp nhất của khoảng hoặc thấp hơn giá niêm yết **luôn cần Nhung (hoặc Linh) duyệt**, kèm lý do, và **không tính vào bậc %** của C15. Các khoản giảm khác (5%, 10%, sinh nhật, bù khiếu nại, giảm tay) vẫn theo bậc C15. | Khớp test 46. Mức duyệt của đơn = mức cao nhất giữa bậc % (C15) và "Nhung" nếu có khoản giảm này. |
| **K13** | Lượt khách (Q-B) | **1 đơn = 1 lượt khách.** | Tổng quan và báo cáo ngày đếm lượt khách bằng số đơn đã xác nhận. |
| **K14** | Ai sửa đơn Đang làm (P39) | **Người tạo đơn và Nhung, Linh.** Thợ được chia phần chỉ xem, muốn đổi thì báo người tạo hoặc Nhung. | Chặn ở API và trigger DB. Thợ có phần vẫn bấm Làm xong được. |
| **K15** | Phiếu ưu đãi bù khiếu nại do người không phải chủ lập (P40) | Lập được ngay, đồng thời **vào danh sách Cần xem lại của Linh**. | Linh bấm "Đã xem" trên phiếu; Tổng quan đếm chung với đơn cần xem lại. |

## K16–K18 — Sổ tiền và cọc Tết, trước Đợt 3 (13/10/2026, đã chốt)

Nguồn: hỏi khi lập kế hoạch `docs/plans/2026-10-13-dot-3-so-tien-coc.md`.

| Mã | Chủ đề | Đã chốt | Áp dụng trong app |
|---|---|---|---|
| **K16** | Lịch tạo trong mùa cọc mà khách chưa chuyển cọc (Q-C) | **Lưu được.** Lịch có nhãn **"Chưa cọc"** và nằm trong Cần xử lý của Linh, Nhung, Chin cho đến khi có khoản cọc. | Làm rõ test 30 module lịch ("Form yêu cầu cọc"): form hiện phần cọc và số gợi ý, nhưng không chặn lưu. |
| **K17** | Chốt quỹ lệch tiền đếm (Q-D) | App ghi bút toán **"chênh lệch kiểm quỹ"** đúng bằng số lệch, kèm lý do, để **số dư tiền mặt trong app bằng tiền thật trong két**. Mọi lần lệch khác 0 vào **Cần xem lại của Linh**. | Tiền mặt đầu ngày hôm sau = số đếm khi chốt. Bút toán lệch chỉ thêm, không sửa. |
| **K18** | Ai làm phiếu hoàn tiền, huỷ đơn đã xác nhận (Q-E) | **Nhung, Linh.** Phiếu hoàn và huỷ do Nhung làm vào **Cần xem lại của Linh** (như K15). | Quyền `order.refund` cho Linh, Nhung; kiểm ở API và DB. Hoàn phải có lý do; huỷ đơn đã xác nhận chỉ khi đã hoàn hết tiền thu. |

## K19 — Sau phản biện Đợt 3 (13/10/2026, anh chốt)

| Mã | Chủ đề | Đã chốt | Áp dụng trong app |
|---|---|---|---|
| **K19** | Ảnh chứng từ làm DB phình (P61) | **Giữ như hiện tại, không thêm hạn mức ảnh mỗi ngày.** Dung lượng do Vibe Host Mắt Bão xử lý. | Giữ giới hạn sẵn có: tối đa 3 ảnh mỗi phiếu, mỗi ảnh ≤ 1MB, app thu nhỏ ảnh trước khi gửi. |

## K20–K22 — Công và lương, trước Đợt 4 (13/10/2026, anh chốt)

Nguồn: hỏi khi lập kế hoạch `docs/plans/2026-10-13-dot-4-cong-luong.md`.

| Mã | Chủ đề | Đã chốt | Áp dụng trong app |
|---|---|---|---|
| **K20** | Ngày chưa duyệt công khi khoá lương (Q-F) | Trong tháng, ngày chưa duyệt **tạm coi như đi làm** (lương tạm tính không bị trừ, test 23). **Khoá bảng lương chỉ được khi mọi ngày đã duyệt** (đi làm / nghỉ có phép / nghỉ không phép). | Bảng lương và hộp xác nhận khoá hiện số ngày chưa duyệt; DB chặn khoá khi còn ngày chưa duyệt. |
| **K21** | Hạn mức tạm ứng (Q-G) | **Tổng các lần ứng trong một tháng ≤ lương cứng** của người đó (A05). | Đề nghị đang chờ, đã duyệt, đã chi đều tính vào tổng; bị từ chối, đã huỷ thì không. Kiểm ở API và constraint DB. |
| **K22** | Tạm ứng nhiều hơn lương của tháng (Q-H) | Khi khoá, phần âm **tự chuyển thành khoản trừ vào lương tháng sau**, ghi tháng gốc; phiếu lương tháng này còn lại 0đ. | Khoản trừ loại "chuyển từ tháng trước", không sửa tay được. |

## K23–K25 — Hoàn thiện, trước Đợt 5 (13/10/2026, anh chốt)

Nguồn: hỏi khi lập kế hoạch `docs/plans/2026-10-13-dot-5-hoan-thien.md`.

| Mã | Chủ đề | Đã chốt | Áp dụng trong app |
|---|---|---|---|
| **K23** | Lợi nhuận ước tính (Q-K) | **Chỉ khoản kinh doanh:** doanh thu thuần (sau giảm giá, hoàn) + doanh thu cọc bỏ hẹn − chi vận hành đã chi − chi nhân sự ngoài bảng lương đã chi − lương phải trả của tháng. Thu khác, góp/rút vốn, tạm ứng, tip giữ hộ, chênh lệch quỹ, điều chỉnh **hiện riêng, không cộng vào**. | Chỉ Linh (`profit.read`) thấy; Nhung, thợ không nhận trường lợi nhuận (test 27). |
| **K24** | Báo cáo đã chốt không bị đổi ngược (Q-L) | Khi Linh **khoá bảng lương** tháng, app **chụp lại số báo cáo tháng**. Báo cáo tháng đó hiện số đã chốt, kèm dòng riêng **"phát sinh sau khi chốt"** (đơn xác nhận muộn, sửa đơn). | Bản chụp ghi trong cùng giao dịch khoá lương; chỉ thêm, không sửa, không xoá. |
| **K25** | Ai tải file xuất (Q-M) | **Chỉ Linh** tải file (báo cáo tháng, đơn hàng, sổ tiền, thu chi, khách hàng, bảng lương, bản sao lưu). Nhung xem trên app, không tải. | Quyền `data.export` chỉ gán vai trò chủ; mỗi lần tải ghi audit. |

## S01–S14 — Gói chỉnh sửa sau Đợt 5 (14/10/2026, chủ trả lời Phiếu 4)

Nguồn: `docs/surveys/04-phieu-chinh-sua.md`. Kế hoạch: `docs/plans/2026-10-14-goi-chinh-sua.md`. Các mục này thắng quyết định cũ khi khác nhau.

| Mã | Chủ đề | Đã chốt | Thay đổi so với trước |
|---|---|---|---|
| **S01** | Xoá tài khoản | Chủ xoá được tài khoản (tạo nhầm, tạo thử, người đã nghỉ). **Chưa có dữ liệu thì xoá hẳn.** Đã có dữ liệu thì **xoá thông tin đăng nhập** (SĐT, email, mật khẩu, phiên) và **ẩn khỏi danh sách**; tên vẫn hiện trong đơn, lương, lịch sử cũ. | Ngoại lệ có chủ đích của quy tắc "không xoá vĩnh viễn": chỉ áp cho tài khoản chưa phát sinh dữ liệu. Đăng nhập cũng ghi nhật ký (không xoá được), nên tài khoản **đã từng đăng nhập** đi theo cách xoá đăng nhập và ẩn. SĐT đã xoá được dùng lại cho tài khoản mới. |
| **S02** | Bỏ bước chốt lịch | Lịch tạo ra là **chốt luôn**; không còn trạng thái "Mới đặt", không còn nút "Chốt lịch", "Tạo và chốt". | Thay B02, B03, B04. Lịch "Mới đặt" đang có chuyển thành "Đã chốt lịch". |
| **S03** | Nút trong chi tiết lịch | Chỉ còn **Sửa lịch · Tạo đơn · Huỷ lịch**. "Khách không đến" và "Khách báo huỷ" thành **lý do khi huỷ**: Khách báo huỷ / Khách không đến / Lý do khác. Cọc xử lý theo lý do như hiện nay (C03). | Bỏ nút Khách đã đến (Tạo đơn tự ghi khách đến), Hoàn thành (tự hoàn thành theo đơn), Khách không đến, Khách báo huỷ, Tạo thêm đơn. |
| **S04** | Nhân viên thường bấm Huỷ lịch | Vẫn thấy nút Huỷ lịch. Người không có quyền huỷ thì bấm xong app **gửi yêu cầu** cho Linh, Nhung, Chin huỷ chính thức (như B07); lịch giữ nguyên đến khi họ xử lý. | Thay B06 (không còn lịch "Mới đặt" để tự huỷ). |
| **S05** | Đóng hộp thoại | Bỏ nút "Thôi" và "Đóng"; **mọi hộp hỏi lại và bảng trượt** dùng nút **X ở góc phải trên**. | Toàn app. |
| **S06** | Lịch nhiều khách | Bấm Tạo đơn trên lịch N khách: app **tạo luôn N đơn ngang nhau** (Khách 1…N). Trước khi tạo, app **hỏi tên từng khách** (SĐT không bắt buộc); bỏ trống thì ghi "Khách đi cùng" + tên người đặt. | Thay cách "Tạo thêm đơn (khách khác trong nhóm)". |
| **S07** | Cọc lịch nhóm | Cọc **chia đều** cho các đơn của lịch (200.000đ cho 2 khách → mỗi đơn trừ 100.000đ). | Thay cách trừ vào đơn xong trước. |
| **S08** | Số đơn = số khách | Số đơn của lịch **luôn bằng số khách**; mỗi khách trong lịch nhóm chỉ có 1 đơn. Khách đến ít hơn: sửa lịch giảm số khách, đơn thừa huỷ có lý do. Đến thêm: sửa lịch tăng số khách (tối đa 4, K05), app thêm đơn. | Câu "1 khách không thể có nhiều hơn 1 lịch" nghĩa là ý này. |
| **S09** | Trùng khách | **Chỉ cảnh báo, vẫn cho lưu.** | Giữ B12, không thêm chặn. |
| **S10** | Màn lịch | Mỗi giờ **thấp hơn hiện nay một chút**, vẫn cuộn xem cả ngày; **phóng to, thu nhỏ bằng hai ngón tay**. Ô lịch hiện theo thứ tự **số khách – tên khách – SĐT – giờ**, kèm dấu "chưa cọc" nếu có. Vuốt trái, phải: màn Ngày sang ngày bên cạnh, màn Tuần sang tuần bên cạnh. **Không** thêm kiểu xem 3 ngày. | Thay B08 phần ô lịch: ô lịch chung **có hiện SĐT**. Thông báo trên màn hình khoá vẫn không hiện SĐT. |
| **S11** | "Bỏ nút tạo lịch" | Ý chủ là **bỏ nút tạo đơn** (nút tròn "+ Tạo đơn"), **không bỏ tạo lịch**. Nút "+" tạo lịch và chạm chỗ trống vẫn giữ. | Phạm vi bỏ nút chờ chốt (Q-O trong kế hoạch). |
| **S12** | Dữ liệu dùng thử | Nạp **trên app thật** cho cả quán thử, dùng **tài khoản thật**. Gói gồm khoảng 2 tuần lịch, 40–60 đơn, sổ tiền, thu chi, chấm công, lương tạm tính tháng này. Hiện app chưa có dữ liệu thật. Bắt đầu dùng thật: **Chủ bấm Thêm → Dữ liệu dùng thử → "Xoá, bắt đầu dùng thật"**, gõ chữ xác nhận, **xoá sạch** lịch, đơn, khách, sổ tiền, thu chi, chấm công, lương, tạm ứng, báo cáo, thông báo; **giữ** tài khoản, danh mục dịch vụ, combo, cài đặt. Chỉ dùng được một lần. | Ngoại lệ có chủ đích của quy tắc "không xoá vĩnh viễn", chỉ một lần trước khi dùng thật. |
| **S13** | Kiểu chữ | **Be Vietnam Pro cho cả app**, kể cả tiêu đề và số tiền lớn. **Chữ LINDY giữ chữ có chân** (Cormorant Garamond) làm dấu hiệu thương hiệu. | Thay G11 (kiểu chữ tiêu đề, số tiền). |
| **S14** | Trang chủ | Làm lại cho **mọi người, kể cả thợ**. Đầu trang chữ số to: **doanh thu hôm nay, số khách hôm nay, tiền đã thu và khách còn nợ, tiền mặt trong két và tiền trong tài khoản, doanh thu tháng đến hôm nay**; thêm **biểu đồ doanh thu 30 ngày**. Danh sách "Cần xử lý" **gộp thành một thẻ đếm số việc**, bấm vào mới xem chi tiết. | Quyền xem giữ nguyên (K09, test 27): thợ thấy số của mình, không thấy doanh thu quán và quỹ. |
| **S15** | Nhân viên thường sửa lịch (Q-N) | Sửa được lịch **do mình tạo**, khi lịch **chưa tạo đơn và chưa đến giờ hẹn**. Lịch khác nhờ Linh, Nhung, Chin. | Thay luật "chỉ sửa lịch mình tạo khi còn Mới đặt". |
| **S16** | Tạo đơn chỉ từ lịch (Q-O) | **Bỏ nút tròn "+ Tạo đơn" ở mọi màn.** Mọi đơn tạo từ lịch; khách vãng lai cũng tạo lịch rồi bấm Tạo đơn, để kiểm soát. | Thay G18 (vị trí nút "+ Tạo đơn"). Bỏ màn tạo đơn rời; API chặn tạo đơn không gắn lịch. |
| **S17** | Hồ sơ nhân viên khi xoá dữ liệu thử (Q-P) | Hồ sơ, mức lương nhân viên **xoá cùng dữ liệu thử**; sau đó Linh nhập hồ sơ thật ở Thêm → Nhân viên. | Bổ sung S12. |
| **S18** | Ảnh thành phẩm (15/10/2026) | Sau khi bấm **Làm xong** (và ở chi tiết đơn) có nút **Chụp ảnh**: mở camera iPhone hoặc chọn ảnh có sẵn, app ghép khung, bấm **Lưu / Chia sẻ** để lưu vào Ảnh hoặc gửi Instagram, Zalo. Mỗi đơn chụp được nhiều ảnh. | Tính năng mới. |
| **S19** | Khung ảnh (sửa 15/10/2026) | **Một kiểu khung**, chức năng tên **"Chụp ảnh thành phẩm"** (bỏ khung nội bộ kiểu Timemark, không ghi chữ "Đăng Instagram"). Khung có: LINDY, NAIL & LASH STUDIO, @lindy.nailashstudio, tên dịch vụ, **tên khách che bớt** (2 chữ đầu + `***`, ví dụ "Ma***") để ảnh đăng lên thật hơn, thợ, ngày. Không có SĐT, giá, mã đơn. Khách đi cùng không có tên thì bỏ phần tên. | Mẫu: artifact "Khung ảnh LINDY". |
| **S20** | Khổ ảnh | **4:5** (1080 × 1350). | |
| **S21** | Không lưu ảnh vào app | Ảnh chỉ lưu trên điện thoại. App chỉ giữ dữ liệu đơn (dịch vụ, ngày) trong lịch sử khách như hiện có. | Không đổi dữ liệu, không tốn dung lượng hosting. |
| **S22** | Sau khi chụp, lưu ảnh thành phẩm (15/10/2026) | Ghép khung xong **hiện ảnh để xem** trọn trong bảng. Bấm Lưu / Chia sẻ xong app **báo "Đã lưu / gửi ảnh"**, nút cuối đổi thành **Chụp ảnh khác · Đóng**; vẫn gửi thêm nơi khác được. | Ngoại lệ của S05: bảng này có nút **Đóng** theo yêu cầu của chủ. |
| **S23** | QR chuyển khoản (15/10/2026) | Mã **VietQR (NAPAS)** có sẵn **số tiền** và **nội dung**; **app tự vẽ QR trên điện thoại** (cách A), không dùng dịch vụ ngoài. QR chỉ giúp khách chuyển đúng; người thu vẫn xem thông báo ngân hàng rồi bấm ghi tiền như cũ. | Tính năng mới. Tự xác nhận tiền về (SePay, Casso…) chưa làm. |
| **S24** | Nơi hiện QR | Chỉ ở hộp **ghi tiền thu của đơn**, khi chọn **Chuyển khoản**. **Không** hiện ở nhận cọc lịch. | |
| **S25** | Tip và QR | Số tiền trên QR **chỉ là tiền thu của đơn**, **không gộp tip**: khách chuyển tip riêng cho nhân viên. | Phần ghi tip giữ hộ hiện có giữ nguyên. |
| **S26** | Thông tin tài khoản nhận tiền | Ngân hàng, số tài khoản, tên chủ tài khoản của "Tài khoản cs HTK": **chủ thêm sau**. Chưa có thì không hiện QR. | |
| **S27** | Bỏ tip trên app (15/10/2026) | **Bỏ tính năng tip**: khách tip **chuyển riêng cho nhân viên**, app không ghi tip. | Thay Q15 (tip giữ hộ). |
| **S28** | Phiếu xử lý | **Ẩn** chức năng lập phiếu xử lý (bảo hành, khiếu nại) **trong bản này**. | Tạm ẩn, chưa bỏ. |
| **S29** | Hộp ghi tiền thu | Mở hộp ghi tiền thu thì **chọn sẵn Chuyển khoản** (hiện QR trước), vì phần lớn khách chuyển khoản. | |
| **S30** | Bố cục nút màn chi tiết đơn (anh duyệt 15/10/2026) | **Nút chính cố định** ngay trên menu dưới, theo trạng thái: Làm xong / Duyệt giảm giá / Xác nhận bill / Ghi tiền thu (kèm số tiền). **Chụp ảnh, Sửa đơn** hai nút nhỏ cạnh nhau. **Hoàn tiền, Huỷ đơn** thành chữ nhỏ ở cuối, tách xa nút chính (vẫn hỏi lại). Dòng tiền thu chỉ ghi "Chuyển khoản" / "Tiền mặt". | Thay cách xếp dọc mọi nút toàn chiều ngang. |
| **S31** | Màu lịch, độ tương phản (anh duyệt 16/10/2026) | Ô lịch **kiểu lịch iPhone**: nền màu nhạt, vạch trái đậm, chữ cùng tông. **Hồng mận** = đã chốt; **vạch cam** = chưa cọc, cọc chờ xác nhận, yêu cầu huỷ; **xanh** = khách đã đến, đang làm; **xám** = xong; **xám mờ gạch ngang** = huỷ, không đến. Áp cho màn Ngày, Tuần; Danh sách có vạch màu đầu dòng. Viền ô nhập giao diện sáng `line-strong` `#9c8d82` → `#968679` (đạt 3:1 trên nền xám nhạt). Mọi chữ ≥ 4.5:1, vạch ≥ 3:1. | Thay ô lịch nền xám viền mảnh (chỉ 1.06–1.09:1 so với nền trang). |
| **S32** | Đầu màn Lịch (anh duyệt 17/10/2026) | Màn Ngày: một thẻ gồm **ngày · số lịch**; **người nghỉ ngày đó** nổi bật (nền cam): đã duyệt "Nghỉ: …", chờ duyệt "… xin nghỉ, chờ duyệt"; không ai nghỉ thì "Đủ nhân sự"; **Cần xử lý** (Linh, Nhung, Chin, chỉ hôm nay). **Bỏ dòng hướng dẫn thao tác.** Ai xem được lịch thì thấy **tên** người nghỉ, **không thấy lý do**. | Mở rộng quyền xem: trước đây thợ chỉ thấy đơn nghỉ của mình. RLS đơn nghỉ giữ nguyên; tên đọc qua hàm DB `app.staff_off_on`. |
| **S33** | Khung ảnh thành phẩm (18/10/2026) | Chữ thương hiệu **LINDY · NAIL STUDIO** (bỏ "& LASH"). In **đủ mọi dịch vụ** của đơn (kèm số lượng, ví dụ "Mắt mèo × 10 ngón"), không cắt "…": dài thì xuống dòng, ảnh thấp bớt, vẫn khổ 4:5. Thêm **TỔNG** = thành tiền sau giảm. Giữ: khách che bớt, thợ, ngày, @lindy.nailashstudio; không SĐT, mã đơn. | Thay S19 phần "không có giá" và tên một dòng. |
| **S35** | Khung ảnh thành phẩm (19/10/2026) | Khổ **3:4** (1080 × 1440). Dưới ảnh **chỉ có chữ LINDY · NAIL STUDIO**, không in thông tin gì khác (dịch vụ, tiền, khách, thợ, ngày, Instagram). | Thay S19, S20, S33. |
| **S36** | Quy trình sau làm xong (19/10/2026) | **Nhận tiền → in bill → chụp ảnh thành phẩm**; nhân viên chụp ảnh **bill kèm thành phẩm**. Cách in bill: S38. Màn đơn: thu đủ tiền thì nút chính là **In bill**; in xong nút chính là **Chụp ảnh**, In lại bill ở hàng nút nhỏ. Làm xong không tự mở Chụp ảnh nữa. | Thay việc tự mở Chụp ảnh ngay sau Làm xong (S18). |
| **S34** | Vạch giờ hiện tại (18/10/2026) | Màn Lịch, kiểu Ngày, **ngày hôm nay**: vạch đỏ ngang và nhãn giờ (ví dụ 13:22) ở cột giờ, như lịch iPhone; tự chạy theo giờ. | |
| **S37** | Nội dung bill in (anh chốt 19/10/2026) | **LINDY NAIL STUDIO**; dòng thông tin quán (tối đa 4 dòng, Linh sửa ở Thêm → Máy in bill); **HOÁ ĐƠN + mã đơn**, ngày giờ in; **tên khách in đầy đủ** (khách lẻ: "Khách lẻ"), **không in SĐT**; thợ; từng dịch vụ với giá sau giảm riêng của dòng; tạm tính, giảm cả bill, **TỔNG**; đã thu theo cách trả, còn lại; bảo hành đến ngày; lời cảm ơn (Linh sửa). Khổ giấy 80mm hoặc 58mm (Linh chọn). | Nội dung "em sáng tạo, anh sửa sau": sửa được dòng quán, lời cảm ơn, khổ giấy không cần sửa code. |
| **S38** | Cách in bill: trạm in (anh duyệt 19/10/2026) | **MacBook dư ở quán làm trạm in** (macOS 11, Node.js 22), nối máy in sẵn có của quán qua mạng (`tcp://IP:9100`), USB (`cups://…`) hoặc bluetooth đã ghép (`file:///dev/cu.…`). Ai xem được đơn (cả thợ trên đơn) bấm **In bill** khi đơn đã bấm Làm xong (chờ xác nhận hoặc đã xác nhận), in lại được. App lưu lệnh in kèm nội dung bill lúc bấm; trạm in hỏi app mỗi 2 giây bằng **mã kết nối** (Linh tạo, chỉ hiện một lần, DB lưu dạng băm, thu hồi được), vẽ bill thành ảnh rồi in. Lệnh chờ **quá 10 phút** thì hết hạn (không tự in muộn); trạm lấy lệnh mà **2 phút** không báo kết quả thì ghi lỗi. **In thử**, cài đặt máy in: chỉ Linh. iPad không làm trạm in (không chạy nền được); máy in bluetooth không nối thẳng điện thoại (Safari không hỗ trợ, mỗi lúc chỉ một máy nối). | Lệnh in không xoá, chỉ đổi trạng thái. |
| **S39** | Báo thiếu hồ sơ nhân viên (anh duyệt 20/10/2026) | Tài khoản đang dùng mà **chưa có hồ sơ nhân viên**, hoặc có hồ sơ (chưa nghỉ việc) mà **chưa có chính sách lương** của tháng đang làm, thì app báo rõ thay vì ẩn: nhãn **Thiếu hồ sơ / Thiếu chính sách** ở Thêm → Tài khoản, nút **Hồ sơ nhân viên** mở thẳng hồ sơ người đó; tạo tài khoản xong nhắc nhập hồ sơ; **Cần xử lý của Linh** có dòng tên người thiếu; Trang chủ của người thiếu hồ sơ hiện "Chưa có hồ sơ nhân viên…" thay cho thẻ Vào ca. Nạp gói dùng thử báo lại **tên không có trong `data/staff.csv`** (vẫn so đúng tên). Nguyên nhân: tài khoản "Nhung Hi" không khớp "Nhung" nên gói thử bỏ qua, Nhung không đăng ký nghỉ được. | Không đổi quyền, dữ liệu. Chỉ người có `payroll.edit` (Chủ) thấy nhắc ở Tài khoản và Cần xử lý. Kế hoạch: `docs/plans/2026-10-20-bao-thieu-ho-so.md`. |
| **S40** | Làm gọn tab Khách và Thêm (anh duyệt A–C 20/10/2026) | **Thêm:** chia 6 nhóm theo việc — Hằng ngày (Chốt quỹ, Thu chi, Chấm công, Cần xem lại), Tiền và báo cáo, Nhân sự, Cài đặt quán, Dữ liệu, Cá nhân (Thông báo, Đổi mật khẩu, Đăng xuất ở cuối); nhóm ẩn theo quyền; gợi ý một dòng ngắn; mục có việc chờ hiện số (lấy từ Cần xử lý); đầu trang "tên · vai trò · cơ sở". **Khách:** ô tìm có kính lúp, dính đầu trang; chưa gõ thì nhóm theo ngày làm gần nhất (Hôm nay, Hôm qua, dd/mm); dòng phụ SĐT che · số lần làm (chỉ người xem mọi đơn); SĐT lẫn trong tên cũng che trên danh sách; Linh, Nhung thấy nhãn **Sửa tên** ở tên lẫn SĐT, giờ, ngày hoặc dài quá 30 ký tự; hồ sơ khách nhắc sửa, lịch sử sửa hồ sơ thu gọn. **Ô tên khách** (form lịch, khách mới khi tạo đơn, sửa khách): rời ô thì SĐT lẫn trong tên tự chuyển sang ô SĐT (nếu ô SĐT trống hoặc cùng số), báo "Đã chuyển … sang ô SĐT."; tên lẫn giờ, ngày thì nhắc, không chặn lưu. | Lý do: 30 khách gần nhất trên bản thật có 8 tên lẫn SĐT, 10 tên lẫn giờ/ngày (dán cả tiêu đề lịch). Không đổi quyền, dữ liệu; app không tự sửa tên cũ. Kế hoạch: `docs/plans/2026-10-20-ui-khach-them.md`. |
| **S41** | Mọi người xác nhận bill; Làm xong là xác nhận luôn (anh chốt 23/10/2026) | **Mọi tài khoản** (Linh, Nhung, Chin, thợ) xác nhận được bill của **đơn mình xem được** (thợ: đơn mình tạo hoặc có phần mình làm, K09 giữ nguyên). Thợ bấm **Làm xong là bill Đã xác nhận luôn**, vào doanh thu, hoa hồng, không chờ Linh, Nhung. Đơn còn **giảm giá chờ duyệt** (trên 10%, giá thấp hơn niêm yết/khoảng) thì Làm xong vẫn sang **Chờ xác nhận**, Nhung/Linh duyệt (C15, K12); bấm Làm xong không tự duyệt giảm giá. Giữ: sửa đơn sau Làm xong, hoàn tiền, huỷ đơn đã xác nhận vẫn Nhung, Linh (ghi tiền thu: S43). | Thay D17, PRD §4 phần "thợ không xác nhận bill" và bước chờ Nhung xác nhận. Quyền mới `order.confirm_bill` cho mọi vai trò; kiểm ở API và trigger DB (0030). Cọc Nhung xác nhận sau khi đơn đã xong được trừ ngay vào bill (trước đây trừ lúc xác nhận bill). Thợ ghi tiền thu, bỏ Q04: xem S43. |
| **S42** | Xoá món trong menu (anh chốt 23/10/2026) | Chủ bấm **Xoá** dịch vụ, combo ở Thêm → Danh mục dịch vụ (có hỏi lại): món **biến mất khỏi menu tạo đơn và danh mục**, không lấy lại được; **đơn cũ giữ tên, giá lúc bán**. Dịch vụ còn nằm trong combo thì xoá combo trước. Không làm sửa thành phần combo: muốn đổi thì tạo combo mới, xoá combo cũ. | Thay "không xoá, chỉ ngừng bán" (0010). Không xoá dòng trong DB (đánh dấu đã xoá, 0029): dòng đơn tham chiếu món, và seed lúc khởi động sẽ thêm lại món gốc nếu xoá hẳn. |
| **S43** | Thợ ghi tiền thu; bỏ Cần xem lại khi tự xác nhận (anh duyệt 23/10/2026) | **Mọi tài khoản ghi được tiền thu** (tiền mặt, chuyển khoản, có QR) cho đơn mình xem được, ngay sau Làm xong: thợ tự làm trọn **nhận tiền → in bill → chụp ảnh**, không nhờ Linh, Nhung. **Huỷ khoản thu** nhập nhầm, đối soát, chốt quỹ vẫn **Nhung, Linh**. **Bỏ Q04:** người không phải chủ tự xác nhận đơn có phần mình **không còn vào Cần xem lại** của Linh. | Thay Q04, PRD §4 phần "thợ không thanh toán". Quyền mới `order.record_payment` cho mọi vai trò; kiểm ở API, RLS và trigger DB (0030). Giữ: Nhung sửa đơn đã xác nhận có phần mình (P31), Nhung huỷ đơn đã xác nhận (K18), phiếu ưu đãi (K15) vẫn vào Cần xem lại. Đơn đã vào Cần xem lại từ trước vẫn còn cho Linh bấm Đã xem. |
| **S44** | Trang chủ: Toàn quán · Cá nhân (anh yêu cầu 26/10/2026) | Linh, Nhung có lúc cũng làm khách như thợ, nên trang chủ của người xem được số toàn quán có **ô chuyển Toàn quán · Cá nhân** ngay dưới lời chào. **Cá nhân** hiện chỉ số và biểu đồ 30 ngày **như màn của thợ**: doanh thu của bạn hôm nay, khách bạn làm hôm nay, doanh thu tháng, lương tạm tính (nếu có). Số cá nhân chỉ tính **phần mình làm** trên đơn đã xác nhận; dòng "đơn đang làm, chờ xác nhận" chỉ đếm đơn có phần mình làm, **không đếm đơn mình tạo hộ thợ khác**. Mặc định mở trang là Toàn quán. Các thẻ khác (Chấm công, Cần xử lý, lãi/lỗ, cọc, doanh thu thợ) giữ nguyên. | Bổ sung S14. Không đổi quyền, dữ liệu; thợ không thấy ô chuyển. |
| **S45** | Nút ở chi tiết lịch (anh chốt 01/11/2026) | **Tạo đơn** là nút chính dính đáy ngay trên menu dưới (như S30 ở đơn); **Sửa lịch** nút nhỏ; **Huỷ lịch** thành chữ nhỏ ở cuối, tách xa nút chính, vẫn hỏi lại và chọn lý do như S03. | Thay bố cục "3 nút một hàng" của S03; nghĩa và lý do huỷ của S03, S04 giữ nguyên. Nguồn: khảo sát UX 01/11, `docs/plans/2026-10-31-lam-moi-giao-dien.md` mục 2.5. |
| **S46** | Thẻ đầu màn Lịch khi không ai nghỉ (anh chốt 01/11/2026) | Không ai nghỉ thì **không hiện dòng** "Đủ nhân sự, không ai nghỉ". Có người nghỉ hoặc chờ duyệt vẫn hiện dải cam như S32. | Bổ sung S32, chỉ bỏ câu trống. |
| **S47** | Tab Thêm bớt dòng phụ (anh chốt 01/11/2026) | Nhóm **Hằng ngày** và **Cá nhân** chỉ còn tên mục; nhóm ít dùng (Tiền và báo cáo, Nhân sự, Cài đặt quán, Dữ liệu) giữ dòng gợi ý. Số việc chờ giữ. | Bổ sung S40. |
| **S48** | Bỏ hộp hỏi lại ở việc sửa lại được (anh chốt 01/11/2026) | **Xác nhận bill** và **Duyệt giảm giá** bấm là làm ngay, không hỏi lại (đơn vẫn sửa được sau đó, có lý do, K10). Hộp hỏi lại giữ cho việc không hoàn tác: Huỷ đơn, Hoàn tiền, Huỷ khoản thu, Huỷ lịch, Ra ca, Chốt quỹ, Khoá bảng lương, Đăng xuất. | Quy định chung: chỉ việc không hoàn tác được mới hỏi lại. **Sửa sau phản biện (01/11):** đơn còn **giảm giá chờ duyệt** thì Xác nhận bill vẫn hỏi lại, vì bấm xác nhận chính là duyệt giảm giá (C15, K12) và không quay lại được; đơn không có giảm chờ duyệt thì bấm là xong. Mọi hộp hỏi lại khác (giữ cọc, hoàn cọc, xoá món…) giữ nguyên. |
| **S49** | Mỗi màu một nghĩa, 8 tone (anh chốt 01/11/2026) | Chip trạng thái dùng 8 tone, mỗi tone một nghĩa: **hành động** (nút, tab, link, huy hiệu số; không dùng cho chip), **đang làm** (xanh chàm dịu, mới), **đang chờ ai đó** (hồng mận), **chưa đủ, cần chú ý** (cam), **tiền chưa về, hỏng** (đỏ), **xong và đúng** (xanh lá), **thông tin** (nâu nhạt, mới), **đã kết thúc** (xám). Bảng trạng thái → tone và mã màu ở `docs/plans/2026-10-31-lam-moi-giao-dien.md` mục 2.5.2; đặt ở một file có test. Trạng thái tiền giữ G10. Ô lịch giữ S31, S34. | Thay cách 5 tone cũ (mận vừa là nút vừa là trạng thái). **Điều kiện:** mận cho "đang chờ" chỉ đúng khi nút chính là nâu (hướng B, chờ phiếu của Linh chốt G07); Linh giữ mận cho nút thì "đang chờ" đổi sang tím ấm, đo lại tương phản. |
| **S50** | Ô đăng nhập (anh chốt 01/11/2026) | Ô đăng nhập mở **bàn phím số**, có chữ **"Dùng email"** để đổi sang bàn phím chữ. | Nhân viên đăng nhập bằng SĐT là chính; bàn phím số của iPhone không gõ được email, có tài khoản chỉ có email nên cần lối đổi. |
| **S51** | Màu giống CEN WORK (anh yêu cầu 01/11/2026) | LINDY OS dùng **bộ màu Đen Ngọc Trai của CEN**: nền xám trắng hoặc gần đen, chữ đen trắng trung tính, nút chính đen (sáng) hoặc **dải ngọc trai** (tối), ánh sáng nền tĩnh, thanh dưới kính. Mã màu theo `cenwork-lovable/src/styles.css`. Chip trạng thái theo tone của CEN: **đang làm** xanh dương, **đang chờ ai đó** tím, **chưa đủ, cần chú ý** cam, **tiền chưa về, hỏng** đỏ, **xong và đúng** xanh lá, còn lại xám. Khác CEN có chủ đích: viền ô nhập đậm hơn để đạt 3:1; viền thẻ tối #34343a; ánh sáng nền 18% và 16% (CEN 26% và 22%), không hạt nhiễu; thanh dưới kính 86% (CEN 58–62% làm chữ rớt 4.5:1); link gạch chân vì màu nhấn trùng màu chữ; **sáng tối vẫn tự theo iPhone** (G09), không có nút chuyển; giữ Be Vietnam Pro và chữ LINDY OS (S13), ô lịch hồng mận, xanh (S31, phần xám đổi sang xám trung tính), vạch giờ (S34), chữ kèm trạng thái tiền (G10). Không thêm chuyển động (G21). | Thay G02 (màu app, không phải màu thương hiệu của quán), G06, G07, G08; thay phần màu của S49 (tím thay mận cho "đang chờ", gộp "thông tin" vào xám, bỏ điều kiện chờ phiếu). Bỏ hướng B và phiếu của Linh. Biểu tượng app chữ L nền mận giữ nguyên, chưa có quyết định đổi. |
| **S52** | Làm gọn chữ và thao tác trên điện thoại (anh yêu cầu 01/11/2026) | **Bỏ chữ hướng dẫn và giải thích lặp** trên màn, chỉ giữ câu cần lúc có việc (`docs/plans/2026-10-31-lam-moi-giao-dien.md` mục 2.5.3). Không ghi "(không bắt buộc)" trên ô nhập. **Dịch vụ chọn ngay trong màn đơn** (đơn Đang làm): chạm là thêm, chạm lần nữa là bỏ nếu dòng chưa sửa gì; dòng đã sửa giá, chia thợ, có giảm thì bỏ bằng nút X; có nút +1 cho dịch vụ làm hai lần. **Thợ làm mặc định là người đang lên đơn**, bấm mới chọn người khác; Linh, Nhung và lịch nhiều khách vẫn thấy đủ danh sách thợ. **Sau Làm xong** đơn đã xác nhận mà còn phải thu thì mở luôn hộp Ghi tiền thu (đơn còn chờ duyệt giảm thì không). **Chụp ảnh** mở camera thẳng, vẫn có lối chọn ảnh có sẵn. **Lịch mới** có chip giờ và chip thời lượng 1h · 1h30 · 2h · 3h, Enter ở ô tên là lưu khi không có cọc và không có cảnh báo. **Chốt quỹ** nút dính đáy, thanh nút nổi trên bàn phím. **Đăng xuất** thành chữ nhỏ. Mọi thứ bấm được cao ít nhất 44px, trừ ô lịch và ô bảng công. Thông báo "Đã…" không che nút chính. Hộp hỏi lại không đóng khi đang xử lý. | Bổ sung G15 (mật độ dày giữ), G22, S30. Không đổi nghiệp vụ, quyền, API, dữ liệu. Kế hoạch: mục Bước 4. |
