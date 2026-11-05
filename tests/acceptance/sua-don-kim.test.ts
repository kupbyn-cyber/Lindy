// Nghiệm thu S62–S64 (kế hoạch docs/plans/2026-11-05-sua-don-va-kim.md): người tạo sửa đơn trong ngày làm dịch vụ;
// sau Làm xong chỉ Linh, Quản lý sửa làm thành tiền thấp đi; đổi phần chia của thợ → Cần xem lại; món Kìm là hàng bán
// (không giảm giá, không chia thợ, không hoa hồng, không vào doanh thu tính KPI). Kiểm ở API và SQL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiscountInput, ItemInput } from '../../src/lib/order-math'
import { addDays, toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { recordPayment } from '../../src/server/orders/payments'
import { refundOrder } from '../../src/server/orders/refunds'
import { createOrder, getOrder, markDone, orderAudit, updateOrder } from '../../src/server/orders/service'
import { reviewQueue } from '../../src/server/review/service'
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
const kim = (extra: Record<string, unknown> = {}) => svc('SP01', [], extra)
const son200 = (staff: SeedKey[] = ['trang']): ItemInput => ({
  type: 'custom',
  name: 'Sơn gel',
  amount: 200000,
  staff: staff.map((k) => ({ userId: uid(k) })),
})

/** Thợ tạo đơn rồi bấm Làm xong (S41: xác nhận luôn khi không có giảm chờ duyệt). */
async function doneOrder(
  by: SeedKey,
  items: ItemInput[],
  over: { serviceDate?: string; discounts?: DiscountInput[] } = {},
) {
  const { order } = await createOrder(auth(by), {
    createRequestId: rid(),
    customerId: null,
    serviceDate: over.serviceDate ?? today,
    items,
    discounts: over.discounts ?? [],
  })
  return markDone(auth(by), order.id, order.version)
}
const body = (o: { version: number; serviceDate: string }, items: ItemInput[], extra = {}) => ({
  version: o.version,
  customerId: null,
  serviceDate: o.serviceDate,
  items,
  discounts: [],
  ...extra,
})

describe('S62 — người tạo sửa đơn trong ngày làm dịch vụ', () => {
  it('Trang thêm món vào đơn đã xác nhận cùng ngày: cần lý do, lưu được, có lịch sử, không vào Cần xem lại', async () => {
    const o = await doneOrder('trang', [svc('CB02', ['trang'])])
    expect(o.status).toBe('confirmed')
    expect(o.can.edit).toBe(true)
    expect(o.can.reduceTotal).toBe(false)
    const items = [svc('CB02', ['trang']), svc('CB01', ['trang'])]
    expect((await err(updateOrder(auth('trang'), o.id, body(o, items)))).status).toBe(422)
    const adj = await updateOrder(auth('trang'), o.id, body(o, items, { adjustReason: 'Quên ghi cắt sửa' }))
    expect(adj.netAmount).toBe(110000)
    expect(adj.adjustReason).toBe('Quên ghi cắt sửa')
    expect(adj.needsOwnerReview).toBe(false)
    const audit = await orderAudit(auth('trang'), o.id)
    expect(audit.some((a) => a.action === 'adjusted')).toBe(true)
  })

  it('đơn ghi ngày hôm qua đã Làm xong: Trang không sửa được (API 403, SQL lỗi); Nhung sửa được', async () => {
    const o = await doneOrder('trang', [svc('CB02', ['trang'])], { serviceDate: addDays(today, -1) })
    expect(o.status).toBe('confirmed')
    expect(o.can.edit).toBe(false)
    const items = [svc('CB02', ['trang']), svc('CB01', ['trang'])]
    const e = await err(updateOrder(auth('trang'), o.id, body(o, items, { adjustReason: 'Thêm' })))
    expect(e.status).toBe(403)
    expect(e.message).toMatch(/Đã qua ngày làm dịch vụ/)
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) =>
          tx`update orders set content_rev = content_rev + 1, adjust_reason = 'lách' where id = ${o.id}`,
      ),
      '42501',
    )
    const byNhung = await updateOrder(auth('nhung'), o.id, body(o, items, { adjustReason: 'Thêm cắt sửa' }))
    expect(byNhung.netAmount).toBe(110000)
  })

  it('đơn Đang làm: người tạo bỏ món chọn nhầm vẫn lưu được (thành tiền giảm)', async () => {
    const { order } = await createOrder(auth('trang'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [svc('CB02', ['trang']), svc('CB01', ['trang'])],
      discounts: [],
    })
    expect(order.can.reduceTotal).toBe(true)
    const fixed = await updateOrder(auth('trang'), order.id, body(order, [svc('CB02', ['trang'])]))
    expect(fixed.netAmount).toBe(70000)
  })

  it('Chin có phần nhưng không phải người tạo: không sửa được đơn của Trang', async () => {
    const o = await doneOrder('trang', [svc('CB02', ['chin'])])
    const chinView = await getOrder(auth('chin'), o.id)
    expect(chinView.can.edit).toBe(false)
    const e = await err(
      updateOrder(
        auth('chin'),
        o.id,
        body(o, [svc('CB02', ['chin']), svc('CB01', ['chin'])], { adjustReason: 'x' }),
      ),
    )
    expect(e.status).toBe(403)
  })
})

describe('S63 — sau Làm xong không giảm thành tiền; đổi phần chia → Cần xem lại', () => {
  it('Trang bỏ món: 403 có số tiền; giảm giá thêm cũng bị chặn; Nhung bỏ được', async () => {
    const o = await doneOrder('trang', [svc('CB02', ['trang']), svc('CB01', ['trang'])])
    const e = await err(
      updateOrder(auth('trang'), o.id, body(o, [svc('CB02', ['trang'])], { adjustReason: 'Bỏ cắt sửa' })),
    )
    expect(e.status).toBe(403)
    expect(e.message).toBe('Thành tiền giảm từ 110.000đ xuống 70.000đ, cần Nhung hoặc Linh sửa.')
    const disc = await err(
      updateOrder(auth('trang'), o.id, {
        ...body(o, [svc('CB02', ['trang']), svc('CB01', ['trang'])], { adjustReason: 'Giảm' }),
        discounts: [{ scope: 'order', kind: 'preset_5' }],
      }),
    )
    expect(disc.status).toBe(403)
    const byNhung = await updateOrder(
      auth('nhung'),
      o.id,
      body(o, [svc('CB02', ['trang'])], { adjustReason: 'Khách không cắt' }),
    )
    expect(byNhung.netAmount).toBe(70000)
  })

  it('Trang chuyển phần của Chin về mình (giữ tổng) → lưu được, vào Cần xem lại kèm lý do', async () => {
    const split = (a: number, b: number) =>
      ({
        type: 'service',
        serviceId: svcId.CB02!,
        quantity: 1,
        staff: [
          { userId: uid('trang'), amount: a },
          { userId: uid('chin'), amount: b },
        ],
      }) as ItemInput
    const o = await doneOrder('trang', [split(40000, 30000)])
    const adj = await updateOrder(
      auth('trang'),
      o.id,
      body(o, [svc('CB02', ['trang'])], { adjustReason: 'Chin không làm' }),
    )
    expect(adj.netAmount).toBe(70000)
    expect(adj.needsOwnerReview).toBe(true)
    const q = await reviewQueue(auth('linh'))
    const item = q.items.find((i) => i.kind === 'order' && i.id === o.id)
    expect(item?.detail).toBe('Trang sửa đơn đã xác nhận: Chin không làm')
  })

  it('SQL: người tạo ghi thẳng bản mới chuyển phần chia mà không vào Cần xem lại → lỗi khi commit', async () => {
    const o = await doneOrder('trang', [svc('CB02', ['chin'])])
    await expectPgError(
      withUser(uid('trang'), async (tx) => {
        const [r] = await tx<{ rev: number }[]>`
          update orders set content_rev = content_rev + 1, adjust_reason = 'lách' where id = ${o.id}
          returning content_rev as rev`
        await tx`
          insert into order_items (order_id, rev, position, line_type, service_id, name, unit, price_mode, list_min,
            list_max, unit_price, quantity, gross_amount, line_discount_amount, order_discount_amount, discount_amount,
            net_amount)
          values (${o.id}, ${r!.rev}, 0, 'service', ${svcId.CB02!}, 'Sơn gel trơn', 'lần', 'list', 70000, 70000, 70000, 1,
                  70000, 0, 0, 0, 70000)`
        await tx`
          insert into order_staff_allocations (order_id, rev, item_position, staff_user_id, allocated_net_amount,
            commission_base_amount)
          values (${o.id}, ${r!.rev}, 0, ${uid('trang')}, 70000, 70000)`
      }),
      'P0001',
    )
  })
})

describe('S64 — Kìm 110.000đ: hàng bán', () => {
  it('Sơn gel 200.000đ + Kìm, giảm cả bill 10% → 290.000đ; kìm không thợ; Làm xong là xác nhận', async () => {
    const o = await doneOrder('trang', [son200(), kim()], {
      discounts: [{ scope: 'order', kind: 'preset_10' }],
    })
    expect(o.status).toBe('confirmed')
    expect(o.netAmount).toBe(290000)
    const k = o.items[1]!
    expect(k.name).toBe('Kìm')
    expect(k.isRetail).toBe(true)
    expect(k.discountAmount).toBe(0)
    expect(k.staff).toEqual([])
  })

  it('API: giảm trên dòng kìm, gán thợ cho kìm, sửa giá kìm → 422', async () => {
    const base = { createRequestId: rid(), customerId: null, serviceDate: today }
    const onLine = await err(
      createOrder(auth('trang'), {
        ...base,
        items: [son200(), kim()],
        discounts: [{ scope: 1, kind: 'preset_5' }],
      }),
    )
    expect(onLine.status).toBe(422)
    expect(onLine.message).toMatch(/hàng bán, không áp dụng giảm giá/)
    const staffed = await err(
      createOrder(auth('trang'), {
        ...base,
        createRequestId: rid(),
        items: [svc('SP01', ['trang'])],
        discounts: [],
      }),
    )
    expect(staffed.status).toBe(422)
    const priced = await err(
      createOrder(auth('trang'), {
        ...base,
        createRequestId: rid(),
        items: [kim({ unitPrice: 100000 })],
        discounts: [],
      }),
    )
    expect(priced.status).toBe(422)
  })

  it('SQL: dòng kìm có phần thợ → lỗi khi commit; có giảm → lỗi ràng buộc; cờ hàng bán do DB đặt', async () => {
    const o = await doneOrder('nhung', [svc('CB02', ['nhung'])])
    const writeKim = (alloc: boolean, discount: number) =>
      withUser(uid('nhung'), async (tx) => {
        const [r] = await tx<{ rev: number }[]>`
          update orders set content_rev = content_rev + 1, gross_amount = 110000,
                 discount_amount = ${discount}, net_amount = ${110000 - discount}, has_hardening = false,
                 adjust_reason = 'lách', needs_owner_review = true
          where id = ${o.id} returning content_rev as rev`
        await tx`
          insert into order_items (order_id, rev, position, line_type, service_id, name, unit, price_mode, list_min,
            list_max, unit_price, quantity, gross_amount, line_discount_amount, order_discount_amount, discount_amount,
            net_amount, is_retail)
          values (${o.id}, ${r!.rev}, 0, 'service', ${svcId.SP01!}, 'Kìm', 'cái', 'list', 110000, 110000, 110000, 1,
                  110000, ${discount}, 0, ${discount}, ${110000 - discount}, false)`
        const [it] = await tx<{ isRetail: boolean }[]>`
          select is_retail from order_items where order_id = ${o.id} and rev = ${r!.rev}`
        expect(it!.isRetail).toBe(true)
        if (alloc)
          await tx`
            insert into order_staff_allocations (order_id, rev, item_position, staff_user_id, allocated_net_amount,
              commission_base_amount)
            values (${o.id}, ${r!.rev}, 0, ${uid('nhung')}, 110000, 110000)`
      })
    await expectPgError(writeKim(true, 0), 'P0001')
    await expectPgError(writeKim(false, 10000), '23514')
  })

  it('lương: kìm không vào hoa hồng, không vào doanh thu tính KPI; hoàn tiền trừ KPI theo tỷ lệ', async () => {
    const o = await doneOrder('trang', [son200(), kim()])
    expect(o.netAmount).toBe(310000)
    const entries = () =>
      owner<
        { sourceType: string; staffUserId: string | null; commissionBase: string; shopRevenue: string }[]
      >`
        select source_type, staff_user_id, sum(commission_base) as commission_base, sum(shop_revenue) as shop_revenue
        from payroll_revenue_entries where order_id = ${o.id}
        group by source_type, staff_user_id order by source_type, staff_user_id nulls first`
    expect(await entries()).toEqual([
      { sourceType: 'order', staffUserId: null, commissionBase: '0', shopRevenue: '200000' },
      { sourceType: 'order', staffUserId: uid('trang'), commissionBase: '200000', shopRevenue: '0' },
    ])
    await recordPayment(auth('trang'), o.id, { idempotencyKey: rid(), amount: 310000, method: 'cash' })
    await refundOrder(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 110000,
      method: 'cash',
      reason: 'Khách trả kìm',
    })
    const after = await entries()
    // 110.000đ × 200.000 / 310.000 = 70.968đ trừ vào doanh thu tính KPI
    expect(after.find((r) => r.sourceType === 'refund' && r.staffUserId === null)?.shopRevenue).toBe('-70968')
  })
})
