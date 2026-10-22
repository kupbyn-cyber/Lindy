// Nghiệm thu báo cáo dòng tiền, ảnh chứng từ, Cần xem lại (Đợt 3B-2, bước 3.19–3.21): PRD §18 test 18 (số dư cuối
// tháng = đầu + thu − chi từng tài khoản); S48 (chứng từ). Chạy trên cơ sở thử riêng "CS4".
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import {
  addAttachment,
  getAttachment,
  listAttachments,
  removeAttachment,
} from '../../src/server/attachments/service'
import { closeSql } from '../../src/server/db/client'
import { actOnExpense, createExpense } from '../../src/server/expenses/service'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { createTransfer, createVoucher, openBook } from '../../src/server/money/service'
import { recordPayment } from '../../src/server/orders/payments'
import { refundOrder } from '../../src/server/orders/refunds'
import { createOrder, markDone } from '../../src/server/orders/service'
import { monthReport, overview } from '../../src/server/reports/service'
import { reviewQueue } from '../../src/server/review/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
let cs4 = ''
const acc: Record<'cash' | 'bank', string> = { cash: '', bank: '' }
let expenseId = ''
let refundId = ''

// Ảnh tối thiểu: chỉ cần byte đầu đúng loại
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS4', 'Zz cơ sở thử dòng tiền', 'CS4') returning id`
  cs4 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs4})`
  await owner`
    insert into money_accounts (branch_id, code, name, type)
    values (${cs4}, 'cash', 'Tiền mặt CS4', 'cash'), (${cs4}, 'bank', 'Tài khoản CS4', 'bank')`
  for (const r of await owner<{ id: string; type: 'cash' | 'bank' }[]>`
    select id, type from money_accounts where branch_id = ${cs4}`)
    acc[r.type] = r.id
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs4}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  const prevMonth = `${addDays(`${today.slice(0, 8)}01`, -1).slice(0, 8)}01`
  await openBook(auth('linh'), {
    branchId: cs4,
    openingDate: prevMonth,
    amounts: [
      { accountId: acc.cash, amount: 1_000_000 },
      { accountId: acc.bank, amount: 2_000_000 },
    ],
  })

  // Hoạt động trong tháng: đơn 300.000đ thu 200.000đ CK + 100.000đ TM, hoàn 30.000đ TM (Nhung); chi vật tư 50.000đ
  // (Nhung tự lập, tự duyệt); chuyển 100.000đ TM → NH; Linh góp vốn 1.000.000đ vào NH
  const { order } = await createOrder(auth('nhung'), {
    branchId: cs4,
    createRequestId: rid(),
    customerId: null,
    serviceDate: today,
    items: [{ type: 'custom', name: 'Dịch vụ', amount: 300_000, staff: [{ userId: uid('nhung') }] }] as never,
    discounts: [],
  })
  // S41: Làm xong là xác nhận luôn
  const c = await markDone(auth('nhung'), order.id, order.version)
  await recordPayment(auth('nhung'), c.id, { idempotencyKey: rid(), amount: 200_000, method: 'transfer' })
  await recordPayment(auth('nhung'), c.id, { idempotencyKey: rid(), amount: 100_000, method: 'cash' })
  const r = await refundOrder(auth('nhung'), c.id, {
    idempotencyKey: rid(),
    amount: 30_000,
    method: 'cash',
    reason: 'Bớt cho khách',
  })
  refundId = r.refunds[0]!.id
  const e = await createExpense(auth('nhung'), {
    branchId: cs4,
    createRequestId: rid(),
    categoryCode: 'supplies',
    amount: 50_000,
    note: 'Bông, cồn',
  })
  expenseId = e.id
  await actOnExpense(auth('nhung'), e.id, 'pay', { version: e.version, method: 'cash' })
  await createTransfer(auth('nhung'), {
    branchId: cs4,
    idempotencyKey: rid(),
    fromAccountId: acc.cash,
    toAccountId: acc.bank,
    amount: 100_000,
  })
  await createVoucher(auth('linh'), {
    branchId: cs4,
    idempotencyKey: rid(),
    kind: 'capital_in',
    accountId: acc.bank,
    amount: 1_000_000,
    reason: 'Góp vốn',
  })
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs4}`
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

describe('3.20 — báo cáo dòng tiền tháng (PRD §7.5, test 18)', () => {
  it('số dư cuối tháng = đầu + thu − chi từng tài khoản; chuyển nội bộ hiện riêng; chi theo nhóm', async () => {
    const m = await monthReport(auth('nhung'), { branchId: cs4, month: today.slice(0, 7) })
    const f = m.cashflow!
    expect(f.accounts).toEqual([
      { name: 'Tiền mặt CS4', opening: 1_000_000, closing: 920_000 },
      { name: 'Tài khoản CS4', opening: 2_000_000, closing: 3_300_000 },
    ])
    expect(Object.fromEntries(f.inflows.map((l) => [l.key, l.amount]))).toEqual({
      customer: 300_000,
      capital_in: 1_000_000,
    })
    expect(Object.fromEntries(f.outflows.map((l) => [l.key, l.amount]))).toEqual({
      expense_operating: 50_000,
      refund: 30_000,
    })
    expect(f.transfers).toBe(100_000)
    expect(f.byCategory).toEqual([{ name: 'Vật tư', amount: 50_000 }])
    // Test 18: tổng cuối = tổng đầu + thu − chi (chuyển nội bộ triệt tiêu)
    const sum = (k: 'opening' | 'closing') => f.accounts.reduce((s, a) => s + a[k], 0)
    expect(sum('closing')).toBe(sum('opening') + f.totalIn - f.totalOut)
    expect(f.byDay.reduce((s, d) => s + d.inflow - d.outflow, 0)).toBe(f.totalIn - f.totalOut)
    // Doanh thu tháng trừ phần hoàn; tiền thu khách để so với doanh thu
    expect(m.revenue.net).toBe(270_000)
    expect(m.revenue.refunded).toBe(30_000)
    expect(f.customerReceipts).toBe(300_000)
  })
})

describe('3.19 — ảnh chứng từ (S48)', () => {
  it('người đề nghị và Nhung, Linh gắn, xem ảnh phiếu chi; thợ khác không thấy; sai loại, quá cỡ, quá 3 ảnh → 422', async () => {
    const t = await createExpense(auth('trang'), {
      branchId: cs4,
      createRequestId: rid(),
      categoryCode: 'tools',
      amount: 40_000,
      note: 'Kéo',
    })
    const l = await addAttachment(auth('trang'), 'expense', t.id, JPEG)
    expect(l.items).toHaveLength(1)
    expect(l.items[0]).toMatchObject({ mime: 'image/jpeg', canRemove: true })
    expect((await listAttachments(auth('nhung'), 'expense', t.id)).items).toHaveLength(1)
    expect((await err(listAttachments(auth('chin'), 'expense', t.id))).status).toBe(404)
    expect((await err(getAttachment(auth('chin'), l.items[0]!.id))).status).toBe(404)
    const a = await getAttachment(auth('linh'), l.items[0]!.id)
    expect(a.mime).toBe('image/jpeg')
    expect(new Uint8Array(a.data)).toEqual(JPEG)
    expect(
      (await err(addAttachment(auth('trang'), 'expense', t.id, new TextEncoder().encode('<svg>')))).status,
    ).toBe(422)
    const big = new Uint8Array(1024 * 1024 + 1)
    big.set(JPEG)
    expect((await err(addAttachment(auth('trang'), 'expense', t.id, big))).status).toBe(422)
    await addAttachment(auth('nhung'), 'expense', t.id, PNG)
    await addAttachment(auth('trang'), 'expense', t.id, JPEG)
    expect((await err(addAttachment(auth('trang'), 'expense', t.id, JPEG))).status).toBe(422)
    // Gỡ: người gửi gỡ ảnh của mình; thợ không gỡ ảnh Nhung gửi
    const items = (await listAttachments(auth('trang'), 'expense', t.id)).items
    const nhungs = items.find((i) => !i.canRemove)!
    expect((await err(removeAttachment(auth('trang'), nhungs.id))).status).toBe(403)
    await removeAttachment(auth('trang'), items.find((i) => i.canRemove)!.id)
    expect((await listAttachments(auth('trang'), 'expense', t.id)).items).toHaveLength(2)
  })

  it('phiếu hoàn: Nhung, Linh gắn ảnh; thợ không gắn; phiếu không tồn tại → 404', async () => {
    expect((await addAttachment(auth('nhung'), 'refund', refundId, JPEG)).items).toHaveLength(1)
    expect((await err(addAttachment(auth('chin'), 'refund', refundId, JPEG))).status).toBe(403)
    expect((await err(listAttachments(auth('linh'), 'refund', rid()))).status).toBe(404)
    expect((await err(listAttachments(auth('linh'), 'other', refundId))).status).toBe(404)
  })
})

describe('3.21 — Cần xem lại của Linh', () => {
  it('gom phiếu chi Nhung tự duyệt, phiếu hoàn của Nhung; Tổng quan đếm đúng; Nhung không xem được', async () => {
    const q = await reviewQueue(auth('linh'), { branchId: cs4 })
    expect(q.items.map((i) => [i.kind, i.id])).toEqual(
      expect.arrayContaining([
        ['expense', expenseId],
        ['refund', refundId],
      ]),
    )
    const ov = await overview(auth('linh'), { branchId: cs4, period: 'day' })
    expect(ov.attention.reviewTotal).toBe(q.total)
    expect((await err(reviewQueue(auth('nhung'), { branchId: cs4 }))).status).toBe(403)
  })
})
