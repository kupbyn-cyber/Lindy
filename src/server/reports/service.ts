// Tổng quan (UI02, bước 2.20) và báo cáo doanh thu ngày/tháng (UI13, PRD §11, bước 2.21).
// Doanh thu chỉ tính đơn Đã xác nhận, theo ngày làm dịch vụ (Q01, Q02). Lượt khách = số đơn đã xác nhận (K13).
// Linh, Nhung (revenue.read_branch) xem số toàn quán; thợ chỉ thấy số của mình (K09). Đợt 3A: Tiền trong quỹ
// (money_accounts.read_balance), cọc nhận / hoàn / giữ, doanh thu cọc khách bỏ hẹn tách riêng. Tip, thu chi ở 3B.
import { isIsoDate, toLocalDate } from '~/lib/time'
import { attendanceAttention } from '../attendance/service'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden, invalid } from '../http/errors'
import { balancesOf } from '../money/service'
import { reviewPending } from '../orders/service'
import { reviewCount } from '../review/service'

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
  /** Đã hoàn (phiếu hoàn ghi vào khoảng ngày này) */
  refunded: number
  /** Doanh thu thuần = tiền thuần các đơn − đã hoàn */
  net: number
  /** Đã thu của các đơn này, trừ phần đã hoàn */
  paid: number
  due: number
  unpaidOrders: number
}

/**
 * Tổng đơn đã xác nhận trong khoảng ngày làm dịch vụ (RLS lọc theo người xem). Phiếu hoàn trừ vào doanh thu của ngày ghi
 * hoàn (`revenue_date`; Đợt 3 = ngày làm dịch vụ của đơn).
 */
async function totals(tx: Tx, branchId: string, from: string, to: string): Promise<Totals> {
  const [r] = await tx<Record<string, unknown>[]>`
    with o as (
      select o.id, o.gross_amount, o.discount_amount, o.net_amount,
             coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.voided_at is null), 0) as paid,
             coalesce((select sum(rr.amount) from order_refunds rr where rr.order_id = o.id), 0) as refunded_all
      from orders o
      where o.branch_id = ${branchId} and o.status = 'confirmed' and o.service_date between ${from}::date and ${to}::date
    ), rf as (
      select coalesce(sum(r.amount), 0) as refunded
      from order_refunds r join orders o2 on o2.id = r.order_id
      where r.branch_id = ${branchId} and o2.status = 'confirmed'
        and r.revenue_date between ${from}::date and ${to}::date
    )
    select count(*) as orders, coalesce(sum(gross_amount), 0) as gross, coalesce(sum(discount_amount), 0) as discount,
           (select refunded from rf) as refunded,
           coalesce(sum(net_amount), 0) - (select refunded from rf) as net,
           coalesce(sum(paid - refunded_all), 0) as paid,
           coalesce(sum(greatest(net_amount - paid, 0)), 0) as due,
           count(*) filter (where paid < net_amount) as unpaid_orders
    from o`
  const orders = n(r?.orders)
  return {
    orders,
    guests: orders,
    gross: n(r?.gross),
    discount: n(r?.discount),
    refunded: n(r?.refunded),
    net: n(r?.net),
    paid: n(r?.paid),
    due: n(r?.due),
    unpaidOrders: n(r?.unpaidOrders),
  }
}

/** Doanh thu theo thợ: phần chia trừ phần bị trừ của phiếu hoàn (theo ngày ghi hoàn). */
async function byStaff(tx: Tx, branchId: string, from: string, to: string, onlyUser: string | null) {
  const rows = await tx<{ userId: string; name: string; amount: string; orders: string }[]>`
    select x.staff_user_id as user_id, u.display_name as name, sum(x.amount) as amount,
           count(distinct x.order_id) as orders
    from (
      select a.staff_user_id, a.allocated_net_amount as amount, o.id as order_id
      from orders o join order_staff_allocations a on a.order_id = o.id and a.rev = o.content_rev
      where o.branch_id = ${branchId} and o.status = 'confirmed' and o.service_date between ${from}::date and ${to}::date
      union all
      select ra.staff_user_id, -ra.amount, null
      from order_refund_allocations ra join order_refunds r on r.id = ra.refund_id join orders o on o.id = r.order_id
      where r.branch_id = ${branchId} and o.status = 'confirmed' and r.revenue_date between ${from}::date and ${to}::date
    ) x join users u on u.id = x.staff_user_id
    where (${onlyUser}::uuid is null or x.staff_user_id = ${onlyUser}::uuid)
    group by x.staff_user_id, u.display_name
    order by sum(x.amount) desc`
  return rows.map((r) => ({ userId: r.userId, name: r.name, amount: n(r.amount), orders: n(r.orders) }))
}

// ---------------------------------------------------------------- Tổng quan (UI02)

export async function overview(auth: Auth, input: { branchId?: string; period: 'day' | 'month' }) {
  const branch = requireBranch(auth, input.branchId)
  const all = hasPerm(auth, branch.id, 'revenue.read_branch')
  const isOwner = hasPerm(auth, branch.id, 'review_queue.read')
  const canConfirm = hasPerm(auth, branch.id, 'order.confirm')
  const balances = hasPerm(auth, branch.id, 'money_accounts.read_balance')
  return withUser(auth.userId, async (tx) => {
    const { tz, today } = await branchToday(tx, branch.id)
    const from = input.period === 'month' ? `${today.slice(0, 8)}01` : today
    const t = all ? await totals(tx, branch.id, from, today) : null
    // Tiền trong quỹ (PRD §5.2): Linh, Nhung; chưa mở sổ thì số dư null
    const money = balances
      ? (await balancesOf(tx, branch.id)).map((a) => ({ id: a.id, name: a.name, balance: a.balance }))
      : null
    const deposits = all ? await depositStats(tx, branch.id, tz, from, today) : null
    const staff = await byStaff(tx, branch.id, from, today, all ? null : auth.userId)
    // P41: đếm mọi ngày (đơn ngày cũ chưa xác nhận thì chưa vào doanh thu, không được quên)
    const [c] = await tx<Record<string, unknown>[]>`
      select
        count(*) filter (where o.status = 'awaiting_confirmation') as awaiting,
        count(*) filter (where o.status = 'in_progress' and o.created_by = ${auth.userId}) as my_in_progress,
        count(*) filter (where o.status in ('in_progress', 'awaiting_confirmation') and o.required_level = 'owner'
                         and (o.discount_approval_hash is distinct from o.pricing_hash
                              or o.discount_approved_level is distinct from 'owner')) as owner_approval,
        count(*) filter (where ${reviewPending(tx)}) as review
      from orders o
      where o.branch_id = ${branch.id}
        and (o.status in ('in_progress', 'awaiting_confirmation') or ${reviewPending(tx)})`
    // Thu chi (Đợt 3B): phiếu chờ duyệt mức mình duyệt được, phiếu đã duyệt chờ chi; Linh xem lại phiếu Nhung tự
    // duyệt, lệch quỹ; ngày chưa chốt quỹ (trước hôm nay) cho người chốt
    const approveAny = hasPerm(auth, branch.id, 'expense.approve_above_limit')
    const approveWithin = hasPerm(auth, branch.id, 'expense.approve_within_limit')
    const manage = hasPerm(auth, branch.id, 'cashbook.manage')
    const [x] = await tx<Record<string, unknown>[]>`
      select
        (select count(*) from expense_requests where branch_id = ${branch.id} and status = 'requested'
           and (${approveAny} or (${approveWithin} and required_level = 'manager'))) as expenses_to_approve,
        (select count(*) from expense_requests where branch_id = ${branch.id} and status = 'approved') as expenses_to_pay,
        (select count(*) from expense_requests where branch_id = ${branch.id} and needs_owner_review
           and reviewed_at is null) as expenses_review,
        (select count(*) from cash_day_closes where branch_id = ${branch.id} and needs_owner_review
           and reviewed_at is null) as closes_review,
        (select case when mb.branch_id is null then null
                     else greatest(mb.opening_date, coalesce(max(c.business_date) + 1, mb.opening_date))::text end
         from money_books mb left join cash_day_closes c on c.branch_id = mb.branch_id
         where mb.branch_id = ${branch.id} group by mb.branch_id, mb.opening_date) as first_unclosed`
    const firstUnclosed = (x?.firstUnclosed as string | null) ?? null
    return {
      period: input.period,
      from,
      to: today,
      revenue: t,
      money,
      deposits,
      byStaff: staff,
      mine: all ? null : (staff[0]?.amount ?? 0),
      attention: {
        awaiting: canConfirm ? n(c?.awaiting) : 0,
        myInProgress: n(c?.myInProgress),
        ownerApproval: isOwner ? n(c?.ownerApproval) : 0,
        review: isOwner ? n(c?.review) : 0,
        expensesToApprove: approveAny || approveWithin ? n(x?.expensesToApprove) : 0,
        expensesToPay: manage ? n(x?.expensesToPay) : 0,
        expensesReview: isOwner ? n(x?.expensesReview) : 0,
        closesReview: isOwner ? n(x?.closesReview) : 0,
        /** Ngày chưa chốt quỹ sớm nhất, nếu trước hôm nay (quên chốt) */
        closeOverdue: manage && firstUnclosed && firstUnclosed < today ? firstUnclosed : null,
        /** Tổng mục Cần xem lại của Linh (trang Thêm → Cần xem lại) */
        reviewTotal: isOwner ? await reviewCount(tx, branch.id) : 0,
        /** Tip giữ hộ chưa trả (RLS: Nhung, Linh thấy cả quán; thợ thấy tip của mình) */
        tipsPending: (await tipsHolding(tx, branch.id)).amount,
        /** Đợt 4A: ngày công chưa duyệt (trước hôm nay), đơn nghỉ chờ duyệt — Nhung, Linh */
        ...(await attendanceAttention(tx, auth, branch.id)),
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

// Nhóm dòng tiền (PRD §7.5) theo loại bút toán; chuyển nội bộ hiện riêng, không cộng vào tổng thu chi
const FLOW: Record<string, { key: string; label: string }> = {
  payment: { key: 'customer', label: 'Thu tiền khách' },
  payment_void: { key: 'customer', label: 'Thu tiền khách' },
  deposit_in: { key: 'deposit_in', label: 'Nhận cọc' },
  deposit_in_void: { key: 'deposit_in', label: 'Nhận cọc' },
  tip_in: { key: 'tip_in', label: 'Tip khách chuyển (giữ hộ thợ)' },
  tip_in_void: { key: 'tip_in', label: 'Tip khách chuyển (giữ hộ thợ)' },
  other_income: { key: 'other_income', label: 'Thu khác' },
  capital_in: { key: 'capital_in', label: 'Góp vốn' },
  deposit_refund: { key: 'deposit_refund', label: 'Hoàn cọc' },
  refund: { key: 'refund', label: 'Hoàn tiền đơn' },
  expense_operating: { key: 'expense_operating', label: 'Chi vận hành' },
  expense_staff: { key: 'expense_staff', label: 'Chi nhân sự (lương, thưởng)' },
  tip_payout: { key: 'tip_payout', label: 'Trả tip cho thợ' },
  capital_out: { key: 'capital_out', label: 'Rút vốn' },
  cash_count_diff: { key: 'adjust', label: 'Chênh lệch quỹ, điều chỉnh' },
  adjustment: { key: 'adjust', label: 'Chênh lệch quỹ, điều chỉnh' },
}

/**
 * Dòng tiền (PRD §7.5, Đợt 3B-2 bước 3.20) từ sổ bút toán: số dư đầu/cuối từng tài khoản, thu chi theo nhóm, chi theo
 * nhóm chi, theo ngày. Chỉ Linh, Nhung (RLS money_accounts.read_balance); chưa mở sổ → null. Số dư mở sổ tính vào đầu kỳ.
 */
async function cashflow(tx: Tx, branchId: string, from: string, to: string) {
  const [book] = await tx<{ openingDate: string }[]>`
    select opening_date::text as opening_date from money_books where branch_id = ${branchId}`
  if (!book || book.openingDate > to) return null
  const start = from > book.openingDate ? from : book.openingDate
  const accounts = await tx<{ name: string; opening: string; closing: string }[]>`
    select m.name,
           coalesce(sum(e.amount) filter (where e.business_date < ${start}::date or e.entry_type = 'opening'), 0) as opening,
           coalesce(sum(e.amount), 0) as closing
    from money_accounts m
    left join money_ledger_entries e on e.money_account_id = m.id
      and e.business_date >= ${book.openingDate}::date and e.business_date <= ${to}::date
    where m.branch_id = ${branchId} and m.is_active and app.can_view_account(m.id)
    group by m.id order by case m.type when 'cash' then 0 else 1 end, m.code`
  const groups = await tx<{ type: string; amount: string }[]>`
    select case when e.entry_type = 'expense' then 'expense_' || coalesce(c.kind, 'operating') else e.entry_type end as type,
           sum(e.amount) as amount
    from money_ledger_entries e
    left join expense_requests x on e.source_type = 'expense' and x.id = e.source_id
    left join expense_categories c on c.code = x.category_code
    where e.branch_id = ${branchId} and e.business_date between ${start}::date and ${to}::date and e.entry_type <> 'opening'
    group by 1`
  const byCategory = await tx<{ name: string; amount: string }[]>`
    select c.name, sum(-e.amount) as amount
    from money_ledger_entries e
    join expense_requests x on e.source_type = 'expense' and x.id = e.source_id
    join expense_categories c on c.code = x.category_code
    where e.branch_id = ${branchId} and e.business_date between ${start}::date and ${to}::date
    group by c.name, c.sort_order order by c.sort_order`
  const days = await tx<{ date: string; inflow: string; outflow: string }[]>`
    select business_date::text as date,
           coalesce(sum(amount) filter (where amount > 0), 0) as inflow,
           coalesce(sum(-amount) filter (where amount < 0), 0) as outflow
    from money_ledger_entries
    where branch_id = ${branchId} and business_date between ${start}::date and ${to}::date
      and entry_type not in ('opening', 'transfer_in', 'transfer_out')
    group by business_date order by business_date`
  const lines = new Map<string, { key: string; label: string; amount: number }>()
  let transfers = 0
  for (const g of groups) {
    if (g.type === 'transfer_out') transfers += -n(g.amount)
    const f = FLOW[g.type]
    if (!f) continue
    const cur = lines.get(f.key) ?? { ...f, amount: 0 }
    cur.amount += n(g.amount)
    lines.set(f.key, cur)
  }
  const list = [...lines.values()].filter((l) => l.amount !== 0)
  return {
    from: start,
    to,
    accounts: accounts.map((a) => ({ name: a.name, opening: n(a.opening), closing: n(a.closing) })),
    inflows: list.filter((l) => l.amount > 0),
    outflows: list.filter((l) => l.amount < 0).map((l) => ({ ...l, amount: -l.amount })),
    totalIn: list.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0),
    totalOut: list.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0),
    transfers,
    customerReceipts: lines.get('customer')?.amount ?? 0,
    byCategory: byCategory.map((c) => ({ name: c.name, amount: n(c.amount) })),
    byDay: days.map((d) => ({ date: d.date, inflow: n(d.inflow), outflow: n(d.outflow) })),
  }
}

/**
 * Cọc mùa Tết (Đợt 3): nhận (đã xác nhận), hoàn, giữ trong khoảng ngày; đang giữ, chờ xác nhận tính đến lúc xem.
 * Cọc bị giữ là doanh thu "cọc khách bỏ hẹn", tách riêng, ghi theo ngày hẹn, phần của người nhận (A03, C04).
 */
async function depositStats(tx: Tx, branchId: string, tz: string, from: string, to: string) {
  const [r] = await tx<Record<string, unknown>[]>`
    select
      coalesce(sum(amount) filter (where status <> 'voided'
        and (confirmed_at at time zone ${tz})::date between ${from}::date and ${to}::date), 0) as received,
      coalesce(sum(resolved_amount) filter (where status = 'refunded'
        and (resolved_at at time zone ${tz})::date between ${from}::date and ${to}::date), 0) as refunded,
      coalesce(sum(resolved_amount) filter (where status = 'forfeited'
        and revenue_date between ${from}::date and ${to}::date), 0) as forfeited,
      coalesce(sum(amount - coalesce(resolved_amount, 0) - app.deposit_applied(id)) filter (where status = 'confirmed'), 0)
        as held,
      coalesce(sum(amount) filter (where status = 'recorded'), 0) as pending
    from appointment_deposits where branch_id = ${branchId}`
  const owners = await tx<{ name: string; amount: string }[]>`
    select u.display_name as name, sum(d.resolved_amount) as amount
    from appointment_deposits d join users u on u.id = d.forfeit_owner_user_id
    where d.branch_id = ${branchId} and d.status = 'forfeited' and d.revenue_date between ${from}::date and ${to}::date
    group by u.display_name order by u.display_name`
  return {
    received: n(r?.received),
    refunded: n(r?.refunded),
    forfeited: n(r?.forfeited),
    forfeitedByOwner: owners.map((o) => ({ name: o.name, amount: n(o.amount) })),
    held: n(r?.held),
    pending: n(r?.pending),
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
      deposits: await depositStats(tx, branch.id, tz, date, date),
      cashflow: await cashflow(tx, branch.id, date, date),
      dayClose: await dayCloseOf(tx, branch.id, date),
      tipsHolding: await tipsHolding(tx, branch.id),
    }
  })
}

/** Bản chốt quỹ của ngày (nếu đã chốt; RLS: Linh, Nhung) */
async function dayCloseOf(tx: Tx, branchId: string, date: string) {
  const [c] = await tx<
    {
      expected: string
      counted: string
      difference: string
      reason: string | null
      closedByName: string | null
    }[]
  >`
    select c.expected, c.counted, c.difference, c.reason, u.display_name as closed_by_name
    from cash_day_closes c left join users u on u.id = c.closed_by
    where c.branch_id = ${branchId} and c.business_date = ${date}::date`
  return c
    ? {
        expected: n(c.expected),
        counted: n(c.counted),
        difference: n(c.difference),
        reason: c.reason,
        closedByName: c.closedByName,
      }
    : null
}

/** Tip giữ hộ chưa trả thợ (hiện tại) */
async function tipsHolding(tx: Tx, branchId: string) {
  const [t] = await tx<{ amount: string; count: string }[]>`
    select coalesce(sum(amount), 0) as amount, count(*) as count from tip_holdings
    where branch_id = ${branchId} and payout_id is null and voided_at is null`
  return { amount: n(t?.amount), count: n(t?.count) }
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

    // Theo ngày: đơn đã xác nhận theo ngày làm dịch vụ, trừ phiếu hoàn theo ngày ghi hoàn
    const days = await tx<{ date: string; orders: string; net: string }[]>`
      select d.date::text as date, sum(d.orders) as orders, sum(d.net) as net
      from (
        select service_date as date, count(*) as orders, sum(net_amount) as net
        from orders where branch_id = ${branch.id} and status = 'confirmed'
          and service_date between ${from}::date and ${to}::date
        group by service_date
        union all
        select r.revenue_date, 0, -sum(r.amount)
        from order_refunds r join orders o on o.id = r.order_id
        where r.branch_id = ${branch.id} and o.status = 'confirmed'
          and r.revenue_date between ${from}::date and ${to}::date
        group by r.revenue_date
      ) d
      group by d.date order by d.date`
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
      deposits: await depositStats(tx, branch.id, tz, from, to),
      cashflow: await cashflow(tx, branch.id, from, to),
      customers: {
        new: n(cust?.newCustomers),
        returning: n(cust?.returningCustomers),
        walkIn: n(walkIn?.c),
      },
    }
  })
}
