// Dữ liệu dùng thử (S12, S17): xoá để bắt đầu dùng thật, nạp gói thử. File này chạy sau cùng (tests/setup/sequencer.ts)
// vì nó xoá sạch dữ liệu nghiệp vụ của DB test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { createAccount } from '../../src/server/admin/accounts'
import { createAppointment } from '../../src/server/appointments/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { demoStatus, GOLIVE_CONFIRM, goLive, loadDemo } from '../../src/server/ops/demo'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'trang'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth

async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    const mapped = fromDbError(e)
    if (mapped) return mapped
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

const WIPED = [
  'appointments',
  'orders',
  'payments',
  'customers',
  'money_books',
  'money_ledger_entries',
  'expense_requests',
  'attendance_days',
  'staff_profiles',
  'employee_advances',
  'notification_events',
] as const
const KEPT = [
  'users',
  'user_credentials',
  'user_branch_roles',
  'services',
  'combos',
  'money_accounts',
  'branch_booking_settings',
  'expense_categories',
] as const

async function count(table: string) {
  const [r] = await owner<{ n: number }[]>`select count(*)::int as n from ${owner(table)}`
  return r!.n
}

describe('Dữ liệu dùng thử (S12)', () => {
  it('chỉ Chủ: Nhung, thợ không xem, không nạp, không xoá được (API và DB)', async () => {
    expect((await err(demoStatus(auth('nhung')))).status).toBe(403)
    expect((await err(loadDemo(auth('trang')))).status).toBe(403)
    expect((await err(goLive(auth('nhung'), { confirm: GOLIVE_CONFIRM }))).status).toBe(403)
    await expectPgError(
      withUser(seed().users.nhung!.id, (tx) => tx`select app.demo_golive_wipe(${seed().branchIds.HTK!})`),
      '42501',
    )
    await expectPgError(
      withUser(seed().users.nhung!.id, (tx) => tx`select app.demo_clear_existing(${seed().branchIds.HTK!})`),
      '42501',
    )
  })

  it('app đã có dữ liệu: nạp thẳng bị chặn; phải chọn xoá dữ liệu hiện có và gõ đúng chữ xác nhận', async () => {
    await createAppointment(auth('trang'), {
      customerDisplayName: 'Khách thử tay',
      phone: null,
      date: addDays(toLocalDate(new Date()), 40),
      startTime: '10:00',
      endTime: '11:00',
      guestCount: 1,
      serviceSummary: null,
      notes: null,
      createRequestId: rid(),
    })
    expect((await demoStatus(auth('linh'))).counts.appointments).toBeGreaterThan(0)
    expect((await err(loadDemo(auth('linh')))).status).toBe(422)
    expect((await err(loadDemo(auth('linh'), { replaceExisting: true, confirm: 'xoa' }))).status).toBe(422)
  })

  it('xoá dữ liệu hiện có rồi nạp gói thử: lịch 2 tuần, 40–60 đơn, sổ tiền, thu chi, công, lương; không phát thông báo', async () => {
    const events = await count('notification_events')
    // Tên không có trong data/staff.csv (S39): không có hồ sơ thử, được báo lại thay vì bỏ qua im lặng
    const extra = await createAccount(auth('linh'), { name: 'Nhung Hi', phone: '0912000601', role: 'staff' })
    const res = await loadDemo(auth('linh'), { replaceExisting: true, confirm: GOLIVE_CONFIRM })
    expect(res.state).toBe('loaded')
    expect(res.summary!.unmatched).toContain('Nhung Hi')
    expect(res.summary!.unmatched).not.toContain('Nhung')
    expect(await owner`select 1 from staff_profiles where user_id = ${extra.id}`).toHaveLength(0)
    expect(res.summary!.orders).toBeGreaterThanOrEqual(40)
    expect(res.summary!.orders).toBeLessThanOrEqual(60)
    expect(res.counts.appointments).toBeGreaterThanOrEqual(50)
    // Dữ liệu cũ đã xoá: không còn "Khách thử tay"
    const [old] = await owner<{ n: number }[]>`
        select count(*)::int as n from appointments where customer_display_name = 'Khách thử tay'`
    expect(old!.n).toBe(0)
    // Thông báo cũ xoá cùng dữ liệu; nạp gói thử không phát thông báo mới
    expect(events).toBeGreaterThan(0)
    expect(await count('notification_events')).toBe(0)
    expect(await count('money_books')).toBe(1)
    expect(await count('expense_requests')).toBe(3)
    expect(await count('employee_advances')).toBe(1)
    expect(await count('staff_profiles')).toBeGreaterThanOrEqual(4)
    expect(await count('attendance_days')).toBeGreaterThan(0)
    expect(await count('payments')).toBeGreaterThan(30)
    // Mọi lịch đã qua giờ đều có đơn hoặc đã huỷ / không đến → không báo "quá giờ"
    const [overdue] = await owner<{ n: number }[]>`
        select count(*)::int as n from appointments a
        where a.end_at < now() and a.status in ('pending', 'confirmed')`
    expect(overdue!.n).toBe(0)
    // Đơn ghi đúng ngày làm dịch vụ của lịch
    const [bad] = await owner<{ n: number }[]>`
        select count(*)::int as n from orders o join appointments a on a.id = o.appointment_id
        where o.service_date <> (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date`
    expect(bad!.n).toBe(0)
    // Đã nạp rồi: không nạp lại, không "xoá dữ liệu hiện có" được nữa
    expect(
      (await err(loadDemo(auth('linh'), { replaceExisting: true, confirm: GOLIVE_CONFIRM }))).status,
    ).toBe(422)
  }, 180_000)

  it('xoá, bắt đầu dùng thật: sai chữ xác nhận → 422; đúng → bảng nghiệp vụ trống, tài khoản, danh mục giữ nguyên', async () => {
    expect((await err(goLive(auth('linh'), { confirm: 'xoa' }))).status).toBe(422)
    const kept = Object.fromEntries(await Promise.all(KEPT.map(async (t) => [t, await count(t)])))
    const auditBefore = await count('audit_logs')
    const s = await goLive(auth('linh'), { confirm: GOLIVE_CONFIRM.toLowerCase() })
    expect(s.state).toBe('live')
    for (const t of WIPED) expect(await count(t), t).toBe(0)
    for (const t of KEPT) expect(await count(t), t).toBe(kept[t])
    // Nhật ký thao tác giữ lại, thêm dòng ghi việc xoá
    expect(await count('audit_logs')).toBe(auditBefore + 1)
    // Trigger chặn sửa/xoá đã bật lại
    const [off] = await owner<{ n: number }[]>`
      select count(*)::int as n from pg_trigger t where not t.tgisinternal and t.tgenabled = 'D'`
    expect(off!.n).toBe(0)
    // Xoá lần hai bị chặn; không nạp thử, không dọn được nữa
    expect((await demoStatus(auth('linh'))).counts).toEqual({ appointments: 0, orders: 0, customers: 0 })
    expect((await err(goLive(auth('linh'), { confirm: GOLIVE_CONFIRM }))).status).toBe(422)
    expect((await err(loadDemo(auth('linh')))).status).toBe(422)
    await expectPgError(
      withUser(seed().users.linh!.id, (tx) => tx`select app.demo_clear_existing(${seed().branchIds.HTK!})`),
      'P0001',
    )
  })
})
