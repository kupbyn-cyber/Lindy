// Nghiệm thu tiền cọc mùa Tết (Đợt 3A, bước 3.4–3.8): module lịch §13 test 29–36; PRD §18 test 35, 36, 54;
// test bảo mật S31, S32, S35–S38 (kế hoạch Đợt 3 mục 10.2). Mỗi test ghi đúng số thứ tự.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import {
  attentionList,
  createAppointment,
  getAppointment,
  getSettings,
  listAppointments,
  transitionAppointment,
} from '../../src/server/appointments/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { RecordDepositBody } from '../../src/server/deposits/schema'
import {
  confirmDeposit,
  listSeasons,
  recordDeposit,
  resolveDeposit,
  reviewDeposit,
  saveSeason,
  voidDeposit,
} from '../../src/server/deposits/service'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { voidPayment } from '../../src/server/orders/payments'
import {
  confirmOrder,
  createOrderFromAppointment,
  getOrder,
  markDone,
  updateOrder,
} from '../../src/server/orders/service'
import { overview } from '../../src/server/reports/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
let htk = ''
const acc: Record<'cash' | 'bank', string> = { cash: '', bank: '' }
let seasonId = ''

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
  htk = seed().branchIds.HTK!
  for (const r of await owner<{ id: string; type: 'cash' | 'bank' }[]>`
    select id, type from money_accounts where branch_id = ${htk}`)
    acc[r.type] = r.id
})
afterAll(async () => {
  // Tắt mùa cọc thử để các file test sau tạo lịch như ngoài mùa
  if (seasonId) await owner`update deposit_seasons set is_active = false where id = ${seasonId}`
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

async function newAppt(k: SeedKey, opts: { date?: string; guests?: number; name?: string } = {}) {
  const { appointment } = await createAppointment(auth(k), {
    customerDisplayName: opts.name ?? 'Khách Tết',
    phone: '0912000111',
    date: opts.date ?? addDays(today, 3),
    startTime: '10:00',
    endTime: '11:00',
    guestCount: opts.guests ?? 1,
    serviceSummary: null,
    notes: 'Ghi chú nội bộ bí mật',
    createRequestId: rid(),
  })
  return appointment
}

const record = (k: SeedKey, apptId: string, amount: number, method: 'cash' | 'transfer' = 'transfer') =>
  recordDeposit(auth(k), apptId, { idempotencyKey: rid(), amount, method })

/** Ghi + Nhung xác nhận; trả về id khoản cọc */
async function heldDeposit(apptId: string, amount: number, method: 'cash' | 'transfer' = 'transfer') {
  const d = await record('trang', apptId, amount, method)
  const dep = d.deposit!.items.at(-1)!
  await confirmDeposit(auth('nhung'), dep.id, dep.version)
  return dep.id
}

/** Dời giờ hẹn về `hours` giờ kể từ bây giờ (chủ DB) để thử mốc 12 tiếng */
async function startIn(apptId: string, hours: number) {
  await owner`
    update appointments set start_at = now() + make_interval(hours => ${hours}),
                            end_at = now() + make_interval(hours => ${hours}) + interval '1 minute'
    where id = ${apptId}`
}

async function ledgerOf(depositId: string) {
  return owner<{ entryType: string; amount: string; moneyAccountId: string }[]>`
    select entry_type, amount, money_account_id from money_ledger_entries
    where source_type = 'deposit' and source_id = ${depositId} order by id`
}

async function version(apptId: string) {
  return (await getAppointment(auth('nhung'), apptId)).version
}

async function depositOf(k: SeedKey, apptId: string, depositId: string) {
  return (await getAppointment(auth(k), apptId)).deposit!.items.find((i) => i.id === depositId)!
}

let beforeSeason = ''

describe('Module 29 — ngoài mùa cọc', () => {
  it('form không có phần cọc; không ghi được cọc', async () => {
    const a = await newAppt('trang')
    beforeSeason = a.id
    expect(a.depositState).toBeNull()
    expect((await getAppointment(auth('trang'), a.id)).deposit).toBeNull()
    expect((await getSettings(auth('trang'))).depositSeason).toBeNull()
    expect((await err(record('trang', a.id, 100_000))).status).toBe(422)
  })
})

describe('3.4 — mùa cọc (Linh cài)', () => {
  const season = (over: Record<string, unknown> = {}) => ({
    name: 'Tết thử',
    startDate: addDays(today, -1),
    endDate: addDays(today, 5),
    amountPerGuest: 100_000,
    refundNoticeHours: 12,
    forfeitOwnerUserId: uid('linh'),
    isActive: true,
    ...over,
  })

  it('Nhung không cài được (API và SQL); mùa dài hơn 31 ngày, chồng ngày → chặn', async () => {
    expect((await err(saveSeason(auth('nhung'), season()))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) => tx`select app.deposit_season_save(null, ${htk}::uuid, 'X', ${today}::date, ${today}::date,
                                                  100000::bigint, 12, ${uid('nhung')}::uuid, true)`,
      ),
      '42501',
    )
    expect((await err(saveSeason(auth('linh'), season({ endDate: addDays(today, 40) })))).status).toBe(422)
  })

  it('Linh lưu mùa cọc; mùa thứ hai chồng ngày bị chặn; lịch tạo trước khi có mùa vẫn không cần cọc (C01)', async () => {
    const res = await saveSeason(auth('linh'), season())
    seasonId = res.seasons[0]!.id
    expect(res.current?.id).toBe(seasonId)
    expect(res.current?.forfeitOwnerName).toBe('Linh')
    expect((await err(saveSeason(auth('linh'), season({ name: 'Trùng' })))).status).toBe(422)
    expect((await getAppointment(auth('trang'), beforeSeason)).deposit).toBeNull()
    expect((await listSeasons(auth('trang'))).can.manage).toBe(false)
  })
})

describe('Module 30 — lịch 2 khách tạo trong mùa, ngày hẹn sau mùa', () => {
  it('cần cọc, gợi ý 200.000đ; lưu được khi chưa cọc, nhãn Chưa cọc (K16)', async () => {
    expect((await getSettings(auth('trang'))).depositSeason).toMatchObject({ amountPerGuest: 100_000 })
    const a = await newAppt('trang', { guests: 2, date: addDays(today, 20) })
    expect(a.depositState).toBe('missing')
    const d = await getAppointment(auth('trang'), a.id)
    expect(d.deposit).toMatchObject({ suggested: 200_000, perGuest: 100_000, state: 'missing' })
    const list = await listAppointments(auth('trang'), { from: addDays(today, 20), to: addDays(today, 20) })
    expect(list.items.find((i) => i.id === a.id)?.depositState).toBe('missing')
    const att = await attentionList(auth('nhung'))
    expect(att.depositsMissing.map((i) => i.id)).toContain(a.id)
  })
})

describe('Module 31, 32 — ghi cọc, xác nhận (S31, S32, S38)', () => {
  it('Trang ghi 200.000đ chuyển khoản → Chờ xác nhận, chưa vào sổ; Nhung, Linh nhận thông báo', async () => {
    const a = await newAppt('trang', { guests: 2 })
    const bank0 = await owner<{ s: string }[]>`
      select coalesce(sum(amount), 0) as s from money_ledger_entries where money_account_id = ${acc.bank}`
    const key = rid()
    const d = await recordDeposit(auth('trang'), a.id, {
      idempotencyKey: key,
      amount: 200_000,
      method: 'transfer',
    })
    // Bấm hai lần cùng mã → một khoản (S32)
    await recordDeposit(auth('trang'), a.id, { idempotencyKey: key, amount: 200_000, method: 'transfer' })
    expect(d.deposit!.items).toHaveLength(1)
    expect(d.deposit).toMatchObject({ state: 'pending', pendingAmount: 200_000, heldAmount: 0 })
    expect(d.depositState).toBe('pending')
    const dep = d.deposit!.items[0]!
    expect(dep).toMatchObject({ status: 'recorded', accountName: 'Tài khoản cs HTK' })
    expect(await ledgerOf(dep.id)).toHaveLength(0)
    const bank1 = await owner<{ s: string }[]>`
      select coalesce(sum(amount), 0) as s from money_ledger_entries where money_account_id = ${acc.bank}`
    expect(bank1[0]!.s).toBe(bank0[0]!.s)

    const rec = await owner<{ userId: string; pushBody: string }[]>`
      select r.user_id, e.push_body from notification_recipients r join notification_events e on e.id = r.event_id
      where e.type = 'deposit.recorded' and e.entity_id = ${a.id}`
    expect(rec.map((r) => r.userId).sort()).toEqual([uid('linh'), uid('nhung')].sort())
    // S38: màn hình khoá không có tên khách, SĐT, ghi chú
    for (const r of rec) {
      expect(r.pushBody).not.toContain('Khách Tết')
      expect(r.pushBody).not.toContain('0912000111')
      expect(r.pushBody).not.toContain('bí mật')
    }
    expect((await attentionList(auth('nhung'))).depositsToConfirm.map((i) => i.id)).toContain(a.id)
    expect((await attentionList(auth('chin'))).depositsToConfirm).toHaveLength(0)

    // Module 32 / S31: Trang, Chin không xác nhận được (API và SQL)
    expect((await err(confirmDeposit(auth('trang'), dep.id, dep.version))).status).toBe(403)
    expect((await err(confirmDeposit(auth('chin'), dep.id, dep.version))).status).toBe(403)
    await expectPgError(
      withUser(
        uid('chin'),
        (tx) => tx`update appointment_deposits set status = 'confirmed' where id = ${dep.id}`,
      ),
      '42501',
    )
    // Nhung xác nhận → tiền vào Tài khoản cs HTK
    const c = await confirmDeposit(auth('nhung'), dep.id, dep.version)
    expect(c.deposit).toMatchObject({ state: 'held', heldAmount: 200_000, pendingAmount: 0 })
    expect(c.deposit!.items[0]).toMatchObject({ status: 'confirmed', confirmedByName: 'Nhung' })
    const led = await ledgerOf(dep.id)
    expect(led.map((l) => [l.entryType, Number(l.amount), l.moneyAccountId])).toEqual([
      ['deposit_in', 200_000, acc.bank],
    ])
    // Xác nhận lần hai → không ghi thêm
    await confirmDeposit(auth('nhung'), dep.id, dep.version)
    expect(await ledgerOf(dep.id)).toHaveLength(1)
  })

  it('S32: số tiền không hợp lệ, trường lạ → 422; lịch cơ sở khác → 404', async () => {
    expect(RecordDepositBody.safeParse({ idempotencyKey: rid(), amount: 0, method: 'cash' }).success).toBe(
      false,
    )
    expect(
      RecordDepositBody.safeParse({ idempotencyKey: rid(), amount: 20_000_000, method: 'cash' }).success,
    ).toBe(false)
    expect(
      RecordDepositBody.safeParse({
        idempotencyKey: rid(),
        amount: 100_000,
        method: 'cash',
        status: 'confirmed',
      }).success,
    ).toBe(false)
    const a = await newAppt('trang')
    expect((await err(record('mai', a.id, 100_000))).status).toBe(404)
  })

  it('huỷ cọc: người ghi huỷ khi chưa xác nhận; cọc đã xác nhận chỉ Nhung, Linh huỷ (bút toán đảo)', async () => {
    const a = await newAppt('trang')
    const d1 = (await record('trang', a.id, 100_000, 'cash')).deposit!.items[0]!
    expect((await err(voidDeposit(auth('chin'), d1.id, d1.version, 'nhầm'))).status).toBe(403)
    const v = await voidDeposit(auth('trang'), d1.id, d1.version, 'Ghi nhầm lịch')
    expect(v.deposit!.state).toBe('missing')
    const id2 = await heldDeposit(a.id, 100_000, 'cash')
    const d2 = await depositOf('trang', a.id, id2)
    expect(d2.can.void).toBe(false)
    expect((await err(voidDeposit(auth('trang'), id2, d2.version, 'x'))).status).toBe(403)
    await voidDeposit(auth('nhung'), id2, d2.version, 'Xác nhận nhầm, tiền chưa vào')
    const led = await ledgerOf(id2)
    expect(led.map((l) => [l.entryType, Number(l.amount)])).toEqual([
      ['deposit_in', 100_000],
      ['deposit_in_void', -100_000],
    ])
  })
})

describe('Module 36 — thợ không tự huỷ lịch có cọc đã xác nhận (S37)', () => {
  it('Trang huỷ lịch mình tạo còn Mới đặt có cọc → chặn ở API và SQL; Chin huỷ được', async () => {
    const a = await newAppt('trang')
    await heldDeposit(a.id, 100_000)
    const d = await getAppointment(auth('trang'), a.id)
    expect(d.can.cancel).toBe(false)
    const e = await err(
      transitionAppointment(auth('trang'), a.id, 'cancel', { version: d.version, reason: 'Khách bận' }),
    )
    expect(e.status).toBe(403)
    await expectPgError(
      withUser(
        uid('trang'),
        (tx) => tx`update appointments set status = 'cancelled', cancel_reason = 'x' where id = ${a.id}`,
      ),
      '42501',
    )
    const c = await transitionAppointment(auth('chin'), a.id, 'cancel', {
      version: d.version,
      reason: 'Khách bận',
    })
    expect(c.status).toBe('cancelled')
    expect((await attentionList(auth('chin'))).depositsToResolve.map((i) => i.id)).toContain(a.id)
  })
})

describe('Module 33 — khách báo huỷ 13 tiếng trước giờ hẹn → hoàn cọc', () => {
  it('app gợi ý hoàn; Chin hoàn tiền mặt → phiếu hoàn, tiền ra', async () => {
    const a = await newAppt('trang', { guests: 2 })
    const dep = await heldDeposit(a.id, 200_000)
    await startIn(a.id, 13)
    await transitionAppointment(auth('trang'), a.id, 'report_customer_cancel', {
      version: await version(a.id),
      note: 'Khách nhắn huỷ',
    })
    const pre = await depositOf('chin', a.id, dep)
    expect(pre.can.resolve).toBe(false) // lịch chưa huỷ chính thức
    await transitionAppointment(auth('chin'), a.id, 'cancel', {
      version: await version(a.id),
      reason: 'Khách huỷ',
    })
    const d = await getAppointment(auth('chin'), a.id)
    expect(d.deposit!.suggestion).toBe('refund')
    const item = d.deposit!.items[0]!
    expect(item.can.resolve).toBe(true)
    const r = await resolveDeposit(auth('chin'), dep, 'refund', {
      version: item.version,
      reason: 'Báo trước 13 tiếng',
      method: 'cash',
    })
    expect(r.deposit!.items[0]).toMatchObject({
      status: 'refunded',
      resolvedAmount: 200_000,
      suggestedAction: 'refund',
      needsOwnerReview: false,
    })
    expect(r.deposit!.state).toBe('done')
    const led = await ledgerOf(dep)
    expect(led.map((l) => [l.entryType, Number(l.amount), l.moneyAccountId])).toEqual([
      ['deposit_in', 200_000, acc.bank],
      ['deposit_refund', -200_000, acc.cash],
    ])
  })
})

describe('Module 34, PRD 36 — báo huỷ 11 tiếng trước hoặc không đến → giữ cọc', () => {
  it('giữ cọc: doanh thu cọc bỏ hẹn phần của Linh, ngày hẹn; không bút toán mới; doanh thu thợ không đổi', async () => {
    const ov0 = await overview(auth('linh'), { period: 'day' })
    const a = await newAppt('trang')
    const dep = await heldDeposit(a.id, 100_000)
    await startIn(a.id, 11)
    await transitionAppointment(auth('trang'), a.id, 'report_customer_cancel', {
      version: await version(a.id),
    })
    await transitionAppointment(auth('nhung'), a.id, 'cancel', {
      version: await version(a.id),
      reason: 'Khách huỷ',
    })
    const d = await getAppointment(auth('nhung'), a.id)
    expect(d.deposit!.suggestion).toBe('forfeit')
    const it0 = d.deposit!.items[0]!
    await resolveDeposit(auth('nhung'), dep, 'forfeit', { version: it0.version, reason: 'Báo huỷ muộn' })
    const [row] = await owner<
      { status: string; revenueDate: string; forfeitOwnerUserId: string; startDate: string }[]
    >`
      select d.status, d.revenue_date::text as revenue_date, d.forfeit_owner_user_id,
             (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date::text as start_date
      from appointment_deposits d join appointments a on a.id = d.appointment_id where d.id = ${dep}`
    expect(row).toMatchObject({ status: 'forfeited', forfeitOwnerUserId: uid('linh') })
    expect(row!.revenueDate).toBe(row!.startDate)
    expect((await ledgerOf(dep)).map((l) => l.entryType)).toEqual(['deposit_in'])
    // Doanh thu đơn và doanh thu theo thợ (cơ sở hoa hồng, KPI) không đổi (A03, C04)
    const ov1 = await overview(auth('linh'), { period: 'day' })
    expect(ov1.revenue?.net).toBe(ov0.revenue?.net)
    expect(ov1.byStaff).toEqual(ov0.byStaff)
  })

  it('khách không đến → gợi ý giữ; Chin hoàn trái gợi ý → bắt lý do, vào Cần xem lại của Linh [P49]', async () => {
    const a = await newAppt('trang')
    const dep = await heldDeposit(a.id, 100_000)
    await transitionAppointment(auth('chin'), a.id, 'no_show', { version: await version(a.id) })
    const d = await getAppointment(auth('chin'), a.id)
    expect(d.deposit!.suggestion).toBe('forfeit')
    const r = await resolveDeposit(auth('chin'), dep, 'refund', {
      version: d.deposit!.items[0]!.version,
      reason: 'Khách quen, ốm đột xuất',
    })
    expect(r.deposit!.items[0]).toMatchObject({
      status: 'refunded',
      suggestedAction: 'forfeit',
      needsOwnerReview: true,
    })
    expect((await err(reviewDeposit(auth('nhung'), dep))).status).toBe(403)
    const l = await reviewDeposit(auth('linh'), dep)
    expect(l.deposit!.items[0]!.needsOwnerReview).toBe(false)
    // Hoàn lại lần nữa → chặn (S35)
    expect(
      (
        await err(
          resolveDeposit(auth('chin'), dep, 'forfeit', {
            version: l.deposit!.items[0]!.version,
            reason: 'x',
          }),
        )
      ).status,
    ).toBe(422)
  })

  it('S35: hoàn và giữ cùng một cọc song song → chỉ một thao tác thành công', async () => {
    const a = await newAppt('trang')
    const dep = await heldDeposit(a.id, 100_000)
    await transitionAppointment(auth('chin'), a.id, 'no_show', { version: await version(a.id) })
    const v = (await depositOf('chin', a.id, dep)).version
    const res = await Promise.allSettled([
      resolveDeposit(auth('chin'), dep, 'refund', { version: v, reason: 'a' }),
      resolveDeposit(auth('nhung'), dep, 'forfeit', { version: v, reason: 'b' }),
    ])
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const led = await ledgerOf(dep)
    expect(led.filter((l) => l.entryType === 'deposit_refund').length).toBeLessThanOrEqual(1)
  })
})

describe('Module 35, PRD 35, 54 — khách có cọc đến làm', () => {
  async function orderFrom(apptId: string, amount: number) {
    const { order } = await createOrderFromAppointment(auth('trang'), apptId, {
      createRequestId: rid(),
      additional: true,
    })
    const saved = await updateOrder(auth('trang'), order.id, {
      version: order.version,
      customerId: order.customer?.id ?? null,
      serviceDate: order.serviceDate,
      items: [{ type: 'custom', name: 'Dịch vụ Tết', amount, staff: [{ userId: uid('trang') }] }] as never,
      discounts: [],
    })
    return saved
  }

  it('cọc 200.000đ, bill 500.000đ → khoản thu cọc tự có, còn phải thu 300.000đ; ngày nhận cọc không có doanh thu', async () => {
    const a = await newAppt('trang', { guests: 2, date: today })
    const rev0 = (await overview(auth('linh'), { period: 'day' })).revenue?.net
    const dep = await heldDeposit(a.id, 200_000)
    expect((await overview(auth('linh'), { period: 'day' })).revenue?.net).toBe(rev0)

    const o = await orderFrom(a.id, 500_000)
    expect(o.depositAvailable).toBe(200_000)
    const done = await markDone(auth('trang'), o.id, o.version)
    expect(done.paidAmount).toBe(200_000)
    expect(done.dueAmount).toBe(300_000)
    expect(done.depositAvailable).toBe(0)
    expect(done.payments).toMatchObject([{ method: 'deposit', amount: 200_000, voided: false }])
    // Trừ cọc không ghi bút toán mới (tiền đã vào sổ lúc xác nhận cọc)
    expect((await ledgerOf(dep)).map((l) => l.entryType)).toEqual(['deposit_in'])
    const c = await confirmOrder(auth('nhung'), o.id, done.version)
    expect(c.dueAmount).toBe(300_000)
    expect(c.payments.filter((p) => !p.voided)).toHaveLength(1)
    expect((await getAppointment(auth('nhung'), a.id)).deposit).toMatchObject({
      state: 'done',
      heldAmount: 0,
    })
    // Cọc đã trừ vào bill: không huỷ được, không hoàn được
    const it0 = await depositOf('nhung', a.id, dep)
    expect(it0.can.void).toBe(false)
    expect((await err(voidDeposit(auth('nhung'), dep, it0.version, 'x'))).status).toBe(422)
  })

  it('S36: lịch nhóm 2 đơn dùng chung cọc 200.000đ, bấm Làm xong song song → tổng trừ không vượt cọc', async () => {
    const a = await newAppt('trang', { guests: 2, date: today })
    await heldDeposit(a.id, 200_000)
    const o1 = await orderFrom(a.id, 150_000)
    const o2 = await orderFrom(a.id, 300_000)
    await Promise.all([
      markDone(auth('trang'), o1.id, o1.version),
      markDone(auth('trang'), o2.id, o2.version),
    ])
    const [x, y] = await Promise.all([getOrder(auth('nhung'), o1.id), getOrder(auth('nhung'), o2.id)])
    expect(x.paidAmount + y.paidAmount).toBe(200_000)
    expect((await getAppointment(auth('nhung'), a.id)).deposit!.heldAmount).toBe(0)

    // Huỷ khoản trừ cọc trên đơn → cọc trả về; xác nhận đơn thì trừ lại
    const pay = y.payments.find((p) => p.method === 'deposit' && !p.voided)!
    await voidPayment(auth('nhung'), pay.id, 'Trừ nhầm đơn')
    expect((await getAppointment(auth('nhung'), a.id)).deposit!.heldAmount).toBe(pay.amount)
    const c = await confirmOrder(auth('nhung'), y.id, (await getOrder(auth('nhung'), y.id)).version)
    expect(c.paidAmount).toBe(pay.amount)
  })

  it('cọc dư sau khi lịch Hoàn thành → gợi ý hoàn phần còn lại', async () => {
    const a = await newAppt('trang', { guests: 2, date: today })
    const dep = await heldDeposit(a.id, 200_000)
    const o = await orderFrom(a.id, 120_000)
    const done = await markDone(auth('trang'), o.id, o.version)
    await confirmOrder(auth('nhung'), o.id, done.version)
    const d = await getAppointment(auth('nhung'), a.id)
    expect(d.status).toBe('completed')
    expect(d.deposit).toMatchObject({ heldAmount: 80_000, suggestion: 'refund' })
    const r = await resolveDeposit(auth('nhung'), dep, 'refund', {
      version: d.deposit!.items[0]!.version,
      reason: 'Hoàn phần cọc dư',
      method: 'transfer',
    })
    expect(r.deposit!.items[0]).toMatchObject({
      status: 'refunded',
      resolvedAmount: 80_000,
      applied: 120_000,
    })
    expect((await ledgerOf(dep)).map((l) => [l.entryType, Number(l.amount)])).toEqual([
      ['deposit_in', 200_000],
      ['deposit_refund', -80_000],
    ])
  })
})

describe('3.10 — Tổng quan, báo cáo', () => {
  it('Linh, Nhung thấy Tiền trong quỹ và cọc; thợ không thấy; báo cáo tháng khớp số cọc trong DB', async () => {
    const lo = await overview(auth('linh'), { period: 'month' })
    expect(lo.money?.map((m) => m.name)).toEqual(['Tiền mặt cs HTK', 'Tài khoản cs HTK'])
    expect((await overview(auth('nhung'), { period: 'day' })).money).toHaveLength(2)
    const to = await overview(auth('trang'), { period: 'day' })
    expect(to.money).toBeNull()
    expect(to.deposits).toBeNull()

    // Tháng có cọc bị giữ (ngày hẹn có thể sang tháng sau nếu chạy test cuối tháng)
    const [fm] = await owner<{ month: string }[]>`
      select to_char(max(revenue_date), 'YYYY-MM') as month from appointment_deposits
      where branch_id = ${htk} and status = 'forfeited'`
    const month = fm!.month
    const { monthReport, dayReport } = await import('../../src/server/reports/service')
    const m = await monthReport(auth('nhung'), { month })
    const [db] = await owner<{ forfeited: string; held: string; pending: string }[]>`
      select coalesce(sum(resolved_amount) filter (where status = 'forfeited'
               and to_char(revenue_date, 'YYYY-MM') = ${month}), 0) as forfeited,
             coalesce(sum(amount - coalesce(resolved_amount, 0) - app.deposit_applied(id))
               filter (where status = 'confirmed'), 0) as held,
             coalesce(sum(amount) filter (where status = 'recorded'), 0) as pending
      from appointment_deposits where branch_id = ${htk}`
    expect(m.deposits.forfeited).toBe(Number(db!.forfeited))
    expect(m.deposits.forfeited).toBeGreaterThan(0)
    expect(m.deposits.held).toBe(Number(db!.held))
    expect(m.deposits.pending).toBe(Number(db!.pending))
    expect(m.deposits.forfeitedByOwner.map((o) => o.name)).toEqual(['Linh'])
    expect(lo.deposits?.held).toBe(Number(db!.held))
    const d = await dayReport(auth('linh'), { date: today })
    expect(d.deposits.received).toBeGreaterThan(0)
  })
})

describe('S34 — không đổi trạng thái cọc, không trừ cọc bằng SQL trực tiếp', () => {
  it('app_user không ghi khoản thu loại cọc; không sửa số tiền cọc', async () => {
    const a = await newAppt('trang')
    const dep = await heldDeposit(a.id, 100_000)
    const { order } = await createOrderFromAppointment(auth('trang'), a.id, { createRequestId: rid() })
    await expectPgError(
      withUser(
        uid('nhung'),
        (
          tx,
        ) => tx`insert into payments (order_id, branch_id, amount, method, recorded_by, idempotency_key, deposit_id)
                   values (${order.id}, ${htk}, 100000, 'deposit', ${uid('nhung')}, gen_random_uuid(), ${dep})`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(uid('nhung'), (tx) => tx`update appointment_deposits set amount = 1 where id = ${dep}`),
      '42501',
    )
  })
})
