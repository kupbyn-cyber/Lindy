// Tiền là số nguyên VND, hiển thị 8.450.000đ; số âm dùng dấu trừ "−" (G13).
function groupDigits(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatVND(value: number, opts: { sign?: boolean } = {}) {
  const n = Math.round(Number(value) || 0)
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : ''
  return `${sign}${groupDigits(Math.abs(n))}đ`
}

export function parseVND(text: string | null | undefined) {
  const d = String(text ?? '').replace(/[^\d]/g, '')
  return d ? Number.parseInt(d, 10) : 0
}
