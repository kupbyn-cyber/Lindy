// Kiểm thử nghiệm thu đơn hàng Đợt 2A: PRD §18 test 1, 3, 4, 15, 17, 21, 26, 28, 30, 31, 32, 45–50, 52
// và module lịch §13 test 26, 27, 28. (43 ở tests/integration/customers.test.ts; 51 ở tests/unit/catalog-search.test.ts.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ItemInput } from '../../src/lib/order-math'
import { addDays, toLocalDate } from '../../src/lib/time'
import {
  createAppointment,
  getAppointment,
  transitionAppointment,
  updateAppointment,
} from '../../src/server/appointments/service'
import { createCustomer } from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { recordPayment } from '../../src/server/orders/payments'
import type { CreateOrderInput } from '../../src/server/orders/schema'
import {
  approveDiscounts,
  cancelOrder,
  confirmOrder,
  createOrder,
  createOrderFromAppointment,
  getOrder,
  listOrders,
  markDone,
  markReviewed,
  updateOrder,
} from '../../src/server/orders/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed, toAwaiting } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const svcId: Record<string, string> = {}
const comboId: Record<string, string> = {}
const today = toLocalDate(new Date())

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
  for (const r of await owner<{ id: string; code: string }[]>`select id, code from services`)
    svcId[r.code] = r.id
  for (const r of await owner<{ id: string; code: string }[]>`select id, code from combos`)
    comboId[r.code] = r.id
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})

const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id

async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

const svc = (code: string, staff: SeedKey[], extra: Record<string, unknown> = {}): ItemInput =>
  ({
    type: 'service',
    serviceId: svcId[code]!,
    quantity: 1,
    staff: staff.map((k) => ({ userId: uid(k) })),
    ...extra,
  }) as ItemInput

const custom = (name: string, amount: number, staff: SeedKey[]): ItemInput => ({
  type: 'custom',
  name,
  amount,
  staff: staff.map((k) => ({ userId: uid(k) })),
})

// Đơn có ngày riêng để tổng doanh thu theo ngày không lẫn giữa các test (chỉ Nhung, Linh lùi ngày được).
let pastOffset = 20
const pastDay = () => addDays(today, -pastOffset++)

async function newOrder(k: SeedKey, over: Partial<CreateOrderInput> = {}) {
  const res = await createOrder(auth(k), {
    createRequestId: rid(),
    customerId: null,
    serviceDate: today,
    items: [],
    discounts: [],
    ...over,
  })
  return res.order
}

async function revenue(k: SeedKey, date: string) {
  return (await listOrders(auth(k), { from: date, to: date })).summary
}

describe('Tạo đơn, Làm xong, xác nhận', () => {
  it('15 — khách lẻ không SĐT vẫn lập đơn; 52 — Mắt mèo 10 ngón tự điền 70.000đ', async () => {
    const o = await newOrder('trang', { items: [svc('DS01', ['trang'], { quantity: 10 })] })
    expect(o.status).toBe('in_progress')
    expect(o.customer).toBeNull()
    expect(o.netAmount).toBe(70000)
    expect(o.items[0]!.unitPrice).toBe(7000)
    expect(o.codeLabel).toMatch(/^#\d{4}$/)
  })

  it('21, S41 — thợ bấm Làm xong là xác nhận bill luôn, không chờ Nhung, Linh', async () => {
    const o = await newOrder('trang', { items: [svc('CB02', ['trang'])] })
    expect(o.can.confirm).toBe(true)
    // Chin (quyền lịch mở rộng) không thấy đơn không phải của mình (K09)
    expect((await err(markDone(auth('chin'), o.id, o.version))).status).toBe(404)
    expect((await err(confirmOrder(auth('chin'), o.id, o.version))).status).toBe(404)
    const done = await markDone(auth('trang'), o.id, o.version)
    expect(done.status).toBe('confirmed')
    expect(done.confirmedAt).not.toBeNull()
    expect(done.warrantyUntil).toBe(addDays(today, 3))
    const [hist] = await owner<{ actions: string[] }[]>`
      select array_agg(action order by id) as actions from order_audit_events where order_id = ${o.id}`
    expect(hist!.actions.slice(-2)).toEqual(['done', 'confirmed'])
  })

  it('Làm xong bị chặn khi đơn trống hoặc còn dòng chưa chọn thợ', async () => {
    const empty = await newOrder('trang')
    expect((await err(markDone(auth('trang'), empty.id, empty.version))).message).toMatch(/chưa có dịch vụ/)
    const o = await newOrder('trang', { items: [svc('CB02', [])] })
    expect((await err(markDone(auth('trang'), o.id, o.version))).message).toMatch(/chưa chọn thợ/)
  })

  it('30, S41 — Làm xong là xác nhận luôn → vào doanh thu ngày làm dịch vụ; đơn Chờ xác nhận chưa vào', async () => {
    const day = pastDay()
    const o = await newOrder('nhung', { serviceDate: day, items: [svc('MG03', ['chin'])] })
    // Đơn Chờ xác nhận (có từ trước S41, hoặc chờ duyệt giảm giá) chưa vào doanh thu
    await toAwaiting(owner, o.id)
    let s = await revenue('linh', day)
    expect(s.netAmount).toBe(0)
    expect(s.awaitingCount).toBe(1)
    const waiting = await getOrder(auth('nhung'), o.id)
    await confirmOrder(auth('nhung'), o.id, waiting.version)
    s = await revenue('linh', day)
    expect(s.netAmount).toBe(220000)
    expect(s.byStaff).toEqual([{ userId: uid('chin'), name: 'Chin', amount: 220000 }])

    const day2 = pastDay()
    const o2 = await newOrder('nhung', { serviceDate: day2, items: [svc('MG03', ['chin'])] })
    expect((await markDone(auth('nhung'), o2.id, o2.version)).status).toBe('confirmed')
    s = await revenue('linh', day2)
    expect([s.netAmount, s.awaitingCount]).toEqual([220000, 0])
  })

  it('31 — đơn làm ngày trước, xác nhận hôm nay → doanh thu ghi ngày làm dịch vụ', async () => {
    const day = pastDay()
    const o = await newOrder('nhung', { serviceDate: day, items: [svc('CB02', ['trang'])] })
    await confirmOrder(auth('nhung'), o.id, o.version)
    expect((await revenue('linh', day)).netAmount).toBe(70000)
    const before = (await revenue('linh', today)).netAmount ?? 0
    const again = (await revenue('linh', today)).netAmount ?? 0
    expect(again).toBe(before)
  })

  it('1 — bill 348.000đ chia Nhung 239.000đ, Chin 109.000đ → doanh thu quán 348.000đ', async () => {
    const day = pastDay()
    const o = await newOrder('nhung', {
      serviceDate: day,
      items: [custom('Đắp gel + vẽ', 239000, ['nhung']), custom('Sơn gel + mắt mèo', 109000, ['chin'])],
    })
    await confirmOrder(auth('linh'), o.id, o.version)
    const s = await revenue('linh', day)
    expect(s.netAmount).toBe(348000)
    expect(s.byStaff).toEqual([
      { userId: uid('nhung'), name: 'Nhung', amount: 239000 },
      { userId: uid('chin'), name: 'Chin', amount: 109000 },
    ])
  })

  it('4 — giảm 10% đơn nhiều thợ → tổng phần chia khớp doanh thu thuần', async () => {
    const o = await newOrder('nhung', {
      serviceDate: pastDay(),
      items: [
        svc('MG03', ['nhung']),
        svc('DS06', ['chin'], { quantity: 7, unitPrice: 13000 }),
        svc('CB08', ['trang']),
      ],
      discounts: [{ scope: 'order', kind: 'preset_10' }],
    })
    const total = o.items.flatMap((i) => i.staff).reduce((a, s) => a + s.allocatedNetAmount, 0)
    expect(total).toBe(o.netAmount)
    expect(o.discountAmount).toBe(Math.round(o.grossAmount / 10))
    const c = await confirmOrder(auth('nhung'), o.id, o.version)
    expect(c.status).toBe('confirmed')
  })

  it('49 — combo 139k do Chin và Trang làm: 80.000đ + 59.000đ lưu được; lệch tổng không lưu được', async () => {
    const combo = (a: number, b: number): ItemInput => ({
      type: 'combo',
      comboId: comboId.CBO139!,
      staff: [
        { userId: uid('chin'), amount: a },
        { userId: uid('trang'), amount: b },
      ],
    })
    const o = await newOrder('trang', { items: [combo(80000, 59000)] })
    expect(o.items[0]!.staff.map((s) => s.allocatedNetAmount).sort()).toEqual([59000, 80000])
    expect((await err(newOrder('trang', { items: [combo(80000, 50000)] }))).status).toBe(422)
  })

  it('48 — sinh nhật 10% trên combo 199k → 179.100đ (thợ tự áp được)', async () => {
    const o = await newOrder('trang', {
      items: [{ type: 'combo', comboId: comboId.CBO199!, staff: [{ userId: uid('trang') }] }],
      discounts: [{ scope: 0, kind: 'birthday' }],
    })
    expect(o.netAmount).toBe(179100)
    expect(o.requiredLevel).toBe('staff')
  })

  it('50 — bill có Cứng móng (2 lớp) → bảo hành 7 ngày; chỉ Sơn gel trơn → 3 ngày', async () => {
    const day = pastDay()
    const hard = await newOrder('nhung', {
      serviceDate: day,
      items: [svc('CB03', ['nhung']), svc('CB02', ['nhung'])],
    })
    expect((await confirmOrder(auth('linh'), hard.id, hard.version)).warrantyUntil).toBe(addDays(day, 7))
    const soft = await newOrder('nhung', { serviceDate: day, items: [svc('CB02', ['nhung'])] })
    expect((await confirmOrder(auth('linh'), soft.id, soft.version)).warrantyUntil).toBe(addDays(day, 3))
  })

  it('17 (tạo đơn) — bấm lưu hai lần cùng mã → một đơn; cùng mã khác nội dung → 422', async () => {
    const body: CreateOrderInput = {
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [svc('CB02', ['trang'])],
      discounts: [],
    }
    const [a, b] = await Promise.all([createOrder(auth('trang'), body), createOrder(auth('trang'), body)])
    expect(a.order.id).toBe(b.order.id)
    const e = await err(createOrder(auth('trang'), { ...body, items: [svc('CB01', ['trang'])] }))
    expect(e.status).toBe(422)
  })
})

describe('Giảm giá và duyệt (C15, K12)', () => {
  it('32 — thợ áp 10% được; 15% cần Nhung; Nhung 20% được; 25% cần Linh', async () => {
    const ten = await newOrder('trang', {
      items: [svc('CB02', ['trang'])],
      discounts: [{ scope: 'order', kind: 'preset_10' }],
    })
    expect(ten.requiredLevel).toBe('staff')
    expect((await confirmOrder(auth('nhung'), ten.id, ten.version)).status).toBe('confirmed')

    const fifteen = await newOrder('trang', {
      items: [svc('CB02', ['trang'])],
      discounts: [{ scope: 'order', kind: 'manual', percent: 15, reason: 'Khách quen' }],
    })
    expect(fifteen.requiredLevel).toBe('manager')
    expect(fifteen.approval).toBeNull()
    const c15 = await confirmOrder(auth('nhung'), fifteen.id, fifteen.version)
    expect(c15.approval).toMatchObject({ byName: 'Nhung', level: 'manager', valid: true })

    const twenty = await newOrder('nhung', {
      items: [svc('CB02', ['nhung'])],
      discounts: [{ scope: 'order', kind: 'manual', percent: 20, reason: 'Khai trương' }],
    })
    expect(twenty.approval).toMatchObject({ byName: 'Nhung', valid: true })

    const t25 = await newOrder('nhung', {
      items: [svc('CB02', ['nhung'])],
      discounts: [{ scope: 'order', kind: 'manual', percent: 25, reason: 'Bạn chủ quán' }],
    })
    expect(t25.requiredLevel).toBe('owner')
    expect(t25.can.confirm).toBe(false)
    expect(t25.can.confirmBlocked).toMatch(/Linh/)
    expect((await err(confirmOrder(auth('nhung'), t25.id, t25.version))).status).toBe(403)
    expect((await err(approveDiscounts(auth('nhung'), t25.id, t25.version))).status).toBe(403)
    const approved = await approveDiscounts(auth('linh'), t25.id, t25.version)
    expect(approved.approval).toMatchObject({ byName: 'Linh', level: 'owner', valid: true })
    expect((await confirmOrder(auth('nhung'), t25.id, approved.version)).status).toBe('confirmed')
  })

  it('47 — thợ áp 5% + sinh nhật 10% = 15% → cần Nhung duyệt', async () => {
    const o = await newOrder('trang', {
      items: [svc('CB02', ['trang'])],
      discounts: [
        { scope: 0, kind: 'preset_5' },
        { scope: 0, kind: 'birthday' },
      ],
    })
    expect(o.requiredLevel).toBe('manager')
    expect(o.netAmount).toBe(59500)
  })

  it('S41 — giảm giá chờ duyệt: Làm xong sang Chờ xác nhận, không tự duyệt; duyệt xong thợ tự xác nhận được', async () => {
    const fifteen = () =>
      newOrder('trang', {
        items: [svc('CB02', ['trang'])],
        discounts: [{ scope: 'order', kind: 'manual', percent: 15, reason: 'Khách quen' }],
      })
    const o = await fifteen()
    const done = await markDone(auth('trang'), o.id, o.version)
    expect(done.status).toBe('awaiting_confirmation')
    expect(done.can.confirm).toBe(false)
    expect(done.can.confirmBlocked).toMatch(/Nhung/)
    expect((await err(confirmOrder(auth('trang'), o.id, done.version))).status).toBe(403)
    const approved = await approveDiscounts(auth('nhung'), o.id, done.version)
    const c = await confirmOrder(auth('trang'), o.id, approved.version)
    expect(c.status).toBe('confirmed')
    expect(c.approval).toMatchObject({ byName: 'Nhung', valid: true })

    // Nhung bấm Làm xong đơn cần Nhung duyệt: vẫn sang Chờ xác nhận, Nhung bấm Xác nhận bill là duyệt
    const o2 = await fifteen()
    const d2 = await markDone(auth('nhung'), o2.id, o2.version)
    expect(d2.status).toBe('awaiting_confirmation')
    expect(d2.approval).toBeNull()
    expect(d2.can.confirm).toBe(true)
  })

  it('46 — Phá móng cũ: 15.000đ thành giảm cần lý do và Nhung duyệt; 60.000đ có nhãn vượt khoảng', async () => {
    const noReason = await err(newOrder('trang', { items: [svc('CB07', ['trang'], { unitPrice: 15000 })] }))
    expect(noReason.status).toBe(422)
    const low = await newOrder('trang', {
      items: [svc('CB07', ['trang'], { unitPrice: 15000, belowReason: 'Móng ít' })],
    })
    expect(low.requiredLevel).toBe('manager')
    expect(low.discounts).toEqual([
      expect.objectContaining({ kind: 'below_list', amount: 5000, reason: 'Móng ít' }),
    ])
    const high = await newOrder('trang', { items: [svc('CB07', ['trang'], { unitPrice: 60000 })] })
    expect(high.items[0]!.outOfRange).toBe(true)
    expect(high.hasOutOfRange).toBe(true)
    expect(high.requiredLevel).toBe('none')
  })

  it('28 — giảm giá có lý do và người duyệt; giảm khác thiếu lý do không lưu được', async () => {
    const e = await err(
      newOrder('trang', {
        items: [svc('CB02', ['trang'])],
        discounts: [{ scope: 0, kind: 'manual', percent: 5 }],
      }),
    )
    expect(e.status).toBe(422)
    const o = await newOrder('trang', {
      items: [svc('CB02', ['trang'])],
      discounts: [{ scope: 0, kind: 'manual', amount: 14000, reason: 'Lỗi màu lần trước' }],
    })
    expect(o.discounts[0]).toMatchObject({ reason: 'Lỗi màu lần trước', appliedByName: 'Trang' })
    const c = await confirmOrder(auth('nhung'), o.id, o.version)
    expect(c.approval).toMatchObject({ byName: 'Nhung', valid: true })
  })
})

describe('Thu tiền', () => {
  it('3 — đơn 500.000đ thu 300.000đ trước, 200.000đ sau → doanh thu 500.000đ, lần sau chỉ tăng tiền thu', async () => {
    const day = pastDay()
    const o = await newOrder('nhung', { serviceDate: day, items: [custom('Đắp gel', 500000, ['nhung'])] })
    const c = await confirmOrder(auth('linh'), o.id, o.version)
    let d = await recordPayment(auth('nhung'), c.id, {
      idempotencyKey: rid(),
      amount: 300000,
      method: 'transfer',
    })
    expect(d.paymentStatus).toBe('partial')
    expect(d.dueAmount).toBe(200000)
    let s = await revenue('linh', day)
    expect([s.netAmount, s.paidAmount, s.dueAmount]).toEqual([500000, 300000, 200000])
    d = await recordPayment(auth('nhung'), c.id, { idempotencyKey: rid(), amount: 200000, method: 'cash' })
    expect(d.paymentStatus).toBe('paid')
    expect(d.payments.map((p) => p.accountName)).toEqual(['Tài khoản cs HTK', 'Tiền mặt cs HTK'])
    s = await revenue('linh', day)
    expect([s.netAmount, s.paidAmount, s.dueAmount]).toEqual([500000, 500000, 0])
  })

  it('17 — bấm lưu thanh toán hai lần → một khoản thu', async () => {
    const o = await newOrder('nhung', { items: [svc('CB02', ['nhung'])] })
    const key = rid()
    const body = { idempotencyKey: key, amount: 70000, method: 'cash' as const }
    // Đơn Đang làm chưa thu được
    expect((await err(recordPayment(auth('nhung'), o.id, body))).status).toBe(422)
    const done = await markDone(auth('nhung'), o.id, o.version)
    const [a, b] = await Promise.all([
      recordPayment(auth('nhung'), done.id, body),
      recordPayment(auth('nhung'), done.id, body),
    ])
    expect(a.payments.filter((p) => !p.voided)).toHaveLength(1)
    expect(b.payments.filter((p) => !p.voided)).toHaveLength(1)
    const [n] = await owner<
      { n: number }[]
    >`select count(*)::int as n from payments where idempotency_key = ${key}`
    expect(n!.n).toBe(1)
  })

  it('không thu quá số còn phải thu; huỷ khoản nhập nhầm rồi ghi lại được', async () => {
    const o = await newOrder('nhung', { items: [svc('CB02', ['nhung'])] })
    const c = await confirmOrder(auth('nhung'), o.id, o.version)
    expect(
      (
        await err(
          recordPayment(auth('nhung'), c.id, { idempotencyKey: rid(), amount: 80000, method: 'cash' }),
        )
      ).status,
    ).toBe(422)
    const p = await recordPayment(auth('nhung'), c.id, {
      idempotencyKey: rid(),
      amount: 70000,
      method: 'cash',
    })
    const { voidPayment } = await import('../../src/server/orders/payments')
    const v = await voidPayment(auth('nhung'), p.payments[0]!.id, 'Nhập nhầm, khách chuyển khoản')
    expect(v.paymentStatus).toBe('unpaid')
    const again = await recordPayment(auth('nhung'), c.id, {
      idempotencyKey: rid(),
      amount: 70000,
      method: 'transfer',
    })
    expect(again.paymentStatus).toBe('paid')
  })

  it('huỷ đơn: cần lý do; đơn có khoản thu thì phải huỷ khoản thu trước', async () => {
    const o = await newOrder('trang', { items: [svc('CB02', ['trang'])] })
    const c = await cancelOrder(auth('trang'), o.id, o.version, 'Khách đổi ý không làm')
    expect(c.status).toBe('cancelled')
    expect(c.cancelReason).toBe('Khách đổi ý không làm')
    const o2 = await newOrder('nhung', { items: [svc('CB02', ['nhung'])] })
    const d2 = await markDone(auth('nhung'), o2.id, o2.version)
    const p2 = await recordPayment(auth('nhung'), d2.id, {
      idempotencyKey: rid(),
      amount: 70000,
      method: 'cash',
    })
    expect((await err(cancelOrder(auth('nhung'), o2.id, p2.version, 'Thử'))).status).toBe(422)
  })

  it('S43 — thợ ghi tiền thu đơn của mình; không huỷ khoản thu; không ghi được đơn không thấy (API, SQL)', async () => {
    const o = await newOrder('trang', { items: [svc('CB02', ['trang'])] })
    const done = await markDone(auth('trang'), o.id, o.version)
    expect(done.can).toMatchObject({ recordPayment: true, voidPayment: false })
    const paid = await recordPayment(auth('trang'), o.id, {
      idempotencyKey: rid(),
      amount: 70000,
      method: 'cash',
    })
    expect(paid.paymentStatus).toBe('paid')
    expect(paid.payments[0]).toMatchObject({
      amount: 70000,
      recordedByName: 'Trang',
      accountName: 'Tiền mặt cs HTK',
    })
    const { voidPayment } = await import('../../src/server/orders/payments')
    expect((await err(voidPayment(auth('trang'), paid.payments[0]!.id, 'Nhầm'))).status).toBe(403)

    // Đơn của Nhung, Trang không có phần: không thấy (K09) nên không ghi được
    const n = await newOrder('nhung', { items: [svc('CB02', ['nhung'])] })
    const nd = await markDone(auth('nhung'), n.id, n.version)
    const body = { idempotencyKey: rid(), amount: 70000, method: 'cash' as const }
    expect((await err(recordPayment(auth('trang'), nd.id, body))).status).toBe(404)
    const [cash] = await owner<{ id: string }[]>`
      select id from money_accounts where branch_id = ${nd.branchId} and type = 'cash' order by code limit 1`
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`
          insert into payments (order_id, branch_id, amount, method, money_account_id, recorded_by, idempotency_key)
          values (${nd.id}, ${nd.branchId}, 70000, 'cash', ${cash!.id}, ${uid('trang')}, ${rid()})`,
      ),
      ['42501', 'P0001'], // trigger không thấy đơn (RLS) nên chặn trước cả RLS của khoản thu
    )
  })
})

describe('Cần xem lại (S43 bỏ Q04)', () => {
  it('45, S43 — tự xác nhận đơn có phần mình (Nhung, thợ bấm Làm xong) không vào Cần xem lại', async () => {
    const o = await newOrder('nhung', { items: [svc('CB02', ['nhung'])] })
    expect((await confirmOrder(auth('nhung'), o.id, o.version)).needsOwnerReview).toBe(false)
    const t = await newOrder('trang', { items: [svc('CB02', ['trang'])] })
    expect((await markDone(auth('trang'), t.id, t.version)).needsOwnerReview).toBe(false)
    const list = await listOrders(auth('linh'), { from: today, to: today, review: true })
    expect(list.items.map((i) => i.id)).not.toContain(o.id)
    expect(list.items.map((i) => i.id)).not.toContain(t.id)
    // Không có gì để xem lại thì không bấm "Đã xem lại" được
    expect((await err(markReviewed(auth('linh'), o.id))).status).toBeGreaterThanOrEqual(400)
  })
})

describe('Khách hàng trên đơn', () => {
  it('26 — khách ở hai cơ sở: hồ sơ chung, đơn đúng cơ sở', async () => {
    const { customer } = await createCustomer(auth('mai'), {
      name: 'Khách đi hai cơ sở',
      phone: '0977000222',
    })
    const cs2 = await newOrder('mai', { customerId: customer.id, items: [svc('CB02', ['mai'])] })
    const htk = await newOrder('trang', { customerId: customer.id, items: [svc('CB02', ['trang'])] })
    expect(cs2.branchId).toBe(seed().branchIds.CS2)
    expect(htk.branchId).toBe(seed().branchIds.HTK)
    expect(htk.customer).toMatchObject({ id: customer.id, name: 'Khách đi hai cơ sở' })
    expect((await err(getOrder(auth('mai'), htk.id))).status).toBe(404)
  })
})

describe('Tạo đơn từ lịch (module §13 test 26–28)', () => {
  let dayOffset = 0
  const apptInput = (guestCount = 1) => ({
    customerDisplayName: 'Thu Hà',
    phone: `0966${String(100000 + dayOffset++).slice(-6)}`,
    date: today,
    startTime: '09:00',
    endTime: '10:00',
    guestCount,
    serviceSummary: 'sơn gel',
    notes: null,
    createRequestId: rid(),
  })

  it('26 — tạo đơn từ lịch: đơn gắn lịch, mang khách; lịch sang Đang làm; chưa có doanh thu', async () => {
    const { appointment } = await createAppointment(auth('trang'), apptInput())
    const { order } = await createOrderFromAppointment(auth('trang'), appointment.id, {
      createRequestId: rid(),
    })
    expect(order.appointment?.id).toBe(appointment.id)
    expect(order.customer?.name).toBe('Thu Hà')
    expect(order.status).toBe('in_progress')
    expect(order.netAmount).toBe(0)
    const a = await getAppointment(auth('trang'), appointment.id)
    expect(a.status).toBe('in_progress')
    expect(a.orders).toEqual([expect.objectContaining({ id: order.id, codeLabel: order.codeLabel })])
    const [hist] = await owner<{ actions: string[] }[]>`
      select array_agg(action order by id) as actions from appointment_audit_events where appointment_id = ${appointment.id}`
    expect(hist!.actions).toEqual(['created_confirmed', 'customer_linked', 'arrived', 'in_progress'])
    // Lịch có đơn: không bấm tay Hoàn thành được
    expect(a.can.complete).toBe(false)
  })

  it('27, S41 — đơn tạo từ lịch, thợ bấm Làm xong (xác nhận luôn) → lịch Hoàn thành', async () => {
    const { appointment } = await createAppointment(auth('trang'), apptInput())
    const { order } = await createOrderFromAppointment(auth('trang'), appointment.id, {
      createRequestId: rid(),
    })
    const saved = await updateOrder(auth('trang'), order.id, {
      version: order.version,
      customerId: order.customer!.id,
      serviceDate: order.serviceDate,
      items: [svc('CB02', ['trang'])],
      discounts: [],
    })
    const done = await markDone(auth('trang'), saved.id, saved.version)
    expect(done.status).toBe('confirmed')
    expect((await getAppointment(auth('trang'), appointment.id)).status).toBe('completed')
  })

  it('S57 — Nhung tạo khách 1, Chin tạo khách 2; không trùng và không đóng lịch sớm', async () => {
    const { appointment } = await createAppointment(auth('trang'), apptInput(2))
    const rq = rid()
    const a = await createOrderFromAppointment(auth('nhung'), appointment.id, {
      createRequestId: rq,
      guestNo: 1,
    })
    expect(a.orders).toHaveLength(1)
    expect(a.order.appointment?.guestNo).toBe(1)
    expect(
      (await createOrderFromAppointment(auth('nhung'), appointment.id, { createRequestId: rq, guestNo: 1 }))
        .order.id,
    ).toBe(a.order.id)
    expect(
      (
        await err(
          createOrderFromAppointment(auth('nhung'), appointment.id, { createRequestId: rq, guestNo: 2 }),
        )
      ).status,
    ).toBe(422)
    const s1 = await updateOrder(auth('nhung'), a.order.id, {
      version: a.order.version,
      customerId: a.order.customer!.id,
      serviceDate: today,
      items: [svc('CB02', ['trang'])],
      discounts: [],
    })
    await confirmOrder(auth('nhung'), s1.id, s1.version)
    expect((await getAppointment(auth('nhung'), appointment.id)).status).toBe('in_progress')
    const results = await Promise.allSettled([
      createOrderFromAppointment(auth('chin'), appointment.id, { createRequestId: rid(), guestNo: 2 }),
      createOrderFromAppointment(auth('trang'), appointment.id, { createRequestId: rid(), guestNo: 2 }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const detail = await getAppointment(auth('nhung'), appointment.id)
    expect(detail.orders.map((o) => o.guestNo)).toEqual([1, 2])
    const o2 = detail.orders.find((o) => o.guestNo === 2)!
    expect(
      (
        await err(
          updateOrder(auth('trang'), a.order.id, {
            version: s1.version,
            customerId: a.order.customer!.id,
            serviceDate: today,
            items: [svc('CB02', ['trang'])],
            discounts: [],
          }),
        )
      ).status,
    ).toBe(403)
    await cancelOrder(auth('nhung'), o2.id, 1, 'Khách thứ hai không làm')
    expect((await getAppointment(auth('nhung'), appointment.id)).status).toBe('in_progress')
    const cur = await getAppointment(auth('nhung'), appointment.id)
    await updateAppointment(auth('nhung'), appointment.id, { version: cur.version, guestCount: 1 })
    expect((await getAppointment(auth('nhung'), appointment.id)).status).toBe('completed')
  })

  it('S06 — khách đi cùng có tên, SĐT: tạo hồ sơ riêng; SĐT sai → 422, không tạo đơn nào', async () => {
    const { appointment } = await createAppointment(auth('trang'), apptInput(3))
    const bad = await err(
      createOrderFromAppointment(auth('trang'), appointment.id, {
        createRequestId: rid(),
        guestNo: 2,
        guests: [{ guestNo: 2, name: 'Lan', phone: '12ab' }],
      }),
    )
    expect(bad.status).toBe(422)
    expect((await getAppointment(auth('nhung'), appointment.id)).orders).toHaveLength(0)
    const res = await createOrderFromAppointment(auth('trang'), appointment.id, {
      createRequestId: rid(),
      guestNo: 2,
      guests: [
        { guestNo: 2, name: 'Lan', phone: '0911 222 444' },
        { guestNo: 3, name: '', phone: null },
      ],
    })
    expect(res.orders.map((o) => o.customer?.name ?? o.guestLabel)).toEqual(['Lan'])
    expect(res.orders[0]!.customer?.phone).toBe('0911222444')
  })

  it('S08 — số đơn luôn bằng số khách: tăng số khách thì Tạo đơn ra thêm đơn; giảm dưới khách đã có đơn → chặn', async () => {
    const { appointment } = await createAppointment(auth('nhung'), apptInput(2))
    const first = await createOrderFromAppointment(auth('nhung'), appointment.id, { createRequestId: rid() })
    expect(first.orders).toHaveLength(1)
    await createOrderFromAppointment(auth('chin'), appointment.id, { createRequestId: rid(), guestNo: 2 })
    const d = await getAppointment(auth('nhung'), appointment.id)
    const up = await updateAppointment(auth('nhung'), appointment.id, { version: d.version, guestCount: 3 })
    const more = await createOrderFromAppointment(auth('nhung'), appointment.id, { createRequestId: rid() })
    expect(more.orders.map((o) => o.appointment?.guestNo)).toEqual([3])
    // Giảm về 1 khi khách 2, 3 còn đơn → chặn (API và DB)
    const e = await err(
      updateAppointment(auth('nhung'), appointment.id, { version: up.version, guestCount: 1 }),
    )
    expect(e.status).toBe(422)
    // Huỷ đơn khách 3 rồi giảm về 2 → được
    const o3 = more.orders[0]!
    await cancelOrder(auth('nhung'), o3.id, o3.version, 'Khách 3 không đến')
    const cur = await getAppointment(auth('nhung'), appointment.id)
    const down = await updateAppointment(auth('nhung'), appointment.id, {
      version: cur.version,
      guestCount: 2,
    })
    expect(down.guestCount).toBe(2)
    // Thêm đơn vượt số khách ở DB → chặn
    await expectPgError(
      withUser(
        seed().users.nhung!.id,
        (tx) =>
          tx`insert into orders (branch_id, appointment_id, service_date, created_by, updated_by, create_request_id,
                                 create_request_hash, guest_no)
             values (${seed().branchIds.HTK!}, ${appointment.id}, current_date, ${seed().users.nhung!.id},
                     ${seed().users.nhung!.id}, gen_random_uuid(), repeat('a', 64), 4)`,
      ),
      ['P0001', '23505'],
    )
  })

  it('huỷ đơn duy nhất của lịch → lịch về Khách đã đến; lịch huỷ thì không tạo đơn được', async () => {
    const { appointment } = await createAppointment(auth('trang'), apptInput())
    const { order } = await createOrderFromAppointment(auth('trang'), appointment.id, {
      createRequestId: rid(),
    })
    await cancelOrder(auth('trang'), order.id, order.version, 'Tạo nhầm')
    expect((await getAppointment(auth('trang'), appointment.id)).status).toBe('arrived')

    const other = await createAppointment(auth('trang'), apptInput())
    const cancelled = await transitionAppointment(auth('chin'), other.appointment.id, 'cancel', {
      version: 1,
      reason: 'Khách huỷ',
    })
    expect(cancelled.status).toBe('cancelled')
    expect(
      (await err(createOrderFromAppointment(auth('trang'), other.appointment.id, { createRequestId: rid() })))
        .status,
    ).toBe(422)
  })

  it('lịch có SĐT trùng hồ sơ khách cùng tên → dùng lại hồ sơ, không tạo trùng', async () => {
    const { customer } = await createCustomer(auth('trang'), { name: 'Minh Châu', phone: '0955123456' })
    const { appointment } = await createAppointment(auth('trang'), {
      ...apptInput(),
      customerDisplayName: 'minh chau',
      phone: '0955 123 456',
    })
    const { order } = await createOrderFromAppointment(auth('trang'), appointment.id, {
      createRequestId: rid(),
    })
    expect(order.customer?.id).toBe(customer.id)
  })
})
