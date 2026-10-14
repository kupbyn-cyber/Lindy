// Ảnh thành phẩm (S18–S21): thông tin in trên khung lấy từ đơn — tên khách che bớt, không SĐT, giá, mã đơn.
import { describe, expect, it } from 'vitest'
import type { OrderDetail } from '../../src/lib/orders'
import { frameFileName, frameInfo, maskName } from '../../src/lib/photo-frame'

const order = (over: Partial<OrderDetail> = {}) =>
  ({
    codeLabel: '#0128',
    serviceDate: '2026-10-15',
    customer: { id: 'c1', name: 'Mai Anh', phone: '0912345678' },
    guestLabel: null,
    items: [
      { name: 'Sơn gel trơn', staff: [{ userId: 'u1', name: 'Chin' }] },
      {
        name: 'Mắt mèo',
        staff: [
          { userId: 'u1', name: 'Chin' },
          { userId: 'u2', name: 'Trang' },
        ],
      },
      { name: 'Mắt mèo', staff: [{ userId: 'u2', name: 'Trang' }] },
    ],
    ...over,
  }) as unknown as OrderDetail

describe('Khung ảnh thành phẩm', () => {
  it('che tên khách: 2 chữ đầu + *** (kể cả chữ có dấu); trống → null', () => {
    expect(maskName('Mai Anh')).toBe('Ma***')
    expect(maskName('  Ánh Tuyết ')).toBe('Án***')
    expect(maskName('')).toBeNull()
    expect(maskName(null)).toBeNull()
  })

  it('thông tin khung: dịch vụ không trùng, thợ, ngày, tên khách che bớt; không có SĐT, giá, mã đơn', () => {
    const f = frameInfo(order())
    expect(f).toEqual({
      service: 'Sơn gel trơn · Mắt mèo',
      customer: 'Ma***',
      staff: 'Chin & Trang',
      date: '15.10.2026',
    })
    const text = JSON.stringify(f)
    expect(text).not.toMatch(/0912345678|#0128|Mai Anh/)
  })

  it('khách đi cùng không có hồ sơ: không in tên', () => {
    expect(frameInfo(order({ customer: null, guestLabel: 'Khách đi cùng Mai Anh' })).customer).toBeNull()
  })

  it('tên tệp theo mã đơn và ngày', () => {
    expect(frameFileName(order())).toBe('LINDY-0128-2026-10-15.jpg')
  })
})
