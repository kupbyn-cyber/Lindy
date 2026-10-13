// Nghiệm thu Đợt 2B: sửa đơn đã xác nhận (D04, bước 2.19, S27/P31); phiếu xử lý bảo hành và ưu đãi bù khiếu nại
// (bước 2.18, PRD §6.7, §13F, test 33, 50).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ItemInput } from '../../src/lib/order-math'
import { addDays, toLocalDate } from '../../src/lib/time'
import { createCustomer } from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { recordPayment } from '../../src/server/orders/payments'
import type { CreateOrderInput } from '../../src/server/orders/schema'
import {
  approveDiscounts,
  confirmOrder,
  createOrder,
  listOrders,
  markReviewed,
  orderAudit,
  updateOrder,
} from '../../src/server/orders/service'
import { createTicket, customerCompensations, voidTicket } from '../../src/server/orders/tickets'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const svcId: Record<string, string> = {}
const today = toLocalDate(new Date())

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  for (const r of await owner<{ id: string; code: string }[]>`select id, code from services`)
    svcId[r.code] = r.id
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

let off = 70
const pastDay = () => addDays(today, -off++)

async function confirmed(over: Partial<CreateOrderInput> & { items: ItemInput[] }, by: SeedKey = 'nhung') {
  const { order } = await createOrder(auth(by), {
    createRequestId: rid(),
    customerId: null,
    serviceDate: today,
    discounts: [],
    ...over,
  })
  return confirmOrder(auth('nhung'), order.id, order.version)
}

const body = (o: { version: number; customer: { id: string } | null; serviceDate: string }) => ({
  version: o.version,
  customerId: o.customer?.id ?? null,
  serviceDate: o.serviceDate,
})

describe('2.19 Sửa đơn đã xác nhận (D04)', () => {
  it('Nhung sửa có lý do → doanh thu ngày làm dịch vụ đổi theo, hạn bảo hành tính lại, có lịch sử', async () => {
    const day = pastDay()
    const o = await confirmed({ serviceDate: day, items: [svc('CB02', ['trang'])] })
    expect(o.warrantyUntil).toBe(addDays(day, 3))
    const noReason = await err(
      updateOrder(auth('nhung'), o.id, {
        ...body(o),
        items: [svc('CB02', ['trang']), svc('CB03', ['trang'])],
        discounts: [],
      }),
    )
    expect(noReason.status).toBe(422)
    const adj = await updateOrder(auth('nhung'), o.id, {
      ...body(o),
      items: [svc('CB02', ['trang']), svc('CB03', ['trang'])],
      discounts: [],
      adjustReason: 'Quên ghi cứng móng',
    })
    expect(adj.status).toBe('confirmed')
    expect(adj.netAmount).toBe(120000)
    expect(adj.warrantyUntil).toBe(addDays(day, 7))
    expect(adj.adjustReason).toBe('Quên ghi cứng móng')
    expect(adj.adjustedByName).toBe('Nhung')
    expect((await listOrders(auth('linh'), { from: day, to: day })).summary.netAmount).toBe(120000)
    const audit = await orderAudit(auth('nhung'), o.id)
    expect(audit.at(-1)).toMatchObject({
      action: 'adjusted',
      reason: 'Quên ghi cứng móng',
      actorName: 'Nhung',
    })
  })

  it('thợ không sửa được đơn đã xác nhận; tổng mới nhỏ hơn số đã thu → 422 (dùng Hoàn tiền, Đợt 3)', async () => {
    const o = await confirmed({ items: [svc('MG03', ['trang'])] })
    expect(
      (
        await err(
          updateOrder(auth('trang'), o.id, {
            ...body(o),
            items: [svc('CB02', ['trang'])],
            discounts: [],
            adjustReason: 'x',
          }),
        )
      ).status,
    ).toBe(403)
    const paid = await recordPayment(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 220000,
      method: 'cash',
    })
    const e = await err(
      updateOrder(auth('nhung'), o.id, {
        ...body(paid),
        items: [svc('CB02', ['trang'])],
        discounts: [],
        adjustReason: 'Nhầm dịch vụ',
      }),
    )
    expect(e.status).toBe(422)
    expect(e.message).toMatch(/Hoàn tiền/)
  })

  it('S27 — Nhung sửa đơn đã xác nhận để thêm phần của mình → vào lại Cần xem lại của Linh', async () => {
    const o = await confirmed({ items: [svc('CB02', ['trang'])] })
    expect(o.needsOwnerReview).toBe(false)
    const adj = await updateOrder(auth('nhung'), o.id, {
      ...body(o),
      items: [svc('CB02', ['trang']), svc('CB01', ['nhung'])],
      discounts: [],
      adjustReason: 'Thêm cắt sửa',
    })
    expect(adj.needsOwnerReview).toBe(true)
    const list = await listOrders(auth('linh'), { from: today, to: today, review: true })
    expect(list.items.map((i) => i.id)).toContain(o.id)
    // Linh đã xem; Nhung sửa lần nữa có phần mình → vào lại danh sách
    const reviewed = await markReviewed(auth('linh'), o.id)
    expect(reviewed.reviewedByName).toBe('Linh')
    const again = await updateOrder(auth('nhung'), o.id, {
      ...body(reviewed),
      items: [svc('CB02', ['trang']), svc('CB01', ['nhung'], { unitPrice: 45000 })],
      discounts: [],
      adjustReason: 'Sửa giá cắt',
    })
    expect(again.needsOwnerReview).toBe(true)
    expect(again.reviewedByName).toBeNull()
  })

  it('S27 (SQL) — sửa thẳng DB thêm phần của người sửa mà không vào Cần xem lại → lỗi khi commit', async () => {
    const o = await confirmed({ items: [svc('CB02', ['trang'])] })
    await expectPgError(
      withUser(uid('nhung'), async (tx) => {
        const [r] = await tx<{ rev: number }[]>`
          update orders set content_rev = content_rev + 1, adjust_reason = 'lách' where id = ${o.id} returning content_rev as rev`
        await tx`
          insert into order_items (order_id, rev, position, line_type, service_id, name, unit, price_mode, list_min,
            list_max, unit_price, quantity, gross_amount, line_discount_amount, order_discount_amount, discount_amount,
            net_amount)
          values (${o.id}, ${r!.rev}, 0, 'service', ${svcId.CB02!}, 'Sơn gel trơn', 'lần', 'list', 70000, 70000, 70000, 1,
                  70000, 0, 0, 0, 70000)`
        await tx`
          insert into order_staff_allocations (order_id, rev, item_position, staff_user_id, allocated_net_amount,
            commission_base_amount)
          values (${o.id}, ${r!.rev}, 0, ${uid('nhung')}, 70000, 70000)`
      }),
      'P0001',
    )
  })

  it('đơn giảm 25% Linh đã duyệt: Nhung đổi giá → 403; chỉ đổi thợ thì được', async () => {
    const { order } = await createOrder(auth('nhung'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [svc('MG03', ['chin'])],
      discounts: [{ scope: 'order', kind: 'manual', percent: 25, reason: 'Bạn chủ quán' }],
    })
    const ok = await approveDiscounts(auth('linh'), order.id, order.version)
    const c = await confirmOrder(auth('nhung'), order.id, ok.version)
    const discounts = [
      { scope: 'order' as const, kind: 'manual' as const, percent: 25, reason: 'Bạn chủ quán' },
    ]
    expect(
      (
        await err(
          updateOrder(auth('nhung'), c.id, {
            ...body(c),
            items: [svc('MG02', ['chin'])],
            discounts,
            adjustReason: 'Đổi dịch vụ',
          }),
        )
      ).status,
    ).toBe(403)
    const staffOnly = await updateOrder(auth('nhung'), c.id, {
      ...body(c),
      items: [svc('MG03', ['trang'])],
      discounts,
      adjustReason: 'Nhầm thợ',
    })
    expect(staffOnly.items[0]!.staff[0]!.name).toBe('Trang')
    // Linh tự sửa giá được (đủ mức duyệt)
    const linhEdit = await updateOrder(auth('linh'), c.id, {
      ...body(staffOnly),
      items: [svc('MG02', ['trang'])],
      discounts,
      adjustReason: 'Đổi sang úp base',
    })
    expect(linhEdit.approval).toMatchObject({ byName: 'Linh', valid: true })
  })
})

describe('2.18 Phiếu xử lý bảo hành, ưu đãi bù khiếu nại', () => {
  it('50 — trong hạn, lỗi kỹ thuật: sửa miễn phí; khách đổi ý không sửa miễn phí; hết hạn thì tính phí', async () => {
    const o = await confirmed({ items: [svc('CB03', ['trang'])] })
    expect(o.warrantyActive).toBe(true)
    const t = await createTicket(auth('nhung'), o.id, {
      issue: 'Bong 2 ngón',
      cause: 'technical',
      outcome: 'free_fix',
      repairedBy: uid('trang'),
    })
    expect(t.tickets).toEqual([
      expect.objectContaining({ withinWarranty: true, outcome: 'free_fix', repairedByName: 'Trang' }),
    ])
    expect(t.netAmount).toBe(o.netAmount) // sửa miễn phí không sinh doanh thu
    expect(
      (
        await err(
          createTicket(auth('nhung'), o.id, {
            issue: 'Muốn đổi màu',
            cause: 'customer_change',
            outcome: 'free_fix',
          }),
        )
      ).status,
    ).toBe(422)
    const old = await confirmed({ serviceDate: addDays(today, -10), items: [svc('CB02', ['trang'])] })
    expect(old.warrantyActive).toBe(false)
    expect(
      (
        await err(
          createTicket(auth('nhung'), old.id, { issue: 'Bong', cause: 'technical', outcome: 'free_fix' }),
        )
      ).status,
    ).toBe(422)
    const charged = await createTicket(auth('nhung'), old.id, {
      issue: 'Bong',
      cause: 'technical',
      outcome: 'charged',
    })
    expect(charged.tickets[0]).toMatchObject({ withinWarranty: false, outcome: 'charged' })
    // Thợ không lập phiếu được
    expect(
      (await err(createTicket(auth('trang'), o.id, { issue: 'x', cause: 'technical', outcome: 'charged' })))
        .status,
    ).toBe(403)
  })

  it('33 — ưu đãi bù khiếu nại 20% bill 500.000đ của Chin → doanh thu 400.000đ, cơ sở hoa hồng Chin 500.000đ; dùng một lần', async () => {
    const { customer } = await createCustomer(auth('nhung'), { name: 'Khách khiếu nại', phone: '0944555666' })
    const first = await confirmed({ customerId: customer.id, items: [svc('CB02', ['trang'])] })
    const t = await createTicket(auth('nhung'), first.id, {
      issue: 'Móng bong, khách không muốn sửa',
      cause: 'technical',
      outcome: 'compensation',
      compensationPercent: 20,
    })
    const ticketId = t.tickets[0]!.id
    // Thợ (không xem được đơn gốc) vẫn thấy ưu đãi còn dùng được khi lập bill sau
    expect(await customerCompensations(auth('chin'), customer.id)).toEqual([
      expect.objectContaining({ ticketId, percent: 20 }),
    ])
    const comp = { scope: 'order' as const, kind: 'complaint_compensation' as const, percent: 20, ticketId }
    const { order } = await createOrder(auth('chin'), {
      createRequestId: rid(),
      customerId: customer.id,
      serviceDate: today,
      items: [custom('Đắp gel', 500000, ['chin'])],
      discounts: [comp],
    })
    expect(order.netAmount).toBe(400000)
    expect(order.items[0]!.staff[0]).toMatchObject({
      allocatedNetAmount: 400000,
      commissionBaseAmount: 500000,
    })
    expect(order.requiredLevel).toBe('manager')
    const c = await confirmOrder(auth('nhung'), order.id, order.version)
    expect(c.status).toBe('confirmed')
    // Dùng lại phiếu cho đơn khác → không được (service và DB)
    expect(await customerCompensations(auth('chin'), customer.id)).toEqual([])
    const again = await err(
      createOrder(auth('chin'), {
        createRequestId: rid(),
        customerId: customer.id,
        serviceDate: today,
        items: [custom('Sơn', 100000, ['chin'])],
        discounts: [comp],
      }),
    )
    expect(again.status).toBe(422)
    // Phiếu đã dùng không huỷ được
    expect((await err(voidTicket(auth('nhung'), ticketId, 'Lập nhầm'))).status).toBe(422)
  })

  it('ưu đãi phải đúng khách, đúng %; phiếu chưa dùng huỷ được và hết dùng được', async () => {
    const a = (await createCustomer(auth('nhung'), { name: 'A', phone: null })).customer
    const b = (await createCustomer(auth('nhung'), { name: 'B', phone: null })).customer
    const first = await confirmed({ customerId: a.id, items: [svc('CB02', ['trang'])] })
    const t = await createTicket(auth('nhung'), first.id, {
      issue: 'Lỗi màu',
      cause: 'technical',
      outcome: 'compensation',
      compensationPercent: 10,
    })
    const ticketId = t.tickets[0]!.id
    const mk = (customerId: string, percent: number) =>
      createOrder(auth('trang'), {
        createRequestId: rid(),
        customerId,
        serviceDate: today,
        items: [svc('CB02', ['trang'])],
        discounts: [{ scope: 'order', kind: 'complaint_compensation', percent, ticketId }],
      })
    expect((await err(mk(b.id, 10))).status).toBe(422)
    expect((await err(mk(a.id, 20))).status).toBe(422)
    expect(
      (
        await err(
          createTicket(auth('nhung'), first.id, {
            issue: 'Đổi ý',
            cause: 'customer_change',
            outcome: 'compensation',
            compensationPercent: 10,
          }),
        )
      ).status,
    ).toBe(422)
    const v = await voidTicket(auth('nhung'), ticketId, 'Khách đồng ý sửa')
    expect(v.tickets[0]).toMatchObject({ voided: true, voidReason: 'Khách đồng ý sửa' })
    expect(await customerCompensations(auth('trang'), a.id)).toEqual([])
    expect((await err(mk(a.id, 10))).status).toBe(422)
  })

  it('SQL: không sửa nội dung phiếu, không xoá phiếu; khách lẻ không nhận ưu đãi bill sau', async () => {
    const o = await confirmed({ items: [svc('CB02', ['trang'])] })
    const t = await createTicket(auth('nhung'), o.id, {
      issue: 'Bong',
      cause: 'technical',
      outcome: 'charged',
    })
    const id = t.tickets[0]!.id
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) => tx`update order_service_tickets set outcome = 'free_fix' where id = ${id}`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`delete from order_service_tickets where id = ${id}`),
      '42501',
    )
    expect(
      (
        await err(
          createTicket(auth('nhung'), o.id, {
            issue: 'x',
            cause: 'technical',
            outcome: 'compensation',
            compensationPercent: 15,
          }),
        )
      ).status,
    ).toBe(422)
  })
})
