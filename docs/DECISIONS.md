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
