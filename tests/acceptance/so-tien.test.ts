// Nghiệm thu thu chi và chốt ngày (Đợt 3B-1, bước 3.12–3.14, 3.17, 3.18): PRD §18 test 6, 7, 8, 14 (khoá ngày), 22, 37;
// §13C; test bảo mật S39–S43, S47 (kế hoạch Đợt 3 mục 10.2).
// Chạy trên cơ sở thử riêng "CS3" để số dư, ngày chốt quỹ không ảnh hưởng file test khác.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { ExpenseBody } from '../../src/server/expenses/schema'
import { actOnExpense, createExpense, listExpenses } from '../../src/server/expenses/service'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { TransferBody, VoucherBody } from '../../src/server/money/schema'
import {
  closeDay,
  createTransfer,
  createVoucher,
  dayClosePreview,
  getBook,
  listEntries,
  openBook,
  reconcile,
  reviewDayClose,
} from '../../src/server/money/service'
import { recordPayment, voidPayment } from '../../src/server/orders/payments'
import { createOrder, markDone } from '../../src/server/orders/service'
import { overview } from '../../src/server/reports/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
let cs3 = ''
const acc: Record<'cash' | 'bank', string> = { cash: '', bank: '' }
let htkCash = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS3', 'Zz cơ sở thử sổ tiền', 'CS3') returning id`
  cs3 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs3})`
  await owner`
    insert into money_accounts (branch_id, code, name, type)
    values (${cs3}, 'cash', 'Tiền mặt CS3', 'cash'), (${cs3}, 'bank', 'Tài khoản CS3', 'bank')`
  for (const r of await owner<{ id: string; type: 'cash' | 'bank' }[]>`
    select id, type from money_accounts where branch_id = ${cs3}`)
    acc[r.type] = r.id
  const [h] = await owner<{ id: string }[]>`
    select id from money_accounts where branch_id = ${seed().branchIds.HTK!} and type = 'cash'`
  htkCash = h!.id
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs3}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  // Mở sổ từ ngày 1 tháng trước để chốt được ngày hôm qua (kể cả khi hôm nay là ngày 1)
  const prevMonth = `${addDays(`${today.slice(0, 8)}01`, -1).slice(0, 8)}01`
  await openBook(auth('linh'), {
    branchId: cs3,
    openingDate: prevMonth,
    amounts: [
      { accountId: acc.cash, amount: 10_000_000 },
      { accountId: acc.bank, amount: 5_000_000 },
    ],
  })
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs3}`
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id

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

async function balances() {
  const b = await getBook(auth('linh'), { branchId: cs3 })
  return Object.fromEntries(b.accounts.map((a) => [a.type, a.balance!])) as Record<'cash' | 'bank', number>
}

const request = (k: SeedKey, categoryCode: string, amount: number, note = 'Mua đồ') =>
  createExpense(auth(k), { branchId: cs3, createRequestId: rid(), categoryCode, amount, note })

describe('3.12 — đề nghị chi và duyệt chi', () => {
  it('PRD 8, 22, §13C: đề nghị 650.000đ vật tư → Nhung duyệt → chi tiền mặt, số dư giảm đúng một lần', async () => {
    const b0 = await balances()
    const e = await request('trang', 'supplies', 650_000, 'Mua gel, cọ')
    expect(e).toMatchObject({ status: 'requested', requiredLevel: 'manager' })
    expect(await balances()).toEqual(b0) // test 22: chưa duyệt → số dư không đổi
    const a = await actOnExpense(auth('nhung'), e.id, 'approve', { version: e.version })
    expect(a).toMatchObject({ status: 'approved', approvedByName: 'Nhung', needsOwnerReview: false })
    expect(await balances()).toEqual(b0) // đã duyệt, chưa chi → số dư không đổi (invariant 9)
    const p = await actOnExpense(auth('nhung'), e.id, 'pay', { version: a.version, method: 'cash' })
    expect(p).toMatchObject({ status: 'paid', paidAccountName: 'Tiền mặt CS3' })
    // S41: bấm Đã chi hai lần → một bút toán
    await actOnExpense(auth('nhung'), e.id, 'pay', { version: a.version, method: 'cash' })
    const b1 = await balances()
    expect(b1.cash).toBe(b0.cash - 650_000)
    expect(b1.bank).toBe(b0.bank)
    const [c] = await owner<{ n: number }[]>`
      select count(*)::int as n from money_ledger_entries where source_type = 'expense' and source_id = ${e.id}`
    expect(c!.n).toBe(1)
  })

  it('PRD 37 / S39: phiếu 1.200.000đ hoặc phiếu sửa chữa 300.000đ → Nhung không duyệt được (API và SQL); Linh duyệt được', async () => {
    const big = await request('trang', 'supplies', 1_200_000)
    const repair = await request('trang', 'repair', 300_000, 'Sửa ghế')
    expect(big.requiredLevel).toBe('owner')
    expect(repair.requiredLevel).toBe('owner')
    expect(big.can.approve).toBe(false)
    expect((await err(actOnExpense(auth('nhung'), big.id, 'approve', { version: big.version }))).status).toBe(
      403,
    )
    expect(
      (await err(actOnExpense(auth('nhung'), repair.id, 'approve', { version: repair.version }))).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) => tx`update expense_requests set status = 'approved' where id = ${repair.id}`,
      ),
      '42501',
    )
    // Đúng 1.000.000đ: Nhung duyệt được
    const edge = await request('trang', 'supplies', 1_000_000)
    expect(edge.requiredLevel).toBe('manager')
    await actOnExpense(auth('nhung'), edge.id, 'approve', { version: edge.version })
    const ok = await actOnExpense(auth('linh'), big.id, 'approve', { version: big.version })
    expect(ok).toMatchObject({ status: 'approved', approvedByName: 'Linh' })
  })

  it('S40: thợ không tự duyệt, không bấm Đã chi; không sửa số tiền sau khi duyệt; thợ chỉ thấy phiếu của mình', async () => {
    const e = await request('trang', 'supplies', 100_000)
    expect((await err(actOnExpense(auth('trang'), e.id, 'approve', { version: e.version }))).status).toBe(403)
    const a = await actOnExpense(auth('nhung'), e.id, 'approve', { version: e.version })
    expect(
      (await err(actOnExpense(auth('trang'), e.id, 'pay', { version: a.version, method: 'cash' }))).status,
    ).toBe(403)
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update expense_requests set amount = 10 where id = ${e.id}`),
      '42501',
    )
    await request('chin', 'tools', 50_000, 'Kéo')
    const mine = await listExpenses(auth('trang'), { branchId: cs3, filter: 'all' })
    expect(mine.items.every((i) => i.mine)).toBe(true)
    const [n] = await withUser(
      uid('trang'),
      (tx) =>
        tx<
          { n: number }[]
        >`select count(*)::int as n from expense_requests where requested_by <> ${uid('trang')}`,
    )
    expect(n!.n).toBe(0)
    expect(
      (await listExpenses(auth('nhung'), { branchId: cs3, filter: 'all' })).items.some((i) => !i.mine),
    ).toBe(true)
    // Thợ huỷ phiếu của mình khi chưa duyệt; trường lạ → 422
    const c = await request('trang', 'supplies', 20_000)
    expect((await actOnExpense(auth('trang'), c.id, 'cancel', { version: c.version })).status).toBe(
      'cancelled',
    )
    expect(
      ExpenseBody.safeParse({
        createRequestId: rid(),
        categoryCode: 'supplies',
        amount: 1,
        note: 'x',
        status: 'paid',
      }).success,
    ).toBe(false)
  })

  it('Linh lập phiếu → duyệt luôn; Nhung lập phiếu trong hạn mức → duyệt luôn và vào Cần xem lại của Linh', async () => {
    const l = await request('linh', 'rent', 8_000_000, 'Tiền nhà tháng')
    expect(l).toMatchObject({ status: 'approved', needsOwnerReview: false })
    const n = await request('nhung', 'supplies', 200_000, 'Mua bông')
    expect(n).toMatchObject({ status: 'approved', needsOwnerReview: true })
    expect(n.can.review).toBe(false) // chỉ Linh bấm "Đã xem"
    const seen = (await listExpenses(auth('linh'), { branchId: cs3, filter: 'approved' })).items.find(
      (i) => i.id === n.id,
    )
    expect(seen).toMatchObject({ needsOwnerReview: true })
    expect(seen!.can.review).toBe(true)
    expect((await err(actOnExpense(auth('nhung'), n.id, 'review', { version: n.version }))).status).toBe(403)
    const r = await actOnExpense(auth('linh'), n.id, 'review', { version: n.version })
    expect(r.needsOwnerReview).toBe(false)
    // Nhung lập phiếu trên hạn mức → chờ Linh
    const big = await request('nhung', 'supplies', 2_000_000)
    expect(big.status).toBe('requested')
  })
})

describe('3.14 — chuyển nội bộ, phiếu Linh lập', () => {
  it('PRD 6: chuyển 2.000.000đ tiền mặt sang ngân hàng → tổng không đổi; S43', async () => {
    const b0 = await balances()
    const key = rid()
    const body = {
      branchId: cs3,
      idempotencyKey: key,
      fromAccountId: acc.cash,
      toAccountId: acc.bank,
      amount: 2_000_000,
    }
    await createTransfer(auth('nhung'), body)
    await createTransfer(auth('nhung'), body) // bấm hai lần
    const b1 = await balances()
    expect(b1.cash).toBe(b0.cash - 2_000_000)
    expect(b1.bank).toBe(b0.bank + 2_000_000)
    expect(b1.cash + b1.bank).toBe(b0.cash + b0.bank)
    // S43: cùng tài khoản, số âm, tài khoản cơ sở khác
    expect(TransferBody.safeParse({ ...body, idempotencyKey: rid(), toAccountId: acc.cash }).success).toBe(
      false,
    )
    expect(TransferBody.safeParse({ ...body, idempotencyKey: rid(), amount: -5 }).success).toBe(false)
    expect(
      (await err(createTransfer(auth('nhung'), { ...body, idempotencyKey: rid(), toAccountId: htkCash })))
        .status,
    ).toBe(404)
    expect((await err(createTransfer(auth('trang'), { ...body, idempotencyKey: rid() }))).status).toBe(403)
  })

  it('PRD 7: góp vốn 20.000.000đ → tăng quỹ, không tăng doanh thu; S42: Nhung không lập phiếu Linh (API và SQL)', async () => {
    const b0 = await balances()
    const rev0 = (await overview(auth('linh'), { branchId: cs3, period: 'month' })).revenue?.net
    await createVoucher(auth('linh'), {
      branchId: cs3,
      idempotencyKey: rid(),
      kind: 'capital_in',
      accountId: acc.bank,
      amount: 20_000_000,
      reason: 'Linh góp vốn',
    })
    expect((await balances()).bank).toBe(b0.bank + 20_000_000)
    expect((await overview(auth('linh'), { branchId: cs3, period: 'month' })).revenue?.net).toBe(rev0)
    const v = {
      branchId: cs3,
      idempotencyKey: rid(),
      kind: 'adjustment' as const,
      accountId: acc.cash,
      amount: -1,
      reason: 'x',
    }
    expect((await err(createVoucher(auth('nhung'), v))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (
          tx,
        ) => tx`select app.cash_voucher_create(${cs3}::uuid, 'capital_out', null, ${acc.cash}::uuid, 1000::bigint,
                                                  'rút', gen_random_uuid())`,
      ),
      '42501',
    )
    // Rút vốn ghi tiền ra; điều chỉnh âm; thu khác cần loại
    await createVoucher(auth('linh'), { ...v, kind: 'capital_out', amount: 500_000, reason: 'Linh rút vốn' })
    await createVoucher(auth('linh'), {
      ...v,
      idempotencyKey: rid(),
      amount: -30_000,
      reason: 'Nhập sai số mở sổ',
    })
    const b2 = await balances()
    expect(b2.cash).toBe(b0.cash - 500_000 - 30_000)
    expect(b2.bank).toBe(b0.bank + 20_000_000)
    expect(
      VoucherBody.safeParse({
        ...v,
        idempotencyKey: rid(),
        kind: 'other_income',
        amount: 100,
        incomeType: null,
      }).success,
    ).toBe(false)
  })
})

describe('3.17 — đối soát chuyển khoản', () => {
  it('khoản ngân hàng đối soát xong thì gốc không huỷ được; tiền mặt không đối soát; thợ không đối soát', async () => {
    const list = await listEntries(auth('nhung'), {
      branchId: cs3,
      from: today,
      to: today,
      unreconciled: true,
    })
    const bankIn = list.items.find((i) => i.type === 'capital_in')!
    expect(bankIn).toMatchObject({ accountType: 'bank', reconciled: false })
    expect((await err(reconcile(auth('trang'), { branchId: cs3, entryIds: [bankIn.id] }))).status).toBe(403)
    const cashEntry = (
      await listEntries(auth('nhung'), { branchId: cs3, from: today, to: today })
    ).items.find((i) => i.accountType === 'cash')!
    expect((await err(reconcile(auth('nhung'), { branchId: cs3, entryIds: [cashEntry.id] }))).status).toBe(
      422,
    )
    expect((await reconcile(auth('nhung'), { branchId: cs3, entryIds: [bankIn.id] })).reconciled).toBe(1)
    const after = await listEntries(auth('nhung'), {
      branchId: cs3,
      from: today,
      to: today,
      unreconciled: true,
    })
    expect(after.items.map((i) => i.id)).not.toContain(bankIn.id)
    // Không gỡ đối soát được
    await expectPgError(
      owner`delete from money_ledger_reconciliations where entry_id = ${bankIn.id}`,
      '42501',
    )
  })

  it('khoản thu chuyển khoản của đơn đã đối soát → không huỷ được (API và SQL), cột đối soát của khoản thu khớp', async () => {
    const htk = seed().branchIds.HTK!
    const { order } = await createOrder(auth('nhung'), {
      branchId: htk,
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [
        { type: 'custom', name: 'Thử đối soát', amount: 120_000, staff: [{ userId: uid('nhung') }] },
      ] as never,
      discounts: [],
    })
    const d = await markDone(auth('nhung'), order.id, order.version)
    const paid = await recordPayment(auth('nhung'), d.id, {
      idempotencyKey: rid(),
      amount: 120_000,
      method: 'transfer',
    })
    const pay = paid.payments[0]!
    const [e] = await owner<{ id: string }[]>`
      select id::text as id from money_ledger_entries where source_type = 'payment' and source_id = ${pay.id}`
    await reconcile(auth('nhung'), { branchId: htk, entryIds: [e!.id] })
    const [p] = await owner<{ reconciliationStatus: string }[]>`
      select reconciliation_status from payments where id = ${pay.id}`
    expect(p!.reconciliationStatus).toBe('reconciled')
    expect((await err(voidPayment(auth('nhung'), pay.id, 'Nhầm'))).status).toBe(422)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) => tx`update payments set reconciliation_status = 'unreconciled' where id = ${pay.id}`,
      ),
      '42501',
    )
  })
})

describe('3.18 — chốt quỹ cuối ngày (test 14, S47, K17)', () => {
  it('chốt hôm qua: lệch phải có lý do, ghi bút toán chênh lệch; Linh xem lại; không chốt lại, không sửa, không xoá', async () => {
    const yesterday = addDays(today, -1)
    expect((await err(dayClosePreview(auth('trang'), { branchId: cs3 }))).status).toBe(403)
    const pre = await dayClosePreview(auth('nhung'), { branchId: cs3, date: yesterday })
    expect(pre.closable).toBe(true)
    // Mọi khoản thu chi ở test trên ghi hôm nay → tiền mặt lý thuyết hôm qua = số mở sổ
    expect(pre.figures).toMatchObject({ expected: 10_000_000, cashIn: 10_000_000, cashOut: 0 })
    expect(
      (await err(closeDay(auth('nhung'), { branchId: cs3, date: yesterday, counted: 9_990_000 }))).status,
    ).toBe(422)
    expect((await err(closeDay(auth('trang'), { branchId: cs3, date: yesterday, counted: 1 }))).status).toBe(
      403,
    )
    const cash0 = (await balances()).cash
    const res = await closeDay(auth('nhung'), {
      branchId: cs3,
      date: yesterday,
      counted: 9_990_000,
      reason: 'Thối nhầm cho khách',
    })
    const c = res.history[0]!
    expect(c).toMatchObject({
      businessDate: yesterday,
      expected: 10_000_000,
      counted: 9_990_000,
      difference: -10_000,
    })
    expect((await balances()).cash).toBe(cash0 - 10_000) // K17: số dư theo số đếm
    const [d] = await owner<{ businessDate: string; amount: string }[]>`
      select business_date::text as business_date, amount from money_ledger_entries
      where source_type = 'day_close' and source_id = ${c.id}`
    expect(d).toMatchObject({ businessDate: yesterday, amount: '-10000' })
    // Nhung chốt có lệch → Cần xem lại của Linh
    expect(c.needsOwnerReview).toBe(true)
    expect((await err(reviewDayClose(auth('nhung'), { branchId: cs3, id: c.id }))).status).toBe(403)
    const r = await reviewDayClose(auth('linh'), { branchId: cs3, id: c.id })
    expect(r.history[0]!.needsOwnerReview).toBe(false)
    // Chốt lại ngày đã chốt, chốt ngày trước đó → 409
    expect((await err(closeDay(auth('nhung'), { branchId: cs3, date: yesterday, counted: 1 }))).status).toBe(
      409,
    )
    expect(
      (await err(closeDay(auth('linh'), { branchId: cs3, date: addDays(today, -2), counted: 1 }))).status,
    ).toBe(409)
    // S47: không sửa, không xoá bản chốt (app_user và chủ DB)
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`update cash_day_closes set counted = 10000000 where id = ${c.id}`),
      '42501',
    )
    await expectPgError(owner`update cash_day_closes set counted = 10000000 where id = ${c.id}`, '42501')
    await expectPgError(owner`delete from cash_day_closes where id = ${c.id}`, '42501')
  })

  it('hôm nay chỉ chốt từ giờ đóng cửa; chốt xong, khoản ghi sau rơi vào ngày kế [P54]', async () => {
    await owner`update branch_booking_settings set close_time = '23:59' where branch_id = ${cs3}`
    const pre = await dayClosePreview(auth('nhung'), { branchId: cs3 })
    expect(pre.date).toBe(today)
    expect(pre.warnings.map((w) => w.key)).toContain('unreconciled')
    if (pre.tooEarly)
      expect((await err(closeDay(auth('nhung'), { branchId: cs3, date: today, counted: 0 }))).status).toBe(
        422,
      )
    // Cho phép chốt hôm nay ngay (giờ đóng cửa sớm) để thử khoản ghi sau khi chốt
    await owner`update branch_booking_settings set open_time = '00:00', close_time = '00:01' where branch_id = ${cs3}`
    const p2 = await dayClosePreview(auth('linh'), { branchId: cs3 })
    const counted = p2.figures!.expected
    await closeDay(auth('linh'), { branchId: cs3, date: today, counted, reason: null })
    const v = await createVoucher(auth('linh'), {
      branchId: cs3,
      idempotencyKey: rid(),
      kind: 'other_income',
      incomeType: 'supplier_refund',
      accountId: acc.cash,
      amount: 50_000,
      reason: 'Nhà cung cấp hoàn tiền',
    })
    expect(v.book).not.toBeNull()
    const [e] = await owner<{ businessDate: string }[]>`
      select business_date::text as business_date from money_ledger_entries
      where branch_id = ${cs3} and entry_type = 'other_income' order by id desc limit 1`
    expect(e!.businessDate).toBe(addDays(today, 1))
    // Lần chốt Linh không lệch → không cần xem lại
    const h = (await dayClosePreview(auth('linh'), { branchId: cs3 })).history[0]!
    expect(h).toMatchObject({ businessDate: today, difference: 0, needsOwnerReview: false })
  })
})
