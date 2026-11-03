// Nghiệm thu Tổng quan và báo cáo doanh thu (bước 2.20–2.21; PRD §5.2, §11; test 30, 31 ở mức báo cáo; K13).
// Mỗi test dùng ngày riêng trong quá khứ để số liệu không lẫn với file test khác chạy song song.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ItemInput } from '../../src/lib/order-math'
import { addDays, addMonths, toLocalDate } from '../../src/lib/time'
import { createCustomer } from '../../src/server/customers/service'
import { closeSql } from '../../src/server/db/client'
import type { AppError } from '../../src/server/http/errors'
import { recordPayment } from '../../src/server/orders/payments'
import { confirmOrder, createOrder, updateOrder } from '../../src/server/orders/service'
import { dayReport, monthReport, overview } from '../../src/server/reports/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { ownerSql, seed, toAwaiting } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const svcId: Record<string, string> = {}
const today = toLocalDate(new Date())

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'trang'] as const) S[k] = await sessionOf(k)
  for (const r of await owner<{ id: string; code: string }[]>`select id, code from services`)
    svcId[r.code] = r.id
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id
const svc = (code: string, staff: SeedKey): ItemInput => ({
  type: 'service',
  serviceId: svcId[code]!,
  quantity: 1,
  staff: [{ userId: uid(staff) }],
})

async function order(serviceDate: string, items: ItemInput[], customerId: string | null = null) {
  const { order } = await createOrder(auth('nhung'), {
    createRequestId: rid(),
    customerId,
    serviceDate,
    items,
    discounts: [],
  })
  return order
}

describe('Báo cáo ngày (PRD §11)', () => {
  it('30, 31 — chỉ đơn đã xác nhận vào doanh thu ngày làm dịch vụ; tiền thu theo ngày nhận tiền và tài khoản', async () => {
    const day = addDays(today, -95)
    const a = await order(day, [svc('MG03', 'trang')])
    const ac = await confirmOrder(auth('nhung'), a.id, a.version)
    await recordPayment(auth('nhung'), ac.id, { idempotencyKey: rid(), amount: 200000, method: 'transfer' })
    const b = await order(day, [svc('CB02', 'nhung')])
    await toAwaiting(owner, b.id) // chờ xác nhận: chưa vào doanh thu
    const r = await dayReport(auth('linh'), { date: day })
    expect(r.revenue).toMatchObject({
      orders: 1,
      guests: 1,
      net: 220000,
      paid: 200000,
      due: 20000,
      unpaidOrders: 1,
    })
    expect(r.orders).toMatchObject({ confirmed: 1, awaiting: 1 })
    expect(r.byStaff).toEqual([{ userId: uid('trang'), name: 'Trang', amount: 220000, orders: 1 }])
    // Tiền thu ghi theo ngày nhận tiền (hôm nay), không theo ngày làm dịch vụ
    expect(r.receipts).toEqual([])
    const t = await dayReport(auth('linh'), { date: today })
    expect(t.receipts.find((x) => x.account === 'Tài khoản cs HTK')?.amount).toBeGreaterThanOrEqual(200000)
  })

  it('thợ không xem được báo cáo toàn quán', async () => {
    const e = await dayReport(auth('trang'), {}).catch((x) => x)
    expect((e as AppError).status).toBe(403)
    const m = await monthReport(auth('trang'), {}).catch((x) => x)
    expect((m as AppError).status).toBe(403)
  })
})

describe('Báo cáo tháng', () => {
  it('doanh thu theo ngày cộng lại bằng tổng tháng; theo dịch vụ, theo thợ; khách mới và quay lại', async () => {
    const month = addMonths(today.slice(0, 7), -12)
    const d1 = `${month}-03`
    const d2 = `${month}-17`
    const old = (await createCustomer(auth('nhung'), { name: 'Khách cũ báo cáo', phone: null })).customer
    const fresh = (await createCustomer(auth('nhung'), { name: 'Khách mới báo cáo', phone: null })).customer
    // Khách cũ có đơn trước tháng
    const prev = await order(addDays(d1, -40), [svc('CB01', 'trang')], old.id)
    await confirmOrder(auth('nhung'), prev.id, prev.version)
    for (const [d, items, c] of [
      [d1, [svc('CB02', 'trang'), svc('CB01', 'trang')], old.id],
      [d2, [svc('CB02', 'nhung')], fresh.id],
      [d2, [svc('MG03', 'nhung')], null],
    ] as const) {
      const o = await order(d, [...items], c)
      await confirmOrder(auth('nhung'), o.id, o.version)
    }
    const r = await monthReport(auth('linh'), { month })
    expect(r.revenue.net).toBe(110000 + 70000 + 220000)
    expect(r.byDay.reduce((s, x) => s + x.net, 0)).toBe(r.revenue.net)
    expect(r.byDay.map((x) => x.date)).toEqual([d1, d2])
    expect(r.byService.find((s) => s.name === 'Sơn gel trơn')).toMatchObject({ quantity: 2, net: 140000 })
    expect(r.byStaff.map((s) => [s.name, s.amount])).toEqual([
      ['Nhung', 290000],
      ['Trang', 110000],
    ])
    expect(r.customers).toEqual({ new: 1, returning: 1, walkIn: 1 })
  })
})

describe('Trang chủ (S14)', () => {
  it('Linh, Nhung: số toàn quán hôm nay, tháng, 30 ngày; thợ: chỉ số của mình, không có đã thu/còn nợ', async () => {
    const day = addDays(today, -3)
    const o = await order(day, [svc('CB02', 'trang')])
    await confirmOrder(auth('nhung'), o.id, o.version)
    const n = (await overview(auth('nhung'), { period: 'month' })).home
    expect(n.scope).toBe('branch')
    expect(n.series).toHaveLength(30)
    expect(n.series.at(-1)!.date).toBe(today)
    expect(n.today.paid).not.toBeNull()
    expect(n.series.find((s) => s.date === day)!.net).toBeGreaterThanOrEqual(70000)
    // Ngày trong chuỗi 30 ngày cộng lại khớp báo cáo theo ngày
    const r = await dayReport(auth('linh'), { date: day })
    expect(n.series.find((s) => s.date === day)!.net).toBe(r.revenue.net)

    const t = (await overview(auth('trang'), { period: 'month' })).home
    expect(t.scope).toBe('mine')
    expect(t.today.paid).toBeNull()
    expect(t.today.due).toBeNull()
    // Thợ chỉ thấy phần mình: không lớn hơn số toàn quán của ngày đó
    const mineDay = t.series.find((s) => s.date === day)!.net
    expect(mineDay).toBeGreaterThanOrEqual(70000)
    expect(mineDay).toBeLessThanOrEqual(n.series.find((s) => s.date === day)!.net)
  })

  it('S44 — Linh, Nhung có thêm số của chính mình (chỉ phần mình làm, không tính đơn tạo hộ); thợ không có', async () => {
    const day = addDays(today, -7)
    const a = await order(day, [svc('CB02', 'nhung')])
    await confirmOrder(auth('nhung'), a.id, a.version)
    const b = await order(day, [svc('MG03', 'trang')]) // Nhung tạo hộ, Trang làm
    await confirmOrder(auth('nhung'), b.id, b.version)
    const o = await overview(auth('nhung'), { period: 'month' })
    expect(o.home.scope).toBe('branch')
    const m = o.homeMine!
    expect(m.scope).toBe('mine')
    expect(m.series).toHaveLength(30)
    expect(m.today.paid).toBeNull()
    expect(m.today.due).toBeNull()
    const mineDay = m.series.find((s) => s.date === day)!.net
    const r = await dayReport(auth('linh'), { date: day })
    expect(mineDay).toBe(r.byStaff.find((s) => s.userId === uid('nhung'))!.amount)
    expect(mineDay).toBeLessThan(o.home.series.find((s) => s.date === day)!.net)
    expect((await overview(auth('trang'), { period: 'day' })).homeMine).toBeNull()
  })
})

describe('Tổng quan (UI02)', () => {
  it('Linh, Nhung thấy số toàn quán; thợ chỉ thấy doanh thu của mình; Linh thấy việc cần duyệt, cần xem lại', async () => {
    const lo = await overview(auth('linh'), { period: 'month' })
    expect(lo.revenue).not.toBeNull()
    expect(lo.mine).toBeNull()
    const to = await overview(auth('trang'), { period: 'day' })
    expect(to.revenue).toBeNull()
    expect(to.byStaff.every((s) => s.userId === uid('trang'))).toBe(true)
    expect(to.attention).toMatchObject({ awaiting: 0, ownerApproval: 0, review: 0 })
    // Đơn giảm 25% chờ Linh duyệt; Nhung sửa đơn đã xác nhận, thêm phần mình → Cần xem lại (P31; Q04 đã bỏ, S43)
    const before = await overview(auth('linh'), { period: 'day' })
    const { order: big } = await createOrder(auth('nhung'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [svc('MG03', 'nhung')],
      discounts: [{ scope: 'order', kind: 'manual', percent: 25, reason: 'Quen' }],
    })
    const own = await order(today, [svc('CB02', 'trang')])
    const c = await confirmOrder(auth('nhung'), own.id, own.version)
    expect(c.needsOwnerReview).toBe(false)
    await updateOrder(auth('nhung'), own.id, {
      version: c.version,
      customerId: null,
      serviceDate: today,
      items: [svc('CB02', 'trang'), svc('CB01', 'nhung')],
      discounts: [],
      adjustReason: 'Thêm cắt sửa',
    })
    const after = await overview(auth('linh'), { period: 'day' })
    expect(after.attention.ownerApproval).toBe(before.attention.ownerApproval + 1)
    expect(after.attention.review).toBe(before.attention.review + 1)
    // Nhung không thấy mục chỉ của Linh
    const nhung = await overview(auth('nhung'), { period: 'day' })
    expect(nhung.attention.review).toBe(0)
    expect(big.requiredLevel).toBe('owner')
  })
})
