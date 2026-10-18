// Ảnh thành phẩm có khung (S18, S21, S35): ảnh móng đặt trong khung giấy ngà khổ 3:4 (1080 × 1440), dưới chỉ có chữ
// LINDY NAIL STUDIO căn giữa, không in thông tin đơn (dịch vụ, tiền, khách, thợ, ngày nằm trên bill; nhân viên chụp ảnh
// bill kèm thành phẩm). Vẽ hoàn toàn trên điện thoại, ảnh không gửi lên server. Chữ LINDY dùng Cormorant Garamond;
// NAIL STUDIO dùng Be Vietnam Pro.
import type { OrderDetail } from './orders'

export const FRAME_W = 1080
export const FRAME_H = 1440

const C = { paper: '#F6F0E7', ink: '#2A211E', muted: '#7A6C64' }
const BRAND = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
const SANS = '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

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

/** Chữ giãn khoảng, căn giữa tại x (canvas không có letter-spacing ổn định trên Safari cũ) */
function spacedCenter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  const chars = Array.from(text)
  const w = chars.reduce(
    (a, ch, i) => a + ctx.measureText(ch).width + (i < chars.length - 1 ? tracking : 0),
    0,
  )
  let cx = x - w / 2
  ctx.textAlign = 'left'
  for (const ch of chars) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
}

/** Chờ phông tải xong để chữ trên ảnh đúng kiểu (lỗi thì vẽ bằng phông dự phòng) */
async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`600 84px ${BRAND}`), document.fonts.load(`500 20px ${SANS}`)])
  } catch {}
}

/** Vẽ khung: giấy ngà, ảnh như treo triển lãm, dưới là LINDY / NAIL STUDIO căn giữa (S35). */
export async function drawFrame(photo: Photo) {
  await fontsReady()
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_W
  canvas.height = FRAME_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Máy không vẽ được ảnh.')
  const W = FRAME_W
  const m = 56
  const top = 56
  const band = 200 // dải chữ thương hiệu dưới ảnh
  const ph = FRAME_H - top - band

  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, W, FRAME_H)
  cover(ctx, photo, m, top, W - 2 * m, ph)
  ctx.strokeStyle = 'rgba(0,0,0,.06)'
  ctx.lineWidth = 2
  ctx.strokeRect(m + 1, top + 1, W - 2 * m - 2, ph - 2)
  const base = top + ph
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = C.ink
  ctx.font = `600 84px ${BRAND}`
  spacedCenter(ctx, 'LINDY', W / 2, base + 110, 14)
  ctx.fillStyle = C.muted
  ctx.font = `500 20px ${SANS}`
  spacedCenter(ctx, 'NAIL STUDIO', W / 2, base + 154, 7)
  return canvas
}

export function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xuất được ảnh.'))), 'image/jpeg', 0.92),
  )
}
