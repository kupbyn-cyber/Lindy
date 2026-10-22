// Sổ tiền (Đợt 3, bước 3.2–3.3): bút toán từ khoản thu, huỷ khoản thu, mở sổ, số dư, quyền xem.
// PRD §18 test 2 (thu 200.000đ CK + 148.000đ TM), test 27 (Nhung xem số dư); S33, S34, S42 phần mở sổ.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { OpenBookBody } from '../../src/server/money/schema'
import { getBook, listEntries, openBook } from '../../src/server/money/service'
import { recordPayment, voidPayment } from '../../src/server/orders/payments'
import { createOrder, markDone } from '../../src/server/orders/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
const firstOfMonth = `${today.slice(0, 8)}01`
let htk = ''
const acc: Record<'cash' | 'bank', string> = { cash: '', bank: '' }

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  htk = seed().branchIds.HTK!
  for (const r of await owner<{ id: string; type: 'cash' | 'bank' }[]>`
    select id, type from money_accounts where branch_id = ${htk}`)
    acc[r.type] = r.id
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id

/** Lỗi như route trả về (lỗi DB đổi sang mã HTTP bằng fromDbError). */
async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    const db = fromDbError(e)
    if (db) return db
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

/** Σ bút toán của tài khoản (mọi ngày), đọc bằng chủ DB */
async function sumOf(account: string) {
  const [r] = await owner<{ s: string }[]>`
    select coalesce(sum(amount), 0) as s from money_ledger_entries where money_account_id = ${account}`
  return Number(r!.s)
}

async function doneOrder(amount: number) {
  const { order } = await createOrder(auth('nhung'), {
    createRequestId: rid(),
    customerId: null,
    serviceDate: today,
    items: [{ type: 'custom', name: 'Dịch vụ thử sổ', amount, staff: [{ userId: uid('nhung') }] }] as never,
    discounts: [],
  })
  return markDone(auth('nhung'), order.id, order.version)
}

describe('3.2 — bút toán từ khoản thu', () => {
  it('PRD test 2: 200.000đ chuyển khoản + 148.000đ tiền mặt → hai tài khoản tăng đúng, công nợ 0', async () => {
    const cash0 = await sumOf(acc.cash)
    const bank0 = await sumOf(acc.bank)
    // S41: Làm xong là xác nhận luôn
    const c = await doneOrder(348_000)
    expect(c.status).toBe('confirmed')
    await recordPayment(auth('nhung'), c.id, { idempotencyKey: rid(), amount: 200_000, method: 'transfer' })
    const d = await recordPayment(auth('nhung'), c.id, {
      idempotencyKey: rid(),
      amount: 148_000,
      method: 'cash',
    })
    expect(d.dueAmount).toBe(0)
    expect((await sumOf(acc.cash)) - cash0).toBe(148_000)
    expect((await sumOf(acc.bank)) - bank0).toBe(200_000)
    const rows = await owner<{ entryType: string; amount: string; businessDate: string }[]>`
      select e.entry_type, e.amount, e.business_date::text as business_date
      from money_ledger_entries e join payments p on p.id = e.source_id and e.source_type = 'payment'
      where p.order_id = ${c.id} order by e.id`
    expect(rows.map((r) => [r.entryType, Number(r.amount), r.businessDate])).toEqual([
      ['payment', 200_000, today],
      ['payment', 148_000, today],
    ])
  })

  it('huỷ khoản thu → bút toán đảo trỏ về bút toán gốc; bấm thu hai lần cùng mã → một bút toán', async () => {
    const o = await doneOrder(90_000)
    const key = rid()
    const cash0 = await sumOf(acc.cash)
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: key, amount: 90_000, method: 'cash' })
    const again = await recordPayment(auth('nhung'), o.id, {
      idempotencyKey: key,
      amount: 90_000,
      method: 'cash',
    })
    expect((await sumOf(acc.cash)) - cash0).toBe(90_000)
    const pay = again.payments[0]!
    await voidPayment(auth('nhung'), pay.id, 'Nhập nhầm')
    expect((await sumOf(acc.cash)) - cash0).toBe(0)
    const [v] = await owner<{ amount: string; reversesEntryId: string; orig: string }[]>`
      select v.amount, v.reverses_entry_id,
             (select id from money_ledger_entries where source_id = ${pay.id} and entry_type = 'payment') as orig
      from money_ledger_entries v where v.source_id = ${pay.id} and v.entry_type = 'payment_void'`
    expect(Number(v!.amount)).toBe(-90_000)
    expect(v!.reversesEntryId).toBe(v!.orig)
  })

  it('S34: app_user không ghi, sửa, xoá bút toán; không gọi được hàm ghi sổ', async () => {
    await expectPgError(
      withUser(
        uid('linh'),
        (
          tx,
        ) => tx`insert into money_ledger_entries (branch_id, money_account_id, entry_type, amount, business_date,
                     source_type, source_id) values (${htk}, ${acc.cash}, 'adjustment', 1000000, ${today}, 'voucher',
                     gen_random_uuid())`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`update money_ledger_entries set amount = amount * 10`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`delete from money_ledger_entries`),
      '42501',
    )
    await expectPgError(
      withUser(
        uid('linh'),
        (tx) => tx`select app._ledger_post(${htk}, ${acc.cash}, 'adjustment', 1000000, 'voucher',
                                           gen_random_uuid(), null)`,
      ),
      '42501',
    )
    // Chủ DB cũng không sửa được bút toán đã ghi (bảng chỉ thêm)
    await expectPgError(
      owner`update money_ledger_entries set amount = 1 where id = (select min(id) from money_ledger_entries)`,
      '42501',
    )
  })

  it('S33: thợ không đọc được bút toán, số dư (API và SQL)', async () => {
    const [n] = await withUser(
      uid('trang'),
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from money_ledger_entries`,
    )
    expect(n!.n).toBe(0)
    const [b] = await withUser(
      uid('chin'),
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from money_books`,
    )
    expect(b!.n).toBe(0)
    expect((await err(getBook(auth('trang')))).status).toBe(403)
    expect((await err(listEntries(auth('chin'), {}))).status).toBe(403)
  })
})

describe('3.3 — mở sổ và số dư', () => {
  it('ngày mở sổ phải là ngày 1, không sau hôm nay; Nhung không mở sổ được', async () => {
    const amounts = [
      { accountId: acc.cash, amount: 1_000_000 },
      { accountId: acc.bank, amount: 5_000_000 },
    ]
    expect(OpenBookBody.safeParse({ openingDate: `${today.slice(0, 8)}15`, amounts }).success).toBe(false)
    await expectPgError(
      withUser(
        uid('linh'),
        (
          tx,
        ) => tx`select app.open_book(${htk}, ${`${today.slice(0, 8)}15`}::date, ${[acc.cash, acc.bank]}::uuid[],
                                        ${['1', '2']}::text[]::bigint[])`,
      ),
      'P0001',
    )
    const nextMonth = `${addDays(`${today.slice(0, 8)}28`, 7).slice(0, 8)}01`
    expect((await err(openBook(auth('linh'), { openingDate: nextMonth, amounts }))).status).toBe(422)
    expect((await err(openBook(auth('nhung'), { openingDate: firstOfMonth, amounts }))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) => tx`select app.open_book(${htk}, ${firstOfMonth}::date, ${[acc.cash, acc.bank]}::uuid[],
                                        ${['1', '2']}::text[]::bigint[])`,
      ),
      '42501',
    )
    // Thiếu một tài khoản → chặn
    expect(
      (await err(openBook(auth('linh'), { openingDate: firstOfMonth, amounts: [amounts[0]!] }))).status,
    ).toBe(422)
  })

  it('Linh mở sổ một lần; số dư = mở sổ + bút toán từ ngày mở sổ; Nhung xem được (test 27)', async () => {
    const before = await getBook(auth('nhung'))
    expect(before.book).toBeNull()
    expect(before.accounts.every((a) => a.balance === null)).toBe(true)
    expect(before.can.open).toBe(false)
    expect((await getBook(auth('linh'))).can.open).toBe(true)

    // Một bút toán trước ngày mở sổ (dữ liệu chạy thử) không được tính
    await owner`select app._ledger_post(${htk}, ${acc.cash}, 'adjustment', 777000, 'voucher', gen_random_uuid(), null,
                                        'trước mở sổ', null, null, ${addDays(firstOfMonth, -1)}::date)`
    const [since] = await owner<{ cash: string; bank: string }[]>`
      select coalesce(sum(amount) filter (where money_account_id = ${acc.cash}), 0) as cash,
             coalesce(sum(amount) filter (where money_account_id = ${acc.bank}), 0) as bank
      from money_ledger_entries where branch_id = ${htk} and business_date >= ${firstOfMonth}::date`

    const opened = await openBook(auth('linh'), {
      openingDate: firstOfMonth,
      amounts: [
        { accountId: acc.cash, amount: 1_500_000 },
        { accountId: acc.bank, amount: 20_000_000 },
      ],
    })
    expect(opened.book?.openingDate).toBe(firstOfMonth)
    const bal = Object.fromEntries(opened.accounts.map((a) => [a.id, a.balance]))
    expect(bal[acc.cash]).toBe(1_500_000 + Number(since!.cash))
    expect(bal[acc.bank]).toBe(20_000_000 + Number(since!.bank))

    const nh = await getBook(auth('nhung'))
    expect(nh.accounts.map((a) => a.balance)).toEqual(opened.accounts.map((a) => a.balance))
    expect(nh.can.open).toBe(false)

    // Mở lần hai → chặn
    expect(
      (
        await err(
          openBook(auth('linh'), {
            openingDate: firstOfMonth,
            amounts: [
              { accountId: acc.cash, amount: 1 },
              { accountId: acc.bank, amount: 1 },
            ],
          }),
        )
      ).status,
    ).toBe(422)

    // Thu thêm 50.000đ tiền mặt → số dư tăng đúng; sổ trong ngày có đầu kỳ / vào / cuối kỳ khớp
    const o = await doneOrder(50_000)
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 50_000, method: 'cash' })
    const after = await getBook(auth('linh'))
    expect(after.accounts.find((a) => a.id === acc.cash)!.balance).toBe(bal[acc.cash]! + 50_000)
    const day = await listEntries(auth('nhung'), { from: today, to: today })
    const cash = day.accounts.find((a) => a.accountId === acc.cash)!
    expect(cash.closing).toBe(after.accounts.find((a) => a.id === acc.cash)!.balance)
    expect(cash.opening! + cash.inflow! - cash.outflow!).toBe(cash.closing)
    const mine = day.items.find((i) => i.order?.id === o.id)
    expect(mine).toMatchObject({ type: 'payment', amount: 50_000, beforeOpening: false })
    const old = await listEntries(auth('linh'), {
      from: addDays(firstOfMonth, -1),
      to: addDays(firstOfMonth, -1),
    })
    expect(old.items.find((i) => i.note === 'trước mở sổ')?.beforeOpening).toBe(true)
  })

  it('xem sổ tối đa 62 ngày', async () => {
    expect((await err(listEntries(auth('linh'), { from: addDays(today, -62), to: today }))).status).toBe(422)
    expect((await listEntries(auth('linh'), { from: addDays(today, -61), to: today })).from).toBe(
      addDays(today, -61),
    )
  })
})
