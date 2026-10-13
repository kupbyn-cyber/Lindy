// Dữ liệu demo cho DB dev (bước 1.19, 2.16): lịch mẫu tuần này, SĐT giả 0900000xxx; 5 đơn mẫu hôm nay, hôm qua.
// Chỉ chạy trên DB localhost _dev.
//   bun scripts/demo-data.ts
import { createHash, randomUUID } from 'node:crypto'
import postgres from 'postgres'
import type { ItemInput } from '../src/lib/order-math'
import { foldVietnamese } from '../src/lib/text'
import { addDays, fromLocal, toLocalDate } from '../src/lib/time'
import type { Auth } from '../src/server/auth/context'
import { closeSql } from '../src/server/db/client'
import { recordPayment } from '../src/server/orders/payments'
import type { CreateOrderInput } from '../src/server/orders/schema'
import { confirmOrder, createOrder, markDone } from '../src/server/orders/service'
import { assertDisposableDb } from './lib/db-guard'
import { loadEnv, requireEnv } from './lib/env'

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
} finally {
  await sql.end()
  await closeSql()
}

// Đơn demo đi qua đúng service của app (kiểm quyền, kiểm tổng tiền như khi dùng thật).
async function demoOrders(users: Map<string, string>, branchId: string, today: string) {
  const [b] = await sql<{ name: string; shortLabel: string }[]>`
    select name, short_label from branches where id = ${branchId}`
  const auth = async (key: string): Promise<Auth> => {
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
