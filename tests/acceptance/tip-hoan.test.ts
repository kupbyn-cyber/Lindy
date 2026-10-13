// Nghiệm thu tip giữ hộ và hoàn tiền (Đợt 3B-2, bước 3.15–3.16): PRD §18 test 5 (kỳ mở), 44; K18; test bảo mật
// S44–S46 (kế hoạch Đợt 3 mục 10.2).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { recordPayment, voidPayment } from '../../src/server/orders/payments'
import { refundOrder, reviewRefund } from '../../src/server/orders/refunds'
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  markDone,
} from '../../src/server/orders/service'
import { payTips, recordTip, tipSummary, voidTip } from '../../src/server/orders/tips'
import { overview } from '../../src/server/reports/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
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

async function sumOf(account: string) {
  const [r] = await owner<{ s: string }[]>`
    select coalesce(sum(amount), 0) as s from money_ledger_entries where money_account_id = ${account}`
  return Number(r!.s)
}

/** Đơn đã xác nhận, các dòng nhập tay theo thợ */
async function confirmed(lines: [SeedKey, number][]) {
  const { order } = await createOrder(auth('nhung'), {
    createRequestId: rid(),
    customerId: null,
    serviceDate: today,
    items: lines.map(([k, amount], i) => ({
      type: 'custom',
      name: `Dịch vụ ${i + 1}`,
      amount,
      staff: [{ userId: uid(k) }],
    })) as never,
    discounts: [],
  })
  const d = await markDone(auth('nhung'), order.id, order.version)
  return confirmOrder(auth('nhung'), d.id, d.version)
}

const revenue = async () => (await overview(auth('linh'), { period: 'day' })).revenue!.net
const staffRevenue = async (k: SeedKey) =>
  (await overview(auth('linh'), { period: 'day' })).byStaff.find((s) => s.userId === uid(k))?.amount ?? 0

describe('3.15 — tip giữ hộ (Q14, Q15)', () => {
  it('PRD 44: tip 50.000đ chuyển vào Tài khoản → giữ cho Chin; cuối ngày trả tiền mặt; doanh thu không đổi', async () => {
    const rev0 = await revenue()
    const bank0 = await sumOf(acc.bank)
    const o = await confirmed([['chin', 300_000]])
    const key = rid()
    const d = await recordPayment(auth('nhung'), o.id, {
      idempotencyKey: key,
      amount: 300_000,
      method: 'transfer',
      tip: { amount: 50_000 },
    })
    // Bấm hai lần cùng mã → không ghi thêm khoản thu, tip
    await recordPayment(auth('nhung'), o.id, {
      idempotencyKey: key,
      amount: 300_000,
      method: 'transfer',
      tip: { amount: 50_000 },
    })
    expect(d.tips).toMatchObject([{ staffName: 'Chin', amount: 50_000, paid: false }])
    expect(d.dueAmount).toBe(0)
    expect((await sumOf(acc.bank)) - bank0).toBe(350_000)
    expect((await revenue()) - rev0).toBe(300_000) // tip không phải doanh thu

    const sum = await tipSummary(auth('nhung'))
    expect(sum.holding.find((h) => h.staffUserId === uid('chin'))?.amount).toBe(50_000)
    // Thợ chỉ thấy tip của mình
    const chin = await tipSummary(auth('chin'))
    expect(chin.holding.map((h) => h.staffUserId)).toEqual([uid('chin')])
    expect((await tipSummary(auth('trang'))).holding.some((h) => h.staffUserId === uid('chin'))).toBe(false)

    const cash0 = await sumOf(acc.cash)
    const pk = rid()
    await payTips(auth('nhung'), { staffUserId: uid('chin'), idempotencyKey: pk })
    await payTips(auth('nhung'), { staffUserId: uid('chin'), idempotencyKey: pk }) // S44: bấm hai lần
    expect((await sumOf(acc.cash)) - cash0).toBe(-50_000)
    expect(
      (await err(payTips(auth('nhung'), { staffUserId: uid('chin'), idempotencyKey: rid() }))).status,
    ).toBe(422)
    expect((await getOrder(auth('nhung'), o.id)).tips[0]!.paid).toBe(true)
  })

  it('bill nhiều thợ chia tip theo phần tiền; khách chỉ định thì nhập tay, tổng phải khớp', async () => {
    const o = await confirmed([
      ['chin', 200_000],
      ['trang', 100_000],
    ])
    const d = await recordTip(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 30_000 })
    expect(Object.fromEntries(d.tips.map((t) => [t.staffName, t.amount]))).toEqual({
      Chin: 20_000,
      Trang: 10_000,
    })
    const bad = recordTip(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 20_000,
      split: [{ userId: uid('trang'), amount: 15_000 }],
    })
    expect((await err(bad)).status).toBe(422)
    const named = await recordTip(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 20_000,
      split: [{ userId: uid('trang'), amount: 20_000 }],
    })
    expect(named.tips.filter((t) => t.staffName === 'Trang').map((t) => t.amount)).toEqual([10_000, 20_000])
  })

  it('tip tiền mặt không ghi; thợ không ghi, không huỷ tip; huỷ tip chưa trả có bút toán đảo, đã trả thì không huỷ', async () => {
    const o = await confirmed([['trang', 100_000]])
    const cashTip = recordPayment(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 100_000,
      method: 'cash',
      tip: { amount: 10_000 },
    })
    expect((await err(cashTip)).status).toBe(422)
    expect(
      (await err(recordTip(auth('trang'), o.id, { idempotencyKey: rid(), amount: 10_000 }))).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        uid('chin'),
        (
          tx,
        ) => tx`select app.record_tip(${o.id}::uuid, ${[uid('chin')]}::uuid[], ${['1000']}::text[]::bigint[],
                                         gen_random_uuid())`,
      ),
      ['42501', '22P02'],
    )
    const d = await recordTip(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 10_000 })
    const t = d.tips[0]!
    expect((await err(voidTip(auth('trang'), t.id, 'x'))).status).toBe(403)
    await voidTip(auth('nhung'), t.id, 'Ghi nhầm')
    const led = await owner<{ entryType: string; amount: string }[]>`
      select entry_type, amount from money_ledger_entries where source_type = 'tip' and source_id = ${t.id} order by id`
    expect(led.map((l) => [l.entryType, Number(l.amount)])).toEqual([
      ['tip_in', 10_000],
      ['tip_in_void', -10_000],
    ])
    // Đã trả cho thợ → không huỷ được
    const d2 = await recordTip(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 5_000 })
    await payTips(auth('linh'), { staffUserId: uid('trang'), idempotencyKey: rid() })
    expect((await err(voidTip(auth('nhung'), d2.tips.find((x) => !x.voided)!.id, 'x'))).status).toBe(422)
  })
})

describe('3.16 — hoàn tiền, huỷ đơn đã xác nhận (K18)', () => {
  it('PRD 5: hoàn 100.000đ trong kỳ mở → có lý do; doanh thu ngày làm và phần thợ giảm đúng; tiền ra', async () => {
    const o = await confirmed([
      ['chin', 300_000],
      ['trang', 200_000],
    ])
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 500_000, method: 'cash' })
    const rev0 = await revenue()
    const chin0 = await staffRevenue('chin')
    const trang0 = await staffRevenue('trang')
    const cash0 = await sumOf(acc.cash)
    const key = rid()
    const d = await refundOrder(auth('nhung'), o.id, {
      idempotencyKey: key,
      amount: 100_000,
      method: 'cash',
      reason: 'Khách không hài lòng màu',
    })
    await refundOrder(auth('nhung'), o.id, {
      idempotencyKey: key,
      amount: 100_000,
      method: 'cash',
      reason: 'x',
    })
    expect(d.refunds).toHaveLength(1)
    expect(d.refunds[0]).toMatchObject({ amount: 100_000, needsOwnerReview: true })
    expect(Object.fromEntries(d.refunds[0]!.allocations.map((a) => [a.name, a.amount]))).toEqual({
      Chin: 60_000,
      Trang: 40_000,
    })
    expect(d).toMatchObject({ refundedAmount: 100_000, refundable: 400_000, paymentStatus: 'refund_partial' })
    expect((await revenue()) - rev0).toBe(-100_000)
    expect((await staffRevenue('chin')) - chin0).toBe(-60_000)
    expect((await staffRevenue('trang')) - trang0).toBe(-40_000)
    expect((await sumOf(acc.cash)) - cash0).toBe(-100_000)
    // K18: phiếu do Nhung lập → Cần xem lại của Linh
    const review = await listOrders(auth('linh'), { review: true })
    expect(review.items.find((i) => i.id === o.id)?.needsOwnerReview).toBe(true)
    expect((await err(reviewRefund(auth('nhung'), d.refunds[0]!.id))).status).toBe(403)
    const r = await reviewRefund(auth('linh'), d.refunds[0]!.id)
    expect(r.refunds[0]!.needsOwnerReview).toBe(false)
  })

  it('S45: hoàn vượt số đã thu → 422; hai phiếu song song cộng lại vượt → chỉ một phiếu; thợ không hoàn được', async () => {
    const o = await confirmed([['chin', 200_000]])
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 200_000, method: 'transfer' })
    const r = (amount: number, k: SeedKey = 'linh') =>
      refundOrder(auth(k), o.id, { idempotencyKey: rid(), amount, method: 'transfer', reason: 'Hoàn' })
    expect((await err(r(250_000))).status).toBe(422)
    const res = await Promise.allSettled([r(150_000), r(150_000)])
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect((await getOrder(auth('linh'), o.id)).refundedAmount).toBe(150_000)
    expect((await err(r(10_000, 'chin'))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('chin'),
        (tx) => tx`select app.refund_order(${o.id}::uuid, 1000::bigint, 'cash', 'x', gen_random_uuid())`,
      ),
      ['42501', '22P02'],
    )
    // Thợ không có phần trong đơn không đọc được số đã thu qua hàm (K09)
    const [leak] = await withUser(
      uid('trang'),
      (tx) => tx<{ n: string | null }[]>`select app.order_net_collected(${o.id}) as n`,
    )
    expect(leak!.n).toBeNull()
    // Linh lập phiếu → không cần xem lại; huỷ khoản thu đã hoàn một phần làm hoàn > thu → chặn
    expect((await getOrder(auth('linh'), o.id)).refunds[0]!.needsOwnerReview).toBe(false)
    const pay = (await getOrder(auth('linh'), o.id)).payments[0]!
    expect((await err(voidPayment(auth('linh'), pay.id, 'Nhầm'))).status).toBe(422)
  })

  it('S46: huỷ đơn đã xác nhận khi còn tiền thu chưa hoàn → 422; hoàn hết rồi huỷ được, doanh thu bỏ đơn', async () => {
    const o = await confirmed([['trang', 120_000]])
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 120_000, method: 'cash' })
    const rev0 = await revenue()
    const v1 = (await getOrder(auth('nhung'), o.id)).version
    expect((await err(cancelOrder(auth('nhung'), o.id, v1, 'Khách huỷ'))).status).toBe(422)
    expect((await err(cancelOrder(auth('trang'), o.id, v1, 'x'))).status).toBe(403)
    await refundOrder(auth('nhung'), o.id, {
      idempotencyKey: rid(),
      amount: 120_000,
      method: 'cash',
      reason: 'Hoàn hết',
    })
    const after = await getOrder(auth('nhung'), o.id)
    expect(after.paymentStatus).toBe('refund_full')
    const c = await cancelOrder(auth('nhung'), o.id, after.version, 'Khách huỷ, đã hoàn tiền')
    expect(c.status).toBe('cancelled')
    expect((await revenue()) - rev0).toBe(-120_000)
    // Nhung huỷ đơn đã xác nhận → Cần xem lại của Linh
    const [row] = await owner<
      { needsOwnerReview: boolean }[]
    >`select needs_owner_review from orders where id = ${o.id}`
    expect(row!.needsOwnerReview).toBe(true)
  })
})
