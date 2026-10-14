// Ảnh thành phẩm có khung (S18–S21): ảnh móng đặt trong khung giấy ngà khổ 4:5 (1080 × 1350), dưới là chữ LINDY,
// tên dịch vụ, tên khách che bớt, thợ, ngày, @lindy.nailashstudio. Vẽ hoàn toàn trên điện thoại, ảnh không gửi lên
// server. Chữ LINDY dùng Cormorant Garamond; chữ còn lại Be Vietnam Pro (đủ dấu tiếng Việt).
import type { OrderDetail } from './orders'

export const FRAME_W = 1080
export const FRAME_H = 1350

const C = { paper: '#F6F0E7', ink: '#2A211E', muted: '#7A6C64', plum: '#8C2F55', hair: 'rgba(42,33,30,.18)' }
const BRAND = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
const SANS = '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export type FrameInfo = {
  /** Tên dịch vụ, ví dụ "Sơn gel trơn · Mắt mèo" */
  service: string
  /** Tên khách che bớt ("Ma***"); null khi khách đi cùng không có tên */
  customer: string | null
  /** Thợ làm, ví dụ "Chin & Trang" */
  staff: string
  /** Ngày làm dịch vụ dạng 15.10.2026 */
  date: string
}

/** Che tên khách: 2 chữ đầu + *** (S19). */
export function maskName(name: string | null | undefined) {
  const s = (name ?? '').normalize('NFC').trim()
  if (!s) return null
  return `${Array.from(s).slice(0, 2).join('')}***`
}

/** Thông tin in trên khung, lấy từ đơn. Không có SĐT, giá, mã đơn (S19). */
export function frameInfo(o: OrderDetail): FrameInfo {
  const names = [...new Set(o.items.map((it) => it.name.trim()).filter(Boolean))]
  const staff = [...new Set(o.items.flatMap((it) => it.staff.map((s) => s.name)).filter(Boolean))]
  const [y, m, d] = o.serviceDate.split('-')
  return {
    service: names.join(' · ') || 'LINDY',
    // Khách đi cùng không có hồ sơ (guestLabel) thì không in tên
    customer: o.customer ? maskName(o.customer.name) : null,
    staff: staff.join(' & '),
    date: `${d}.${m}.${y}`,
  }
}

/** Tên tệp khi lưu / chia sẻ */
export function frameFileName(o: OrderDetail) {
  return `LINDY-${o.codeLabel.replace('#', '')}-${o.serviceDate}.jpg`
}

type Photo = CanvasImageSource & { width: number; height: number }

/** Đọc ảnh đúng chiều (ảnh iPhone có thông tin xoay). */
export async function loadPhoto(file: Blob): Promise<Photo> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Không đọc được ảnh này. Chụp mới hoặc chọn ảnh khác.'))
        img.src = url
      })
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
  }
}

function cover(ctx: CanvasRenderingContext2D, img: Photo, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Cắt chữ dài cho vừa `max` px, thêm "…" */
function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  let t = text
  while (t.length > 1 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`
  return t
}

/** Chữ giãn khoảng (canvas không có letter-spacing ổn định trên Safari cũ) */
function spaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center',
) {
  const chars = Array.from(text)
  const w = chars.reduce(
    (a, ch, i) => a + ctx.measureText(ch).width + (i < chars.length - 1 ? tracking : 0),
    0,
  )
  let cx = align === 'center' ? x - w / 2 : x
  ctx.textAlign = 'left'
  for (const ch of chars) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
}

/** Chờ phông tải xong để chữ trên ảnh đúng kiểu (lỗi thì vẽ bằng phông dự phòng) */
async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`600 84px ${BRAND}`),
      document.fonts.load(`500 20px ${SANS}`),
      document.fonts.load(`600 36px ${SANS}`),
    ])
  } catch {}
}

/** Vẽ khung: giấy ngà, ảnh như treo triển lãm, dải chữ thương hiệu phía dưới. */
export async function drawFrame(photo: Photo, f: FrameInfo) {
  await fontsReady()
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_W
  canvas.height = FRAME_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Máy không vẽ được ảnh.')
  const W = FRAME_W
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, W, FRAME_H)
  const m = 56
  const top = 56
  const ph = 1010
  cover(ctx, photo, m, top, W - 2 * m, ph)
  ctx.strokeStyle = 'rgba(0,0,0,.06)'
  ctx.lineWidth = 2
  ctx.strokeRect(m + 1, top + 1, W - 2 * m - 2, ph - 2)
  const base = top + ph
  ctx.textBaseline = 'alphabetic'

  // Trái: LINDY, NAIL & LASH STUDIO
  ctx.fillStyle = C.ink
  ctx.font = `600 84px ${BRAND}`
  spaced(ctx, 'LINDY', m - 2, base + 128, 14, 'left')
  ctx.fillStyle = C.muted
  ctx.font = `500 19px ${SANS}`
  spaced(ctx, 'NAIL & LASH STUDIO', m, base + 168, 6.5, 'left')

  // Phải: gạch mận, dịch vụ, khách · thợ · ngày
  const right = W - m
  ctx.fillStyle = C.plum
  ctx.fillRect(right - 56, base + 62, 56, 3)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.ink
  ctx.font = `600 36px ${SANS}`
  ctx.fillText(clip(ctx, f.service, 560), right, base + 118)
  ctx.fillStyle = C.muted
  ctx.font = `500 21px ${SANS}`
  const meta = [f.customer ? `Khách ${f.customer}` : null, f.staff ? `by ${f.staff}` : null, f.date]
    .filter(Boolean)
    .join('  ·  ')
  ctx.fillText(clip(ctx, meta, 600), right, base + 166)

  // Chân: tài khoản Instagram
  ctx.strokeStyle = C.hair
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(m, base + 206)
  ctx.lineTo(W - m, base + 206)
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.font = `600 20px ${SANS}`
  spaced(ctx, '@lindy.nailashstudio', W / 2, base + 252, 1.5, 'center')
  return canvas
}

export function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xuất được ảnh.'))), 'image/jpeg', 0.92),
  )
}
