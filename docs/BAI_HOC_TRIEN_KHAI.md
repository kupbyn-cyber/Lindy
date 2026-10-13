# Bài học lần triển khai đầu tiên (13/10/2026)

Kết quả: LINDY OS chạy ở **https://lindy.n2.tinhgon.xyz** (Vibe Host Mắt Bão). `/api/health` báo `ready: true`, Linh đã đăng nhập. Cách làm chi tiết: `docs/TRIEN_KHAI.md`.

## 1. Bức tranh chung

```
Máy anh (code)  ──Push (GitHub Desktop)──▶  GitHub (repo riêng tư)
                                                │  bấm "Triển khai lại"
                                                ▼
                      Vibe Host: kéo code → dựng (build) → chạy container → gắn tên miền + HTTPS
                                                │
                                   DB linhdy-db (dịch vụ riêng, phải GẮN vào website)
```

| Mảnh | Là gì | Điều cần nhớ |
|---|---|---|
| Code | Thư mục dự án trên máy | Em sửa, chạy kiểm tra, commit. Anh **Push** bằng GitHub Desktop (máy em không có quyền đẩy lên GitHub). |
| Dựng (build) | Biến code thành bản chạy được | Dựng **thành công** chưa chắc **chạy** được: lần v2 dựng xong vẫn chết lúc khởi động. |
| Container | “Máy con” chạy app trên hosting | Lệnh khởi động do hosting tự đoán. Mắt Bão chạy `npm run preview`. |
| Database | Dịch vụ riêng, có địa chỉ nội bộ | Phải **gắn vào website**, thì hosting mới đưa `DATABASE_URL` vào app và sao lưu cả dữ liệu. |
| Biến môi trường | Cấu hình và bí mật, **không nằm trong code** | Đổi biến xong phải **Triển khai lại** mới có hiệu lực. |
| `/api/health` | Trang báo tình trạng app | Hosting không cho xem log lúc chạy, nên đây là cách duy nhất biết app có ổn không. |

## 2. Những lỗi đã gặp

| # | Triệu chứng | Nguyên nhân gốc | Cách đã sửa | Lỗi của ai |
|---|---|---|---|---|
| 1 | Đăng nhập localhost báo lỗi | DB trên máy đang tắt | `bun run dev` tự bật DB | Thiếu sót của em |
| 2 | Nhân Hòa: Bad Gateway | Domain trỏ cổng 80, app chạy cổng 3000 | Đổi Container Port thành 3000 | Hosting mặc định khác app |
| 3 | Nhân Hòa: lỗi 500 | Thiếu `DATABASE_URL`, app không báo rõ | Báo 503 “Chưa kết nối được dữ liệu” và thêm `/api/health` | Thiếu sót của em |
| 4 | Nhân Hòa: tên biến thành `<LINDY_APP_PASSWORD`, URL bị bọc `<…>` | Mẫu em đưa có dấu `<…>`, anh chép nguyên | Bỏ dấu `<>`. Từ nay em không dùng `<…>` trong mẫu biến | **Lỗi của em** |
| 5 | Em không xem được form anh đang điền | Chrome chỉ cho em xem tab trong nhóm “Claude” | Kéo tab vào nhóm, hoặc gửi ảnh chụp | Giới hạn công cụ |
| 6 | Mắt Bão v1 thất bại | Website chưa gắn DB nên hosting tự tạo DB mới, mà gói đã dùng **2/2 dịch vụ** | Gắn `linhdy-db` vào website | Chưa biết cách hosting làm việc |
| 7 | Hosting tự điền 6 biến | Nó quét `.env.example` (mẫu cho máy local) và điền giá trị mẫu `localhost`, rồi tự sinh `DATABASE_URL` bằng tài khoản quản trị | Sửa code: app tự nhận `DATABASE_URL` quản trị, tạo role `lindy_app` rồi chỉ chạy bằng role đó | Hosting tự làm, em chưa lường trước |
| 8 | `VAPID_PUBLIC_KEY` thiếu chữ “B” đầu | Bôi đen thiếu 1 ký tự khi chép | Em dán lại. `/api/health` giờ có `badEnv` để phát hiện | Chép tay dễ sót |
| 9 | Mắt Bão v2: dựng xong, app chết 4 lần liên tiếp | Hosting chạy `npm run preview`, dự án không có lệnh này | Thêm script `preview` | Em chưa đọc kỹ nhật ký “Detect” |
| 10 | Em không đẩy được code lên GitHub | Máy không có git trong PATH, không có đăng nhập GitHub cho dòng lệnh | Anh Push bằng GitHub Desktop | Môi trường máy |

## 3. Bài học cho anh

1. **Đọc nhật ký đúng chỗ.** Trong “Nhật ký đầy đủ”, tìm dòng có `✗`, `npm error`, `crash-loop`, `Vượt số lượng`. Dòng `[Detect]` cho biết hosting đoán dự án là gì và chạy cổng nào.
2. **Dựng thành công ≠ chạy thành công.** Sau mỗi lần triển khai, mở `https://lindy.n2.tinhgon.xyz/api/health`:
   - `"ready": true`, `"missingEnv": []`, `"badEnv": []` là ổn;
   - có tên biến trong `missingEnv` hoặc `badEnv` thì sửa đúng biến đó rồi triển khai lại.
3. **Chép bí mật cẩn thận:**
   - chép đủ từ ký tự đầu đến ký tự cuối;
   - không thêm dấu `<>`, ngoặc kép hay khoảng trắng;
   - tên biến gõ đúng chữ hoa, gạch dưới.
4. **Đổi biến môi trường xong phải bấm Triển khai lại.** Đẩy code lên GitHub cũng chưa tự triển khai, vì chưa bật “Tự động triển khai từ GitHub”.
5. **Gói Starter chỉ có 2 dịch vụ.** Mỗi DB tính 1 dịch vụ. DB `postgresql-instance` đang không dùng nhưng vẫn chiếm 1 chỗ.
6. **Không bấm “AI sửa lỗi” của hosting.** Nó có thể sửa thẳng mã nguồn mà không qua kiểm tra của dự án.
7. **Không xoá DB đang gắn website**, không “Bỏ liên kết” khi chưa sao lưu. Xoá DB là mất dữ liệu vĩnh viễn.
8. **Mật khẩu và khoá bí mật do anh tự dán.** Em được phép dán giá trị công khai: tên miền, khoá public, số `1`, tên người.

## 4. Bài học cho em (AI)

1. Không dùng `<…>` trong mẫu. Đưa tên biến và giá trị tách bạch, giá trị nào anh tự điền thì ghi bằng lời.
2. Trước khi lên một hosting mới:
   - đọc nhật ký `[Detect]` để biết lệnh khởi động, cổng, phiên bản Node;
   - không giả định hosting có đặt `NODE_ENV`, cổng hay lệnh `start`.
3. Giả lập môi trường hosting trên máy trước khi nhờ anh triển khai: bản build production, DB trống, chỉ có các biến mà hosting thật có.
4. Có trang báo tình trạng (`/api/health`) ngay từ đầu. Mọi lỗi cấu hình phải hiện ra thành tên biến hoặc mã lỗi, không có giá trị bí mật.
5. `.env.example` không chỉ để người đọc: hosting cũng quét file này và tự điền biến.

## 5. Quy trình cập nhật lần sau

1. Em: sửa code → `bun run check` (lint, typecheck, test) → `bun run build` → commit.
2. Anh: GitHub Desktop → **Push origin**.
3. Anh: Vibe Host → Lindy → **Triển khai lại**, đợi 1–3 phút.
4. Mở `/api/health`: `ready: true`, `badEnv: []`.
5. Đăng nhập thử một lần.
6. Hỏng thì gửi em: ảnh “Nhật ký đầy đủ” (phần cuối), hoặc kéo tab Vibe Host vào nhóm “Claude” để em đọc.

Nếu thay đổi có migration DB, app tự chạy ở request đầu tiên sau khi triển khai. Migration không xoá dữ liệu, nhưng nên sao lưu trước.

## 6. Việc còn lại

- [ ] `VAPID_SUBJECT` sai dạng (health báo `badEnv`). Đặt `mailto:` + email thật của quán, ví dụ `mailto:lindy@gmail.com`. Cần trước khi thử thông báo trên iPhone.
- [ ] DB thừa `postgresql-instance`: anh quyết giữ hay xoá. Xoá là vĩnh viễn, anh tự bấm sau khi chắc không dùng.
- [ ] Sau khi Linh đổi mật khẩu: xoá `INITIAL_OWNER_PASSWORD` khỏi biến môi trường.
- [ ] Bật sao lưu tự động (mục **Sao lưu**).
- [ ] Dịch vụ Vibe Hosting Nhân Hòa: anh quyết huỷ hay giữ.
- [ ] Thử thông báo trên iPhone thật (test 21–23) tại https://lindy.n2.tinhgon.xyz.
- [ ] Hosting đang chạy Node 22 (theo `engines` trong `package.json`), còn `TECH_STACK.md` chốt Node 24. App chạy được trên Node 22; nâng lên 24 khi hosting hỗ trợ chắc chắn.
- [ ] Đề xuất: chuyển `.env.example` sang bản cho hosting, để Vibe Host không tự điền giá trị mẫu `localhost`.
