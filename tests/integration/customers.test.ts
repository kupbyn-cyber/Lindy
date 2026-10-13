// Bước 2.5, 2.17 — Khách hàng: tạo, tìm, nhắc trùng SĐT (Q06, test 43), hồ sơ chung mọi cơ sở, quyền sửa,
// lịch sử đơn theo K09 (test 16), lịch hẹn gắn hồ sơ khách (module §10).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ItemInput } from '../../src/lib/order-math'
import { toLocalDate } from '../../src/lib/time'
import { createAppointment } from '../../src/server/appointments/service'
import {
  createCustomer,
  getCustomer,
  maskPhone,
  recentCustomers,
  searchCustomers,
  updateCustomer,
} from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { confirmOrder, createOrder, createOrderFromAppointment } from '../../src/server/orders/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
beforeAll(async () => {
  for (const k of ['nhung', 'trang', 'chin', 'mai'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth

describe('2.5 Khách hàng', () => {
  it('43 — hai khách khác tên cùng SĐT: lưu được, có nhắc số đã có', async () => {
    const a = await createCustomer(auth('trang'), { name: 'Ngọc Hân', phone: '0907 111 222' })
    expect(a.customer.phone).toBe('0907111222')
    expect(a.samePhone).toEqual([])
    const b = await createCustomer(auth('trang'), { name: 'Mẹ Ngọc Hân', phone: '+84907111222' })
    expect(b.customer.id).not.toBe(a.customer.id)
    expect(b.samePhone).toEqual([{ id: a.customer.id, name: 'Ngọc Hân', phoneMasked: '0907•••222' }])
  })

  it('khách lẻ không SĐT vẫn tạo được; SĐT có ký tự lạ bị từ chối', async () => {
    const c = await createCustomer(auth('trang'), { name: 'Chị áo xanh', phone: null })
    expect(c.customer.phone).toBeNull()
    await expect(createCustomer(auth('trang'), { name: 'X', phone: '09abc' })).rejects.toBeInstanceOf(
      AppError,
    )
  })

  it('tìm không dấu và theo SĐT; kết quả che SĐT; "%" không khớp mọi khách', async () => {
    await createCustomer(auth('trang'), { name: 'Phương Thảo', phone: '0933444555' })
    const byName = await searchCustomers(auth('nhung'), 'phuong thao')
    expect(byName[0]).toMatchObject({ name: 'Phương Thảo', phoneMasked: '0933•••555' })
    expect(JSON.stringify(byName)).not.toContain('0933444555')
    const byPhone = await searchCustomers(auth('nhung'), '0933 444')
    expect(byPhone.map((x) => x.name)).toContain('Phương Thảo')
    expect(await searchCustomers(auth('nhung'), '%%')).toEqual([])
    expect(await searchCustomers(auth('nhung'), 'a')).toEqual([])
    expect(maskPhone('0912345678')).toBe('0912•••678')
  })

  it('26 — hồ sơ khách chung: người ở cơ sở 2 thấy khách tạo ở cơ sở 1', async () => {
    const c = await createCustomer(auth('trang'), { name: 'Khách hai cơ sở', phone: '0988000111' })
    const seen = await getCustomer(auth('mai'), c.customer.id)
    expect(seen.phone).toBe('0988000111')
  })

  it('thợ không sửa được khách; Nhung sửa được, có lịch sử; không ai xoá được', async () => {
    const c = await createCustomer(auth('trang'), { name: 'Lan', phone: null })
    await expectPgError(
      withUser(
        seed().users.trang!.id,
        (tx) => tx`update customers set name = 'Lan Anh' where id = ${c.customer.id}`,
      ),
      '42501',
    )
    await withUser(
      seed().users.nhung!.id,
      (tx) => tx`update customers set name = 'Lan Anh' where id = ${c.customer.id}`,
    )
    const events = await owner<{ action: string }[]>`
      select action from customer_audit_events where customer_id = ${c.customer.id} order by id`
    expect(events.map((e) => e.action)).toEqual(['created', 'updated'])
    await expectPgError(
      withUser(seed().users.nhung!.id, (tx) => tx`delete from customers where id = ${c.customer.id}`),
      '42501',
    )
  })

  it('không tạo khách dưới tên người khác; không đổi người tạo', async () => {
    const trang = seed().users.trang!.id
    await expectPgError(
      withUser(
        trang,
        (tx) => tx`insert into customers (organization_id, name, created_by, updated_by)
                   select app.user_org(), 'Giả', ${seed().users.nhung!.id}, ${trang}`,
      ),
      '42501',
    )
    const c = await createCustomer(auth('trang'), { name: 'Hoa', phone: null })
    await expectPgError(
      withUser(
        seed().users.nhung!.id,
        (tx) => tx`update customers set created_by = ${seed().users.nhung!.id} where id = ${c.customer.id}`,
      ),
      '42501',
    )
  })
})

describe('2.17 Hồ sơ khách, lịch sử đơn', () => {
  const today = toLocalDate(new Date())
  async function serviceId(code: string) {
    const [r] = await owner<{ id: string }[]>`select id from services where code = ${code}`
    return r!.id
  }
  async function orderFor(k: SeedKey, customerId: string, staff: SeedKey) {
    const item: ItemInput = {
      type: 'service',
      serviceId: await serviceId('CB02'),
      quantity: 1,
      staff: [{ userId: seed().users[staff]!.id }],
    }
    const { order } = await createOrder(auth(k), {
      createRequestId: rid(),
      customerId,
      serviceDate: today,
      items: [item],
      discounts: [],
    })
    return order
  }

  it('16 — khách quay lại thấy lịch sử; hai khách trùng tên không tự gộp', async () => {
    const a = (await createCustomer(auth('nhung'), { name: 'Lan', phone: '0911000001' })).customer
    const b = (await createCustomer(auth('nhung'), { name: 'Lan', phone: '0911000002' })).customer
    const o1 = await orderFor('nhung', a.id, 'nhung')
    await confirmOrder(auth('nhung'), o1.id, o1.version)
    await orderFor('nhung', b.id, 'nhung')
    const ha = await getCustomer(auth('nhung'), a.id)
    expect(ha.orders.map((o) => o.id)).toEqual([o1.id])
    expect(ha.stats).toMatchObject({ visits: 1, spent: 70000 })
    const hb = await getCustomer(auth('nhung'), b.id)
    expect(hb.orders).toHaveLength(1)
    expect(hb.orders[0]!.id).not.toBe(o1.id)
  })

  it('K09 — thợ chỉ thấy đơn của mình trong lịch sử khách, không có tổng chi', async () => {
    const c = (await createCustomer(auth('trang'), { name: 'Khánh Vy', phone: null })).customer
    const mine = await orderFor('trang', c.id, 'trang')
    const other = await orderFor('chin', c.id, 'chin')
    const seenByTrang = await getCustomer(auth('trang'), c.id)
    expect(seenByTrang.orders.map((o) => o.id)).toEqual([mine.id])
    expect(seenByTrang.stats).toBeNull()
    expect(seenByTrang.canEdit).toBe(false)
    const seenByNhung = await getCustomer(auth('nhung'), c.id)
    expect(seenByNhung.orders.map((o) => o.id).sort()).toEqual([mine.id, other.id].sort())
    const recent = await recentCustomers(auth('trang'))
    expect(recent.map((r) => r.id)).toContain(c.id)
  })

  it('sửa tên/SĐT: thợ 403; Nhung sửa được, lệch phiên bản → 409, nhắc SĐT trùng', async () => {
    const c = (await createCustomer(auth('trang'), { name: 'Hoà', phone: null })).customer
    await createCustomer(auth('trang'), { name: 'Mẹ Hoà', phone: '0922333444' })
    const e = await updateCustomer(auth('trang'), c.id, {
      version: c.version,
      name: 'Hoà Bình',
      phone: null,
    }).catch((x) => x)
    expect((e as AppError).status).toBe(403)
    const res = await updateCustomer(auth('nhung'), c.id, {
      version: c.version,
      name: 'Hoà Bình',
      phone: '0922333444',
    })
    expect(res.customer.name).toBe('Hoà Bình')
    expect(res.samePhone.map((x) => x.name)).toEqual(['Mẹ Hoà'])
    const stale = await updateCustomer(auth('nhung'), c.id, {
      version: c.version,
      name: 'Khác',
      phone: null,
    }).catch((x) => x)
    expect((stale as AppError).status).toBe(409)
  })

  it('module §10 — lịch chọn khách có sẵn; tạo đơn từ lịch dùng đúng hồ sơ đó', async () => {
    const c = (await createCustomer(auth('trang'), { name: 'Bảo Ngọc', phone: '0933999888' })).customer
    const { appointment } = await createAppointment(auth('trang'), {
      customerId: c.id,
      customerDisplayName: 'Bảo Ngọc',
      phone: '0933999888',
      date: today,
      startTime: '15:00',
      endTime: '16:00',
      guestCount: 1,
      serviceSummary: null,
      notes: null,
      createRequestId: rid(),
    })
    const { order } = await createOrderFromAppointment(auth('trang'), appointment.id, {
      createRequestId: rid(),
    })
    expect(order.customer?.id).toBe(c.id)
    const bad = await createAppointment(auth('trang'), {
      customerId: '00000000-0000-4000-8000-000000000000',
      customerDisplayName: 'X',
      phone: null,
      date: today,
      startTime: '15:00',
      endTime: '16:00',
      guestCount: 1,
      serviceSummary: null,
      notes: null,
      createRequestId: rid(),
    }).catch((x) => x)
    expect((bad as AppError).status).toBe(422)
  })
})
