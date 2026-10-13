// Test bảo mật đơn hàng S19–S26, S28 (kế hoạch Đợt 2 mục 10.2) và chặn ở tầng SQL (gọi thẳng dưới app_user).
// S27 (sửa đơn đã xác nhận) ở bước 2.19.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ItemInput } from '../../src/lib/order-math'
import { addDays, toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { recordPayment } from '../../src/server/orders/payments'
import { UpdateOrderBody } from '../../src/server/orders/schema'
import {
  approveDiscounts,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  markDone,
  updateOrder,
} from '../../src/server/orders/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const svcId: Record<string, string> = {}
const today = toLocalDate(new Date())

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
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

async function newOrder(k: SeedKey, items: ItemInput[], extra: Record<string, unknown> = {}) {
  return (
    await createOrder(auth(k), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items,
      discounts: [],
      ...extra,
    })
  ).order
}

describe('S19 — thợ chỉ thấy đơn mình tạo hoặc có phần mình (K09)', () => {
  it('Trang không đọc được đơn Chin tạo cho Chin làm; thấy khi được chia phần', async () => {
    const o = await newOrder('chin', [svc('CB02', ['chin'])])
    expect((await err(getOrder(auth('trang'), o.id))).status).toBe(404)
    const [n] = await withUser(
      uid('trang'),
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from orders where id = ${o.id}`,
    )
    expect(n!.n).toBe(0)
    const [c] = await withUser(
      uid('trang'),
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from order_items where order_id = ${o.id}`,
    )
    expect(c!.n).toBe(0)
    const list = await listOrders(auth('trang'), {})
    expect(list.items.map((i) => i.id)).not.toContain(o.id)

    // Chin chia cho Trang một dòng → Trang thấy đơn
    const shared = await updateOrder(auth('chin'), o.id, {
      version: o.version,
      customerId: null,
      serviceDate: today,
      items: [svc('CB02', ['chin']), svc('CB01', ['trang'])],
      discounts: [],
    })
    expect((await getOrder(auth('trang'), shared.id)).id).toBe(o.id)
    // Nhung (order.read_all) thấy mọi đơn
    expect((await getOrder(auth('nhung'), o.id)).id).toBe(o.id)
  })

  it('S29 (phần danh sách) — thợ chỉ thấy tổng doanh thu của mình', async () => {
    const day = addDays(today, -40)
    const o = await createOrder(auth('nhung'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: day,
      items: [svc('MG03', ['nhung']), svc('CB02', ['trang'])],
      discounts: [],
    })
    await confirmOrder(auth('nhung'), o.order.id, o.order.version)
    const mine = await listOrders(auth('trang'), { from: day, to: day })
    expect(mine.summary.netAmount).toBeNull()
    expect(mine.summary.byStaff).toEqual([{ userId: uid('trang'), name: 'Trang', amount: 70000 }])
    const all = await listOrders(auth('nhung'), { from: day, to: day })
    expect(all.summary.netAmount).toBe(290000)
    expect(all.summary.byStaff).toHaveLength(2)
  })
})

describe('S20 — máy gửi số tiền, cột hệ thống hoặc trường lạ', () => {
  it('trường lạ → 422 (schema strict); số tiền do server tính lại', () => {
    const base = { version: 1, customerId: null, serviceDate: today, items: [], discounts: [] }
    for (const extra of [
      { netAmount: 1 },
      { status: 'confirmed' },
      { confirmedBy: uid('nhung') },
      { branchId: seed().branchIds.CS2 },
      { requiredLevel: 'none' },
    ]) {
      expect(UpdateOrderBody.safeParse({ ...base, ...extra }).success).toBe(false)
    }
    const item = { type: 'service', serviceId: svcId.CB02, quantity: 1, staff: [], grossAmount: 1 }
    expect(UpdateOrderBody.safeParse({ ...base, items: [item] }).success).toBe(false)
  })

  it('SQL: đổi tổng tiền mà không lưu cả đơn → lỗi; tổng không khớp các dòng → lỗi khi commit', async () => {
    const o = await newOrder('trang', [svc('CB02', ['trang'])])
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`update orders set net_amount = 1, gross_amount = 1 where id = ${o.id}`,
      ),
      'P0001',
    )
    // Tăng content_rev và ghi một dòng sai tổng: constraint trigger chặn khi commit
    await expectPgError(
      withUser(uid('trang'), async (tx) => {
        await tx`update orders set content_rev = content_rev + 1, gross_amount = 1000, net_amount = 1000 where id = ${o.id}`
        await tx`
          insert into order_items (order_id, rev, position, line_type, service_id, name, unit, price_mode, list_min,
            list_max, unit_price, quantity, gross_amount, line_discount_amount, order_discount_amount, discount_amount,
            net_amount)
          select ${o.id}, content_rev, 0, 'service', ${svcId.CB02!}, 'Sơn gel trơn', 'lần', 'list', 70000, 70000,
                 70000, 1, 70000, 0, 0, 0, 70000 from orders where id = ${o.id}`
      }),
      'P0001',
    )
  })

  it('SQL: không chèn thêm dòng vào đơn ngoài giao dịch lưu đơn; không sửa, không xoá dòng đã lưu', async () => {
    const o = await newOrder('trang', [svc('CB02', ['trang'])])
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`
          insert into order_staff_allocations (order_id, rev, item_position, staff_user_id, allocated_net_amount,
            commission_base_amount)
          values (${o.id}, 1, 0, ${uid('chin')}, 1, 1)`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update order_items set net_amount = 1 where order_id = ${o.id}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`delete from order_items where order_id = ${o.id}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`delete from orders where id = ${o.id}`),
      '42501',
    )
  })

  it('SQL: không đổi mã đơn, người tạo, cơ sở; không tự đặt trạng thái Đã xác nhận', async () => {
    const o = await newOrder('trang', [svc('CB02', ['trang'])])
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update orders set created_by = ${uid('nhung')} where id = ${o.id}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update orders set code = 9999 where id = ${o.id}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('trang'), (tx) => tx`update orders set status = 'confirmed' where id = ${o.id}`),
      '42501',
    )
    // Cột người xác nhận do server đặt: giá trị máy gửi lên bị bỏ
    const [r] = await withUser(
      uid('trang'),
      (tx) => tx<{ confirmedBy: string | null }[]>`
        update orders set confirmed_by = ${uid('trang')}, confirmed_at = now() where id = ${o.id}
        returning confirmed_by`,
    )
    expect(r!.confirmedBy).toBeNull()
  })
})

describe('S21 — thợ không sửa đơn sau Làm xong (K10)', () => {
  it('API 403; SQL lỗi; Nhung sửa được', async () => {
    const o = await newOrder('trang', [svc('CB02', ['trang'])])
    const done = await markDone(auth('trang'), o.id, o.version)
    const body = {
      version: done.version,
      customerId: null,
      serviceDate: today,
      items: [svc('CB01', ['trang'])],
      discounts: [],
    }
    expect((await err(updateOrder(auth('trang'), o.id, body))).status).toBe(403)
    await expectPgError(
      withUser(uid('trang'), (tx) => tx`update orders set content_rev = content_rev + 1 where id = ${o.id}`),
      '42501',
    )
    const edited = await updateOrder(auth('nhung'), o.id, body)
    expect(edited.items[0]!.name).toBe('Cắt sửa')
    const confirmed = await confirmOrder(auth('nhung'), o.id, edited.version)
    expect(
      (await err(updateOrder(auth('nhung'), o.id, { ...body, version: confirmed.version }))).status,
    ).toBe(403)
  })
})

describe('S22, S23 — duyệt giảm giá đúng cấp, gắn với nội dung', () => {
  it('S22 — thợ áp 15% rồi tự duyệt hoặc xác nhận → 403; Nhung duyệt 25% → 403; SQL tự đặt người duyệt → lỗi', async () => {
    const o = await newOrder('trang', [svc('CB02', ['trang'])], {
      discounts: [{ scope: 'order', kind: 'manual', percent: 15, reason: 'Quen' }],
    })
    expect((await err(approveDiscounts(auth('trang'), o.id, o.version))).status).toBe(403)
    expect((await err(confirmOrder(auth('trang'), o.id, o.version))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`update orders set discount_approved_by = ${uid('trang')} where id = ${o.id}`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`update orders set discount_approved_by = ${uid('nhung')} where id = ${o.id}`,
      ),
      '42501',
    )
    const big = await newOrder('nhung', [svc('CB02', ['nhung'])], {
      discounts: [{ scope: 'order', kind: 'manual', percent: 25, reason: 'Quen' }],
    })
    expect((await err(approveDiscounts(auth('nhung'), big.id, big.version))).status).toBe(403)
    // SQL: Nhung tự đặt mình là người duyệt đơn cần Linh → DB ghi mức "manager", xác nhận bị chặn khi commit
    await withUser(
      uid('nhung'),
      (tx) =>
        tx`update orders set discount_approved_by = ${uid('nhung')}, discount_approval_hash = null where id = ${big.id}`,
    )
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update orders set status = 'confirmed' where id = ${big.id}`),
      '42501',
    )
  })

  it('S23 — sửa giá sau khi Linh đã duyệt → mất duyệt; xác nhận bị chặn đến khi Linh duyệt lại', async () => {
    const o = await newOrder('nhung', [svc('MG03', ['nhung'])], {
      discounts: [{ scope: 'order', kind: 'manual', percent: 25, reason: 'Bạn chủ quán' }],
    })
    const ok = await approveDiscounts(auth('linh'), o.id, o.version)
    expect(ok.approval?.valid).toBe(true)
    const done = await markDone(auth('nhung'), o.id, ok.version)
    // Nhung đổi sang giảm 30% (K10 cho Nhung sửa sau Làm xong)
    const edited = await updateOrder(auth('nhung'), o.id, {
      version: done.version,
      customerId: null,
      serviceDate: today,
      items: [svc('MG03', ['nhung'])],
      discounts: [{ scope: 'order', kind: 'manual', percent: 30, reason: 'Bạn chủ quán' }],
    })
    expect(edited.approval?.valid).toBe(false)
    expect((await err(confirmOrder(auth('nhung'), o.id, edited.version))).status).toBe(403)
    // Chỉ đổi thợ (không đổi giá, giảm) thì giữ duyệt
    const re = await approveDiscounts(auth('linh'), o.id, edited.version)
    const staffOnly = await updateOrder(auth('nhung'), o.id, {
      version: re.version,
      customerId: null,
      serviceDate: today,
      items: [svc('MG03', ['chin'])],
      discounts: [{ scope: 'order', kind: 'manual', percent: 30, reason: 'Bạn chủ quán' }],
    })
    expect(staffOnly.approval?.valid).toBe(true)
    expect((await confirmOrder(auth('nhung'), o.id, staffOnly.version)).status).toBe('confirmed')
  })
})

describe('S24, S25 — thu tiền', () => {
  it('S24 — hai lần thu song song cộng lại vượt số phải thu → chỉ một lần thành công', async () => {
    const o = await newOrder('nhung', [svc('MG03', ['nhung'])])
    const c = await confirmOrder(auth('nhung'), o.id, o.version)
    const results = await Promise.allSettled([
      recordPayment(auth('nhung'), c.id, { idempotencyKey: rid(), amount: 150000, method: 'cash' }),
      recordPayment(auth('linh'), c.id, { idempotencyKey: rid(), amount: 150000, method: 'transfer' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect((rejected.reason as AppError).status).toBe(422)
    const [p] = await owner<
      { s: number }[]
    >`select sum(amount)::int as s from payments where order_id = ${c.id}`
    expect(p!.s).toBe(150000)
  })

  it('S25 — thợ ghi tiền thu → 403; SQL chèn khoản thu → lỗi', async () => {
    const o = await newOrder('nhung', [svc('CB02', ['trang'])])
    const c = await confirmOrder(auth('nhung'), o.id, o.version)
    expect(
      (await err(recordPayment(auth('trang'), c.id, { idempotencyKey: rid(), amount: 1000, method: 'cash' })))
        .status,
    ).toBe(403)
    const [acc] = await owner<{ id: string }[]>`
      select id from money_accounts where branch_id = ${seed().branchIds.HTK!} and type = 'cash'`
    await expectPgError(
      withUser(
        uid('trang'),
        (
          tx,
        ) => tx`insert into payments (order_id, branch_id, amount, method, money_account_id, recorded_by, idempotency_key)
                   values (${c.id}, ${seed().branchIds.HTK!}, 1000, 'cash', ${acc!.id}, ${uid('trang')}, ${rid()})`,
      ),
      '42501',
    )
  })

  it('SQL: không sửa số tiền khoản thu; không xoá', async () => {
    const o = await newOrder('nhung', [svc('CB02', ['nhung'])])
    const c = await confirmOrder(auth('nhung'), o.id, o.version)
    const d = await recordPayment(auth('nhung'), c.id, {
      idempotencyKey: rid(),
      amount: 70000,
      method: 'cash',
    })
    const pid = d.payments[0]!.id
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update payments set amount = 1 where id = ${pid}`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`delete from payments where id = ${pid}`),
      '42501',
    )
  })
})

describe('S26 — khác cơ sở', () => {
  it('người ở CS2 không đọc đơn CS1, không tạo đơn ở CS1, không chia tiền cho thợ CS1', async () => {
    const o = await newOrder('trang', [svc('CB02', ['trang'])])
    expect((await err(getOrder(auth('mai'), o.id))).status).toBe(404)
    expect(
      (
        await err(
          createOrder(auth('mai'), {
            branchId: seed().branchIds.HTK,
            createRequestId: rid(),
            customerId: null,
            serviceDate: today,
            items: [],
            discounts: [],
          }),
        )
      ).status,
    ).toBe(404)
    expect((await err(newOrder('mai', [svc('CB02', ['trang'])]))).status).toBe(422)
    await expectPgError(
      withUser(
        uid('mai'),
        (
          tx,
        ) => tx`insert into orders (branch_id, service_date, created_by, updated_by, create_request_id, create_request_hash)
                   values (${seed().branchIds.HTK!}, current_date, ${uid('mai')}, ${uid('mai')}, ${rid()}, ${'0'.repeat(64)})`,
      ),
      '42501',
    )
  })
})

describe('S28 — ngày làm dịch vụ', () => {
  it('không ở tương lai; thợ chỉ hôm nay/hôm qua; Nhung lùi ngày được', async () => {
    expect((await err(newOrder('trang', [], { serviceDate: addDays(today, 1) }))).status).toBe(422)
    expect((await err(newOrder('trang', [], { serviceDate: addDays(today, -3) }))).status).toBe(422)
    expect((await newOrder('trang', [], { serviceDate: addDays(today, -1) })).serviceDate).toBe(
      addDays(today, -1),
    )
    expect((await newOrder('nhung', [], { serviceDate: addDays(today, -3) })).serviceDate).toBe(
      addDays(today, -3),
    )
    await expectPgError(
      withUser(
        uid('trang'),
        (
          tx,
        ) => tx`insert into orders (branch_id, service_date, created_by, updated_by, create_request_id, create_request_hash)
                   values (${seed().branchIds.HTK!}, current_date - 5, ${uid('trang')}, ${uid('trang')}, ${rid()}, ${'0'.repeat(64)})`,
      ),
      'P0001',
    )
  })
})

describe('Quyền gọi hàm trong schema app (migration 0008)', () => {
  it('app_user không gọi được hàm nội bộ; vẫn gọi được hàm được cấp', async () => {
    const internal = [
      'app._emit(uuid, text, uuid, text, uuid, text, text, text, text, text, text, text)',
      'app._revoke_user_access(uuid, text)',
      'app._audit(uuid, text, uuid, jsonb)',
      'app.emit_system_event(uuid, text, text, uuid, text, text, text, text, text, text, text)',
      'app._order_check(uuid)',
    ]
    for (const fn of internal) {
      const [r] = await owner<
        { ok: boolean }[]
      >`select has_function_privilege('app_user', ${fn}, 'execute') as ok`
      expect(r!.ok, fn).toBe(false)
    }
    for (const fn of [
      'app.emit_event(uuid, text, text, uuid, text, text, text, text, text, text, text)',
      'app.uid()',
    ]) {
      const [r] = await owner<
        { ok: boolean }[]
      >`select has_function_privilege('app_user', ${fn}, 'execute') as ok`
      expect(r!.ok, fn).toBe(true)
    }
    await expectPgError(
      withUser(uid('trang'), (tx) => tx`select app._revoke_user_access(${uid('linh')}, 'thử')`),
      '42501',
    )
  })
})
