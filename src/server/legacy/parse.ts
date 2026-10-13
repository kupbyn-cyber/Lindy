// Đọc file CSV xuất từ Google Sheets (Đợt 5B, bước 5.9; PRD §16). Không đoán bố cục bảng tính: Linh ghép cột (ngày, tên
// khách, SĐT, ghi chú, tổng, cột tiền từng thợ); ở đây chỉ đọc và kiểm từng ô.

/** CSV theo RFC 4180: ngoặc kép, "" trong ngoặc, xuống dòng trong ô. Tự nhận dấu phân cách , ; hoặc tab. */
export function parseCsv(text: string): string[][] {
  // Bỏ BOM UTF-8 ở đầu file
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = s.slice(0, s.search(/\r?\n|$/))
  const delim = [',', ';', '\t']
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]!.d
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  // Bỏ dòng trống ở cuối
  while (rows.length && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop()
  return rows
}

/**
 * Số tiền VND: "1.250.000", "1,250,000", "1250000", "1.250.000đ", "250k", "-50.000", "(50.000)". Trống → null.
 * Không đọc được → NaN.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (s === '' || s === '-') return null
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    sign = -sign
    s = s.slice(1)
  }
  s = s.replace(/(đ|vnđ|vnd|d)$/, '')
  let mult = 1
  if (s.endsWith('k')) {
    mult = 1000
    s = s.slice(0, -1)
  }
  // Nhóm nghìn bằng . hoặc , (VND không có phần lẻ)
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '')
  else if (mult === 1000 && /^\d+[.,]\d{1,2}$/.test(s)) s = s.replace(',', '.') // 1.5k
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN
  const v = Math.round(Number(s) * mult)
  return Number.isSafeInteger(v) ? sign * v : Number.NaN
}

const pad = (n: number) => String(n).padStart(2, '0')

function validDate(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? `${y}-${pad(m)}-${pad(d)}`
    : null
}

/**
 * Ngày kiểu Việt Nam (ngày trước tháng): "13/10/2026", "13-10-26", "2026-10-13", "13/10" hoặc "13" (lấy tháng, năm từ
 * tháng của tab). Không đọc được → null.
 */
export function parseDate(raw: string, month: string | null): string | null {
  const s = raw.trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return validDate(y, Number(m[2]), Number(m[1]))
  }
  if (!month) return null
  const [y, mo] = month.split('-').map(Number) as [number, number]
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/)
  if (m) return validDate(y, Number(m[2]), Number(m[1]))
  m = s.match(/^(\d{1,2})$/)
  if (m) return validDate(y, mo, Number(m[1]))
  return null
}
