// Sổ tiền (UI06, bước 3.3; PRD §7.1–7.2): số dư từng tài khoản, mở sổ, danh sách bút toán.
// Xem: Linh, Nhung (money_accounts.read_balance, Q17). Mở sổ: Linh (cashbook.owner), một lần, ngày 1 của tháng (Q24).
// Số dư = Σ bút toán từ ngày mở sổ; bút toán chỉ do DB ghi (trigger, hàm), app chỉ đọc [P47].
import { addDays, isIsoDate, toLocalDate } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { forbidden, invalid } from '../http/errors'

const n = (v: unknown) => Number(v ?? 0)
const MAX_DAYS = 62
const MAX_ROWS = 500

function requireReader(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'money_accounts.read_balance'))
    throw forbidden('Chỉ Linh, Nhung xem được sổ tiền.')
  return branch
}

async function branchToday(tx: Tx, branchId: string) {
  const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
  return toLocalDate(new Date(), b?.timezone)
}

async function loadBook(tx: Tx, branchId: string) {
  const [b] = await tx<{ openingDate: string; openedAt: Date; openedByName: string | null }[]>`
    select b.opening_date::text as opening_date, b.opened_at, u.display_name as opened_by_name
    from money_books b left join users u on u.id = b.opened_by
    where b.branch_id = ${branchId}`
  return b ?? null
}

export type AccountBalance = {
  id: string
  code: string
  name: string
  type: 'cash' | 'bank'
  balance: number | null
}

/** Số dư các tài khoản đến hết ngày `on` (mặc định hôm nay). Chưa mở sổ → balance = null. */
export async function balancesOf(tx: Tx, branchId: string, on?: string): Promise<AccountBalance[]> {
  const book = await loadBook(tx, branchId)
  const rows = await tx<{ id: string; code: string; name: string; type: 'cash' | 'bank'; balance: string }[]>`
    select m.id, m.code, m.name, m.type,
           coalesce(sum(e.amount) filter (where e.business_date >= ${book?.openingDate ?? null}::date
                                          and (${on ?? null}::date is null or e.business_date <= ${on ?? null}::date)), 0)
             as balance
    from money_accounts m left join money_ledger_entries e on e.money_account_id = m.id
    where m.branch_id = ${branchId} and m.is_active and app.can_view_account(m.id)
    group by m.id
    order by case m.type when 'cash' then 0 else 1 end, m.code`
  return rows.map((r) => ({ ...r, balance: book ? n(r.balance) : null }))
}

export async function getBook(auth: Auth, input: { branchId?: string } = {}) {
  const branch = requireReader(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const book = await loadBook(tx, branch.id)
    return {
      branchId: branch.id,
      today: await branchToday(tx, branch.id),
      book,
      accounts: await balancesOf(tx, branch.id),
      can: { open: !book && hasPerm(auth, branch.id, 'cashbook.owner') },
    }
  })
}

export async function openBook(
  auth: Auth,
  input: { branchId?: string; openingDate: string; amounts: { accountId: string; amount: number }[] },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.owner')) throw forbidden('Chỉ chủ quán mở sổ được.')
  await withUser(auth.userId, async (tx) => {
    await tx`
      select app.open_book(${branch.id}, ${input.openingDate}::date,
                           ${input.amounts.map((a) => a.accountId)}::uuid[],
                           ${input.amounts.map((a) => String(a.amount))}::text[]::bigint[])`
  })
  return getBook(auth, { branchId: branch.id })
}

export type LedgerRow = {
  id: string
  accountId: string
  accountName: string
  type: string
  amount: number
  businessDate: string
  occurredAt: Date
  note: string | null
  createdByName: string | null
  beforeOpening: boolean
  order: { id: string; code: number } | null
}

/** Bút toán trong khoảng ngày (≤ 62 ngày, ≤ 500 dòng), kèm đầu kỳ / vào / ra / cuối kỳ từng tài khoản. */
export async function listEntries(
  auth: Auth,
  input: { branchId?: string; from?: string; to?: string; accountId?: string },
) {
  const branch = requireReader(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const today = await branchToday(tx, branch.id)
    const to = input.to ?? today
    const from = input.from ?? to
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw invalid('Khoảng ngày không hợp lệ.')
    if (addDays(from, MAX_DAYS - 1) < to) throw invalid(`Xem tối đa ${MAX_DAYS} ngày mỗi lần.`)
    const accountId = input.accountId && /^[0-9a-f-]{36}$/i.test(input.accountId) ? input.accountId : null
    const book = await loadBook(tx, branch.id)
    const opening = book?.openingDate ?? null

    const rows = await tx<
      (Omit<LedgerRow, 'amount' | 'order' | 'beforeOpening'> & {
        amount: string
        orderId: string | null
        orderCode: number | null
      })[]
    >`
      select e.id::text as id, e.money_account_id as account_id, m.name as account_name, e.entry_type as type,
             e.amount, e.business_date::text as business_date, e.occurred_at, e.note,
             u.display_name as created_by_name, o.id as order_id, o.code as order_code
      from money_ledger_entries e
      join money_accounts m on m.id = e.money_account_id
      left join users u on u.id = e.created_by
      left join payments p on e.source_type = 'payment' and p.id = e.source_id
      left join orders o on o.id = p.order_id
      where e.branch_id = ${branch.id} and e.business_date between ${from}::date and ${to}::date
        and (${accountId}::uuid is null or e.money_account_id = ${accountId}::uuid)
      order by e.business_date desc, e.id desc
      limit ${MAX_ROWS + 1}`

    const summary = await tx<
      { accountId: string; name: string; type: string; opening: string; inflow: string; outflow: string }[]
    >`
      select m.id as account_id, m.name, m.type,
             coalesce(sum(e.amount) filter (where e.business_date < ${from}::date), 0) as opening,
             coalesce(sum(e.amount) filter (where e.business_date >= ${from}::date and e.amount > 0), 0) as inflow,
             coalesce(sum(-e.amount) filter (where e.business_date >= ${from}::date and e.amount < 0), 0) as outflow
      from money_accounts m
      left join money_ledger_entries e on e.money_account_id = m.id and e.business_date <= ${to}::date
        and ${opening}::date is not null and e.business_date >= ${opening}::date
      where m.branch_id = ${branch.id} and m.is_active and app.can_view_account(m.id)
        and (${accountId}::uuid is null or m.id = ${accountId}::uuid)
      group by m.id
      order by case m.type when 'cash' then 0 else 1 end, m.code`

    return {
      from,
      to,
      book,
      truncated: rows.length > MAX_ROWS,
      accounts: summary.map((s) => {
        const openingBal = n(s.opening)
        const inflow = n(s.inflow)
        const outflow = n(s.outflow)
        return {
          accountId: s.accountId,
          name: s.name,
          type: s.type,
          opening: book ? openingBal : null,
          inflow: book ? inflow : null,
          outflow: book ? outflow : null,
          closing: book ? openingBal + inflow - outflow : null,
        }
      }),
      items: rows.slice(0, MAX_ROWS).map(
        (r): LedgerRow => ({
          id: r.id,
          accountId: r.accountId,
          accountName: r.accountName,
          type: r.type,
          amount: n(r.amount),
          businessDate: r.businessDate,
          occurredAt: r.occurredAt,
          note: r.note,
          createdByName: r.createdByName,
          beforeOpening: !opening || r.businessDate < opening,
          order: r.orderId ? { id: r.orderId, code: r.orderCode! } : null,
        }),
      ),
    }
  })
}
