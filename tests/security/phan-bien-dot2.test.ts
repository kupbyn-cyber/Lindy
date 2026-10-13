// Sửa sau phản biện Đợt 2 (kế hoạch mục 17): P38 giới hạn mở hồ sơ có SĐT + ghi audit; P39 (K14) chỉ người tạo,
// Nhung, Linh sửa đơn Đang làm; P40 (K15) phiếu ưu đãi do người không phải chủ lập vào Cần xem lại; P41 đơn chờ
// xác nhận ngày cũ không bị quên.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ItemInput } from '../../src/lib/order-math'
import { addDays, toLocalDate } from '../../src/lib/time'
import { createCustomer, getCustomer } from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { limitSensitiveReads, SENSITIVE_LIMIT } from '../../src/server/http/route'
import {
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  markDone,
  updateOrder,
} from '../../src/server/orders/service'
import { createTicket, markTicketReviewed } from '../../src/server/orders/tickets'
import { overview } from '../../src/server/reports/service'
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
const svc = (code: string, staff: SeedKey): ItemInput => ({
  type: 'service',
  serviceId: svcId[code]!,
  quantity: 1,
  staff: [{ userId: uid(staff) }],
})

async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

describe('P38 — mở hồ sơ có SĐT đầy đủ', () => {
  it('tối đa 60 hồ sơ khác nhau trong 10 phút; mở lại cùng hồ sơ không tính thêm', () => {
    const user = randomUUID()
    const t0 = 1_000_000
    for (let i = 0; i < SENSITIVE_LIMIT; i++) limitSensitiveReads(user, `customer:${i}`, t0)
    for (let i = 0; i < 10; i++) limitSensitiveReads(user, 'customer:0', t0 + 1000)
    expect(() => limitSensitiveReads(user, 'customer:new', t0 + 2000)).toThrow(AppError)
    // Hết 10 phút thì mở tiếp được
    expect(() => limitSensitiveReads(user, 'customer:new', t0 + 10 * 60_000 + 1)).not.toThrow()
  })

  it('xem hồ sơ có SĐT → ghi audit người xem', async () => {
    const { customer } = await createCustomer(auth('trang'), { name: 'Khách audit', phone: '0966777888' })
    await getCustomer(auth('chin'), customer.id)
    const rows = await owner<{ actorUserId: string }[]>`
      select actor_user_id from audit_logs where action = 'customer.phone_viewed' and entity_id = ${customer.id}`
    expect(rows.map((r) => r.actorUserId)).toContain(uid('chin'))
  })
})

describe('P39 (K14) — chỉ người tạo và Nhung, Linh sửa đơn Đang làm', () => {
  it('thợ được chia phần không sửa được (API và SQL), vẫn bấm Làm xong được', async () => {
    const { order } = await createOrder(auth('chin'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [svc('CB02', 'chin'), svc('CB01', 'trang')],
      discounts: [],
    })
    const seen = await getOrder(auth('trang'), order.id)
    expect(seen.can.edit).toBe(false)
    const body = {
      version: order.version,
      customerId: null,
      serviceDate: today,
      items: [svc('CB02', 'trang'), svc('CB01', 'trang')],
      discounts: [],
    }
    expect((await err(updateOrder(auth('trang'), order.id, body))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`update orders set content_rev = content_rev + 1 where id = ${order.id}`,
      ),
      '42501',
    )
    // Người tạo và Nhung sửa được
    const byChin = await updateOrder(auth('chin'), order.id, {
      ...body,
      items: [svc('CB02', 'chin'), svc('CB08', 'trang')],
    })
    const byNhung = await updateOrder(auth('nhung'), order.id, {
      ...body,
      version: byChin.version,
      items: [svc('CB02', 'chin'), svc('CB01', 'trang')],
    })
    expect(byNhung.items).toHaveLength(2)
    const done = await markDone(auth('trang'), order.id, byNhung.version)
    expect(done.status).toBe('awaiting_confirmation')
  })
})

describe('P40 (K15) — phiếu ưu đãi do người không phải chủ lập vào Cần xem lại', () => {
  it('Nhung lập phiếu ưu đãi → Linh thấy trong Cần xem lại, đánh dấu đã xem; phiếu Linh lập không cần xem', async () => {
    const { customer } = await createCustomer(auth('nhung'), { name: 'Khách K15', phone: null })
    const { order } = await createOrder(auth('nhung'), {
      createRequestId: rid(),
      customerId: customer.id,
      serviceDate: today,
      items: [svc('CB02', 'trang')],
      discounts: [],
    })
    const c = await confirmOrder(auth('nhung'), order.id, order.version)
    const before = (await overview(auth('linh'), { period: 'day' })).attention.review
    const t = await createTicket(auth('nhung'), c.id, {
      issue: 'Bong',
      cause: 'technical',
      outcome: 'compensation',
      compensationPercent: 20,
    })
    expect(t.tickets[0]).toMatchObject({ needsOwnerReview: true })
    expect((await overview(auth('linh'), { period: 'day' })).attention.review).toBe(before + 1)
    const list = await listOrders(auth('linh'), { review: true })
    expect(list.items.find((i) => i.id === c.id)?.needsOwnerReview).toBe(true)

    expect((await err(markTicketReviewed(auth('nhung'), t.tickets[0]!.id))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) =>
          tx`update order_service_tickets set reviewed_by = ${uid('nhung')} where id = ${t.tickets[0]!.id}`,
      ),
      '42501',
    )
    const r = await markTicketReviewed(auth('linh'), t.tickets[0]!.id)
    expect(r.tickets[0]).toMatchObject({ needsOwnerReview: false, reviewedByName: 'Linh' })
    expect((await overview(auth('linh'), { period: 'day' })).attention.review).toBe(before)

    const byLinh = await createTicket(auth('linh'), c.id, {
      issue: 'Bong lần 2',
      cause: 'technical',
      outcome: 'compensation',
      compensationPercent: 10,
    })
    expect(byLinh.tickets.find((x) => x.compensationPercent === 10)?.needsOwnerReview).toBe(false)
  })
})

describe('P41 — đơn chờ xác nhận ngày cũ không bị quên', () => {
  it('lọc Chờ xác nhận xem mọi ngày; Tổng quan đếm cả đơn quá 31 ngày', async () => {
    const before = (await overview(auth('nhung'), { period: 'day' })).attention.awaiting
    const { order } = await createOrder(auth('nhung'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: addDays(today, -45),
      items: [svc('CB02', 'trang')],
      discounts: [],
    })
    await markDone(auth('nhung'), order.id, order.version)
    const list = await listOrders(auth('nhung'), { filter: 'awaiting_confirmation' })
    expect(list.allDates).toBe(true)
    expect(list.items.map((i) => i.id)).toContain(order.id)
    // Lọc "Tất cả" vẫn theo ngày đang chọn
    expect((await listOrders(auth('nhung'), {})).items.map((i) => i.id)).not.toContain(order.id)
    expect((await overview(auth('nhung'), { period: 'day' })).attention.awaiting).toBe(before + 1)
  })
})
