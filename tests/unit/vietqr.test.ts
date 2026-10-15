// QR chuyển khoản VietQR (S23–S25): chuỗi mã đúng chuẩn EMVCo / NAPAS, có số tiền, nội dung LINDY + mã đơn, CRC đúng.
import { describe, expect, it } from 'vitest'
import { BANKS, bankName, crc16, qrMatrix, transferNote, vietQrPayload } from '../../src/lib/vietqr'

/** Tách chuỗi EMVCo thành { mã: giá trị } (mã 2 số, độ dài 2 số). */
function parse(s: string) {
  const out: Record<string, string> = {}
  let i = 0
  while (i < s.length) {
    const id = s.slice(i, i + 2)
    const len = Number(s.slice(i + 2, i + 4))
    out[id] = s.slice(i + 4, i + 4 + len)
    i += 4 + len
  }
  return out
}

const base = { bin: '970436', accountNo: '0011001234567', amount: 88_000, note: transferNote('#0053') }

describe('VietQR', () => {
  it('CRC-16/CCITT-FALSE đúng giá trị kiểm chuẩn', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('nội dung chuyển khoản là LINDY + mã đơn', () => {
    expect(transferNote('#0053')).toBe('LINDY 0053')
  })

  it('chuỗi mã có QR động, ngân hàng, số tài khoản, số tiền, nội dung, CRC khớp', () => {
    const p = vietQrPayload(base)
    const top = parse(p)
    expect(top['00']).toBe('01')
    expect(top['01']).toBe('12')
    expect(top['53']).toBe('704')
    expect(top['54']).toBe('88000')
    expect(top['58']).toBe('VN')
    const acc = parse(top['38']!)
    expect(acc['00']).toBe('A000000727')
    expect(acc['02']).toBe('QRIBFTTA')
    expect(parse(acc['01']!)).toEqual({ '00': '970436', '01': '0011001234567' })
    expect(parse(top['62']!)).toEqual({ '08': 'LINDY 0053' })
    // CRC tính trên toàn chuỗi đến hết "6304"
    expect(p.slice(-8, -4)).toBe('6304')
    expect(top['63']).toBe(crc16(p.slice(0, -4)))
  })

  it('nội dung bỏ dấu, bỏ ký tự lạ, tối đa 25 ký tự', () => {
    const p = vietQrPayload({ ...base, note: 'Đơn #0053 – Mai Anh, chuyển khoản tiền làm móng' })
    const note = parse(parse(p)['62']!)['08']!
    expect(note).toMatch(/^[0-9A-Za-z ]{1,25}$/)
    expect(note.startsWith('Don 0053 Mai Anh')).toBe(true)
  })

  it('chặn số tiền, số tài khoản, mã ngân hàng sai', () => {
    expect(() => vietQrPayload({ ...base, amount: 0 })).toThrow()
    expect(() => vietQrPayload({ ...base, amount: 1.5 })).toThrow()
    expect(() => vietQrPayload({ ...base, accountNo: '0011 0012' })).toThrow()
    expect(() => vietQrPayload({ ...base, accountNo: 'abc123' })).toThrow()
    expect(() => vietQrPayload({ ...base, bin: '97043' })).toThrow()
  })

  it('ma trận QR vuông, đủ ô cho chuỗi mã', () => {
    const m = qrMatrix(vietQrPayload(base))
    expect(m.length).toBeGreaterThanOrEqual(21)
    expect(m.every((row) => row.length === m.length)).toBe(true)
    // Ô định vị góc trên trái luôn đen
    expect(m[0]![0]).toBe(true)
  })

  it('danh sách ngân hàng: mã BIN 6 số, không trùng; tên tra được', () => {
    expect(BANKS.every((b) => /^[0-9]{6}$/.test(b.bin))).toBe(true)
    expect(new Set(BANKS.map((b) => b.bin)).size).toBe(BANKS.length)
    expect(bankName('970436')).toBe('Vietcombank')
  })
})
