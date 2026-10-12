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

/** SĐT dùng để đăng nhập: số Việt Nam 10–11 chữ số bắt đầu bằng 0. */
export function normalizeLoginPhone(input: string): string | null {
  const r = normalizePhone(input)
  if (!r.ok || !r.value || !/^0[0-9]{9,10}$/.test(r.value)) return null
  return r.value
}
