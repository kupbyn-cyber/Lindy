// Ảnh vào ca (S59–S61): đồng hồ chạy theo giờ máy chủ, đóng dấu giờ lên ảnh, nén JPEG ≤ 150KB. Vẽ hoàn toàn trên
// điện thoại (máy chủ không có thư viện xử lý ảnh); giờ vào ca chính thức vẫn do DB ghi lúc nhận ảnh.
import { formatIsoDate, toLocalDate, VN_TZ, weekdayLong } from './time'

export const CHECKIN_MAX_BYTES = 150 * 1024
export const CHECKIN_W = 720
export const CHECKIN_H = 960

const SANS = '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

/** Giờ máy chủ trừ giờ điện thoại (ms). Lấy mốc giữa lúc gửi và lúc nhận để bù thời gian mạng. */
export function clockOffset(serverNowIso: string, sentAt: number, receivedAt: number) {
  return Date.parse(serverNowIso) - (sentAt + receivedAt) / 2
}

export type StampLines = { time: string; date: string; who: string }

/** Ba dòng đóng dấu: "08:57:12" · "Thứ tư, 04/11/2026" · "Trang · Vào ca · LINDY" */
export function stampLines(ms: number, name: string, tz = VN_TZ): StampLines {
  const d = new Date(ms)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(d)
  const date = toLocalDate(d, tz)
  return { time, date: `${weekdayLong(date)}, ${formatIsoDate(date)}`, who: `${name} · Vào ca · LINDY` }
}

/** Vùng cắt giữa ảnh nguồn để phủ kín khung đích (như object-fit: cover) */
export function coverRect(sw: number, sh: number, dw: number, dh: number) {
  const s = Math.max(dw / sw, dh / sh)
  const w = dw / s
  const h = dh / s
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h }
}

/** Vẽ khung hình camera khổ 3:4 kèm dải giờ ở dưới. Camera trước lật như gương, giống khung đang thấy; chữ không lật. */
export function drawCheckIn(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  lines: StampLines,
  opts: { mirror: boolean },
) {
  const W = CHECKIN_W
  const H = CHECKIN_H
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Máy không vẽ được ảnh.')
  const r = coverRect(sw, sh, W, H)
  ctx.save()
  if (opts.mirror) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, W, H)
  ctx.restore()

  const band = 230
  const g = ctx.createLinearGradient(0, H - band, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.35, 'rgba(0,0,0,.55)')
  g.addColorStop(1, 'rgba(0,0,0,.78)')
  ctx.fillStyle = g
  ctx.fillRect(0, H - band, W, band)

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const m = 32
  ctx.font = `700 76px ${SANS}`
  ctx.fillText(lines.time, m, H - 112, W - 2 * m)
  ctx.font = `500 30px ${SANS}`
  ctx.fillText(lines.date, m, H - 66, W - 2 * m)
  ctx.fillText(lines.who, m, H - 26, W - 2 * m)
  return canvas
}

function scaled(canvas: HTMLCanvasElement, k: number) {
  const c = document.createElement('canvas')
  c.width = Math.round(canvas.width * k)
  c.height = Math.round(canvas.height * k)
  c.getContext('2d')?.drawImage(canvas, 0, 0, c.width, c.height)
  return c
}

/** Nén JPEG tới ≤ 150KB: hạ chất lượng trước, chưa đủ thì thu nhỏ khung. */
export async function toCheckInJpeg(canvas: HTMLCanvasElement, max = CHECKIN_MAX_BYTES) {
  for (const k of [1, 0.75]) {
    const c = k === 1 ? canvas : scaled(canvas, k)
    for (const q of [0.72, 0.6, 0.5, 0.4]) {
      const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', q))
      if (b && b.size <= max) return b
    }
  }
  throw new Error('Ảnh quá lớn sau khi nén. Chụp lại.')
}
