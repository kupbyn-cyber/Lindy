// Ảnh vào ca (S59–S61): đồng hồ theo giờ máy chủ, chữ đóng dấu giờ VN, khung 3:4, cắt giữa; header cho phép camera
// của chính app.
import { describe, expect, it } from 'vitest'
import {
  CHECKIN_H,
  CHECKIN_MAX_BYTES,
  CHECKIN_W,
  clockOffset,
  coverRect,
  stampLines,
} from '../../src/lib/checkin-photo'
import { applySecurityHeaders } from '../../src/server/http/headers'

describe('Ảnh vào ca', () => {
  it('Độ lệch giờ lấy mốc giữa lúc gửi và lúc nhận: điện thoại chậm 1 giờ → +3.600.000ms', () => {
    const phone = Date.parse('2026-11-04T01:00:00Z')
    const server = new Date(phone + 3_600_000 + 100).toISOString()
    expect(clockOffset(server, phone, phone + 200)).toBe(3_600_000)
  })

  it('Chữ đóng dấu theo giờ VN dù máy chủ, máy test chạy UTC', () => {
    const ms = Date.parse('2026-11-04T01:57:09Z') // 08:57:09 thứ tư 04/11/2026 giờ VN
    expect(stampLines(ms, 'Trang')).toEqual({
      time: '08:57:09',
      date: 'Thứ tư, 04/11/2026',
      who: 'Trang · Vào ca · LINDY',
    })
    // Gần nửa đêm UTC đã sang ngày mới ở VN
    expect(stampLines(Date.parse('2026-11-04T17:30:00Z'), 'Chin').date).toBe('Thứ năm, 05/11/2026')
  })

  it('Khung 3:4, giới hạn 150KB; cắt giữa ảnh ngang để phủ kín khung dọc', () => {
    expect(CHECKIN_W / CHECKIN_H).toBe(3 / 4)
    expect(CHECKIN_MAX_BYTES).toBe(153_600)
    expect(coverRect(1280, 960, 720, 960)).toEqual({ x: 280, y: 0, w: 720, h: 960 })
    expect(coverRect(960, 1280, 720, 960)).toEqual({ x: 0, y: 0, w: 960, h: 1280 })
  })

  it('Header chỉ cho camera của chính app; micro, vị trí vẫn tắt', () => {
    const h = new Headers()
    applySecurityHeaders(h, { path: '/', dev: false })
    expect(h.get('Permissions-Policy')).toBe('camera=(self), microphone=(), geolocation=()')
  })
})
