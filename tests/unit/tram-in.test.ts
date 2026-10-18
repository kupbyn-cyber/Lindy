// Trạm in (public/tram-in/tram-in.mjs, Đợt 7): vẽ bill, đổi ảnh sang lệnh in ESC/POS, đọc địa chỉ máy in.
import { describe, expect, it } from 'vitest'
import { billSvg, parsePrinter, renderBill, toEscPos } from '../../public/tram-in/tram-in.mjs'
import { groupVnd, testBill } from '../../src/lib/bill'

const bill = {
  ...testBill(
    { infoLines: 'Dòng 1\n\n Dòng 2 \nDòng 3\nDòng 4\nDòng 5', thanks: 'Cảm ơn <bạn> & hẹn gặp lại' },
    {
      date: '2026-10-19',
      time: '14:05',
    },
  ),
  customer: 'Nguyễn Thị Bích Ngọc',
}

describe('nội dung bill', () => {
  it('số tiền chia nhóm bằng dấu chấm; dòng trống bỏ, tối đa 4 dòng thông tin quán', () => {
    expect(groupVnd(8_450_000)).toBe('8.450.000')
    expect(groupVnd(-15_000)).toBe('−15.000')
    expect(groupVnd(0)).toBe('0')
    expect(bill.shopLines).toEqual(['Dòng 1', 'Dòng 2', 'Dòng 3', 'Dòng 4'])
    expect(bill.time).toBe('19/10/2026 · 14:05')
  })

  it('SVG có tên quán, tên khách đầy đủ, tổng tiền; ký tự đặc biệt được thoát', () => {
    const svg = billSvg(bill)
    expect(svg).toContain('>LINDY<')
    expect(svg).toContain('>NAIL STUDIO<')
    expect(svg).toContain('Khách: Nguyễn Thị Bích Ngọc')
    expect(svg).toContain('135.000đ')
    expect(svg).toContain('Cảm ơn &lt;bạn&gt; &amp; hẹn gặp lại')
    expect(svg).toMatch(/^<svg [^>]*width="576"/)
    expect(billSvg(bill, 384)).toMatch(/^<svg [^>]*width="384"/)
  })
})

describe('in ảnh ESC/POS', () => {
  it('ảnh 16×300: hai dải (255 + 45 dòng), điểm tối thành bit 1, cuối đẩy giấy và cắt', () => {
    const width = 16
    const height = 300
    const pixels = new Uint8Array(width * height * 4).fill(255)
    // điểm đen ở (0,0) và (9,256)
    for (const [x, y] of [
      [0, 0],
      [9, 256],
    ] as const) {
      const i = (y * width + x) * 4
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
    }
    const b = toEscPos({ width, height, pixels })
    expect([...b.subarray(0, 2)]).toEqual([0x1b, 0x40])
    expect([...b.subarray(2, 10)]).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 255, 0])
    expect(b[10]).toBe(0x80)
    const band2 = 10 + 2 * 255
    expect([...b.subarray(band2, band2 + 8)]).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 45, 0])
    expect(b[band2 + 8 + 2 * 1 + 1]).toBe(0x40)
    expect([...b.subarray(-7)]).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0])
    expect(() => toEscPos({ width: 10, height: 1, pixels: new Uint8Array(40) })).toThrow()
  })

  it('vẽ bill bằng phông đóng kèm: đúng bề rộng khổ giấy, có chữ đen', async () => {
    const img = await renderBill(bill, 576)
    expect(img.width).toBe(576)
    expect(img.height).toBeGreaterThan(400)
    let dark = 0
    for (let i = 0; i < img.pixels.length; i += 4) if (img.pixels[i]! < 128) dark++
    expect(dark).toBeGreaterThan(5000)
    expect((await renderBill(bill, 384)).width).toBe(384)
  })
})

describe('địa chỉ máy in', () => {
  it('tcp, cups, cổng nối tiếp; sai dạng báo lỗi', () => {
    expect(parsePrinter('tcp://192.168.1.50:9100')).toEqual({ type: 'tcp', host: '192.168.1.50', port: 9100 })
    expect(parsePrinter('tcp://192.168.1.50')).toEqual({ type: 'tcp', host: '192.168.1.50', port: 9100 })
    expect(parsePrinter('cups://XP_80C')).toEqual({ type: 'cups', queue: 'XP_80C' })
    expect(parsePrinter('file:///dev/cu.Printer')).toEqual({ type: 'file', path: '/dev/cu.Printer' })
    expect(() => parsePrinter('192.168.1.50')).toThrow(/tcp:\/\//)
  })
})
