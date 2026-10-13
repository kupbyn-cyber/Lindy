// Dữ liệu demo cho DB dev (bước 1.19, 2.16, 3.11, 4.2): lịch mẫu tuần này, SĐT giả 0900000xxx; 5 đơn mẫu hôm nay,
// hôm qua; mùa cọc thử và 3 lịch có cọc; hồ sơ, chính sách lương, chấm công mẫu.
// Chỉ chạy trên DB localhost _dev.
//   bun scripts/demo-data.ts
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import type { ItemInput } from '../src/lib/order-math'
import { foldVietnamese } from '../src/lib/text'
import { addDays, addMonths, fromLocal, toLocalDate } from '../src/lib/time'
import { createAppointment } from '../src/server/appointments/service'
import { createLeave } from '../src/server/attendance/leave'
import { decideDay } from '../src/server/attendance/service'
import type { Auth } from '../src/server/auth/context'
import { closeSql } from '../src/server/db/client'
import { confirmDeposit, listSeasons, recordDeposit, saveSeason } from '../src/server/deposits/service'
import { recordPayment } from '../src/server/orders/payments'
import type { CreateOrderInput } from '../src/server/orders/schema'
import { confirmOrder, createOrder, markDone } from '../src/server/orders/service'
import { createAdvance } from '../src/server/payroll/advances'
import { savePolicy, saveProfile, saveSettings } from '../src/server/staff/service'
import { assertDisposableDb } from './lib/db-guard'
import { loadEnv, ROOT, requireEnv } from './lib/env'

loadEnv()
const url = requireEnv('MIGRATE_DATABASE_URL')
assertDisposableDb(url, ['_dev'])
assertDisposableDb(requireEnv('DATABASE_URL'), ['_dev']) // đơn demo tạo qua service, kết nối bằng DATABASE_URL
const sql = postgres(url, { onnotice: () => {}, max: 1, transform: postgres.camel })

type Demo = [
  dayOffset: number,
  start: string,
  end: string,
  name: string,
  guests: number,
  service: string | null,
  by: string,
  confirm: boolean,
  phone?: string,
]

const DEMO: Demo[] = [
  [0, '09:00', '11:00', 'Mai Anh', 1, 'sơn gel tay', 'trang', false, '0900000001'],
  [0, '10:00', '11:30', 'Hà Linh', 2, 'tay + chân', 'chin', true, '0900000002'],
  [0, '10:00', '12:00', 'Nhóm 3 khách', 3, 'đắp gel', 'nhung', true],
  [0, '10:30', '11:30', 'Thu Trang', 1, 'uốn mi', 'trang', false],
  [0, '11:00', '13:00', 'Khách', 1, null, 'linh', true],
  [0, '14:00', '16:00', 'Phương', 1, 'nhặt da + sơn', 'chin', false, '0900000003'],
  [0, '20:30', '22:00', 'Ngọc', 1, 'phá móng', 'nhung', true],
  [1, '09:30', '11:30', 'Lan', 1, 'sơn gel tay', 'trang', false],
  [1, '13:00', '15:00', 'Hồng Nhung', 2, 'combo 139k', 'nhung', true],
  [2, '15:00', '17:00', 'Thảo', 1, 'mi', 'chin', true],
  [3, '10:00', '12:00', 'Vy', 1, 'móng giả', 'trang', false],
  [5, '18:00', '20:00', 'Quỳnh', 4, 'nhóm 4 người', 'linh', true],
]

try {
  const users = new Map(
    (
      await sql<{ id: string; email: string }[]>`select id, email from users where email like '%@lindy.test'`
    ).map((u) => [u.email.split('@')[0]!, u.id]),
  )
  const [branch] = await sql<
    { id: string; timezone: string }[]
  >`select id, timezone from branches where code = 'HTK'`
  const today = toLocalDate(new Date())
  let n = 0
  for (const [off, s, e, name, guests, service, by, confirm, phone] of DEMO) {
    const date = addDays(today, off)
    const uid = users.get(by)!
    await sql`
      insert into appointments (branch_id, customer_display_name, phone, start_at, end_at, guest_count, service_summary,
                                status, search_norm, created_by, updated_by, create_request_id, create_request_hash)
      values (${branch!.id}, ${name}, ${phone ?? null}, ${fromLocal(date, s, branch!.timezone)}, ${fromLocal(date, e, branch!.timezone)},
              ${guests}, ${service}, ${confirm ? 'confirmed' : 'pending'},
              ${foldVietnamese([name, phone ?? '', service ?? ''].join(' '))}, ${uid}, ${uid}, ${randomUUID()},
              ${createHash('sha256').update(randomUUID()).digest('hex')})`
    n++
  }
  console.log(`Đã tạo ${n} lịch demo từ hôm nay đến 5 ngày tới.`)
  console.log(`Đã tạo ${await demoOrders(users, branch!.id, today)} đơn demo (Đợt 2).`)
  console.log(`Đã tạo ${await demoDeposits(users, branch!.id, today)} lịch có mùa cọc demo (Đợt 3).`)
  console.log(
    `Đã tạo hồ sơ, chính sách lương, chấm công demo cho ${await demoStaff(users, branch!.id, today)} người (Đợt 4).`,
  )
} finally {
  await sql.end()
  await closeSql()
}

async function authOf(users: Map<string, string>, branchId: string, key: string): Promise<Auth> {
  const [b] = await sql<{ name: string; shortLabel: string }[]>`
    select name, short_label from branches where id = ${branchId}`
  const userId = users.get(key)!
  const perms = await sql<{ code: string }[]>`
    select distinct rp.permission_code as code from user_branch_roles ubr
    join role_permissions rp on rp.role_id = ubr.role_id
    where ubr.user_id = ${userId} and ubr.branch_id = ${branchId} and ubr.revoked_at is null`
  return {
    sessionId: 'demo',
    userId,
    displayName: key,
    mustChangePassword: false,
    branches: [{ id: branchId, name: b!.name, shortLabel: b!.shortLabel, perms: perms.map((p) => p.code) }],
  }
}

// Nhân viên demo (Đợt 4A, chỉ DB dev): hồ sơ (ngày vào làm giả: đầu tháng trước), chính sách lương theo
// data/staff.csv (bảng tháng 10/2026, Q31) từ tháng trước, tháng bắt đầu tính lương = tháng này; hôm qua Chin, Trang
// vào ca, Nhung mới duyệt Chin; Trang đăng ký nghỉ tuần sau (chờ duyệt).
async function demoStaff(users: Map<string, string>, branchId: string, today: string) {
  const linh = await authOf(users, branchId, 'linh')
  const prevMonth = `${addMonths(today.slice(0, 7), -1)}-01`
  const rows = readFileSync(join(ROOT, 'data', 'staff.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
  let n = 0
  for (const line of rows) {
    const [name, , base, rate, leave] = line.split(',')
    const userId = users.get(name!.toLowerCase())
    if (!userId) continue
    await saveProfile(linh, { branchId, userId, startDate: prevMonth, endDate: null, payMethod: 'transfer' })
    await savePolicy(linh, {
      branchId,
      userId,
      effectiveMonth: prevMonth,
      baseSalary: Number(base),
      commissionBps: Math.round(Number(rate) * 10_000),
      leaveDays: Number(leave),
      managerKpi: name === 'Nhung',
      reason: 'Bảng tháng 10/2026 (demo)',
    })
    n++
  }
  await saveSettings(linh, { branchId, startMonth: `${today.slice(0, 7)}-01` })
  const yesterday = addDays(today, -1)
  const [b] = await sql<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
  for (const [key, at] of [
    ['chin', '08:52'],
    ['trang', '09:05'],
  ] as const) {
    await sql`
      insert into attendance_days (branch_id, user_id, work_date, check_in_at, check_out_at)
      values (${branchId}, ${users.get(key)!}, ${yesterday}::date, ${fromLocal(yesterday, at, b!.timezone)},
              ${fromLocal(yesterday, '21:05', b!.timezone)})
      on conflict do nothing`
  }
  await decideDay(await authOf(users, branchId, 'nhung'), {
    branchId,
    userId: users.get('chin')!,
    date: yesterday,
    status: 'worked',
  })
  // Đợt 4B: Chin đề nghị tạm ứng 500.000đ (chờ Linh duyệt)
  await createAdvance(await authOf(users, branchId, 'chin'), {
    branchId,
    createRequestId: randomUUID(),
    amount: 500000,
    reason: 'Tạm ứng (demo)',
  })
  await createLeave(await authOf(users, branchId, 'trang'), {
    branchId,
    createRequestId: randomUUID(),
    fromDate: addDays(today, 7),
    toDate: addDays(today, 7),
    reason: 'Việc gia đình (demo)',
  })
  return n
}

// Cọc demo (Đợt 3, chỉ DB dev): mùa cọc thử 10 ngày từ hôm nay nếu chưa có mùa nào đang bật; 3 lịch: chưa cọc,
// cọc chờ xác nhận, đã nhận cọc. Đi qua service như khi dùng thật.
async function demoDeposits(users: Map<string, string>, branchId: string, today: string) {
  const linh = await authOf(users, branchId, 'linh')
  const trang = await authOf(users, branchId, 'trang')
  const nhung = await authOf(users, branchId, 'nhung')
  const seasons = await listSeasons(linh, branchId)
  if (!seasons.current) {
    await saveSeason(linh, {
      branchId,
      name: 'Tết (demo)',
      startDate: today,
      endDate: addDays(today, 9),
      amountPerGuest: 100000,
      refundNoticeHours: 12,
      forfeitOwnerUserId: users.get('linh')!,
      isActive: true,
    })
  }
  const appt = async (name: string, guests: number, start: string) =>
    (
      await createAppointment(trang, {
        branchId,
        customerDisplayName: name,
        phone: null,
        date: addDays(today, 2),
        startTime: start,
        endTime: `${String(Number(start.slice(0, 2)) + 2).padStart(2, '0')}${start.slice(2)}`,
        guestCount: guests,
        serviceSummary: 'Tết',
        notes: null,
        createRequestId: randomUUID(),
      })
    ).appointment
  await appt('Khách Tết chưa cọc', 1, '09:00')
  const p = await appt('Khách Tết chờ xác nhận', 2, '11:00')
  await recordDeposit(trang, p.id, { idempotencyKey: randomUUID(), amount: 200000, method: 'transfer' })
  const h = await appt('Khách Tết đã cọc', 1, '14:00')
  const d = await recordDeposit(trang, h.id, { idempotencyKey: randomUUID(), amount: 100000, method: 'cash' })
  await confirmDeposit(nhung, d.deposit!.items[0]!.id, d.deposit!.items[0]!.version)
  return 3
}

// Đơn demo đi qua đúng service của app (kiểm quyền, kiểm tổng tiền như khi dùng thật).
async function demoOrders(users: Map<string, string>, branchId: string, today: string) {
  const auth = (key: string) => authOf(users, branchId, key)
  const svc = new Map(
    (await sql<{ id: string; code: string }[]>`select id, code from services`).map((r) => [r.code, r.id]),
  )
  const combo = new Map(
    (await sql<{ id: string; code: string }[]>`select id, code from combos`).map((r) => [r.code, r.id]),
  )
  const staff = (...keys: string[]) => keys.map((k) => ({ userId: users.get(k)! }))
  const line = (code: string, by: string[], extra: Record<string, unknown> = {}): ItemInput =>
    ({ type: 'service', serviceId: svc.get(code)!, quantity: 1, staff: staff(...by), ...extra }) as ItemInput
  const create = async (
    by: string,
    serviceDate: string,
    items: ItemInput[],
    discounts: CreateOrderInput['discounts'] = [],
  ) =>
    (
      await createOrder(await auth(by), {
        createRequestId: randomUUID(),
        customerId: null,
        serviceDate,
        items,
        discounts,
      })
    ).order

  const nhung = await auth('nhung')
  // 1. Trang: sơn gel + mắt mèo 10 ngón, chờ xác nhận
  const a = await create('trang', today, [line('CB02', ['trang']), line('DS01', ['trang'], { quantity: 10 })])
  await markDone(await auth('trang'), a.id, a.version)
  // 2. Combo 139k Chin + Trang chia tay 80k/59k, đã xác nhận, thu đủ tiền mặt
  const c = await create('nhung', today, [
    {
      type: 'combo',
      comboId: combo.get('CBO139')!,
      staff: [
        { userId: users.get('chin')!, amount: 80000 },
        { userId: users.get('trang')!, amount: 59000 },
      ],
    },
  ])
  const cc = await confirmOrder(nhung, c.id, c.version)
  await recordPayment(nhung, cc.id, { idempotencyKey: randomUUID(), amount: 139000, method: 'cash' })
  // 3. Chin: phá móng 15.000đ (thấp hơn khoảng) → chờ Nhung duyệt khi xác nhận
  const p = await create('chin', today, [
    line('CB07', ['chin'], { unitPrice: 15000, belowReason: 'Móng ít' }),
  ])
  await markDone(await auth('chin'), p.id, p.version)
  // 4. Đơn hôm qua giảm 25% → chờ Linh duyệt
  await create(
    'nhung',
    addDays(today, -1),
    [line('MG03', ['nhung'])],
    [{ scope: 'order', kind: 'manual', percent: 25, reason: 'Khách quen lâu năm' }],
  )
  // 5. Linh: nối móng + đắp gel, đã xác nhận, mới thu một phần
  const l = await create('linh', addDays(today, -1), [line('MG03', ['linh']), line('CB03', ['linh'])])
  const lc = await confirmOrder(await auth('linh'), l.id, l.version)
  await recordPayment(await auth('linh'), lc.id, {
    idempotencyKey: randomUUID(),
    amount: 200000,
    method: 'transfer',
  })
  return 5
}
