# Người tạo sửa đơn, chặn giảm thành tiền, món Kìm (S62–S64)

Brief đã duyệt: `docs/vibe/sua-don-va-kim/brief.md` (05/11/2026). Quyết định sẽ ghi: S62–S64 trong `docs/DECISIONS.md`.

**Trạng thái:** anh duyệt 05/11/2026 (kèm 3 chi tiết mục 8); đã code, kiểm xong trên máy (chưa thử iPhone thật).

## 1. Mục tiêu

- **S62:** người tạo đơn sửa được đơn của mình **trong ngày làm dịch vụ**, kể cả sau Làm xong (Chờ xác nhận, Đã xác nhận). Qua ngày thì chỉ Nhung, Linh sửa.
- **S63:** sau Làm xong, chỉ Linh và Quản lý (`order.confirm`) được sửa làm **thành tiền thấp đi**. Người tạo sửa đơn đã xác nhận thì vào **Cần xem lại** của Linh **khi phần tiền của một thợ bị giảm** (tiền chia bị chuyển sang người khác).
- **S64:** món **Kìm 110.000đ** là hàng bán: không giảm giá (cả giảm dòng lẫn giảm cả bill), không chọn thợ, không hoa hồng, không vào doanh thu tính KPI của Nhung, nhưng vẫn vào doanh thu quán.

## 2. Thế nào là xong

Theo mục "Tiêu chí xong" của brief, cụ thể:

- Trang tạo đơn → Làm xong (Đã xác nhận) → cùng ngày Trang thêm Cắt sửa, ghi lý do → lưu được, lịch sử có trước/sau, **không** vào Cần xem lại.
- Trang bỏ một dịch vụ trên đơn đó → màn sửa báo "Thành tiền giảm từ … xuống …, cần Nhung hoặc Linh sửa", nút Lưu tắt; gọi thẳng API → 403; ghi thẳng SQL → lỗi trigger. Nhung làm đúng thao tác đó → lưu được.
- Trang chuyển tiền chia giữa Trang và Chin (giữ tổng) → lưu được, đơn vào Cần xem lại, dòng ghi "Trang sửa đơn đã xác nhận: <lý do>".
- Đơn Trang ghi ngày hôm qua đã Làm xong → không có nút Sửa đơn; API 403; SQL lỗi.
- Đơn Đang làm: Trang bỏ món chọn nhầm → lưu bình thường (như cũ).
- Chin (không phải người tạo) vẫn không sửa được đơn của Trang.
- Người tạo không đổi được ngày làm dịch vụ sau Làm xong.
- Menu tạo đơn có nhóm **Sản phẩm → Kìm 110.000đ**, chọn được số lượng. Dòng kìm không có chọn thợ, không có "Sửa giá", không có trong danh sách "Áp cho" của Giảm giá.
- Sơn gel 200.000đ + Kìm 110.000đ, giảm cả bill 10% → **290.000đ**. Bill chỉ có kìm → không thêm được giảm giá.
- Gửi giảm giá trên dòng kìm, gán thợ cho dòng kìm, sửa giá kìm qua API → 422; ghi thẳng SQL dòng kìm có giảm hoặc có phần thợ → lỗi khi commit.
- Bảng lương: hoa hồng thợ và "doanh thu tính KPI" của Nhung không có tiền kìm; doanh thu quán ở Trang chủ, Báo cáo có tiền kìm.
- Đơn cũ, bảng lương cũ, tháng đã khoá không đổi số.
- `bun run check`, `bun run build`, `bun scripts/check-upgrade.ts --from=0034` đạt.

## 3. Phạm vi

**Làm:** đúng "Phạm vi bản đầu" của brief.

**Không làm:** 6 mục "Để sau" của brief (nút nhờ sửa, màn đánh dấu hàng bán, tồn kho, báo cáo riêng kìm, thợ có phần sửa đơn, bỏ bảo hành bill chỉ có kìm). Không đổi luật Nhung sửa đơn có phần mình (P31 giữ nguyên). Không tính lại đơn cũ.

## 4. Lựa chọn kỹ thuật

| Việc | Chọn | Lý do |
|---|---|---|
| Đánh dấu kìm | Cột `services.is_retail` (mặc định false) | Không gắn cứng tên "Kìm" trong code; sau này mở màn đánh dấu món khác dễ. Bản đầu không có nút sửa cờ. |
| Dòng đơn nhớ cờ | Cột `order_items.is_retail`, **DB tự đặt** khi chèn dòng (trigger đọc `services`) | Đơn giữ đúng luật lúc bán (như tên, giá – P35); máy khách không giả cờ được. |
| Kiểm "không giảm, không chia thợ" | TypeScript (`computeOrder`) báo lỗi sớm + `_order_check` kiểm khi commit | Cùng kiểu kiểm hai lớp hiện có. |
| Mức duyệt giảm giá | `order_required_level` bỏ dòng kìm khỏi gốc tính % cả bill | Giảm 10% bill có kìm vẫn là 10% (thợ tự áp), không bị đẩy sang mức khác. |
| "Trong ngày làm dịch vụ" | So `service_date` với hôm nay theo múi giờ cơ sở, tính ở DB (`loadRow` trả cờ, trigger tự tính) | Một nguồn giờ, không phụ thuộc đồng hồ điện thoại. |
| Chặn giảm thành tiền | So `net_amount` mới với cũ trong `orders_guard` + API | Gọi thẳng API hay SQL đều bị chặn. |
| Cần xem lại khi đổi phần chia | So tổng tiền mỗi thợ ở bản nội dung mới với bản trước (`content_rev − 1`); có người giảm → bắt buộc vào Cần xem lại | Bản nội dung cũ không bao giờ bị xoá, so được ở DB. |
| KPI không có kìm | `_payroll_target`: doanh thu quán của đơn = tiền thuần − tiền thuần dòng kìm; phiếu hoàn trừ KPI theo tỷ lệ phần không phải kìm | Đơn cũ không có dòng kìm → số y như trước, không phát sinh bút toán đảo, tháng đã khoá không đổi (K24). |
| Món Kìm vào DB | Thêm dòng vào `data/services.csv` (mã `SP01`, nhóm "Sản phẩm", cột mới `retail`), sinh lại `catalog-data.ts`; seed lúc khởi động thêm món | Như cách nạp danh mục hiện có; lên Vibe Host tự có món. **Nếu app thật đã có món tên "Kìm"** (Linh tự thêm, chưa xoá) thì seed gắn cờ cho món đó, không thêm SP01. |

## 5. File sẽ tạo / sửa

- **Mới:** `db/migrations/0035_sua_don_hang_ban.sql`, `tests/acceptance/sua-don-kim.test.ts`.
- **Sửa máy chủ:** `src/lib/order-math.ts`, `src/server/orders/policy.ts`, `src/server/orders/service.ts`, `src/server/review/service.ts`, `src/server/ops/seed.ts`, `src/server/ops/catalog-data.ts` (sinh lại), `scripts/gen-catalog.ts`, `scripts/check-upgrade.ts`.
- **Sửa giao diện:** `src/components/don-hang/OrderEditor.tsx`, `src/components/don-hang/pickers.tsx` (DiscountSheet), `src/components/don-hang/OrderView.tsx`, `src/routes/_app/them/danh-muc.tsx`, `src/components/luong/Payslip.tsx`.
- **Sửa test sẵn có:** `tests/unit/order-math.test.ts`, `tests/security/orders.test.ts` (S21), `tests/acceptance/don-hang-2b.test.ts` (ca "thợ không sửa được đơn đã xác nhận"), `tests/acceptance/luong.test.ts`.
- **Tài liệu:** `data/services.csv`, `data/bang-gia-dich-vu.md`, `docs/DECISIONS.md` (S62–S64), `CLAUDE.md` (S01–S64, dòng trạng thái), kế hoạch này.

**Đổi dữ liệu:** thêm 2 cột (mặc định false, dữ liệu cũ không đổi), 1 trigger; thay 4 hàm DB (`orders_guard`, `_order_check`, `order_required_level`, `_payroll_target`); thêm 1 món vào danh mục. Không xoá, không sửa dòng cũ.

## 6. Các bước

### Gói 1 — Database (migration 0035)
- [x] **1.1** Cột `services.is_retail`, `order_items.is_retail`; trigger `order_items_set_retail` (BEFORE INSERT: dòng dịch vụ lấy cờ từ `services`, dòng khác false). *Kiểm:* `bun run db:migrate`, `bun run lint`.
- [x] **1.2** Thay `order_required_level`: bỏ dòng kìm khỏi gốc bill và khỏi bậc từng dòng. *Kiểm:* test 5.1 (giảm 10% bill có kìm → mức "thợ tự áp").
- [x] **1.3** Thay `_order_check`: dòng kìm phải giảm = 0, không có phần thợ, không cần chọn thợ; luật Cần xem lại: người sửa có `order.confirm` → giữ P31; người sửa khác → bắt buộc Cần xem lại khi một thợ bị giảm tổng tiền so với bản trước. *Kiểm:* test SQL 5.1.
- [x] **1.4** Thay `orders_guard`: người tạo (có `order.create_draft`) sửa đơn Chờ xác nhận / Đã xác nhận khi `service_date >= hôm nay`; người không có `order.confirm` sau Làm xong: không giảm `net_amount`, không đổi `service_date`. *Kiểm:* test SQL 5.1.
- [x] **1.5** Thay `_payroll_target`: KPI bỏ tiền thuần dòng kìm; phiếu hoàn trừ KPI theo tỷ lệ. *Kiểm:* test 5.1; test lương cũ vẫn đạt.

### Gói 2 — Danh mục và tính tiền
- [x] **2.1** `services.csv` thêm cột `retail` và dòng `SP01,Sản phẩm,Kìm,list,cái,110000,110000,…,1`; `gen-catalog.ts` sinh `isRetail`; chạy `bun scripts/gen-catalog.ts`; `seed.ts` chèn cờ, xử lý món "Kìm" có sẵn. *Kiểm:* `tests/integration/catalog.test.ts`, chạy seed hai lần không thêm trùng.
- [x] **2.2** `loadCatalog`, kiểu `CatalogService` thêm `isRetail`; màn Danh mục hiện nhãn "Hàng bán · không giảm giá, không chia %". *Kiểm:* typecheck, trình duyệt.
- [x] **2.3** `computeOrder`: dòng kìm bán đúng giá (sửa giá → lỗi), không nhận giảm dòng, bị bỏ khỏi gốc và phần chia giảm cả bill, có thợ → lỗi, không báo "chưa chọn thợ"; bill chỉ có kìm mà có giảm cả bill → lỗi. *Kiểm:* `tests/unit/order-math.test.ts` (290.000đ, các lỗi).

### Gói 3 — Máy chủ đơn hàng
- [x] **3.1** `policy.ts`: `orderCan` nhận cờ `serviceDayOpen`; `edit` = người tạo khi Đang làm, **hoặc** người tạo khi Chờ xác nhận / Đã xác nhận mà còn trong ngày, **hoặc** `order.confirm`; thêm `reduceTotal`, `changeDate`. *Kiểm:* typecheck, test.
- [x] **3.2** `service.ts`: `loadRow` trả `service_day_open` (tính ở SQL theo múi giờ cơ sở); `loadContent`, `problemsOf` biết dòng kìm; `updateOrder`: chặn giảm thành tiền và đổi ngày cho người không có `order.confirm` sau Làm xong (403, câu báo có số tiền), luật Cần xem lại mới. *Kiểm:* test 5.1.
- [x] **3.3** `review/service.ts`: dòng Cần xem lại của đơn sửa ghi "<người> sửa đơn đã xác nhận: <lý do>". *Kiểm:* test 5.1.

### Gói 4 — Giao diện
- [x] **4.1** `OrderEditor.tsx`: dòng kìm không có chọn thợ, không "Sửa giá", có dòng phụ "Hàng bán"; thêm kìm không gán thợ mặc định; người không phải Nhung, Linh sửa sau Làm xong: ẩn chọn ngày, thành tiền thấp hơn cũ thì hiện câu báo và tắt Lưu; câu ghi chú dưới ô lý do đổi theo người sửa. `pickers.tsx`: "Áp cho" chỉ liệt kê dòng không phải kìm; nút Giảm giá tắt khi bill chỉ có kìm. *Kiểm:* trình duyệt 375px, tài khoản Trang và Nhung.
- [x] **4.2** `OrderView.tsx`: dòng kìm ghi "Hàng bán" thay "Chưa chọn thợ"; nút Sửa đơn theo `can.edit` mới. `Payslip.tsx`: "Doanh thu tính KPI" thay "Doanh thu quán". *Kiểm:* trình duyệt.

### Gói 5 — Kiểm thử và chốt
- [x] **5.1** `tests/acceptance/sua-don-kim.test.ts`: mọi ca ở mục 2 (API và SQL); sửa ca S21 (`security/orders.test.ts`) và ca thợ sửa đơn đã xác nhận (`don-hang-2b.test.ts`) theo luật mới; lương: hoa hồng, KPI không có kìm, đơn cũ không sinh bút toán mới.
- [x] **5.2** `bun run check`, `bun run build`, `bun scripts/check-upgrade.ts --from=0034` (thêm bước: món Kìm có sau nâng cấp, đơn có kìm, người tạo sửa đơn trong ngày).
- [x] **5.3** Chạy bản build trên trình duyệt 375px sáng/tối: Trang thêm món, bị chặn khi bỏ món; Nhung bỏ được; đơn có kìm và giảm 10% ra 290.000đ.
- [x] **5.4** Ghi S62–S64 vào `DECISIONS.md`, cập nhật `CLAUDE.md`, đánh dấu kế hoạch, commit. Không push khi anh chưa yêu cầu.

## 7. Rủi ro và cách lùi

| Rủi ro | Cách xử lý |
|---|---|
| Thợ chuyển tiền chia về mình sau khi đơn đã xác nhận | Có lý do bắt buộc, lịch sử trước/sau, và bắt buộc vào Cần xem lại (kiểm ở DB). Chỉ trong ngày, chỉ người tạo. |
| Đổi `_payroll_target` làm lệch bảng lương cũ | Đơn cũ không có dòng kìm nên số đích y như cũ, không sinh bút toán đảo. Test và `check-upgrade` so số trước/sau. |
| Hoàn tiền đơn có kìm: phần trừ của thợ vẫn chia theo tỷ lệ cả đơn như hiện nay, nên hoàn đúng tiền kìm vẫn trừ nhẹ hoa hồng thợ | Giữ nguyên trong bản đầu (hiếm khi hoàn kìm). Ghi vào DECISIONS. |
| Đơn ghi ngày hôm qua (lên đơn sau nửa đêm) thì sau Làm xong người tạo không sửa được | Đúng định nghĩa "trong ngày làm dịch vụ"; nhờ Nhung, Linh. |
| App thật đã có món "Kìm" Linh tự thêm | Seed gắn cờ cho món đó, không thêm món trùng. Đơn cũ có món đó vẫn tính như cũ. |
| Hỏng sau khi triển khai | Triển khai lại bản trước. Migration chỉ thêm cột, trigger, thay hàm. Code cũ chạy với DB mới: luật sửa đơn của code cũ chặt hơn nên vẫn đúng; giảm giá trên dòng kìm sẽ bị DB từ chối khi lưu (Linh có thể tạm xoá món Kìm). |

## 8. Chi tiết em tự chọn, cần anh gật đầu

1. **Nhung sửa đơn đã xác nhận có phần của Nhung** vẫn vào Cần xem lại mọi lần như hiện nay (P31). Luật "chỉ khi đổi phần chia" chỉ áp cho thợ là người tạo.
2. **Hoàn tiền đơn có kìm** giữ cách chia phần trừ hiện nay (mục 7, dòng 3).
3. Mã món **SP01**, nhóm **"Sản phẩm"**, đơn vị **cái**.

## 9. Xác minh (05/11/2026)

- `bun run check` đạt: lint, typecheck, 449 kiểm thử (42 file). Mới: `tests/acceptance/sua-don-kim.test.ts` 11 ca (API và SQL: sửa trong ngày, qua ngày, Đang làm, Chin không phải người tạo, chặn giảm thành tiền, đổi phần chia → Cần xem lại, SQL lách phần chia, Kìm 290.000đ, giảm/gán thợ/sửa giá kìm bị chặn, ràng buộc DB, lương và phiếu hoàn); thêm ca Kìm ở `order-math`, `catalog`, `catalog-search`; viết lại ca S21 ở `security/orders.test.ts`.
- `bun run build` đạt. `bun scripts/check-upgrade.ts --from=0034` đạt: sau nâng cấp có đúng 1 món Kìm; đồng bộ lại sổ doanh thu tính lương của mọi đơn cũ không sinh dòng mới (8 → 8); đơn Sơn gel trơn + Kìm 180.000đ: doanh thu tính KPI 70.000đ, cơ sở hoa hồng 70.000đ.
- Bản build ở cổng 3000, trình duyệt 375px, sáng và tối, tài khoản Trang: đơn đã xác nhận có nút Sửa đơn; bỏ Cắt sửa → câu "Thành tiền giảm từ 110.000đ xuống 70.000đ, cần Nhung hoặc Linh sửa.", nút Lưu tắt, ngày làm dịch vụ chỉ hiện chữ; menu có nhóm Sản phẩm → Kìm; dòng Kìm không có chọn thợ, không có Sửa giá; hộp Giảm giá "Áp cho" không có dòng Kìm; chạm Kìm lần nữa bỏ được dòng; đơn Sơn gel 200.000đ + Kìm giảm 10% hiện 290.000đ, Kìm ghi "Hàng bán, không chia thợ". Không có lỗi console.
- **Chưa thử trên iPhone thật**, chưa triển khai lên Vibe Host.
