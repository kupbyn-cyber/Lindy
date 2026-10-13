// Bước 2.5 — Khách hàng: tạo, tìm, nhắc trùng SĐT (Q06, test 43), hồ sơ chung mọi cơ sở, quyền sửa.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCustomer, getCustomer, maskPhone, searchCustomers } from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
beforeAll(async () => {
  for (const k of ['nhung', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
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
