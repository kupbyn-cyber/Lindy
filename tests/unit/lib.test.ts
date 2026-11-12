// Hàm thuần (bước 0.6, 1.2): tiền, SĐT (K06), giờ Việt Nam khi máy chủ chạy UTC, trùng giờ, xếp cột.
import { describe, expect, it } from 'vitest'
import {
  addMinutes,
  hasServiceChip,
  type ListItem,
  layoutDay,
  toggleServiceChip,
} from '../../src/lib/appointments'
import { formatVND, parseVND } from '../../src/lib/money'
import {
  maskPhonesInText,
  movePhoneOutOfName,
  nameLooksMessy,
  normalizePhone,
  splitPhoneFromName,
} from '../../src/lib/phone'
import { escapeLike, foldVietnamese } from '../../src/lib/text'
import { addDays, fromLocal, startOfWeek, toLocalDate, toLocalTime, weekdayShort } from '../../src/lib/time'
import { runOneAtATime } from '../../src/server/auth/password'
import { clientIp } from '../../src/server/http/client-ip'
import { fromDbError } from '../../src/server/http/errors'
import { badEnvNames, classifyReleaseError, pickAdminUrl } from '../../src/server/ops/release'

describe('IP người dùng sau proxy Vibe Host', () => {
  const h = (xff?: string) => new Headers(xff ? { 'x-forwarded-for': xff } : {})
  it('lấy phần tử cuối do proxy thêm, không tin phần trình duyệt tự khai', () => {
    expect(clientIp(h('1.2.3.4, 203.0.113.7'), true, '10.0.0.2')).toBe('203.0.113.7')
    expect(clientIp(h('203.0.113.7'), true, '10.0.0.2')).toBe('203.0.113.7')
  })
  it('không bật TRUST_PROXY hoặc không có header → địa chỉ kết nối', () => {
    expect(clientIp(h('1.2.3.4'), false, '10.0.0.2')).toBe('10.0.0.2')
    expect(clientIp(h(), true, '10.0.0.2')).toBe('10.0.0.2')
    expect(clientIp(h(), true, undefined)).toBe('unknown')
  })
})

describe('Băm mật khẩu chạy lần lượt (RAM 512 MB trên hosting)', () => {
  it('không bao giờ chạy 2 lượt cùng lúc; lượt lỗi không chặn lượt sau', async () => {
    let active = 0
    let maxActive = 0
    const task = (fail: boolean) => async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      if (fail) throw new Error('x')
      return 1
    }
    const results = await Promise.allSettled([
      runOneAtATime(task(false)),
      runOneAtATime(task(true)),
      runOneAtATime(task(false)),
      runOneAtATime(task(false)),
    ])
    expect(maxActive).toBe(1)
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled'])
  })
})

describe('Biến môi trường dán sai dạng → /api/health báo tên biến', () => {
  const pub = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url') // 87 ký tự
  const priv = Buffer.alloc(32, 9).toString('base64url') // 43 ký tự
  const ok = {
    VAPID_PUBLIC_KEY: pub,
    VAPID_PRIVATE_KEY: priv,
    VAPID_SUBJECT: 'mailto:lindy@example.com',
    APP_ORIGIN: 'https://lindy.n2.tinhgon.xyz',
  }
  const from = (vars: Record<string, string>) => (k: string) => vars[k]

  it('đúng dạng → không báo gì', () => {
    expect(badEnvNames(from(ok))).toEqual([])
  })
  it('khoá thiếu ký tự đầu, origin có / cuối, subject không phải mailto', () => {
    expect(
      badEnvNames(
        from({
          VAPID_PUBLIC_KEY: pub.slice(1),
          VAPID_PRIVATE_KEY: priv.slice(1),
          VAPID_SUBJECT: 'lindy@example.com',
          APP_ORIGIN: 'https://lindy.n2.tinhgon.xyz/',
        }),
      ),
    ).toEqual(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'APP_ORIGIN'])
  })
})

describe('Chọn chuỗi kết nối quản trị DB trên hosting', () => {
  const admin = 'postgres://dbadmin:mk@db:5432/lindy'
  const app = 'postgres://lindy_app:mk@db:5432/lindy'
  const from = (vars: Record<string, string>) => (k: string) => vars[k]

  it('DATABASE_ADMIN_URL thắng; local không có thì bỏ qua', () => {
    expect(pickAdminUrl(from({ DATABASE_ADMIN_URL: admin, DATABASE_URL: app }), false)?.source).toBe(
      'DATABASE_ADMIN_URL',
    )
    expect(pickAdminUrl(from({ DATABASE_URL: admin }), false)).toBeNull()
  })
  it('production: hosting tự điền DATABASE_URL bằng tài khoản quản trị → dùng nó', () => {
    expect(pickAdminUrl(from({ DATABASE_URL: admin }), true)).toEqual({ url: admin, source: 'DATABASE_URL' })
    expect(pickAdminUrl(from({ DATABASE_URL: app, MIGRATE_DATABASE_URL: admin }), true)?.source).toBe(
      'MIGRATE_DATABASE_URL',
    )
  })
  it('production: chỉ có lindy_app → không chuẩn bị lại', () => {
    expect(pickAdminUrl(from({ DATABASE_URL: app }), true)).toBeNull()
  })
})

describe('Lỗi khi chuẩn bị DB trên hosting → mã cho /api/health, không lộ bí mật', () => {
  it('phân loại lỗi kết nối, sai mật khẩu, lỗi lạ', () => {
    const secret = 'postgres://lindy_db:mat-khau-bi-mat@host:5432/lindy_db'
    const cases: [unknown, string][] = [
      [
        Object.assign(new Error(`getaddrinfo ENOTFOUND ${secret}`), { code: 'ENOTFOUND' }),
        'db_host_not_found',
      ],
      [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'db_unreachable'],
      [Object.assign(new Error('password authentication failed'), { code: '28P01' }), 'db_auth_failed'],
      [new Error(`lỗi lạ ${secret}`), 'other'],
    ]
    for (const [e, code] of cases) {
      const p = classifyReleaseError(e)
      expect(p.code).toBe(code)
      expect(JSON.stringify(p)).not.toContain('mat-khau-bi-mat')
    }
  })
})

describe('Lỗi DB → lỗi HTTP', () => {
  it('mất kết nối PostgreSQL → 503 có câu nói rõ, không phải "Có lỗi xảy ra"', () => {
    for (const code of ['ECONNREFUSED', 'CONNECT_TIMEOUT', 'CONNECTION_CLOSED']) {
      const e = fromDbError(Object.assign(new Error('x'), { code }))
      expect(e?.status).toBe(503)
      expect(e?.message).toMatch('Chưa kết nối được dữ liệu')
    }
    expect(fromDbError(new Error('khác'))).toBeUndefined()
  })
})

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

describe('SĐT lẫn trong tên khách (S40)', () => {
  it('tách SĐT ra khỏi ô tên, dọn dấu ngăn thừa', () => {
    expect(splitPhoneFromName('Tú - 0969038498 - tay móng thường - 19/10 1:30')).toEqual({
      name: 'Tú - tay móng thường - 19/10 1:30',
      phone: '0969038498',
    })
    expect(splitPhoneFromName('Quỳnh Anh - 0949033958')).toEqual({ name: 'Quỳnh Anh', phone: '0949033958' })
    expect(splitPhoneFromName('anh thư-0386091107-tay úp móng-13h')).toEqual({
      name: 'anh thư - tay úp móng-13h',
      phone: '0386091107',
    })
    expect(splitPhoneFromName('Chị Hà 0912 345 678')).toEqual({ name: 'Chị Hà', phone: '0912345678' })
    expect(splitPhoneFromName('+84912345678 Lan')).toEqual({ name: 'Lan', phone: '0912345678' })
    // Không phải SĐT: giữ nguyên
    expect(splitPhoneFromName('Nhóm 3 khách 19/10 9h30')).toEqual({
      name: 'Nhóm 3 khách 19/10 9h30',
      phone: null,
    })
    expect(splitPhoneFromName('Mã 12345678901234')).toEqual({ name: 'Mã 12345678901234', phone: null })
  })
  it('rời ô tên: chuyển SĐT sang ô SĐT trống; trùng số thì chỉ bỏ khỏi tên; khác số thì giữ nguyên', () => {
    expect(movePhoneOutOfName('Tú - 0969038498 - tay', '')).toEqual({
      name: 'Tú - tay',
      phone: '0969038498',
      moved: '0969038498',
    })
    expect(movePhoneOutOfName('Tú 0969038498', '0969 038 498')).toEqual({
      name: 'Tú',
      phone: '0969 038 498',
      moved: '0969038498',
    })
    expect(movePhoneOutOfName('Tú 0969038498', '0912345678')).toEqual({
      name: 'Tú 0969038498',
      phone: '0912345678',
      moved: null,
    })
    expect(movePhoneOutOfName('0969038498', '')).toEqual({ name: '0969038498', phone: '', moved: null })
    expect(movePhoneOutOfName('Minh Hà', '')).toEqual({ name: 'Minh Hà', phone: '', moved: null })
  })
  it('che SĐT trong chữ để hiện trên danh sách', () => {
    expect(maskPhonesInText('Tú - 0969038498 - tay')).toBe('Tú - 0969•••498 - tay')
    expect(maskPhonesInText('Minh Hà')).toBe('Minh Hà')
  })
  it('nhận ra tên cần sửa: có SĐT, giờ, ngày, hoặc dài quá 30 ký tự', () => {
    expect(nameLooksMessy('Quỳnh Anh - 0949033958')).toBe(true)
    expect(nameLooksMessy('huyền anh tay phá móng 9h30')).toBe(true)
    expect(nameLooksMessy('Thư 13:30')).toBe(true)
    expect(nameLooksMessy('PM- tay úp móng 19/10')).toBe(true)
    expect(nameLooksMessy('Nguyễn Diễm Quỳnh - lm nail tay chân và mi')).toBe(true)
    expect(nameLooksMessy('Nguyễn Diễm Quỳnh')).toBe(false)
    expect(nameLooksMessy('Anh Thư 2')).toBe(false)
    expect(nameLooksMessy('Nhóm 3 khách')).toBe(false)
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
    phone: null,
    guestCount: 1,
    serviceSummary: null,
    status: 'confirmed',
    depositState: null,
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

describe('S65 — chip dịch vụ', () => {
  it('chạm chip: thêm cuối, chạm lại bỏ, nối " + ", chỉ khớp nguyên phần', () => {
    expect(toggleServiceChip('', 'Tay')).toBe('Tay')
    expect(toggleServiceChip('Tay', 'Chân')).toBe('Tay + Chân')
    expect(toggleServiceChip('Tay + Chân', 'Tay')).toBe('Chân')
    expect(toggleServiceChip('tay úp móng', 'Tay')).toBe('tay úp móng + Tay')
    expect(toggleServiceChip('Tay +  + Gel', 'Chân')).toBe('Tay + Gel + Chân')
    expect(toggleServiceChip('Tay +  + Gel', 'Gel')).toBe('Tay')
    expect(toggleServiceChip('TAY', 'Tay')).toBe('')
  })
  it('chip đang bật khi ô có đúng phần đó', () => {
    expect(hasServiceChip('Tay + Chân', 'chân')).toBe(true)
    expect(hasServiceChip('tay úp móng', 'Tay')).toBe(false)
    expect(hasServiceChip('', 'Tay')).toBe(false)
  })
})
