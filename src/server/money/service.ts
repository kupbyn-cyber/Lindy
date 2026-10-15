// Sổ tiền (UI06, bước 3.3; PRD §7.1–7.2): số dư từng tài khoản, mở sổ, danh sách bút toán.
// Xem: Linh, Nhung (money_accounts.read_balance, Q17). Mở sổ: Linh (cashbook.owner), một lần, ngày 1 của tháng (Q24).
// Số dư = Σ bút toán từ ngày mở sổ; bút toán chỉ do DB ghi (trigger, hàm), app chỉ đọc [P47].
import { addDays, isIsoDate, toLocalDate } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'

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

/** Tài khoản ngân hàng nhận tiền thu chuyển khoản của cơ sở và thông tin vẽ QR (S26); chưa nhập → bankBin null. */
async function bankAccountOf(tx: Tx, branchId: string) {
  const [r] = await tx<
    {
      id: string
      name: string
      bankBin: string | null
      bankAccountNo: string | null
      bankAccountName: string | null
    }[]
  >`
    select id, name, bank_bin, bank_account_no, bank_account_name from money_accounts
    where branch_id = ${branchId} and type = 'bank' and is_active order by code limit 1`
  return r ?? null
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
      bankAccount: await bankAccountOf(tx, branch.id),
      can: {
        open: !book && hasPerm(auth, branch.id, 'cashbook.owner'),
        editBank: hasPerm(auth, branch.id, 'cashbook.owner'),
      },
    }
  })
}

/** Linh nhập, sửa tài khoản nhận chuyển khoản (S26). DB kiểm quyền lại và ghi nhật ký trước / sau. */
export async function saveBankAccount(
  auth: Auth,
  input: { branchId?: string; bankBin: string; accountNo: string; accountName: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.owner'))
    throw forbidden('Chỉ chủ quán sửa tài khoản nhận chuyển khoản.')
  await withUser(auth.userId, async (tx) => {
    await tx`
      select app.bank_account_save(${branch.id}::uuid, ${input.bankBin}::text, ${input.accountNo}::text,
                                   ${input.accountName}::text)`
  })
  return getBook(auth, { branchId: branch.id })
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
  /** Cọc của lịch nào (bút toán nhận, huỷ, hoàn cọc) */
  appointment: { id: string; name: string } | null
  accountType: 'cash' | 'bank'
  /** Tài khoản ngân hàng: đã khớp sao kê (3.17) */
  reconciled: boolean
}

/**
 * Bút toán trong khoảng ngày (≤ 62 ngày, ≤ 500 dòng), kèm đầu kỳ / vào / ra / cuối kỳ từng tài khoản.
 * unreconciled: chỉ khoản ngân hàng chưa khớp sao kê (mọi ngày đến `to`).
 */
export async function listEntries(
  auth: Auth,
  input: { branchId?: string; from?: string; to?: string; accountId?: string; unreconciled?: boolean },
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

    const unrec = !!input.unreconciled
    const rows = await tx<
      (Omit<LedgerRow, 'amount' | 'order' | 'beforeOpening' | 'appointment'> & {
        amount: string
        orderId: string | null
        orderCode: number | null
        apptId: string | null
        apptName: string | null
      })[]
    >`
      select e.id::text as id, e.money_account_id as account_id, m.name as account_name, m.type as account_type,
             e.entry_type as type, e.amount, e.business_date::text as business_date, e.occurred_at, e.note,
             u.display_name as created_by_name, o.id as order_id, o.code as order_code,
             a.id as appt_id, a.customer_display_name as appt_name,
             exists (select 1 from money_ledger_reconciliations r where r.entry_id = e.id) as reconciled
      from money_ledger_entries e
      join money_accounts m on m.id = e.money_account_id
      left join users u on u.id = e.created_by
      left join payments p on e.source_type = 'payment' and p.id = e.source_id
      left join orders o on o.id = p.order_id
      left join appointment_deposits d on e.source_type = 'deposit' and d.id = e.source_id
      left join appointments a on a.id = d.appointment_id
      where e.branch_id = ${branch.id}
        and (case when ${unrec} then e.business_date <= ${to}::date and m.type = 'bank' and e.entry_type <> 'opening'
                       and not exists (select 1 from money_ledger_reconciliations r where r.entry_id = e.id)
                  else e.business_date between ${from}::date and ${to}::date end)
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
      can: {
        reconcile: hasPerm(auth, branch.id, 'cashbook.manage'),
        transfer: hasPerm(auth, branch.id, 'cashbook.manage'),
        voucher: hasPerm(auth, branch.id, 'cashbook.owner'),
      },
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
          appointment: r.apptId ? { id: r.apptId, name: r.apptName ?? '' } : null,
          accountType: r.accountType,
          reconciled: r.reconciled,
        }),
      ),
    }
  })
}

// ---------------------------------------------------------------- Phiếu Linh lập, chuyển nội bộ (3.14)

export async function createVoucher(
  auth: Auth,
  input: {
    branchId?: string
    idempotencyKey: string
    kind: 'other_income' | 'capital_in' | 'capital_out' | 'adjustment'
    incomeType?: 'loan' | 'supplier_refund' | 'other' | null
    accountId: string
    amount: number
    reason: string
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.owner'))
    throw forbidden('Chỉ chủ quán lập phiếu thu khác, góp/rút vốn, điều chỉnh.')
  await withUser(auth.userId, async (tx) => {
    await tx`
      select app.cash_voucher_create(${branch.id}::uuid, ${input.kind}::text, ${input.incomeType ?? null}::text,
                                     ${input.accountId}::uuid, ${input.amount}::bigint, ${input.reason}::text,
                                     ${input.idempotencyKey}::uuid)`
  })
  return getBook(auth, { branchId: branch.id })
}

export async function createTransfer(
  auth: Auth,
  input: {
    branchId?: string
    idempotencyKey: string
    fromAccountId: string
    toAccountId: string
    amount: number
    note?: string | null
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.manage')) throw forbidden('Chỉ Nhung, Linh chuyển tiền nội bộ.')
  await withUser(auth.userId, async (tx) => {
    await tx`
      select app.cash_transfer_create(${branch.id}::uuid, ${input.fromAccountId}::uuid, ${input.toAccountId}::uuid,
                                      ${input.amount}::bigint, ${input.note ?? null}::text,
                                      ${input.idempotencyKey}::uuid)`
  })
  return getBook(auth, { branchId: branch.id })
}

// ---------------------------------------------------------------- Đối soát chuyển khoản (3.17)

export async function reconcile(auth: Auth, input: { branchId?: string; entryIds: string[] }) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.manage')) throw forbidden('Chỉ Nhung, Linh đối soát chuyển khoản.')
  const [r] = await withUser(
    auth.userId,
    (tx) =>
      tx<{ n: number }[]>`
      select app.reconcile_entries(${branch.id}::uuid, ${input.entryIds}::text[]::bigint[]) as n`,
  )
  return { reconciled: r?.n ?? 0 }
}

// ---------------------------------------------------------------- Chốt quỹ cuối ngày (3.18; Q23, K17)

const WARNING_TEXT: Record<string, string> = {
  awaitingOrders: 'đơn chờ xác nhận',
  inProgressOrders: 'đơn đang làm, chưa bấm Làm xong',
  unpaidOrders: 'đơn đã xác nhận chưa thu đủ',
  pendingDeposits: 'khoản cọc chờ xác nhận',
  unreconciled: 'khoản chuyển khoản chưa đối soát',
  unpaidTips: 'khoản tip giữ hộ chưa trả thợ',
}

function warningList(w: Record<string, unknown> | null) {
  return Object.entries(w ?? {})
    .map(([key, v]) => ({ key, count: n(v), text: WARNING_TEXT[key] ?? key }))
    .filter((x) => x.count > 0)
}

type CloseRow = {
  id: string
  businessDate: string
  periodStart: string
  opening: string
  cashIn: string
  cashOut: string
  expected: string
  counted: string
  difference: string
  reason: string | null
  warnings: Record<string, unknown>
  closedByName: string | null
  closedAt: Date
  needsOwnerReview: boolean
  reviewedAt: Date | null
}

function closeView(r: CloseRow) {
  return {
    id: r.id,
    businessDate: r.businessDate,
    periodStart: r.periodStart,
    opening: n(r.opening),
    cashIn: n(r.cashIn),
    cashOut: n(r.cashOut),
    expected: n(r.expected),
    counted: n(r.counted),
    difference: n(r.difference),
    reason: r.reason,
    warnings: warningList(r.warnings),
    closedByName: r.closedByName,
    closedAt: new Date(r.closedAt).toISOString(),
    needsOwnerReview: r.needsOwnerReview && !r.reviewedAt,
  }
}

/** Xem trước chốt quỹ ngày `date` (mặc định: ngày chưa chốt sớm nhất, không sau hôm nay) và các lần chốt gần đây. */
export async function dayClosePreview(auth: Auth, input: { branchId?: string; date?: string }) {
  const branch = requireReader(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const [b] = await tx<{ timezone: string; closeTime: string; nowTime: string }[]>`
      select b.timezone, to_char(coalesce(s.close_time, '21:00'), 'HH24:MI') as close_time,
             to_char(now() at time zone b.timezone, 'HH24:MI') as now_time
      from branches b left join branch_booking_settings s on s.branch_id = b.id where b.id = ${branch.id}`
    const today = toLocalDate(new Date(), b!.timezone)
    const book = await loadBook(tx, branch.id)
    const [last] = await tx<{ d: string | null }[]>`
      select max(business_date)::text as d from cash_day_closes where branch_id = ${branch.id}`
    const lastClosed = last?.d ?? null
    // Ngày nên chốt: hôm nay (từ giờ đóng cửa); trước giờ đó thì hôm qua nếu chưa chốt. Chốt một ngày là gộp luôn
    // các ngày chưa chốt trước nó (số lý thuyết tính lũy kế).
    const firstOpen = lastClosed ? addDays(lastClosed, 1) : (book?.openingDate ?? today)
    const yesterday = addDays(today, -1)
    const suggested =
      b!.nowTime >= b!.closeTime || yesterday < firstOpen || (lastClosed && lastClosed >= yesterday)
        ? today
        : yesterday
    const date = input.date && isIsoDate(input.date) ? input.date : suggested
    const history = await tx<CloseRow[]>`
      select c.id, c.business_date::text as business_date, c.period_start::text as period_start, c.opening,
             c.cash_in, c.cash_out, c.expected, c.counted, c.difference, c.reason, c.warnings,
             u.display_name as closed_by_name, c.closed_at, c.needs_owner_review, c.reviewed_at
      from cash_day_closes c left join users u on u.id = c.closed_by
      where c.branch_id = ${branch.id} order by c.business_date desc limit 31`
    let figures: {
      opening: number
      cashIn: number
      cashOut: number
      expected: number
      periodStart: string
    } | null = null
    let warnings: ReturnType<typeof warningList> = []
    const closable = !!book && (!lastClosed || date > lastClosed) && date <= today && date >= book.openingDate
    if (closable) {
      const [f] = await tx<
        { periodStart: string; opening: string; cashIn: string; cashOut: string; expected: string }[]
      >`select period_start::text as period_start, opening, cash_in, cash_out, expected
        from app.day_close_figures(${branch.id}, ${date}::date)`
      if (f)
        figures = {
          periodStart: f.periodStart,
          opening: n(f.opening),
          cashIn: n(f.cashIn),
          cashOut: n(f.cashOut),
          expected: n(f.expected),
        }
      const [w] = await tx<{ w: Record<string, unknown> | null }[]>`
        select app.day_close_warnings(${branch.id}, ${date}::date) as w`
      warnings = warningList(w?.w ?? null)
    }
    return {
      today,
      date,
      suggested,
      lastClosed,
      book,
      closeTime: b!.closeTime,
      /** Hôm nay chỉ chốt được từ giờ đóng cửa (Q23) */
      tooEarly: date === today && b!.nowTime < b!.closeTime,
      closable,
      figures,
      warnings,
      history: history.map(closeView),
      can: {
        close: hasPerm(auth, branch.id, 'cashbook.manage'),
        review: hasPerm(auth, branch.id, 'review_queue.read'),
      },
    }
  })
}

export async function closeDay(
  auth: Auth,
  input: { branchId?: string; date: string; counted: number; reason?: string | null },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'cashbook.manage')) throw forbidden('Chỉ Nhung, Linh chốt quỹ.')
  await withUser(auth.userId, async (tx) => {
    const [done] = await tx`
      select 1 from cash_day_closes where branch_id = ${branch.id} and business_date >= ${input.date}::date limit 1`
    if (done) throw conflict('Ngày này đã chốt quỹ (hoặc đã chốt ngày sau đó).')
    await tx`
      select app.close_day(${branch.id}::uuid, ${input.date}::date, ${input.counted}::bigint,
                           ${input.reason ?? null}::text)`
  })
  return dayClosePreview(auth, { branchId: branch.id })
}

export async function reviewDayClose(auth: Auth, input: { branchId?: string; id: string }) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'review_queue.read')) throw forbidden('Chỉ chủ quán đánh dấu đã xem lại.')
  await withUser(auth.userId, async (tx) => {
    const [r] = await tx`
      update cash_day_closes set reviewed_by = ${auth.userId}, reviewed_at = now()
      where id = ${input.id} and branch_id = ${branch.id} and needs_owner_review and reviewed_at is null
      returning id`
    if (!r) throw notFound('Không có bản chốt cần xem lại.')
  })
  return dayClosePreview(auth, { branchId: branch.id })
}
