// Hàm thuần (bước 0.6, 1.2): tiền, SĐT (K06), giờ Việt Nam khi máy chủ chạy UTC, trùng giờ, xếp cột.
import { describe, expect, it } from 'vitest'
import { addMinutes, type ListItem, layoutDay } from '../../src/lib/appointments'
import { formatVND, parseVND } from '../../src/lib/money'
import { normalizePhone } from '../../src/lib/phone'
import { escapeLike, foldVietnamese } from '../../src/lib/text'
import { addDays, fromLocal, startOfWeek, toLocalDate, toLocalTime, weekdayShort } from '../../src/lib/time'

describe('Tiền', () => {
  it('8.450.000đ; số âm dùng dấu trừ "−"', () => {
    expect(formatVND(8450000)).toBe('8.450.000đ')
    expect(formatVND(-550000)).toBe('−550.000đ')
    expect(formatVND(0)).toBe('0đ')
    expect(parseVND('1.250.000đ')).toBe(1250000)
  })
})

describe('SĐT (K06)', () => {
  it('bỏ khoảng trắng, chấm, gạch, ngoặc; +84 → 0', () => {
    expect(normalizePhone('0912 345 678')).toEqual({ ok: true, value: '0912345678' })
    expect(normalizePhone('0912.345.678')).toEqual({ ok: true, value: '0912345678' })
    expect(normalizePhone('+84 912-345-678')).toEqual({ ok: true, value: '0912345678' })
    expect(normalizePhone('(091) 2345678')).toEqual({ ok: true, value: '0912345678' })
    expect(normalizePhone('')).toEqual({ ok: true, value: null })
  })
  it('còn ký tự lạ thì báo lỗi', () => {
    expect(normalizePhone('09abc')).toMatchObject({ ok: false })
    expect(normalizePhone('0912345678 gọi sau')).toMatchObject({ ok: false })
    expect(normalizePhone('123')).toMatchObject({ ok: false })
  })
})

describe('Giờ Việt Nam khi máy chủ chạy UTC', () => {
  it('TZ của test là UTC', () => {
    expect(new Date('2026-01-01T00:00:00').getTimezoneOffset()).toBe(0)
  })
  it('đổi giờ địa phương ↔ UTC', () => {
    const d = fromLocal('2026-10-13', '09:00')
    expect(d.toISOString()).toBe('2026-10-13T02:00:00.000Z')
    expect(toLocalTime(d)).toBe('09:00')
    expect(toLocalDate(new Date('2026-10-12T17:30:00Z'))).toBe('2026-10-13') // 00:30 sáng 13/10 giờ VN
  })
  it('ngày, tuần', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12') // CN → thứ hai đầu tuần
    expect(weekdayShort('2026-10-13')).toBe('T3')
  })
  it('mặc định +120 phút; không vượt quá ngày', () => {
    expect(addMinutes('09:00', 120)).toBe('11:00')
    expect(addMinutes('23:00', 120)).toBe('23:59')
  })
})

describe('Tìm kiếm', () => {
  it('bỏ dấu tiếng Việt, đ → d', () => {
    expect(foldVietnamese('Sơn gel trơn')).toBe('son gel tron')
    expect(foldVietnamese('Nguyễn Thị Đào')).toBe('nguyen thi dao')
  })
  it('escape ký tự đặc biệt của LIKE [P13]', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})

describe('Xếp cột lịch chồng giờ', () => {
  const item = (id: string, s: string, e: string): ListItem => ({
    id,
    date: '2026-10-13',
    startTime: s,
    endTime: e,
    startAt: '',
    endAt: '',
    name: id,
    guestCount: 1,
    serviceSummary: null,
    status: 'pending',
    customerCancelReported: false,
    outsideHours: false,
    mine: false,
  })
  it('5 lịch chồng nhau → 5 cột, không lịch nào bị che', () => {
    const placed = layoutDay(
      ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, '10:00', '11:30')),
      1,
    )
    expect(new Set(placed.map((p) => p.col)).size).toBe(5)
    expect(placed.every((p) => p.cols === 5)).toBe(true)
  })
  it('09:00–10:00 và 10:00–11:00 không chồng (test 12) → cùng cột', () => {
    const placed = layoutDay([item('a', '09:00', '10:00'), item('b', '10:00', '11:00')], 1)
    expect(placed.map((p) => p.cols)).toEqual([1, 1])
  })
  it('lịch kết thúc thì cột được dùng lại', () => {
    const placed = layoutDay(
      [item('a', '09:00', '11:00'), item('b', '09:30', '10:00'), item('c', '10:30', '11:30')],
      1,
    )
    const byId = Object.fromEntries(placed.map((p) => [p.id, p.col]))
    expect(byId.c).toBe(1)
  })
})
