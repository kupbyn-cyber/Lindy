// Chuẩn hoá SĐT theo K06: bỏ khoảng trắng, dấu chấm, gạch, ngoặc; +84 → 0; còn ký tự lạ thì báo lỗi.
export type PhoneResult = { ok: true; value: string | null } | { ok: false; error: string }

const SEPARATORS = /[\s.\-()]/g

export function normalizePhone(input: string | null | undefined): PhoneResult {
  const raw = (input ?? '').trim()
  if (raw === '') return { ok: true, value: null }
  let s = raw.replace(SEPARATORS, '')
  if (s.startsWith('+84')) s = `0${s.slice(3)}`
  if (!/^\+?[0-9]+$/.test(s)) return { ok: false, error: 'SĐT chỉ gồm chữ số.' }
  if (!/^\+?[0-9]{8,15}$/.test(s)) return { ok: false, error: 'SĐT không đúng độ dài.' }
  return { ok: true, value: s }
}

/** 0912345678 → 0912•••678 */
export function maskPhone(phone: string | null) {
  if (!phone) return null
  if (phone.length <= 7) return `${phone.slice(0, 2)}•••${phone.slice(-2)}`
  return `${phone.slice(0, 4)}•••${phone.slice(-3)}`
}

// SĐT Việt Nam nằm lẫn trong chữ (tên khách dán cả tiêu đề lịch): 0 hoặc +84 rồi 9–10 chữ số, giữa các số có thể
// có cách, chấm, gạch. Không bắt ngày "19/10" hay giờ "13h30".
const PHONE_IN_TEXT = /(?<!\d)(?:\+84|0)(?:[\s.-]?\d){9,10}(?!\d)/g
const digitsOf = (s: string) => {
  const d = s.replace(/\D/g, '')
  return d.startsWith('84') && s.trim().startsWith('+') ? `0${d.slice(2)}` : d
}

/** Che SĐT nằm trong chữ để hiện trên danh sách (P34): "Tú - 0969038498" → "Tú - 0969•••498". */
export function maskPhonesInText(text: string) {
  return text.replace(PHONE_IN_TEXT, (m) => maskPhone(digitsOf(m)) ?? m)
}

/**
 * Tách SĐT đầu tiên ra khỏi ô tên (S40): "Tú - 0969038498 - tay" → { name: "Tú - tay", phone: "0969038498" }.
 * Không có SĐT thì phone = null, tên giữ nguyên.
 */
export function splitPhoneFromName(text: string): { name: string; phone: string | null } {
  const m = new RegExp(PHONE_IN_TEXT.source).exec(text)
  if (!m) return { name: text, phone: null }
  const name = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    // Bỏ dấu ngăn bị bỏ trống sau khi lấy số ra: "Tú -  - tay" → "Tú - tay"
    .replace(/\s*([-–—|,/])\s*(?:[-–—|,/]\s*)+/g, ' $1 ')
    .replace(/^[\s\-–—|,/]+|[\s\-–—|,/]+$/g, '')
    .replace(/\s{2,}/g, ' ')
  return { name, phone: digitsOf(m[0]) }
}

/** Tên khách có lẫn SĐT, giờ, ngày hoặc quá dài: nên sửa lại cho gọn (S40). */
export function nameLooksMessy(name: string) {
  return (
    new RegExp(PHONE_IN_TEXT.source).test(name) ||
    /(?<![\p{L}\d])\d{1,2}(?:h\d{0,2}|:\d{2})(?![\p{L}\d])/u.test(name) ||
    /(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/.test(name) ||
    name.length > 30
  )
}

/** SĐT dùng để đăng nhập: số Việt Nam 10–11 chữ số bắt đầu bằng 0. */
export function normalizeLoginPhone(input: string): string | null {
  const r = normalizePhone(input)
  if (!r.ok || !r.value || !/^0[0-9]{9,10}$/.test(r.value)) return null
  return r.value
}
