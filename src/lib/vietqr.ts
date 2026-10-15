// QR chuyển khoản VietQR (NAPAS, chuẩn EMVCo) có sẵn số tiền và nội dung (S23–S25). Chuỗi mã dựng ngay trên điện
// thoại, không gọi dịch vụ ngoài. Khách quét bằng app ngân hàng: số tiền, nội dung tự điền, chỉ bấm xác nhận.
import qrcode from 'qrcode-generator'

export type Bank = { bin: string; name: string }

/** Ngân hàng nhận chuyển khoản 24/7 qua NAPAS. Mã BIN theo danh sách VietQR (api.vietqr.io/v2/banks, 15/10/2026). */
export const BANKS: Bank[] = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970422', name: 'MBBank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970443', name: 'SHB' },
  { bin: '970448', name: 'OCB' },
  { bin: '970426', name: 'MSB' },
  { bin: '970440', name: 'SeABank' },
  { bin: '970431', name: 'Eximbank' },
  { bin: '970449', name: 'LPBank' },
  { bin: '970425', name: 'ABBANK' },
  { bin: '970409', name: 'BacABank' },
  { bin: '970438', name: 'BaoVietBank' },
  { bin: '546034', name: 'CAKE' },
  { bin: '970444', name: 'CBBank' },
  { bin: '422589', name: 'CIMB' },
  { bin: '970446', name: 'Co-opBank' },
  { bin: '970434', name: 'IndovinaBank' },
  { bin: '668888', name: 'KBank' },
  { bin: '970452', name: 'KienLongBank' },
  { bin: '970463', name: 'Kookmin HCM' },
  { bin: '970462', name: 'Kookmin HN' },
  { bin: '970414', name: 'MBV' },
  { bin: '970428', name: 'NamABank' },
  { bin: '970419', name: 'NCB' },
  { bin: '970430', name: 'PGBank' },
  { bin: '970412', name: 'PVcomBank' },
  { bin: '971133', name: 'PVcomBank Pay' },
  { bin: '970400', name: 'SaigonBank' },
  { bin: '970429', name: 'SCB' },
  { bin: '970424', name: 'ShinhanBank' },
  { bin: '963388', name: 'Timo' },
  { bin: '546035', name: 'Ubank' },
  { bin: '970427', name: 'VietABank' },
  { bin: '970433', name: 'VietBank' },
  { bin: '970454', name: 'VietCapitalBank' },
  { bin: '970457', name: 'Woori' },
]

export function bankName(bin: string) {
  return BANKS.find((b) => b.bin === bin)?.name ?? bin
}

/** Số tài khoản như DB lưu: bỏ khoảng trắng, chữ in hoa (khớp kiểm tra trong app.bank_account_save). */
export function normalizeAccountNo(s: string) {
  return s.replace(/\s/g, '').toUpperCase()
}

export const ACCOUNT_NO_RE = /^[0-9A-Z]{4,19}$/

/** Nội dung chuyển khoản: LINDY + mã đơn, ví dụ "LINDY 0053" (S23). */
export function transferNote(codeLabel: string) {
  return `LINDY ${codeLabel.replace('#', '')}`
}

/** Bỏ dấu, chỉ giữ chữ, số, khoảng trắng; tối đa 25 ký tự (app ngân hàng cắt hoặc từ chối nội dung dài, ký tự lạ). */
function asciiNote(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^0-9A-Za-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25)
    .trim()
}

/** Một trường EMVCo: mã 2 số, độ dài 2 số, giá trị (toàn ký tự ASCII nên độ dài theo ký tự = theo byte). */
function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF), 4 ký tự hex in hoa. */
export function crc16(s: string) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Chuỗi VietQR động (có số tiền) chuyển vào tài khoản: ngân hàng `bin`, số tài khoản, số tiền VND, nội dung. */
export function vietQrPayload(input: { bin: string; accountNo: string; amount: number; note: string }) {
  if (!/^[0-9]{6}$/.test(input.bin)) throw new Error('Mã ngân hàng không hợp lệ.')
  if (!ACCOUNT_NO_RE.test(input.accountNo)) throw new Error('Số tài khoản không hợp lệ.')
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 9_999_999_999_999)
    throw new Error('Số tiền không hợp lệ.')
  const beneficiary = tlv('00', input.bin) + tlv('01', input.accountNo)
  const account = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA')
  const note = asciiNote(input.note)
  const body =
    tlv('00', '01') + // phiên bản
    tlv('01', '12') + // QR động: dùng một lần, có số tiền
    tlv('38', account) + // VietQR: chuyển nhanh đến tài khoản
    tlv('53', '704') + // VND
    tlv('54', String(input.amount)) +
    tlv('58', 'VN') +
    (note ? tlv('62', tlv('08', note)) : '') + // nội dung chuyển khoản
    '6304'
  return body + crc16(body)
}

/** Ma trận ô QR (true = ô đen), mức sửa lỗi M. */
export function qrMatrix(payload: string) {
  const qr = qrcode(0, 'M')
  qr.addData(payload)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}
