// Khách hàng (PRD §10; D10-B; Q06). Hồ sơ chung cả tổ chức; chỉ tên, SĐT, lịch sử đơn.
// Danh sách tìm kiếm chỉ trả SĐT đã che; chi tiết mới trả đủ số [P34].
import { normalizePhone } from '~/lib/phone'
import { escapeLike, foldVietnamese } from '~/lib/text'
import type { Auth } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'

export const MAX_SEARCH = 20

export type CustomerRow = {
  id: string
  name: string
  phone: string | null
  version: number
  createdAt: Date
}

export type CustomerHit = { id: string; name: string; phoneMasked: string | null }

/** 0912345678 → 0912•••678 */
export function maskPhone(phone: string | null) {
  if (!phone) return null
  if (phone.length <= 7) return `${phone.slice(0, 2)}•••${phone.slice(-2)}`
  return `${phone.slice(0, 4)}•••${phone.slice(-3)}`
}

export function customerSearchNorm(name: string, phone: string | null) {
  return foldVietnamese(`${name} ${phone ?? ''}`).slice(0, 300)
}

function canCreate(auth: Auth) {
  return auth.branches.some(
    (b) => b.perms.includes('order.create_draft') || b.perms.includes('appointments.create'),
  )
}

const hit = (r: CustomerRow): CustomerHit => ({ id: r.id, name: r.name, phoneMasked: maskPhone(r.phone) })

export function cleanCustomerPhone(raw: string | null | undefined) {
  const p = normalizePhone(raw)
  if (!p.ok) throw invalid(p.error)
  return p.value
}

/** Từ khoá chỉ gồm số (có thể có cách, chấm, gạch): đoạn SĐT để tìm, "+84" → "0". Từ 3 chữ số. */
function phoneFragment(query: string) {
  const t = query.trim()
  if (!/^\+?[\d\s.\-()]+$/.test(t)) return null
  let s = t.replace(/[\s.\-()]/g, '')
  if (s.startsWith('+84')) s = `0${s.slice(3)}`
  s = s.replace(/^\+/, '')
  return s.length >= 3 ? s : null
}

export async function searchCustomers(auth: Auth, query: string): Promise<CustomerHit[]> {
  if (!canCreate(auth)) throw forbidden()
  const q = foldVietnamese(query).slice(0, 100)
  if (q.length < 2) return []
  const digits = phoneFragment(query)
  return withUser(auth.userId, async (tx) => {
    const rows = await tx<CustomerRow[]>`
      select id, name, phone, version, created_at from customers
      where search_norm like ${`%${escapeLike(q)}%`} escape '\\'
         or (${digits}::text is not null and phone like ${digits ? `%${escapeLike(digits)}%` : null} escape '\\')
      order by (${digits}::text is not null and phone = ${digits}) desc, (search_norm like ${`${escapeLike(q)}%`} escape '\\') desc,
               updated_at desc
      limit ${MAX_SEARCH}`
    return rows.map(hit)
  })
}

/** Khách khác đã dùng SĐT này (Q06: được trùng, chỉ nhắc). */
export async function samePhone(tx: Tx, phone: string | null, excludeId: string | null) {
  if (!phone) return []
  const rows = await tx<CustomerRow[]>`
    select id, name, phone, version, created_at from customers
    where phone = ${phone} and (${excludeId}::uuid is null or id <> ${excludeId}::uuid)
    order by created_at limit 5`
  return rows.map(hit)
}

export async function insertCustomer(tx: Tx, auth: Auth, name: string, phone: string | null) {
  const [org] = await tx<{ id: string }[]>`select app.user_org() as id`
  if (!org?.id) throw forbidden()
  const [row] = await tx<CustomerRow[]>`
    insert into customers (organization_id, name, phone, search_norm, created_by, updated_by)
    values (${org.id}, ${name}, ${phone}, ${customerSearchNorm(name, phone)}, ${auth.userId}, ${auth.userId})
    returning id, name, phone, version, created_at`
  return row!
}

export async function createCustomer(auth: Auth, input: { name: string; phone?: string | null }) {
  if (!canCreate(auth)) throw forbidden('Không có quyền tạo khách.')
  const name = input.name.trim()
  const phone = cleanCustomerPhone(input.phone)
  return withUser(auth.userId, async (tx) => {
    const same = await samePhone(tx, phone, null)
    const row = await insertCustomer(tx, auth, name, phone)
    return { customer: { ...hit(row), phone: row.phone, version: row.version }, samePhone: same }
  })
}

export async function getCustomer(auth: Auth, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Không tìm thấy khách.')
  return withUser(auth.userId, async (tx) => {
    const [row] = await tx<CustomerRow[]>`
      select id, name, phone, version, created_at from customers where id = ${id}`
    if (!row) throw notFound('Không tìm thấy khách.')
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      version: row.version,
      canEdit: auth.branches.some((b) => b.perms.includes('customers.edit')),
    }
  })
}
