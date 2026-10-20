# Chạy LINDY OS ở local

Cập nhật 13/10/2026, sau Đợt 0 đến Đợt 3 (sổ tiền, cọc, thu chi, chốt quỹ, tip, hoàn tiền) Đợt 4 (nhân viên, chấm công, lương, tạm ứng) và Đợt 5 (lợi nhuận, báo cáo đã chốt, xuất dữ liệu, sao lưu, nhập dữ liệu cũ). Máy: Windows 11, Node 24, Bun 1.4.

## Chạy hằng ngày

```bash
bun run dev
```

Mở http://localhost:3000. `bun run dev` tự bật PostgreSQL nhúng trước (máy khởi động lại thì DB tắt theo). Tắt DB khi không dùng: `bun run db:stop`.

Đăng nhập báo "Chưa kết nối được dữ liệu" nghĩa là PostgreSQL chưa chạy: chạy `bun run db:start`.

**Tài khoản mẫu (chỉ ở local):** `linh@lindy.test` (Chủ), `nhung@lindy.test` (Quản lý), `chin@lindy.test` (Thợ, quyền lịch mở rộng), `trang@lindy.test` (Thợ). Đặt mật khẩu dev cố định cho cả 4 bằng `bun scripts/dev-passwords.ts`; mật khẩu nằm ở hằng `DEV_PASSWORD` trong file đó. Lệnh này chỉ chạy được trên DB `lindy_dev`.

## Dựng lại từ đầu trên máy mới

1. `bun install`
2. `bun run db:setup` — bật PostgreSQL 16 nhúng (thư mục `.pgdata`, cổng 5433), tạo role, DB `lindy_dev` + `lindy_test`, chạy migration, tạo dữ liệu nền và 4 tài khoản mẫu. Mật khẩu sinh ngẫu nhiên ghi vào `.env` và `.local/` (không commit, không in ra màn hình).
3. `bun scripts/gen-vapid.ts` — khoá VAPID riêng cho Web Push.
4. `bun scripts/gen-icons.ts` và `bun scripts/gen-tokens.ts` — chỉ cần khi đổi biểu tượng hoặc `tokens.json`.
5. (Tuỳ chọn) `bun scripts/demo-data.ts` — 12 lịch demo từ hôm nay (SĐT giả) và 5 đơn demo hôm nay, hôm qua. Chỉ chạy trên DB `lindy_dev`; chạy lại sẽ thêm bản nữa, muốn sạch thì `db:reset` trước.
6. Danh mục dịch vụ ban đầu nạp từ `src/server/ops/catalog-data.ts`. Sửa `data/services.csv` hoặc `data/combos.csv` thì chạy `bun scripts/gen-catalog.ts` để sinh lại (chỉ thêm mã mới vào DB; giá đã có trong DB không bị ghi đè).

**Cổng 3000 đang bận** (một dev server khác đang chạy): chạy `node node_modules/vite/bin/vite.js dev --port 3002 --strictPort` hoặc cấu hình `lindy-dev-3002` trong `.claude/launch.json`.

**Dùng PostgreSQL cài thật thay bản nhúng:** đặt `PG_ADMIN_URL` trong `.env` trỏ tới tài khoản `postgres` của bản cài (anh tự nhập mật khẩu), rồi chạy `bun scripts/db-bootstrap.ts`, `bun run db:migrate`, `bun run db:seed`.

## Kiểm tra

| Lệnh | Việc |
|---|---|
| `bun run check` | Biome + luật cấm `sql.unsafe` + typecheck + toàn bộ test (dựng lại DB `lindy_test` mỗi lần) |
| `bun run test` | Chỉ test |
| `bun run build` rồi `bun scripts/scan-bundle.ts` | Build bản chạy thật; quét bundle trình duyệt không chứa bí mật (S16) |
| `node --env-file=.env .output/server/index.mjs` | Chạy bản build bằng Node (cổng 3000, đổi bằng `PORT`) |
| `bun run db:status` | Migration nào đã chạy |
| `bun run db:reset -- --confirm=lindy_dev` | Xoá sạch DB dev và chạy lại migration (chỉ DB localhost tên `_dev`/`_test`) |

## Thử đơn hàng (Đợt 2)

1. Đăng nhập `trang@lindy.test` → nút tròn **+** (Tạo đơn) → Thêm dịch vụ → tích chọn (gõ “tdc”, “son gel”, “mat meo”) → Thêm → **Làm xong**. Khách lẻ, thợ mặc định là người tạo.
2. Đăng nhập `nhung@lindy.test` → Đơn hàng → mở đơn Chờ xác nhận → **Xác nhận bill** → ô ghi tiền thu mở sẵn → Lưu.
3. Từ lịch: mở một lịch hôm nay → **Khách đã đến · Tạo đơn** → đơn mở sẵn với tên, SĐT khách; lịch sang Đang làm; xác nhận đơn → lịch Hoàn thành.
4. Thợ chỉ thấy đơn mình tạo hoặc có phần mình (K09); sau Làm xong chỉ Nhung, Linh sửa được (K10).
5. Đăng nhập `linh@lindy.test`: **Tổng quan** (Hôm nay/Tháng, doanh thu thợ, Cần xử lý đơn); **Thêm → Báo cáo doanh thu**; **Thêm → Danh mục dịch vụ** (thêm, sửa giá, ngừng bán).
6. Đơn đã xác nhận: **Lập phiếu xử lý** (sửa miễn phí trong hạn, tính phí, ưu đãi bill sau); **Sửa đơn** cần lý do. Ưu đãi bù khiếu nại hiện ở đơn sau của khách đó, bấm "Áp ưu đãi".
7. Tab **Khách**: tìm tên/SĐT, hồ sơ, lịch sử đơn; Nhung, Linh sửa tên/SĐT. Form lịch có "Chọn khách có sẵn".

## Thử sổ tiền và cọc Tết (Đợt 3A)

`bun scripts/demo-data.ts` tạo sẵn mùa cọc thử "Tết (demo)" 10 ngày từ hôm nay và 3 lịch: chưa cọc, cọc chờ xác nhận, đã nhận cọc.

1. `linh@lindy.test` → **Thêm → Sổ tiền**: chọn tháng mở sổ, nhập số dư hai tài khoản → **Mở sổ** (một lần). Số dư = số mở sổ + tiền vào − tiền ra từ ngày 1; khoản thu của đơn tự vào sổ.
2. `linh@lindy.test` → **Thêm → Cài đặt lịch → Mùa cọc Tết**: thêm hoặc sửa mùa (ngày dương lịch, 100.000đ/khách, hoàn khi báo trước 12 tiếng).
3. Trong mùa cọc, form tạo lịch có phần **Cọc**: chưa nhận cọc vẫn lưu được, lịch hiện nhãn "Chưa cọc" (K16); chọn "Khách đã cọc" để ghi luôn.
4. `nhung@lindy.test` → mở lịch có "Cọc chờ xác nhận" → **Xác nhận tiền đã vào** → tiền vào Sổ tiền.
5. Lịch có cọc → **Khách đã đến · Tạo đơn** → chọn dịch vụ → **Làm xong**: cọc tự trừ vào bill, còn phải thu = bill − cọc.
6. Lịch có cọc → Khách báo huỷ → Huỷ lịch (Linh, Nhung, Chin) → app gợi ý **Hoàn cọc** (báo trước ≥ 12 tiếng) hoặc **Giữ cọc**. Làm khác gợi ý phải ghi lý do và vào Cần xem lại của Linh.
7. **Tổng quan** (Linh, Nhung): Tiền trong quỹ, Cọc Tết; **Báo cáo**: doanh thu cọc khách bỏ hẹn tách riêng.

## Thử thu chi và chốt quỹ (Đợt 3B-1)

1. `trang@lindy.test` → **Thêm → Thu chi → + Đề nghị chi** (nhóm, số tiền, nội dung). Thợ chỉ thấy phiếu của mình.
2. `nhung@lindy.test` → Thu chi → **Chờ duyệt** → mở phiếu → **Duyệt** → **Chờ chi** → **Đã chi** (tiền mặt / chuyển khoản). Phiếu trên 1.000.000đ hoặc tiền nhà, lương thưởng, máy móc, sửa chữa: chỉ Linh duyệt.
3. Linh, Nhung → **Sổ tiền**: **Chuyển nội bộ**; Linh có thêm **Thu khác, vốn, điều chỉnh**. Khoản của tài khoản ngân hàng có nút **Khớp sao kê** (đã khớp thì khoản gốc không huỷ được).
4. Nhung → **Thêm → Chốt quỹ**: chọn ngày (hôm nay từ 21:00, hoặc hôm qua), xem tiền mặt lý thuyết và việc còn treo, nhập tiền đếm được → **Chốt quỹ**. Lệch thì ghi lý do; app ghi khoản chênh lệch và Linh xem lại. Khoản ghi sau khi chốt tính vào ngày hôm sau.

## Thử tip, hoàn tiền, chứng từ, báo cáo (Đợt 3B-2)

1. `nhung@lindy.test` → đơn đã xác nhận → **Ghi tiền thu** chuyển khoản, ô **Tip khách chuyển thêm** (chia theo phần tiền hoặc khách chỉ định); hoặc **Ghi tip khách chuyển khoản**.
2. Nhung → **Thêm → Chốt quỹ** → khối **Tip giữ hộ chờ trả thợ** → **Trả tiền mặt**. Thợ thấy tip chờ nhận ở Tổng quan.
3. Nhung → đơn đã xác nhận → **Hoàn tiền cho khách** (số tiền, tiền mặt/chuyển khoản, lý do) → phiếu hoàn có **Thêm ảnh chứng từ**. Hoàn hết tiền thu thì **Huỷ đơn** được.
4. Phiếu chi (Thêm → Thu chi → mở phiếu) có **Thêm ảnh chứng từ**.
5. `linh@lindy.test` → **Thêm → Cần xem lại**: mọi việc người khác tự làm (tự xác nhận, phiếu hoàn của Nhung, phiếu chi Nhung tự duyệt, lệch quỹ, cọc khác gợi ý) → **Đã xem**.
6. Linh → **Thêm → Báo cáo**: Tháng có **Dòng tiền tháng**, chi theo nhóm, theo ngày; Ngày có chốt quỹ, tip giữ hộ.

## Thử nhân viên và chấm công (Đợt 4A)

`bun scripts/demo-data.ts` tạo sẵn hồ sơ, chính sách lương 4 người (theo `data/staff.csv`), tháng bắt đầu tính lương = tháng này, chấm công hôm qua của Chin, Trang và một đơn nghỉ của Trang.

1. `linh@lindy.test` → **Thêm → Nhân viên**: ngày vào làm, ngày nghỉ việc, cách nhận lương; **+ Chính sách từ tháng…** (lương cứng, % hoa hồng, ngày nghỉ được hưởng, thưởng KPI quản lý; chỉ từ ngày 1); mốc KPI; tháng bắt đầu tính lương.
2. Linh → **Thêm → Cài đặt lịch → Ngày quán đóng cửa**: thêm một ngày hoặc một khoảng (Tết, sửa chữa), gỡ khi nhầm.
3. `trang@lindy.test` → **Tổng quan → Vào ca** (giờ do máy chủ ghi), cuối ngày **Ra ca**. **Lịch → biểu tượng đồng hồ (Chấm công)**: công tháng của tôi, **Đăng ký nghỉ**.
4. `nhung@lindy.test` → **Lịch → Chấm công → Duyệt công**: **Duyệt N người đã vào ca**; chạm từng người để ghi Đi làm / Nghỉ có phép / Không phép (bổ sung công không có giờ vào ca, đổi quyết định cần lý do); duyệt đơn nghỉ. **Bảng công**: lưới cả tháng, chạm một ngày để mở Duyệt công ngày đó.
5. Tổng quan của Nhung, Linh có **Cần xử lý · chấm công**: ngày công chưa duyệt (trước hôm nay), đơn nghỉ chờ duyệt.
6. Thiếu hồ sơ (S39): `linh@lindy.test` → **Thêm → Tài khoản → Thêm** một tài khoản thử → hộp mật khẩu tạm nhắc nhập hồ sơ, nút **Đã ghi lại, nhập hồ sơ ngay** mở thẳng hồ sơ ở Nhân viên. Danh sách tài khoản có nhãn **Thiếu hồ sơ**; Cần xử lý của Linh có dòng tên người đó. Đăng nhập tài khoản thử (email `@lindy.test` thì `bun scripts/dev-passwords.ts` đặt mật khẩu dev): Tổng quan hiện "Chưa có hồ sơ nhân viên…".

## Thử tab Khách và Thêm (S40)

1. Đăng nhập lần lượt `linh@`, `nhung@`, `trang@lindy.test` → **Thêm**: mục chia nhóm Hằng ngày, Tiền và báo cáo, Nhân sự, Cài đặt quán, Dữ liệu, Cá nhân; nhóm không có mục theo quyền thì ẩn. Mục có việc chờ hiện số giống thẻ Cần xử lý.
2. **Khách**: chưa gõ thì nhóm theo ngày (Hôm nay, Hôm qua, dd/mm); dòng phụ SĐT che · số lần làm (Linh, Nhung).
3. Tạo khách tên "Tú - 0969038498 - tay 13h" (hoặc gõ vào ô Tên khách ở form lịch): rời ô tên thì SĐT chuyển sang ô SĐT. Khách cũ có tên như vậy: danh sách che SĐT trong tên, Linh, Nhung thấy nhãn **Sửa tên**.

## Thử lương và tạm ứng (Đợt 4B)

Demo có tháng bắt đầu tính lương = tháng này và một đề nghị tạm ứng của Chin.

1. `chin@lindy.test` → **Tổng quan**: thẻ **Lương tạm tính tháng này**. **Thêm → Lương**: phiếu lương đủ tham số (công chuẩn, ngày vắng, lương ngày, hoa hồng theo đơn). **Thêm → Tạm ứng**: hạn mức tháng (tổng ≤ lương cứng), **+ Đề nghị tạm ứng**.
2. `linh@lindy.test` → **Thêm → Tạm ứng**: **Duyệt** → **Đã chi** (Nhung cũng chi được tạm ứng đã duyệt). Tạm ứng trừ vào lương tháng xin.
3. Linh → **Thêm → Lương**: bảng lương cả quán; mở một người: **Thưởng thêm / Khấu trừ**. Nhung chỉ xem.
4. Khoá: từ ngày 5 tháng sau, khi mọi ngày công đã duyệt và ai có hồ sơ cũng có chính sách lương → **Khoá bảng lương** → **Trả lương** từng người. Muốn thử khoá trên DB dev: đặt tháng bắt đầu là tháng trước và duyệt đủ công tháng đó.
5. Sau khi khoá: đơn tháng đó xác nhận muộn, phiếu hoàn → hoa hồng, KPI vào tháng đang mở (phiếu lương ghi "dời từ tháng đã khoá").

## Thử báo cáo, xuất dữ liệu, sao lưu (Đợt 5A)

1. `linh@lindy.test` → **Thêm → Báo cáo doanh thu → Tháng**: khối **Lợi nhuận ước tính** (chỉ Linh; Nhung không thấy). Tháng đã khoá lương: **Doanh thu đã chốt** và **Phát sinh sau khi chốt**. **Tổng quan → Tháng**: lãi/lỗ tạm tính.
2. Linh → **Thêm → Xuất dữ liệu**: chọn tháng, tải CSV / XLSX (báo cáo tháng, đơn hàng, sổ tiền, thu chi, bảng lương, khách hàng); **Tải bản sao lưu**. Nhung, thợ không có mục này.
3. **In / PDF** ở Báo cáo và trong phiếu lương: Safari iPhone → Chia sẻ → In → Lưu PDF; máy tính → In → Lưu PDF.
4. Khôi phục thử bản sao lưu vào DB tạm: `bun scripts/restore-check.ts --file=đường-dẫn.json` (file Linh tải) hoặc `bun scripts/restore-check.ts --from=dev`. Cần `PG_ADMIN_URL` (PostgreSQL local). Tài khoản sau khôi phục không có mật khẩu: đặt lại bằng `bun scripts/user.ts reset-password`.

## Thử nhập dữ liệu cũ (Đợt 5B)

1. Google Sheets → mở tab tháng → **Tệp → Tải xuống → CSV**.
2. `linh@lindy.test` → **Thêm → Nhập dữ liệu cũ** → chọn file. Kiểm **Dòng tiêu đề**, chọn **Tháng của tab** (khi cột ngày chỉ có số ngày), ghép cột ngày, khách, SĐT, dịch vụ, tổng; mỗi cột tiền là của thợ nào (thợ đã nghỉ: "Thợ không có tài khoản").
3. **Kiểm tra**: xem số khoản, tổng theo thợ, lỗi (dòng lỗi không nhập), cảnh báo → **Nhập**. Nhập lại cùng file không nhân đôi; nhầm thì **Huỷ** lần nhập (cần lý do).
4. Báo cáo tháng cũ có khối **Doanh thu nhập từ Google Sheets**; hồ sơ khách (khớp theo SĐT) có mục **Nhập từ Google Sheets**. Không vào doanh thu, sổ tiền, lương của app.

Trước khi triển khai bản có migration mới: `bun scripts/check-upgrade.ts --from=SỐ` (SỐ = migration cuối hosting đang chạy: `0005` nếu còn bản Đợt 1, `0019` nếu đã có Đợt 5).

## Quản trị tài khoản (CLI, chưa có màn hình)

```bash
bun scripts/user.ts list
```

Các lệnh khác: `create --name "Trang" --phone 0912345678 --role staff --branch HTK`, `reset-password --user …`, `grant --user … --role … --branch …`, `revoke --user … --branch …`, `lock --user …`, `unlock --user …`. Mật khẩu tạm ghi vào `.local/mat-khau-tam.txt`; người dùng phải đổi khi đăng nhập lần đầu. Vai trò: `owner`, `manager`, `staff_booking_plus`, `staff`.

## Thử trên iPhone (K01, chưa làm)

Cần HTTPS tin cậy. Phương án đã chốt là mkcert:

1. Cài mkcert (cần quyền admin): `winget install -e --id FiloSottile.mkcert`, rồi `mkcert -install`.
2. Tạo chứng chỉ cho IP máy trong mạng nhà; file `rootCA-key.pem` để ngoài thư mục dự án.
3. Cài `rootCA.pem` lên **iPhone dùng để thử** (Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị → cài profile; rồi Giới thiệu → Cài đặt tin cậy chứng nhận → bật).
4. Chạy dev server có HTTPS, mở bằng Safari, Thêm vào Màn hình chính, đăng nhập lại trong app ghim, bật thông báo, bấm Gửi thử.
5. Thử xong gỡ profile khỏi iPhone.

Các bước 2 và 4 cần cấu hình HTTPS cho dev server; làm cùng anh khi thử.
