// Giờ Việt Nam (Asia/Ho_Chi_Minh). Lưu UTC, hiển thị dd/mm/yyyy và 14:20.
export const VN_TZ = 'Asia/Ho_Chi_Minh'

const parts = (d: Date, tz = VN_TZ) => {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return o as { year: string; month: string; day: string; hour: string; minute: string; weekday: string }
}

/** "2026-10-13" theo giờ VN. */
export function toLocalDate(d: Date | string, tz = VN_TZ) {
  const p = parts(new Date(d), tz)
  return `${p.year}-${p.month}-${p.day}`
}

/** "14:30" theo giờ VN. */
export function toLocalTime(d: Date | string, tz = VN_TZ) {
  const p = parts(new Date(d), tz)
  return `${p.hour}:${p.minute}`
}

/** Phút kể từ 0:00 theo giờ VN. */
export function minutesOfDay(d: Date | string, tz = VN_TZ) {
  const p = parts(new Date(d), tz)
  return Number(p.hour) * 60 + Number(p.minute)
}

/** Độ lệch múi giờ (phút) của tz tại thời điểm d. Việt Nam luôn +420. */
function offsetMinutes(d: Date, tz: string) {
  const p = parts(d, tz)
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000)
}

/** Ngày "2026-10-13" + "14:30" giờ địa phương → Date (UTC). */
export function fromLocal(date: string, time: string, tz = VN_TZ): Date {
  const [y, m, dd] = date.split('-').map(Number) as [number, number, number]
  const [hh, mi] = time.split(':').map(Number) as [number, number]
  const guess = new Date(Date.UTC(y, m - 1, dd, hh, mi))
  const off = offsetMinutes(guess, tz)
  return new Date(guess.getTime() - off * 60000)
}

/** "13/10/2026" */
export function formatDate(d: Date | string, tz = VN_TZ) {
  const p = parts(new Date(d), tz)
  return `${p.day}/${p.month}/${p.year}`
}

/** "2026-10-13" → "13/10/2026" */
export function formatIsoDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Hôm nay hiện giờ; khác ngày thì "13/10 14:30". */
export function formatDateTimeShort(d: Date | string, now = new Date(), tz = VN_TZ) {
  const date = new Date(d)
  const p = parts(date, tz)
  if (toLocalDate(date, tz) === toLocalDate(now, tz)) return `${p.hour}:${p.minute}`
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const WEEKDAYS_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

/** Thứ của một ngày "2026-10-13" (0 = CN). */
export function weekdayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
export const weekdayShort = (iso: string) => WEEKDAYS[weekdayOf(iso)]!
export const weekdayLong = (iso: string) => WEEKDAYS_LONG[weekdayOf(iso)]!

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** Thứ hai đầu tuần chứa ngày iso. */
export function startOfWeek(iso: string) {
  const wd = weekdayOf(iso)
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}

/** "2026-10" hợp lệ. */
export function isYearMonth(s: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/** "2026-10" → ngày đầu và ngày cuối tháng ("2026-10-01", "2026-10-31"). */
export function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return { first: `${ym}-01`, last: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
}

/** "2026-10" + n tháng. */
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/** "2026-10" hoặc "2026-10-01" → "10/2026" */
export function formatYearMonth(s: string) {
  return `${s.slice(5, 7)}/${s.slice(0, 4)}`
}

export function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}

export function isHHMM(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

export function hhmmToMinutes(s: string) {
  const [h, m] = s.split(':').map(Number) as [number, number]
  return h * 60 + m
}

export function minutesToHHMM(n: number) {
  const h = Math.floor(n / 60)
  const m = n % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
