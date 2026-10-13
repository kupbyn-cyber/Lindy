// Ghi CSV cho Excel, Google Sheets, Numbers (Đợt 5A, bước 5.4). BOM UTF-8 để Excel đọc đúng tiếng Việt; số giữ nguyên
// (không chấm nghìn) để cộng được. Ô chữ bắt đầu bằng = + - @ (hoặc tab, xuống dòng) thêm ' đằng trước để Excel không
// chạy như công thức [P77].
export type Cell = string | number | null | undefined
export type Table = { headers: string[]; rows: Cell[][] }

/** Ô chữ an toàn khi mở bằng bảng tính */
export function safeText(s: string) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function csvCell(c: Cell) {
  if (c == null) return ''
  if (typeof c === 'number') return Number.isFinite(c) ? String(c) : ''
  const s = safeText(c)
  return /[",\r\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(t: Table) {
  const lines = [t.headers, ...t.rows].map((r) => r.map(csvCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}
