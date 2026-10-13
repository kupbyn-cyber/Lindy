// Khách hàng (PRD §10; D10-B; Q06). Hồ sơ chung cả tổ chức; chỉ tên, SĐT, lịch sử đơn.
// Danh sách tìm kiếm chỉ trả SĐT đã che; chi tiết mới trả đủ số [P34].
import { normalizePhone } from '~/lib/phone'
import { escapeLike, foldVietnamese } from '~/lib/text'
import type { Auth } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'

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

const canEditCustomers = (auth: Auth) => auth.branches.some((b) => b.perms.includes('customers.edit'))
const readsAllOrders = (auth: Auth) => auth.branches.some((b) => b.perms.includes('order.read_all'))

/** Khách có đơn gần đây (trong phạm vi đơn người xem thấy được, K09). Dùng khi chưa gõ từ khoá. */
export async function recentCustomers(auth: Auth): Promise<(CustomerHit & { lastDate: string })[]> {
  if (!canCreate(auth)) throw forbidden()
  return withUser(auth.userId, async (tx) => {
    const rows = await tx<(CustomerRow & { lastDate: string })[]>`
      select c.id, c.name, c.phone, c.version, c.created_at, max(o.service_date)::text as last_date
      from customers c join orders o on o.customer_id = c.id
      where o.status <> 'cancelled'
      group by c.id
      order by max(o.service_date) desc, max(o.created_at) desc
      limit 30`
    return rows.map((r) => ({ ...hit(r), lastDate: r.lastDate }))
  })
}

export type CustomerOrder = {
  id: string
  codeLabel: string
  branchName: string
  serviceDate: string
  status: string
  netAmount: number
  items: string[]
  staff: string[]
  warrantyUntil: string | null
}

export async function getCustomer(auth: Auth, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Không tìm thấy khách.')
  return withUser(auth.userId, async (tx) => {
    const [row] = await tx<CustomerRow[]>`
      select id, name, phone, version, created_at from customers where id = ${id}`
    if (!row) throw notFound('Không tìm thấy khách.')
    // Ghi lại ai xem SĐT đầy đủ của khách [P38]
    if (row.phone) {
      await tx`
        insert into audit_logs (actor_user_id, action, entity_type, entity_id)
        values (${auth.userId}, 'customer.phone_viewed', 'customer', ${row.id})`
    }
    // Lịch sử đơn: RLS chỉ trả đơn người xem được thấy (K09); không tự gộp khách trùng tên (test 16)
    const orders = await tx<CustomerOrder[]>`
      select o.id, '#' || lpad(o.code::text, 4, '0') as code_label, b.short_label as branch_name,
             o.service_date::text as service_date, o.status, o.net_amount::int as net_amount,
             o.warranty_until::text as warranty_until,
             coalesce((select array_agg(i.name || case when i.quantity > 1 then ' ×' || i.quantity else '' end
                                        order by i.position)
                       from order_items i where i.order_id = o.id and i.rev = o.content_rev), '{}') as items,
             coalesce((select array_agg(distinct u.display_name)
                       from order_staff_allocations a join users u on u.id = a.staff_user_id
                       where a.order_id = o.id and a.rev = o.content_rev), '{}') as staff
      from orders o join branches b on b.id = o.branch_id
      where o.customer_id = ${id}
      order by o.service_date desc, o.created_at desc
      limit 100`
    const confirmed = orders.filter((o) => o.status === 'confirmed')
    const changes = canEditCustomers(auth)
      ? await tx<
          {
            action: string
            afterJson: unknown
            beforeJson: unknown
            occurredAt: Date
            actorName: string | null
          }[]
        >`
          select e.action, e.after_json, e.before_json, e.occurred_at, u.display_name as actor_name
          from customer_audit_events e left join users u on u.id = e.actor_user_id
          where e.customer_id = ${id} order by e.id desc limit 20`
      : []
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      version: row.version,
      createdAt: new Date(row.createdAt).toISOString(),
      canEdit: canEditCustomers(auth),
      orders,
      // Tổng chỉ cho người xem được mọi đơn; thợ chỉ thấy đơn của mình nên tổng sẽ sai lệch
      stats: readsAllOrders(auth)
        ? {
            visits: confirmed.length,
            spent: confirmed.reduce((s, o) => s + o.netAmount, 0),
            lastDate: confirmed[0]?.serviceDate ?? null,
          }
        : null,
      changes: changes.map((c) => ({ ...c, occurredAt: new Date(c.occurredAt).toISOString() })),
    }
  })
}

export async function updateCustomer(
  auth: Auth,
  id: string,
  input: { version: number; name: string; phone?: string | null },
) {
  if (!canEditCustomers(auth)) throw forbidden('Chỉ Nhung, Linh sửa được thông tin khách.')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Không tìm thấy khách.')
  const name = input.name.trim()
  const phone = cleanCustomerPhone(input.phone)
  return withUser(auth.userId, async (tx) => {
    const [cur] = await tx<
      CustomerRow[]
    >`select id, name, phone, version, created_at from customers where id = ${id}`
    if (!cur) throw notFound('Không tìm thấy khách.')
    if (cur.version !== input.version) {
      if (cur.name === name && cur.phone === phone) return { customer: { ...hit(cur), phone }, samePhone: [] }
      throw conflict('Thông tin khách vừa được người khác sửa. Tải lại rồi sửa.')
    }
    const [row] = await tx<CustomerRow[]>`
      update customers set name = ${name}, phone = ${phone}, search_norm = ${customerSearchNorm(name, phone)}
      where id = ${id} and version = ${input.version}
      returning id, name, phone, version, created_at`
    if (!row) throw conflict('Thông tin khách vừa được người khác sửa. Tải lại rồi sửa.')
    return {
      customer: { ...hit(row), phone: row.phone, version: row.version },
      samePhone: await samePhone(tx, phone, id),
    }
  })
}
