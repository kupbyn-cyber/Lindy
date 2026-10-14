# Làm app mới bằng vibe code và đưa lên Vibe Host Mắt Bão

Kinh nghiệm rút từ hai dự án đang chạy thật trên Mắt Bão:

- **CEN WORK**: làm trên Lovable/Supabase, sau phải chuyển sang PostgreSQL tự quản trên Mắt Bão.
- **LINDY OS**: làm thẳng theo kiến trúc CEN, lên Mắt Bão ngày 13/10/2026, xong Đợt 5 ngày 13/10/2026.

Cập nhật: 14/10/2026.

**Cách dùng file này**

- Mỗi app mới: chép file này vào `docs/` của app đó. Trong `CLAUDE.md` của app ghi: "Làm và triển khai theo `docs/HUONG_DAN_APP_MOI_MATBAO.md`".
- Mỗi việc có ghi rõ ai làm: **Anh** hay **AI** (Claude Code).
- Câu giao việc cho AI có sẵn ở Phụ lục D, anh chép nguyên khối.
- Code mẫu đã chạy thật nằm trong repo Lindy (`E:\AI - Vibecode\Lindy`). Bảo AI đọc cách làm ở đó rồi viết lại cho app mới. Không bảo AI chép dữ liệu nghiệp vụ của Lindy.

---

## 1. Mười điều quan trọng nhất

1. **Dùng PostgreSQL tự quản ngay từ đầu.** CEN làm trên Lovable/Supabase rồi phải chuyển sang Mắt Bão, tốn công gấp đôi. Lindy làm thẳng theo khuôn CEN nên lên hosting được ngay.
2. **Chốt yêu cầu bằng văn bản trước khi code.** Cần PRD, `DECISIONS.md` và `OPEN_QUESTIONS.md`. AI không được tự đoán số liệu nghiệp vụ.
3. **Làm theo đợt.** Mỗi đợt có kế hoạch, anh duyệt rồi AI mới code. Xong đợt nào thì kiểm tra và commit đợt đó.
4. **Có `Dockerfile` 2 tầng ngay từ ngày đầu.** Nếu để hosting tự dựng, ảnh nặng 1,2 GB, vượt hạn mức 1 GB của gói. Dựng bằng Dockerfile thì ảnh khoảng 250 MB.
5. **App tự chuẩn bị DB khi khởi động**: tạo role, chạy migration, nạp dữ liệu nền, tạo tài khoản chủ đầu tiên. Hosting không có dòng lệnh để làm tay.
6. **Có trang `/api/health` ngay từ ngày đầu.** Trang báo tên biến còn thiếu, biến sai dạng và mã lỗi DB, không bao giờ in bí mật.
7. **Viết `.env.example` cho hosting đọc.** Vibe Host quét file này và tự điền biến theo nó. Không dùng dấu `<…>` trong mẫu.
8. **Push lên `main` coi như phát hành.** Chỉ push khi anh bảo. Bản mới có migration thì sao lưu DB trước.
9. **Đo tốc độ với dữ liệu lớn trước khi push.** Gói nhỏ chỉ có 0,3 nhân CPU. CEN từng mất 30 giây mới mở được Trang chủ, chỉ vì một luật phân quyền gọi hàm cho từng dòng.
10. **Không bấm "AI sửa lỗi" của hosting. Không xoá, không bỏ liên kết DB đang gắn website.** Mật khẩu và khoá bí mật do anh tự dán.

---

## 2. Bức tranh chung

```
Máy anh: Claude Code sửa code, chạy kiểm tra, commit
      │  push (GitHub Desktop, hoặc AI push khi anh bảo)
      ▼
GitHub: repo riêng tư, nhánh main
      │  bấm "Triển khai lại" (hoặc tự triển khai nếu đã bật)
      ▼
Vibe Host Mắt Bão — bảng quản lý https://v2.tinhgon.xyz
  ├─ Website: dựng ảnh từ Dockerfile → chạy container cổng 3000 → tên miền + HTTPS tự cấp
  │           khi khởi động: chuẩn bị DB trước, xong mới bật server
  └─ Database PostgreSQL 16: dịch vụ riêng, chỉ có địa chỉ nội bộ, phải GẮN vào website
```

| Mảnh | Điều cần nhớ |
|---|---|
| Gói Starter | **2 dịch vụ, tính cả website**, nên 1 website và 1 DB là hết chỗ. **1 GB lưu trữ dùng chung** cho ảnh website, DB và các bản sao lưu. Website được 0,3 nhân CPU và 512 MB RAM. App mới cần gói riêng hoặc nâng gói (hỏi Mắt Bão khi mua). |
| Dựng (build) | Dựng thành công chưa chắc đã chạy được. Sau mỗi lần triển khai đều phải mở `/api/health`. |
| Database | Khi DB đã gắn vào website, hosting tự điền `DATABASE_URL` (tài khoản quản trị DB) và sao lưu cả dữ liệu. Nếu website chưa gắn DB, hosting tự tạo DB mới; gói hết chỗ thì bước này thất bại. |
| Biến môi trường | Đổi biến xong phải bấm **Triển khai lại** mới có hiệu lực. |
| Tự triển khai | Vibe Host có tuỳ chọn tự triển khai mỗi lần push `main`; CEN đã bật. Lindy lúc đầu chưa bật, push xong phải bấm Triển khai lại. Dù có bật hay không, vẫn coi push `main` là phát hành. |
| Nhật ký | Xem "Nhật ký đầy đủ" của lần triển khai. Tìm dòng `✗`, `npm error`, `crash-loop`, `Vượt số lượng` và dòng `[release]` do app in ra. Dòng `[Detect]` cho biết hosting đoán dự án là gì, chạy lệnh nào, cổng nào. |

---

## 3. Chuẩn bị máy (làm một lần)

**Anh làm:**

- Cài Bun 1.4 và Node 24.
- Cài GitHub Desktop (có sẵn git bên trong). Muốn có lệnh `git` dùng chung thì cài thêm Git for Windows.
- Đăng nhập GitHub cho dòng lệnh, chỉ cần một lần, để AI push được khi anh bảo. AI chạy lệnh đăng nhập bằng mã thiết bị trong tab Terminal, anh nhập mã ở github.com/login/device (làm trên điện thoại được).
- Cài Claude Code (app desktop hoặc VS Code) cùng bộ 5 skill tiếng Việt ở `C:\Users\Admin\.claude\skills\`:
  - `/lap-ke-hoach`
  - `/soat-code`
  - `/phan-bien`
  - `/go-loi`
  - `/kiem-tra-xong`
- Không cần cài PostgreSQL. Dự án dùng PostgreSQL 16 nhúng (gói `embedded-postgres`), `bun run dev` tự bật.

---

## 4. Giai đoạn 1: chốt yêu cầu (chưa code)

Các tài liệu cần có trong `docs/` trước khi viết dòng code đầu tiên:

| File | Nội dung | Ghi chú |
|---|---|---|
| `prd/TEN_APP_PRD_v1_0.md` | Đặc tả: ai dùng, làm gì, quy tắc nghiệp vụ, phân quyền, lộ trình theo đợt, danh sách test nghiệm thu | Sửa lớn thì lên bản mới; bản cũ chỉ để tra lịch sử |
| `surveys/` | Phiếu hỏi chủ: thông tin, phong cách, nghiệp vụ | AI soạn, chủ điền |
| `DECISIONS.md` | Mỗi quyết định có mã (D01, K01…), ngày chốt, người chốt | Mục mới nhất thắng |
| `OPEN_QUESTIONS.md` | Câu hỏi còn chờ, chia nhóm: trước khi chạy thật / chờ anh quyết / chưa cần ngay | Trả lời xong thì chuyển sang `DECISIONS.md` |
| `TECH_STACK.md` | Nền tảng đã chốt, các phiên bản đã ghim | |
| `CLAUDE.md` (gốc repo) | Luật cho AI: thứ tự nguồn yêu cầu, quy tắc không được tự đổi, cách làm việc, trạng thái hiện tại | Mẫu ở Phụ lục A |

**Bài học:**

- **Thiếu số liệu thì AI phải hỏi.** AI hay tự điền cho đủ khi thiếu số liệu (giờ mở cửa, giá, hạn mức). Ghi rõ luật này trong `CLAUDE.md`.
- **Mỗi câu hỏi cho chủ nên có sẵn lựa chọn.** Kèm một phương án "khuyên dùng" để chủ chọn nhanh, rồi AI ghi lại mã quyết định.
- **Quy tắc nghiệp vụ cứng ghi thẳng vào `CLAUDE.md`.** Ví dụ ở Lindy: tiền lưu số nguyên VND, chỉ đơn đã xác nhận mới tính doanh thu, không xoá vĩnh viễn dữ liệu.
- **Khảo sát thói quen làm việc thật.** Lindy dùng Sheets và Apple Calendar, nên có Đợt nhập dữ liệu cũ, và lịch tính chuyện chạy song song với cách cũ.

---

## 5. Giai đoạn 2: nền tảng kỹ thuật (dùng lại khuôn Lindy)

Khuôn này đã chạy thật trên Mắt Bão ở cả CEN và Lindy:

| Phần | Lựa chọn |
|---|---|
| Ứng dụng | TanStack Start (React 19, SSR), TanStack Router, TanStack Query; Vite; Tailwind v4 |
| Máy chủ | Nitro, preset `node-server`, chạy bằng Node 24 trong Docker |
| Database | PostgreSQL 16; viết SQL thuần bằng `postgres` (postgres.js), không dùng ORM |
| Đăng nhập | Phiên cookie HttpOnly tự viết, mật khẩu băm |
| Phân quyền | Kiểm ở server và trong DB bằng RLS: mỗi request chạy trong một transaction đặt role và user id |
| Migration | File SQL đánh số `0001_...sql`, runner lưu checksum, có khoá chống chạy trùng |
| Kiểm tra | Biome (lint, format), TypeScript, Vitest chạy trên DB test thật |
| Thông báo iPhone | Web Push (gói `web-push`) qua hàng đợi outbox |
| Công cụ | Bun cài gói và chạy script; ghim chính xác phiên bản trong `package.json` và `bun.lock`, không tự nâng |

**Không dùng Lovable/Supabase cho app có tiền, lương hay dữ liệu khách**, vì:

- khó kiểm soát chặt phân quyền;
- phụ thuộc nhà cung cấp;
- CEN đã phải chuyển ra khỏi đó.

Bản xem trước của Lovable còn chạy trên hạ tầng cũ, nên không dùng được để kiểm hành vi thật.

**Quyền sở hữu code:** CEN WORK là hệ thống của Tự Do, chỉ được dùng lại **cách làm**, không chép code. Lấy code từ dự án nào cũng phải cân nhắc chuyện này trước.

### Khung bắt buộc ở Đợt 0 (trước tính năng đầu tiên)

| Thành phần | Để làm gì | Mẫu trong Lindy |
|---|---|---|
| `Dockerfile` 2 tầng và `.dockerignore` | Ảnh nhỏ, biết chắc trong ảnh có gì | `Dockerfile`, `.dockerignore` (mẫu ở Phụ lục B) |
| `nitro({ preset: 'node-server' })` trong `vite.config.ts` | Dựng bằng Bun nhưng chạy bằng Node | `vite.config.ts` |
| Script `start` và `preview` cùng chạy `node .output/server/index.mjs` | Không có Dockerfile, hosting chạy `npm run preview` | `package.json` |
| Script chuẩn bị DB lúc khởi động | Tạo role, chạy migration, nạp dữ liệu nền, tạo tài khoản chủ đầu tiên | `scripts/release.ts`, `src/server/ops/release.ts` |
| `/api/health` | Biết app có ổn không khi không xem được log | `src/routes/api/health.ts` |
| `.env.example` viết cho hosting | Hosting quét file này để tự điền biến | `.env.example` (mẫu ở Phụ lục C) |
| Script sinh bí mật production | Ghi vào `.local/prod-env.txt`, không in ra màn hình | `scripts/gen-prod-env.ts` |
| Script quét bundle | Bảo đảm code gửi xuống trình duyệt không chứa bí mật | `scripts/scan-bundle.ts` |
| Migration runner | Checksum, khoá, chạy cả DB dev và DB test | `scripts/migrate.ts`, `src/server/ops/migrations.ts` |
| PostgreSQL nhúng cho local | Không phải cài PostgreSQL | `scripts/db-local.ts` |
| Thử nâng cấp DB | Dựng DB như bản đang chạy, nâng lên bản mới, thử nghiệp vụ | `scripts/check-upgrade.ts` |
| Sao lưu và khôi phục thử | Tải bản sao lưu, khôi phục vào DB tạm, so số liệu | `src/server/export/backup.ts`, `scripts/restore-check.ts` |
| `.gitignore` | Chặn `.env`, `.env.*` (trừ `.env.example`), `.local/`, `.pgdata/`, `*.pem` | `.gitignore` |
| `bun run check` | Lint, typecheck và test trong một lệnh | `package.json` |

---

## 6. Giai đoạn 3: làm từng đợt

### Vòng lặp của một đợt

1. **Anh:** "Làm đợt N". **AI:** dùng `/lap-ke-hoach`, viết kế hoạch vào `docs/plans/YYYY-MM-DD-dot-N-ten-viec.md`. Kế hoạch gồm:
   - mục tiêu, phạm vi (làm gì / không làm gì);
   - file sẽ đổi, có đổi DB không;
   - các bước nhỏ, mỗi bước có cách kiểm tra;
   - rủi ro;
   - câu hỏi cần chốt, mỗi câu có phương án khuyên dùng.
2. **Anh:** trả lời các câu hỏi, rồi nói "Duyệt".
3. **AI:** làm từng bước. Xong bước nào đánh `[x]` trong kế hoạch, commit theo từng cụm nhỏ.
4. **AI, cuối đợt:**
   - `/soat-code`;
   - `/phan-bien` với đợt đụng tới tiền, phân quyền hay dữ liệu khách;
   - `/kiem-tra-xong`.
5. **AI:** ghi kết quả vào cuối file kế hoạch: đã kiểm gì, và **chưa kiểm được gì** (ví dụ chưa thử iPhone thật).
6. **AI:** cập nhật các tài liệu:
   - `CLAUDE.md` (trạng thái);
   - `DECISIONS.md` và `OPEN_QUESTIONS.md`;
   - `docs/CHAY_LOCAL.md` (cách thử tính năng mới).

### Chia đợt (theo Lindy)

- **Đợt 0:** khung dự án, đăng nhập, phân quyền, giao diện chung.
- **Đợt 1:** mảng nghiệp vụ quan trọng nhất. **Xong đợt này thì lên hosting ngay.** Lindy lên hosting sau Đợt 1 và gặp 14 lỗi triển khai; app còn nhỏ thì sửa nhanh.
- **Các đợt giữa:** mỗi đợt một mảng nghiệp vụ.
- **Đợt cuối:** báo cáo, xuất dữ liệu, sao lưu, nhập dữ liệu cũ.

### Lệnh kiểm tra AI phải chạy trước khi báo xong

| Lệnh | Việc |
|---|---|
| `bun run check` | Lint, typecheck, toàn bộ test |
| `bun run build` rồi `bun scripts/scan-bundle.ts` | Dựng bản chạy thật; quét bundle trình duyệt không có bí mật |
| `bun scripts/check-upgrade.ts --from=0005` | Đợt có migration mới: thử nâng DB từ bản cũ lên. Thay `0005` bằng số migration cuối của bản đang chạy trên hosting |
| `bun scripts/restore-check.ts --from=dev` | Khôi phục thử bản sao lưu vào DB tạm |
| Trình duyệt khổ 375×812 | Xem giao diện như trên iPhone |

### Cách AI báo kết quả (học từ CEN)

Mỗi lần xong việc, AI báo theo các mục:

- có đổi DB không;
- migration mới;
- kết quả typecheck, test, build;
- việc anh cần tự thử trên hosting;
- trạng thái git;
- bước tiếp theo.

Phần nào chưa chạy thì ghi "CHƯA CHẠY", không được bỏ qua.

### Giữ mạch khi đổi phiên

- **Trạng thái phải nằm trong file, không chỉ nằm trong cuộc trò chuyện.** Gồm `CLAUDE.md` và kế hoạch có `[x]`. Phiên mới, hay AI khác, đọc lại là làm tiếp được.
- **Khi giao lại giữa các phiên hay các AI, dùng `HANDOFF.md`.** CEN ghi trong đó: đang dừng ở đâu, đã kiểm gì, chưa kiểm gì.
- **Mỗi lúc chỉ để một AI sửa một phần.** Ở CEN, Codex và Claude cùng sửa; một migration của Codex làm Trang chủ chậm 30 giây. Dùng nhiều AI thì tất cả phải đọc chung một file luật, và đo tốc độ trước khi push.

---

## 7. Dữ liệu, phân quyền, bảo mật (luật cố định)

**Phân quyền**

- Kiểm quyền ở server **và** trong database (RLS), không chỉ ẩn nút trên giao diện.
- App kết nối DB bằng một role riêng, ít quyền (ở Lindy là `lindy_app`).
- Tài khoản quản trị DB chỉ dùng lúc khởi động để chuẩn bị DB. Dùng xong thì xoá khỏi `process.env`.

**Dữ liệu**

- Tiền lưu số nguyên VND.
- Ngày giờ theo `Asia/Ho_Chi_Minh`. Máy chủ chạy giờ UTC, nên "hôm nay" phải tính trong DB theo múi giờ, không lấy giờ máy chủ.
- Không xoá vĩnh viễn dữ liệu nghiệp vụ. Huỷ phải có lý do và lịch sử; audit log chỉ được thêm, không được sửa.
- Thao tác tiền phải chạy trong transaction. Chống bấm hai lần bằng khoá yêu cầu hoặc số phiên bản.

**Bí mật**

- Bí mật chỉ nằm trong biến môi trường của máy chủ.
- Biến tên `VITE_*` bị đóng thẳng vào code trình duyệt, nên **không bao giờ** đặt bí mật vào đó (bài học CEN).
- Chạy `scan-bundle` sau mỗi lần build.

**Lạm dụng và mạng**

- Giới hạn số lần thử đăng nhập, số lần xuất dữ liệu, số lần tải bản sao lưu.
- App chạy sau proxy của hosting: lấy IP thật từ `X-Forwarded-For` (biến `TRUST_PROXY=1`).

**Migration**

- Migration đã chạy trên hosting thì **không sửa**, chỉ thêm file mới.
- Migration chưa từng lên hosting thì sửa được, nhưng phải dựng lại DB dev.

**Mật khẩu mẫu**

- Mật khẩu tài khoản mẫu ở local là hằng số trong script dev.
- Script đó chỉ chạy được trên DB tên `_dev`.

---

## 8. Tốc độ trên gói nhỏ (bài học CEN)

- **Truy vấn nặng phải xếp hàng.** Website chỉ có 0,3 nhân CPU, nên truy vấn nặng không chạy song song được. Một trang gọi 5 truy vấn nặng thì thời gian chờ cộng dồn.
- **Luật RLS không gọi hàm cho từng dòng.** CEN thêm một policy gọi `ts_task_access()` cho từng dòng, Trang chủ mất 30 giây; gỡ đi còn 1–2 giây. Điều kiện phân quyền nên so trực tiếp cột, ví dụ `branch_id = ...` hay `team_id = ...`.
- **Đo với dữ liệu lớn trước khi push.** Tạo dữ liệu giả cỡ vài năm dùng (CEN đo với 80 người, 400 dự án, 8.000 việc), rồi so thời gian truy vấn trước và sau khi sửa.
- **Thu nhỏ ảnh trước khi lưu.** Ở CEN, một ảnh đại diện 2,9 MB chiếm 96% dung lượng mỗi lần tải trang. Lindy lưu ảnh chứng từ trong DB, nên DB lớn dần và ăn vào hạn mức 1 GB.
- **Không hỏi server lại thứ đã có.** CEN từng kiểm phiên đăng nhập hai lượt rồi mới vẽ trang.

---

## 9. Triển khai lần đầu lên Vibe Host

### 9.1 AI làm trước, trên máy

1. Chạy `bun run check`, `bun run build`, `bun scripts/scan-bundle.ts`.
2. Giả lập hosting:
   - chạy bản build bằng Node (`node .output/server/index.mjs`);
   - dùng DB trống, chỉ đặt những biến hosting thật có;
   - mở `/api/health`, phải thấy `ready: true`.

   Giả lập không bắt được mọi lỗi. Lỗi quyền đọc file (EACCES, lỗi số 14 ở mục 11) chỉ lộ ra trên hosting, nên Dockerfile phải có sẵn `--chown`.
3. Chạy `bun scripts/gen-prod-env.ts` để sinh bí mật production vào `.local/prod-env.txt`. Anh tự mở file này; AI không đọc.
4. Liệt kê cho anh từng biến cần đặt:
   - biến nào là bí mật, anh tự dán;
   - biến nào là giá trị công khai;
   - biến nào hosting sẽ báo "chưa khai báo" nhưng bỏ qua được (biến chỉ dùng khi test).
5. Commit. Chỉ push khi anh bảo.

### 9.2 Anh làm trên https://v2.tinhgon.xyz

1. **Tạo website**, mục **Triển khai website**:
   - nguồn: repo GitHub riêng tư (Git URL kèm mã truy cập), nhánh `main`;
   - cách dựng: **Dockerfile**;
   - cổng container: 3000.
2. **Gắn DB vào website.**
   - Gói còn chỗ: hosting tự tạo DB khi tạo website.
   - Gặp lỗi "Tạo DB tự động thất bại: Vượt số lượng dịch vụ": vào trang DB → **Website sử dụng**, gắn DB có sẵn vào website.
   - Sau khi gắn, hosting tự điền `DATABASE_URL`.
3. **Đặt biến môi trường.** Dán các dòng trong `.local/prod-env.txt`, cùng các giá trị công khai AI đã liệt kê. Khi dán:
   - chép đủ từ ký tự đầu đến ký tự cuối (Lindy từng mất chữ "B" đầu khoá VAPID);
   - không có dấu `<>`, ngoặc kép hay khoảng trắng;
   - tên biến gõ đúng chữ hoa và dấu gạch dưới.
4. **Bấm Triển khai**, đợi 1–3 phút.
5. **Xem nhật ký:** phải có `[release] Xong`. Nếu có `[release] Lỗi mã_lỗi: …`, gửi dòng đó cho AI.
6. **Mở `https://địa-chỉ-app/api/health`:** phải thấy `ready: true`, `missingEnv: []`, `badEnv: []`.
7. **Đăng nhập tài khoản chủ và đổi mật khẩu.** Sau đó xoá biến `INITIAL_OWNER_PASSWORD`, rồi bấm Triển khai lại.
8. **Bật sao lưu tự động**, giữ ít bản vì bản sao lưu cũng tính vào 1 GB.
9. **Tên miền riêng (nếu có):** trỏ DNS, sửa `APP_ORIGIN`, bấm Triển khai lại.

### 9.3 Đọc `/api/health`

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| `"ready": true` | DB đã chuẩn bị xong | Đăng nhập thử |
| `"missingEnv": [...]` | Biến còn thiếu hoặc gõ sai tên | Thêm đúng biến đó, Triển khai lại |
| `"badEnv": [...]` | Biến sai dạng: khoá dán thiếu ký tự, `APP_ORIGIN` có `/` ở cuối, `VAPID_SUBJECT` không bắt đầu bằng `mailto:`… | Sửa biến đó, Triển khai lại |
| `"problem": {"code": "missing_DATABASE_ADMIN_URL"}` | Website chưa gắn DB | Gắn DB (bước 9.2.2) |
| `db_unreachable`, `db_auth_failed`, `cannot_create_role` | DB không kết nối được, sai mật khẩu, hoặc tài khoản DB thiếu quyền | Gửi mã lỗi cho AI |
| `"hasAccounts": false` | DB chưa có tài khoản nào | Đặt `INITIAL_OWNER_*`, Triển khai lại |

---

## 10. Cập nhật bản mới

1. **AI:** sửa code, chạy `bun run check` và `bun run build`. Có migration mới thì chạy thêm `check-upgrade --from=` với số migration đang chạy trên hosting. Xong thì commit.
2. **Anh:** bản mới có migration thì **sao lưu DB trước**.
3. **Anh bảo push. AI** push lên `main`.
4. **Anh:** bấm **Triển khai lại** (nếu chưa bật tự triển khai), đợi 1–3 phút.
5. Kiểm tra: nhật ký có `[release] Xong`; `/api/health` báo `ready: true`; đăng nhập thử một lần.
6. Bản mới lỗi: container không lên, Vibe Host vẫn giữ bản cũ đang chạy. Anh gửi AI ảnh phần cuối "Nhật ký đầy đủ", hoặc kéo tab Vibe Host vào nhóm tab "Claude" trong Chrome để AI đọc.

---

## 11. Lỗi đã gặp và cách tránh

| # | Triệu chứng | Nguyên nhân | Cách tránh từ đầu |
|---|---|---|---|
| 1 | Đăng nhập ở local báo lỗi | DB trên máy đang tắt | `bun run dev` tự bật DB trước |
| 2 | Bad Gateway (Nhân Hòa) | Tên miền trỏ cổng 80, app chạy cổng 3000 | Đặt cổng container 3000 |
| 3 | Lỗi 500, không rõ vì sao | Thiếu `DATABASE_URL`, app không báo gì | App báo 503 có lời rõ ràng; có `/api/health` |
| 4 | Tên biến thành `<LINDY_APP_PASSWORD` | Mẫu có dấu `<…>`, anh chép nguyên | Không bao giờ dùng `<…>` trong mẫu biến |
| 5 | Triển khai thất bại vì hosting tự tạo DB khi gói đã hết chỗ | Website chưa gắn DB | Gắn DB vào website (bước 9.2.2) |
| 6 | Hosting tự điền 6 biến với giá trị `localhost` | Nó quét `.env.example` viết cho máy local | `.env.example` chỉ để giá trị production hoặc để trống; app tự nhận `DATABASE_URL` quản trị |
| 7 | Khoá VAPID thiếu một ký tự | Bôi đen thiếu khi chép | `/api/health` có `badEnv` kiểm dạng từng biến |
| 8 | Dựng xong, app chết 4 lần liên tiếp | Hosting tự chạy `npm run preview`, dự án không có lệnh này | Có cả script `start` và `preview`; dùng Dockerfile |
| 9 | "Dung lượng lưu trữ đã vượt hạn mức" | Hosting tự dựng (Nixpacks), giữ cả `node_modules`: ảnh 1,2 GB | Dockerfile 2 tầng, ảnh khoảng 250 MB |
| 10 | Chép Dockerfile CEN sang thì app sập ngay ("Bun is not defined") | Dựng bằng Bun, Nitro tự chọn bản chạy cho Bun | Ghim `preset: 'node-server'` |
| 11 | Tạo lại website báo vượt số dịch vụ dù chỉ còn 1 DB | Gói tính cả website là dịch vụ | Website và DB là đủ 2/2; gắn DB có sẵn |
| 12 | Container sập liên tục: `[release] Lỗi other_EACCES` | Mã nguồn hosting kéo về chỉ cho root đọc, user `node` không đọc được file migration | `COPY --chown=node:node` trong Dockerfile |
| 13 | AI không push được | Máy không có git trong PATH, chưa đăng nhập GitHub | Dùng git của GitHub Desktop; đăng nhập bằng mã thiết bị một lần |
| 14 | Trang chủ CEN mất 30 giây | Policy RLS gọi hàm cho từng dòng (migration của AI khác) | Điều kiện RLS so cột; đo trên dữ liệu lớn trước khi push |
| 15 | Mỗi lần mở trang CEN tải 2,9 MB | Ảnh đại diện gốc không thu nhỏ | Thu nhỏ ảnh khi tải lên |
| 16 | Kiểm trên bản xem trước Lovable cho kết quả sai | Bản xem trước chạy hạ tầng cũ | Chỉ tin kết quả ở local hoặc trên hosting thật |
| 17 | Tưởng xong vì triển khai "Live" (CEN Telesale) | Chưa cấu hình nhóm, nhân sự trong app | Nghiệm thu bằng người dùng thật, không chỉ nhìn trạng thái Live |

---

## 12. iPhone: PWA và thông báo

- **Bắt buộc HTTPS.** Tên miền tạm của Vibe Host (dạng `*.n2.tinhgon.xyz`) có sẵn SSL, nên thử thẳng trên iPhone thật ở hosting, không cần mkcert.
- **Cách cài trên iPhone:**
  1. Mở Safari → Chia sẻ → **Thêm vào Màn hình chính**.
  2. Mở app từ biểu tượng vừa tạo, đăng nhập.
  3. Bật thông báo bằng nút trong app. iOS chỉ hỏi quyền khi người dùng bấm.
  4. Gửi thử.
- **Thông báo chỉ chạy khi app được mở từ Màn hình chính** (iOS 16.4 trở lên).
- **Khoá VAPID riêng cho từng app.** `VAPID_SUBJECT` = `mailto:` + email liên hệ thật.
- **Gửi thông báo qua hàng đợi (outbox)**, tự gửi lại khi lỗi, để không chặn thao tác của người dùng.
- **Xem giao diện ở khổ 375×812 trong trình duyệt** để kiểm nhanh. Vẫn phải thử trên iPhone thật, vì Safari khác Chrome.

---

## 13. Sao lưu, khôi phục, dữ liệu cũ

- **Bật sao lưu tự động của Vibe Host.** Hằng tháng xem trang **Dung lượng**.
- **Bản sao lưu riêng của app:** app có nút để chủ tải bản sao lưu (file JSON, không có mật khẩu, phiên đăng nhập hay đăng ký push). Có thêm script khôi phục thử vào DB tạm, so số dòng, số dư và doanh thu từng tháng.
- **Sao lưu chưa từng khôi phục thử thì chưa chắc dùng được.** Thử khôi phục ít nhất một lần.
- **Trước mỗi lần cập nhật có migration, sao lưu.**
- **Nhập dữ liệu cũ** (Sheets, Excel):
  - lưu vào bảng riêng;
  - người dùng tự ghép cột;
  - chống nhập trùng bằng dấu vân tay của từng dòng;
  - huỷ được cả một lần nhập.
- **Phần tiền và lương chạy song song với cách cũ ít nhất một tháng** rồi mới bỏ Sheets.

---

## 14. Phân vai

| Việc | Anh | AI |
|---|---|---|
| Chốt yêu cầu, trả lời câu hỏi, duyệt kế hoạch | ✓ | Soạn câu hỏi có phương án khuyên dùng |
| Viết code, test, kiểm tra, commit | | ✓ |
| Push lên GitHub | Bảo AI push (hoặc tự bấm trong GitHub Desktop) | Chỉ push khi anh bảo |
| Mua gói, tạo website, gắn DB, bấm Triển khai | ✓ | Hướng dẫn từng bước |
| Dán mật khẩu, khoá bí mật vào hosting | ✓ | Chỉ dán giá trị công khai: tên miền, khoá public, số `1`, tên người |
| Đọc `.env`, `.local/` | ✓ | Không đọc; script không in bí mật |
| Sao lưu trước khi cập nhật | ✓ | Nhắc |
| Thử trên iPhone thật, nghiệm thu với người dùng | ✓ | Liệt kê việc cần thử |

**Không ai làm:**

- bấm "AI sửa lỗi" của hosting (nó sửa thẳng mã nguồn, không qua kiểm tra của dự án);
- xoá DB đang gắn website, hay "Bỏ liên kết" khi chưa sao lưu (xoá DB là mất dữ liệu vĩnh viễn);
- dùng chung DB, tên miền hay khoá VAPID giữa hai app.

---

## 15. Ghi chú cho AI làm việc trên máy này

- **Git:** `git` không có trong PATH. Dùng git đi kèm GitHub Desktop:
  ```powershell
  $g = Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Directory -Filter "app-*" | Sort-Object Name -Descending | Select-Object -First 1
  $git = Join-Path $g.FullName "resources\app\git\cmd\git.exe"
  ```
  - Commit message tiếng Việt: ghi ra file rồi dùng `git commit -F`; tránh ngoặc kép trong message.
  - Trước khi push: đặt `GIT_TERMINAL_PROMPT=0` và `GCM_INTERACTIVE=never`.
  - Push báo "could not read Username": đăng nhập lại bằng mã thiết bị (`credential-manager github login --device`).
- **Mẫu cho anh:** không dùng `<…>`; đưa tên biến và giá trị tách bạch. Giá trị nào anh tự điền thì nói bằng lời.
- **Trước khi lên hosting mới:**
  - đọc dòng `[Detect]` trong nhật ký;
  - không giả định hosting có đặt `NODE_ENV`, cổng, hay lệnh `start`.
- **Đọc bảng quản lý Vibe Host qua Chrome:**
  - tab bị ẩn thì đứng hình;
  - bấm theo ref hay không ăn: dùng `button.click()` qua JavaScript hoặc `form_input`;
  - trang nhật ký tải mãi không xong: đọc `main.innerText` bằng JavaScript;
  - AI chỉ thấy tab của anh khi anh kéo tab đó vào nhóm "Claude".
- **Tham khảo dự án đã chạy trước khi tự nghĩ cách làm:**
  - Lindy: `E:\AI - Vibecode\Lindy`;
  - CEN: `C:\Users\Admin\Documents\GitHub\cenwork-lovable` (chỉ xem cách làm).

---

## Phụ lục A: Mẫu `CLAUDE.md` cho app mới

Anh chép khối dưới vào `CLAUDE.md` ở gốc repo app mới. Các dòng bắt đầu bằng "Điền:" để AI điền cùng anh ở Giai đoạn 1.

```markdown
# CLAUDE.md

Hướng dẫn cho AI lập trình khi làm việc trong thư mục này. Trao đổi với người dùng bằng tiếng Việt.

## Dự án

Điền: app gì, cho ai, dùng trên thiết bị nào, giao diện tiếng Việt.

Nền tảng theo `docs/TECH_STACK.md` (khuôn LINDY OS: TanStack Start, PostgreSQL 16, RLS, migration SQL, Dockerfile).
Chạy local trước; đồng bộ GitHub và triển khai lên Vibe Host Mắt Bão chỉ khi người dùng yêu cầu.
Làm và triển khai theo `docs/HUONG_DAN_APP_MOI_MATBAO.md`. Cách chạy, kiểm tra: `docs/CHAY_LOCAL.md`.

Trạng thái: Điền: đợt nào đã xong, đợt nào đang làm.

## Nguồn yêu cầu, theo thứ tự ưu tiên

1. Yêu cầu mới nhất của người dùng trong cuộc trò chuyện.
2. `docs/DECISIONS.md` (mục mới nhất thắng).
3. PRD bản mới nhất trong `docs/prd/`.
4. Bản cũ: chỉ tra lịch sử.

## Quy tắc không được tự thay đổi

- Quyết định đã có mã trong `DECISIONS.md` thì không hỏi lại, không tự sửa.
- Không tự đoán tham số còn thiếu; xem `docs/OPEN_QUESTIONS.md`, thiếu thì hỏi.
- Tiền lưu số nguyên VND; múi giờ Asia/Ho_Chi_Minh.
- Phân quyền kiểm ở server và database, không chỉ ẩn nút.
- Không xoá vĩnh viễn dữ liệu nghiệp vụ; sửa và huỷ có lý do, có lịch sử.
- Không thêm tính năng ngoài yêu cầu.
- Không đọc `.env` và `.local/`; script không in bí mật. Mẫu biến môi trường không dùng dấu `<…>`.
- Migration đã chạy trên hosting thì không sửa, chỉ thêm file mới.
- Chỉ push khi người dùng bảo. Push `main` coi như phát hành.

## Cách làm việc

1. Đọc tài liệu liên quan trước khi sửa.
2. Báo ngắn trước khi làm: hiểu yêu cầu thế nào, file sẽ đổi, có đổi dữ liệu không, rủi ro.
3. Đợt mới: lập kế hoạch ở `docs/plans/`, chờ duyệt rồi mới code.
4. Làm phạm vi nhỏ nhất, kiểm tra được độc lập; commit từng bước.
5. Chạy `bun run check` và `bun run build` trước khi báo xong; báo đúng kết quả, kể cả phần chưa kiểm được.
6. Có quyết định mới: ghi vào `docs/DECISIONS.md`, xoá câu tương ứng khỏi `docs/OPEN_QUESTIONS.md`.
```

---

## Phụ lục B: Mẫu `Dockerfile` và `.dockerignore`

Lấy từ Lindy, đã chạy thật. Dòng `oven/bun:1.4.2` phải trùng phiên bản Bun trên máy (`bun --version`).

```dockerfile
# Ảnh chạy thật trên Vibe Host Mắt Bão. Tầng dựng có Bun và toàn bộ thư viện;
# tầng chạy chỉ có Node, .output (Nitro tự chứa thư viện lúc chạy), migration và script chuẩn bị DB.

# ---------- Dựng ----------
FROM oven/bun:1.4.2 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
RUN bun run build
# Script chuẩn bị DB đóng gói thành một file, ảnh chạy không cần node_modules.
RUN bun build scripts/release.ts --target=node --outfile=/app/release.mjs

# ---------- Chạy ----------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# --chown: mã nguồn hosting kéo về có thể chỉ cho root đọc.
COPY --from=builder --chown=node:node /app/.output ./.output
COPY --from=builder --chown=node:node /app/db/migrations ./db/migrations
COPY --from=builder --chown=node:node /app/release.mjs ./release.mjs
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000
# Chuẩn bị DB rồi mới bật server. Lỗi thì container dừng, Vibe Host giữ bản đang chạy.
ENTRYPOINT ["/bin/sh", "-c", "node release.mjs && exec node .output/server/index.mjs"]
```

`.dockerignore`:

```
node_modules
.output
.nitro
.tanstack
.vinxi
.vite
dist
coverage
*.tsbuildinfo
.git
.github
.env
.env.*
.local
.pgdata
*.pem
.claude
.vscode
.idea
docs
tests
*.log
Dockerfile
.dockerignore
```

---

## Phụ lục C: Mẫu `.env.example`

**Vibe Host đọc file này khi tạo website và tự điền theo.** Vì vậy:

- chỉ để trống, hoặc ghi giá trị dùng được trên hosting;
- không bao giờ ghi `localhost`;
- không bao giờ ghi giá trị bí mật thật.

Tên biến mật khẩu role ở Lindy là `LINDY_APP_PASSWORD`. App mới đặt theo tên app, AI sẽ đặt khi dựng khung.

```
# Biến môi trường khi chạy thật trên Vibe Host Mắt Bão.
# Ở máy local, file .env do script dựng DB tự sinh (xem docs/CHAY_LOCAL.md). KHÔNG commit giá trị thật.

# --- Cơ sở dữ liệu ---
# Vibe Host tự điền khi gắn DB vào website (tài khoản quản trị DB).
# Lúc khởi động app dùng nó để tạo role riêng, chạy migration, rồi chỉ kết nối bằng role riêng.
DATABASE_URL=

# --- Bí mật máy chủ (lấy trong .local/prod-env.txt, sinh bằng bun scripts/gen-prod-env.ts) ---
APP_DB_PASSWORD=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
# mailto: + email liên hệ thật.
VAPID_SUBJECT=

# --- Máy chủ ---
# Địa chỉ công khai của app, không có dấu / cuối.
APP_ORIGIN=
# Chạy sau proxy của Vibe Host: lấy IP người dùng từ X-Forwarded-For.
TRUST_PROXY=1

# --- Tài khoản chủ đầu tiên ---
# Chỉ dùng khi DB chưa có tài khoản nào; chủ phải đổi mật khẩu lần đầu. Tạo xong xoá INITIAL_OWNER_PASSWORD.
INITIAL_OWNER_NAME=
INITIAL_OWNER_PHONE=
INITIAL_OWNER_PASSWORD=
```

---

## Phụ lục D: Câu giao việc cho Claude Code

Anh mở Claude Code ở thư mục app mới (ví dụ `E:\AI - Vibecode\TenApp`), chép nguyên khối.

**D1. Bắt đầu app mới.** Chép khối dưới, rồi viết tiếp mô tả app ở cuối tin nhắn: app cho ai, làm việc gì, bao nhiêu người dùng, dùng trên điện thoại hay máy tính, đang quản lý bằng gì.

```
Đọc E:\AI - Vibecode\Lindy\docs\HUONG_DAN_APP_MOI_MATBAO.md trước.
Anh muốn làm một app mới theo đúng hướng dẫn đó. Việc đầu tiên: soạn phiếu hỏi để chốt yêu cầu,
mỗi câu có sẵn lựa chọn và phương án khuyên dùng. Chưa code, chưa tạo khung dự án.
Mô tả app:
```

**D2. Viết PRD sau khi đã trả lời phiếu.**

```
Từ câu trả lời trong phiếu, viết PRD bản đầu vào docs/prd/, tạo docs/DECISIONS.md,
docs/OPEN_QUESTIONS.md và CLAUDE.md theo Phụ lục A của hướng dẫn. Chia lộ trình thành các đợt nhỏ.
Chỗ nào chưa rõ thì đưa vào OPEN_QUESTIONS, không tự đoán.
```

**D3. Dựng khung (Đợt 0).**

```
Lập kế hoạch Đợt 0: dựng khung dự án theo mục 5 của docs/HUONG_DAN_APP_MOI_MATBAO.md.
Lấy cách làm từ repo E:\AI - Vibecode\Lindy (Dockerfile, chuẩn bị DB lúc khởi động, /api/health,
.env.example cho hosting, gen-prod-env, scan-bundle, migration runner, PostgreSQL nhúng, đăng nhập,
phân quyền RLS). Viết lại cho app này, không chép dữ liệu nghiệp vụ của Lindy. Chờ anh duyệt rồi mới code.
```

**D4. Một đợt tính năng.** Đổi số đợt cho đúng.

```
Lập kế hoạch Đợt 1 theo lộ trình trong PRD. Câu nào cần anh chốt thì hỏi, kèm phương án khuyên dùng.
Chờ anh duyệt rồi mới code.
```

**D5. Triển khai lần đầu.**

```
Chuẩn bị triển khai lần đầu lên Vibe Host Mắt Bão theo mục 9.1 của hướng dẫn: chạy kiểm tra, giả lập
hosting trên máy, sinh .local/prod-env.txt. Liệt kê cho anh từng biến cần đặt (biến bí mật anh tự dán,
biến công khai kèm giá trị, biến hosting báo chưa khai báo mà bỏ qua được). Rồi hướng dẫn anh từng
bước mục 9.2. Chưa push khi anh chưa bảo.
```

**D6. Triển khai bị lỗi.** Gửi kèm ảnh phần cuối "Nhật ký đầy đủ" và nội dung trang `/api/health`.

```
Triển khai lên Vibe Host bị lỗi. Ảnh nhật ký và kết quả /api/health anh gửi kèm.
Dùng /go-loi tìm nguyên nhân gốc. Báo anh nguyên nhân và cách sửa trước khi sửa.
```

**D7. Cập nhật bản mới.**

```
Chuẩn bị đẩy bản mới lên hosting theo mục 10 của hướng dẫn: chạy kiểm tra; có migration mới thì chạy
check-upgrade từ migration đang chạy trên hosting và nhắc anh sao lưu DB trước. Báo kết quả, chờ anh bảo push.
```

**D8. Soi lỗ hổng trước khi chạy thật.**

```
/phan-bien toàn bộ phần tiền, phân quyền và dữ liệu khách của app trước khi đưa người dùng thật vào.
```

---

## Phụ lục E: Danh sách kiểm

**Trước khi push**

- [ ] `bun run check` qua hết
- [ ] `bun run build` và `scan-bundle` sạch
- [ ] Có migration mới: `check-upgrade` qua, anh đã sao lưu DB trên hosting
- [ ] Kế hoạch đợt đã ghi kết quả, kể cả phần chưa kiểm
- [ ] `CLAUDE.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md` đã cập nhật

**Sau mỗi lần triển khai**

- [ ] Nhật ký có `[release] Xong`
- [ ] `/api/health`: `ready: true`, `missingEnv: []`, `badEnv: []`
- [ ] Đăng nhập thử một lần
- [ ] Tính năng mới: thử một lượt trên iPhone

**Lần đầu chạy thật**

- [ ] Chủ đã đổi mật khẩu; đã xoá `INITIAL_OWNER_PASSWORD`
- [ ] Đã tạo tài khoản cho từng người trong app; mật khẩu tạm đưa trực tiếp
- [ ] Mỗi người đã thêm app vào Màn hình chính và bật thông báo
- [ ] Đã bật sao lưu tự động; đã khôi phục thử một lần
- [ ] Chạy song song với cách cũ ít nhất một tháng cho phần tiền và lương

**Hằng tháng**

- [ ] Xem trang **Dung lượng** trên Vibe Host (hạn mức 1 GB dùng chung)
- [ ] Tải một bản sao lưu của app về máy
