// Ảnh thành phẩm (S18, S21, S35): khung khổ 3:4, chỉ chữ LINDY NAIL STUDIO; tên tệp theo mã đơn và ngày.
import { describe, expect, it } from 'vitest'
import type { OrderDetail } from '../../src/lib/orders'
import { FRAME_H, FRAME_W, frameFileName } from '../../src/lib/photo-frame'

describe('Khung ảnh thành phẩm', () => {
  it('S35: khổ 3:4 (1080 × 1440)', () => {
    expect([FRAME_W, FRAME_H]).toEqual([1080, 1440])
    expect(FRAME_W / FRAME_H).toBe(3 / 4)
  })

  it('tên tệp theo mã đơn và ngày', () => {
    const o = { codeLabel: '#0128', serviceDate: '2026-10-15' } as unknown as OrderDetail
    expect(frameFileName(o)).toBe('LINDY-0128-2026-10-15.jpg')
  })
})
