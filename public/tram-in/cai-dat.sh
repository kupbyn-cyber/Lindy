#!/bin/bash
# Cài trạm in bill LINDY trên MacBook (Đợt 7). Dán nguyên dòng lệnh lấy ở app: Thêm → Máy in bill → Tạo mã kết nối.
#   curl -fsSL <APP>/tram-in/cai-dat.sh | bash -s -- <APP> <MÃ KẾT NỐI> <MÁY IN>
# <MÁY IN>: tcp://IP:9100 (dây mạng / WiFi) · cups://Ten_May_In (USB) · file:///dev/cu.Ten (bluetooth)
set -e
SERVER="${1%/}"
TOKEN="$2"
PRINTER="$3"
DIR="$HOME/LindyTramIn"

if [ -z "$SERVER" ] || [ -z "$TOKEN" ]; then
  echo "Thiếu địa chỉ app hoặc mã kết nối. Lấy dòng lệnh đầy đủ ở app: Thêm → Máy in bill."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "MacBook chưa có Node.js. macOS 11: mở https://nodejs.org/dist/latest-v22.x/ tải file đuôi .pkg, cài xong chạy lại lệnh này."
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node.js trên máy đã cũ ($(node -v)). Cài Node.js 22: https://nodejs.org/dist/latest-v22.x/ (file đuôi .pkg)."
  exit 1
fi
case "$PRINTER" in
  *IP_MAY_IN*) PRINTER="" ;;
esac

echo "Tải trạm in vào $DIR …"
mkdir -p "$DIR/fonts"
cd "$DIR"
for f in tram-in.mjs package.json fonts/BeVietnamPro-Regular.ttf fonts/BeVietnamPro-SemiBold.ttf \
  fonts/BeVietnamPro-Bold.ttf fonts/CormorantGaramond-SemiBold.ttf fonts/OFL-BeVietnamPro.txt \
  fonts/OFL-CormorantGaramond.txt; do
  curl -fsSL "$SERVER/tram-in/$f" -o "$f"
done
npm install --omit=dev --no-audit --no-fund --loglevel=error

if [ -z "$PRINTER" ]; then
  echo ""
  echo "Chưa có địa chỉ máy in (cần thay IP_MAY_IN bằng IP máy in). Máy in tìm thấy:"
  node tram-in.mjs find
  echo ""
  echo "Chạy lại dòng lệnh cài, đoạn cuối là địa chỉ máy in, ví dụ tcp://192.168.1.50:9100."
  exit 1
fi

node tram-in.mjs setup --server "$SERVER" --token "$TOKEN" --printer "$PRINTER"
echo "Xong. Vào app bấm In thử để kiểm tra. Giữ MacBook cắm sạc, mở nắp, bắt WiFi quán."
