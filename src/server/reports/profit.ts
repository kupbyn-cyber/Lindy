// Lợi nhuận ước tính tháng (Đợt 5A, bước 5.2; PRD §1, §7.1, §11; K23; test 27). Chỉ Linh (profit.read).
// = doanh thu thuần + doanh thu cọc khách bỏ hẹn − chi vận hành đã chi − chi nhân sự ngoài bảng lương đã chi − lương
// phải trả của tháng. Chi theo ngày chi (bút toán). Lương: từ tháng bắt đầu tính lương trên app lấy bảng lương (tạm tính
// hoặc đã khoá); trước đó chỉ có phiếu chi nhóm Lương, Thưởng. Thu khác, vốn, tạm ứng, tip, chênh lệch quỹ, điều chỉnh
// hiện riêng, không cộng vào.
import { monthRange } from '~/lib/time'
import type { Tx } from '../db/client'

const n = (v: unknown) => Number(v ?? 0)

const EXCLUDED: Record<string, string> = {
  other_income: 'Thu khác',
  capital_in: 'Góp vốn',
  capital_out: 'Rút vốn',
  advance: 'Tạm ứng đã chi (nhân viên nợ quán)',
  tip_in: 'Tip khách chuyển (giữ hộ thợ)',
  tip_in_void: 'Tip khách chuyển (giữ hộ thợ)',
  tip_payout: 'Trả tip cho thợ',
  cash_count_diff: 'Chênh lệch kiểm quỹ',
  adjustment: 'Bút toán điều chỉnh',
}

export async function monthProfit(
  tx: Tx,
  branchId: string,
  ym: string,
  revenue: { net: number; forfeited: number },
) {
  const { first, last } = monthRange(ym)
  const expenses = await tx<{ kind: 'operating' | 'staff'; name: string; amount: string }[]>`
    select c.kind, c.name, sum(-e.amount) as amount
    from money_ledger_entries e
    join expense_requests x on e.source_type = 'expense' and x.id = e.source_id
    join expense_categories c on c.code = x.category_code
    where e.branch_id = ${branchId} and e.business_date between ${first}::date and ${last}::date
    group by c.kind, c.name, c.sort_order
    order by c.sort_order`
  const others = await tx<{ type: string; amount: string }[]>`
    select entry_type as type, sum(amount) as amount from money_ledger_entries
    where branch_id = ${branchId} and business_date between ${first}::date and ${last}::date
      and entry_type = any(${Object.keys(EXCLUDED)}::text[])
    group by entry_type`
  const [s] = await tx<{ startMonth: string | null }[]>`
    select start_month::text from payroll_settings where branch_id = ${branchId}`
  let payroll: { amount: number; fromApp: boolean; locked: boolean } = {
    amount: 0,
    fromApp: false,
    locked: false,
  }
  if (s?.startMonth && first >= s.startMonth) {
    // Chi phí lương = lương phải trả trước khi trừ phần tạm ứng vượt lương tháng trước (đó là khoản nợ, không phải chi phí)
    const [p] = await tx<{ cost: string; locked: boolean }[]>`
      select coalesce(sum(base_salary + attendance_adjustment + commission + kpi_bonus + bonus - deduction), 0) as cost,
             bool_or(locked) as locked
      from app.payroll_view(${branchId}, ${first}::date)`
    payroll = { amount: n(p?.cost), fromApp: true, locked: !!p?.locked }
  }
  const operating = expenses
    .filter((e) => e.kind === 'operating')
    .map((e) => ({ name: e.name, amount: n(e.amount) }))
  const staff = expenses.filter((e) => e.kind === 'staff').map((e) => ({ name: e.name, amount: n(e.amount) }))
  const operatingTotal = operating.reduce((a, e) => a + e.amount, 0)
  const staffTotal = staff.reduce((a, e) => a + e.amount, 0)
  const excluded = new Map<string, number>()
  for (const o of others) {
    const label = EXCLUDED[o.type]!
    excluded.set(label, (excluded.get(label) ?? 0) + n(o.amount))
  }
  const [t] = await tx<{ today: string }[]>`select app.branch_today(${branchId})::text as today`
  return {
    month: ym,
    /** Tháng chưa hết: doanh thu, chi tính đến hôm nay; lương tính cả tháng (tạm tính) [P80] */
    partial: last >= t!.today,
    revenue: revenue.net,
    forfeited: revenue.forfeited,
    operating,
    operatingTotal,
    staff,
    staffTotal,
    payroll,
    profit: revenue.net + revenue.forfeited - operatingTotal - staffTotal - payroll.amount,
    excluded: [...excluded.entries()]
      .filter(([, v]) => v !== 0)
      .map(([label, amount]) => ({ label, amount })),
  }
}

export type MonthProfit = Awaited<ReturnType<typeof monthProfit>>
