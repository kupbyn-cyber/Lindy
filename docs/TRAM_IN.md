# Cài trạm in bill trên MacBook

Trạm in (S38): MacBook ở quầy hỏi app LINDY mỗi 2 giây có bill cần in không, vẽ bill thành ảnh rồi gửi tới máy in bill của quán. Nhân viên bấm **In bill** trên điện thoại ở màn đơn; bill ra trong vài giây.

## 1. Chuẩn bị

- MacBook **macOS 11 trở lên**, **cắm sạc, mở nắp**, bắt **cùng WiFi** với máy in (nếu máy in nối mạng).
- Cài **Node.js 22**: mở https://nodejs.org/dist/latest-v22.x/ , bấm file có đuôi **.pkg** (ví dụ `node-v22.….pkg`), mở và bấm tiếp tới hết. **Không lấy bản mới nhất ở trang chủ nodejs.org**: Node 24 trở lên cần macOS 13.5, không chạy trên macOS 11. Kiểm tra: mở **Terminal** (Launchpad → Khác → Terminal), gõ `node -v`, ra `v22…` là được.
- Máy in bill: nhiệt, lệnh **ESC/POS** (gần như mọi máy in bill 58mm / 80mm đều dùng).

## 2. Biết địa chỉ máy in

| Máy in nối | Địa chỉ dùng khi cài | Cách xem |
|---|---|---|
| Dây mạng / WiFi | `tcp://IP:9100`, ví dụ `tcp://192.168.1.50:9100` | Tắt máy in, giữ nút FEED rồi bật lại: máy in trang tự kiểm tra có dòng IP. Nên đặt **IP cố định** cho máy in (trong trang quản lý modem) để không bị đổi. |
| USB vào MacBook | `cups://Tên_máy_in` | Thêm máy in trong Cài đặt hệ thống → Máy in & Máy quét (chọn driver "Generic"), rồi chạy lệnh `find` ở mục 5 để xem tên. |
| Bluetooth | `file:///dev/cu.Tên` | Ghép đôi máy in với MacBook trong Cài đặt Bluetooth, rồi chạy lệnh `find` để xem tên cổng. |

## 3. Cài

1. Linh mở app → **Thêm → Máy in bill** → **Tạo mã kết nối**. App hiện một dòng lệnh (mã chỉ hiện một lần).
2. Bấm **Chép dòng lệnh**, gửi sang MacBook (AirDrop, Zalo…).
3. Trên MacBook mở **Terminal**, dán dòng lệnh, **thay `IP_MAY_IN`** bằng IP máy in (hoặc thay cả đoạn `tcp://IP_MAY_IN:9100` bằng địa chỉ ở mục 2), bấm Enter.
4. Chờ chạy xong (tải chương trình vào thư mục `LindyTramIn` trong thư mục người dùng, cài thư viện vẽ ảnh, bật tự chạy). Dòng cuối: **Đã cài trạm in**.
5. Quay lại app, màn Máy in bill: trạm hiện **Đang kết nối**. Bấm **In thử**.

Trạm in tự chạy khi mở máy, tự bật lại nếu lỗi, và giữ MacBook không ngủ khi đang chạy. Cài lại (đổi máy in, đổi mã) thì chạy lại dòng lệnh mới.

## 4. Khi không in được

- App báo **Trạm in chưa phản hồi**: MacBook tắt, ngủ, gập nắp hoặc mất WiFi. Mở máy lên, chờ một lúc rồi in lại.
- App báo **Không nối được máy in**: máy in tắt, hết giấy, đổi IP, hoặc MacBook khác WiFi với máy in.
- Lệnh chờ **quá 10 phút** không in thì hết hạn (không tự in muộn); bấm **In lại bill**.
- Mất MacBook hoặc nghi lộ mã: Linh bấm **Thu hồi** ở màn Máy in bill, rồi tạo mã mới.
- Nhật ký trạm in: file `tram-in.log` trong thư mục `LindyTramIn`.

## 5. Lệnh dùng thêm (trong Terminal)

```bash
cd ~/LindyTramIn
```

```bash
node tram-in.mjs find
```

```bash
node tram-in.mjs sample --printer tcp://192.168.1.50:9100
```

`find`: liệt kê máy in USB đã thêm vào macOS và cổng bluetooth. `sample`: in thử thẳng từ MacBook, không qua app (kiểm máy in và địa chỉ; thay `192.168.1.50` bằng IP máy in của quán). Khổ 58mm thêm `--width 384`.

Gỡ trạm in:

```bash
launchctl unload ~/Library/LaunchAgents/vn.lindy.tramin.plist
```

## 6. Kỹ thuật

- Chương trình: `public/tram-in/tram-in.mjs` (Node, một thư viện `@resvg/resvg-js` để vẽ ảnh), phông Be Vietnam Pro và Cormorant Garamond (giấy phép OFL) trong `public/tram-in/fonts/`. App phục vụ các file này ở `/tram-in/…`; `cai-dat.sh` tải về, `npm install`, chạy `setup`.
- Bill vẽ thành ảnh 576 điểm (80mm) hoặc 384 điểm (58mm), in bằng lệnh ảnh ESC/POS `GS v 0`, đẩy giấy, cắt (`GS V`). In ảnh nên chữ có dấu không lỗi trên máy in giá rẻ.
- Trạm in chỉ gọi ra app (`GET /api/print/agent/next`, `POST /api/print/agent/finish`, header `Authorization: Bearer` + mã kết nối), không mở cổng nào. Mã lưu trong DB dạng băm SHA-256.
- Tự chạy: LaunchAgent `~/Library/LaunchAgents/vn.lindy.tramin.plist` (`caffeinate -is`, `KeepAlive`).
