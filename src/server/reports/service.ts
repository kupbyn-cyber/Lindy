// Tổng quan (UI02, bước 2.20) và báo cáo doanh thu ngày/tháng (UI13, PRD §11, bước 2.21).
// Doanh thu chỉ tính đơn Đã xác nhận, theo ngày làm dịch vụ (Q01, Q02). Lượt khách = số đơn đã xác nhận (K13).
// Linh, Nhung (revenue.read_branch) xem số toàn quán; thợ chỉ thấy số của mình (K09). Tiền trong quỹ, cọc, tip, thu chi
// có ở Đợt 3.
import { addDays, isIsoDate, toLocalDate } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden, invalid } from '../http/errors'

const n = (v: unknown) => Number(v ?? 0)

async function branchToday(tx: Tx, branchId: string) {
  const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
  const tz = b?.timezone ?? 'Asia/Ho_Chi_Minh'
  return { tz, today: toLocalDate(new Date(), tz) }
}

type Totals = {
  orders: number
  guests: number
  gross: number
  discount: number
  net: number
  paid: number
  due: number
  unpaidOrders: number
}

/** Tổng đơn đã xác nhận trong khoảng ngày làm dịch vụ (RLS lọc theo người xem). */
async function totals(tx: Tx, branchId: string, from: string, to: string): Promise<Totals> {
  const [r] = await tx<Record<string, unknown>[]>`
    with o as (
      select o.id, o.gross_amount, o.discount_amount, o.net_amount,
             coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.voided_at is null), 0) as paid
      from orders o
      where o.branch_id = ${branchId} and o.status = 'confirmed' and o.service_date between ${from}::date and ${to}::date
    )
    select count(*) as orders, coalesce(sum(gross_amount), 0) as gross, coalesce(sum(discount_amount), 0) as discount,
           coalesce(sum(net_amount), 0) as net, coalesce(sum(paid), 0) as paid,
           coalesce(sum(greatest(net_amount - paid, 0)), 0) as due,
           count(*) filter (where paid < net_amount) as unpaid_orders
    from o`
  const orders = n(r?.orders)
  return {
    orders,
    guests: orders,
    gross: n(r?.gross),
    discount: n(r?.discount),
    net: n(r?.net),
    paid: n(r?.paid),
    due: n(r?.due),
    unpaidOrders: n(r?.unpaidOrders),
  }
}

async function byStaff(tx: Tx, branchId: string, from: string, to: string, onlyUser: string | null) {
  const rows = await tx<{ userId: string; name: string; amount: string; orders: string }[]>`
    select a.staff_user_id as user_id, u.display_name as name, sum(a.allocated_net_amount) as amount,
           count(distinct o.id) as orders
    from orders o
    join order_staff_allocations a on a.order_id = o.id and a.rev = o.content_rev
    join users u on u.id = a.staff_user_id
    where o.branch_id = ${branchId} and o.status = 'confirmed' and o.service_date between ${from}::date and ${to}::date
      and (${onlyUser}::uuid is null or a.staff_user_id = ${onlyUser}::uuid)
    group by a.staff_user_id, u.display_name
    order by sum(a.allocated_net_amount) desc`
  return rows.map((r) => ({ userId: r.userId, name: r.name, amount: n(r.amount), orders: n(r.orders) }))
}

// ---------------------------------------------------------------- Tổng quan (UI02)

export async function overview(auth: Auth, input: { branchId?: string; period: 'day' | 'month' }) {
  const branch = requireBranch(auth, input.branchId)
  const all = hasPerm(auth, branch.id, 'revenue.read_branch')
  const isOwner = hasPerm(auth, branch.id, 'review_queue.read')
  const canConfirm = hasPerm(auth, branch.id, 'order.confirm')
  return withUser(auth.userId, async (tx) => {
    const { today } = await branchToday(tx, branch.id)
    const from = input.period === 'month' ? `${today.slice(0, 8)}01` : today
    const t = all ? await totals(tx, branch.id, from, today) : null
    const staff = await byStaff(tx, branch.id, from, today, all ? null : auth.userId)
    const [c] = await tx<Record<string, unknown>[]>`
      select
        count(*) filter (where status = 'awaiting_confirmation') as awaiting,
        count(*) filter (where status = 'in_progress' and created_by = ${auth.userId}) as my_in_progress,
        count(*) filter (where status in ('in_progress', 'awaiting_confirmation') and required_level = 'owner'
                         and (discount_approval_hash is distinct from pricing_hash
                              or discount_approved_level is distinct from 'owner')) as owner_approval,
        count(*) filter (where needs_owner_review and reviewed_at is null) as review
      from orders where branch_id = ${branch.id} and service_date > ${addDays(today, -31)}::date`
    return {
      period: input.period,
      from,
      to: today,
      revenue: t,
      byStaff: staff,
      mine: all ? null : (staff[0]?.amount ?? 0),
      attention: {
        awaiting: canConfirm ? n(c?.awaiting) : 0,
        myInProgress: n(c?.myInProgress),
        ownerApproval: isOwner ? n(c?.ownerApproval) : 0,
        review: isOwner ? n(c?.review) : 0,
      },
    }
  })
}

// ---------------------------------------------------------------- Báo cáo (UI13)

function requireRevenue(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'revenue.read_branch'))
    throw forbidden('Chỉ Linh, Nhung xem được báo cáo doanh thu.')
  return branch
}

/** Tiền thu theo tài khoản, theo ngày nhận tiền (khác doanh thu: theo ngày làm dịch vụ). */
async function receipts(tx: Tx, branchId: string, tz: string, from: string, to: string) {
  const rows = await tx<{ name: string; method: string; amount: string; count: string }[]>`
    select m.name, p.method, sum(p.amount) as amount, count(*) as count
    from payments p join money_accounts m on m.id = p.money_account_id
    where p.branch_id = ${branchId} and p.voided_at is null
      and (p.received_at at time zone ${tz})::date between ${from}::date and ${to}::date
    group by m.name, p.method order by m.name`
  return rows.map((r) => ({ account: r.name, method: r.method, amount: n(r.amount), count: n(r.count) }))
}

async function appointmentStats(tx: Tx, branchId: string, tz: string, from: string, to: string) {
  const [r] = await tx<Record<string, unknown>[]>`
    select count(*) filter (where status <> 'cancelled') as total,
           count(*) filter (where status = 'pending') as pending,
           count(*) filter (where status in ('arrived', 'in_progress', 'completed')) as arrived,
           count(*) filter (where status = 'cancelled') as cancelled,
           count(*) filter (where status = 'no_show') as no_show
    from appointments
    where branch_id = ${branchId} and (start_at at time zone ${tz})::date between ${from}::date and ${to}::date`
  return {
    total: n(r?.total),
    pending: n(r?.pending),
    arrived: n(r?.arrived),
    cancelled: n(r?.cancelled),
    noShow: n(r?.noShow),
  }
}

async function orderCounts(tx: Tx, branchId: string, from: string, to: string) {
  const [r] = await tx<Record<string, unknown>[]>`
    select count(*) filter (where status = 'confirmed') as confirmed,
           count(*) filter (where status = 'awaiting_confirmation') as awaiting,
           count(*) filter (where status = 'in_progress') as in_progress,
           count(*) filter (where status = 'cancelled') as cancelled,
           count(*) filter (where status = 'confirmed' and needs_owner_review and reviewed_at is null) as review
    from orders where branch_id = ${branchId} and service_date between ${from}::date and ${to}::date`
  return {
    confirmed: n(r?.confirmed),
    awaiting: n(r?.awaiting),
    inProgress: n(r?.inProgress),
    cancelled: n(r?.cancelled),
    review: n(r?.review),
  }
}

export async function dayReport(auth: Auth, input: { branchId?: string; date?: string }) {
  const branch = requireRevenue(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const { tz, today } = await branchToday(tx, branch.id)
    const date = input.date ?? today
    if (!isIsoDate(date)) throw invalid('Ngày không hợp lệ.')
    return {
      date,
      revenue: await totals(tx, branch.id, date, date),
      orders: await orderCounts(tx, branch.id, date, date),
      byStaff: await byStaff(tx, branch.id, date, date, null),
      receipts: await receipts(tx, branch.id, tz, date, date),
      appointments: await appointmentStats(tx, branch.id, tz, date, date),
    }
  })
}

export async function monthReport(auth: Auth, input: { branchId?: string; month?: string }) {
  const branch = requireRevenue(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const { tz, today } = await branchToday(tx, branch.id)
    const month = input.month ?? today.slice(0, 7)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw invalid('Tháng không hợp lệ.')
    const from = `${month}-01`
    const [last] = await tx<
      { d: string }[]
    >`select (${from}::date + interval '1 month - 1 day')::date::text as d`
    const to = last!.d

    const days = await tx<{ date: string; orders: string; net: string }[]>`
      select service_date::text as date, count(*) as orders, sum(net_amount) as net
      from orders where branch_id = ${branch.id} and status = 'confirmed'
        and service_date between ${from}::date and ${to}::date
      group by service_date order by service_date`
    const services = await tx<{ name: string; kind: string; quantity: string; net: string }[]>`
      select i.name, i.line_type as kind, sum(i.quantity) as quantity, sum(i.net_amount) as net
      from orders o join order_items i on i.order_id = o.id and i.rev = o.content_rev
      where o.branch_id = ${branch.id} and o.status = 'confirmed' and o.service_date between ${from}::date and ${to}::date
      group by i.name, i.line_type order by sum(i.net_amount) desc limit 60`
    // Khách mới: lần làm (đơn đã xác nhận) đầu tiên rơi vào tháng này; quay lại: đã có đơn trước tháng
    const [cust] = await tx<Record<string, unknown>[]>`
      with m as (
        select distinct customer_id from orders
        where branch_id = ${branch.id} and status = 'confirmed' and customer_id is not null
          and service_date between ${from}::date and ${to}::date
      )
      select count(*) filter (where not exists (
               select 1 from orders o2 where o2.customer_id = m.customer_id and o2.status = 'confirmed'
               and o2.branch_id = ${branch.id} and o2.service_date < ${from}::date)) as new_customers,
             count(*) filter (where exists (
               select 1 from orders o2 where o2.customer_id = m.customer_id and o2.status = 'confirmed'
               and o2.branch_id = ${branch.id} and o2.service_date < ${from}::date)) as returning_customers
      from m`
    const [walkIn] = await tx<{ c: string }[]>`
      select count(*) as c from orders where branch_id = ${branch.id} and status = 'confirmed' and customer_id is null
        and service_date between ${from}::date and ${to}::date`

    return {
      month,
      from,
      to,
      revenue: await totals(tx, branch.id, from, to),
      byDay: days.map((d) => ({ date: d.date, orders: n(d.orders), net: n(d.net) })),
      byService: services.map((s) => ({
        name: s.name,
        kind: s.kind,
        quantity: n(s.quantity),
        net: n(s.net),
      })),
      byStaff: await byStaff(tx, branch.id, from, to, null),
      receipts: await receipts(tx, branch.id, tz, from, to),
      appointments: await appointmentStats(tx, branch.id, tz, from, to),
      customers: {
        new: n(cust?.newCustomers),
        returning: n(cust?.returningCustomers),
        walkIn: n(walkIn?.c),
      },
    }
  })
}
