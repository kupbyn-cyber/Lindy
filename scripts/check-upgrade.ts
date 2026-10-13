// Giả lập nâng cấp DB như trên hosting trước khi triển khai (BAI_HOC_TRIEN_KHAI 4.3).
// DB tạm ở trạng thái bản đang chạy (migration đến --from, có tài khoản chủ và lịch hẹn), rồi chạy bước chuẩn bị DB
// của bản mới (runRelease, như lúc app khởi động trên hosting) và thử luồng chính bằng service của app.
//   bun scripts/check-upgrade.ts --from=0005
// Chỉ chạy với PostgreSQL local; DB tạm bị xoá khi xong.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { loadEnv, ROOT, requireEnv } from './lib/env'

loadEnv()
const ADMIN = requireEnv('PG_ADMIN_URL')
const appPassword = requireEnv('LINDY_APP_PASSWORD')
const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? '0005'
if (!/^\d{4}$/.test(from)) throw new Error('--from phải là số migration 4 chữ số, ví dụ 0005')
if (!['localhost', '127.0.0.1'].includes(new URL(ADMIN).hostname))
  throw new Error('Chỉ chạy với PostgreSQL local.')

const DB = 'lindy_upgrade_check'
const urlFor = (db: string) => {
  const u = new URL(ADMIN)
  u.pathname = `/${db}`
  return u.toString()
}
const adminUrl = urlFor(DB)
const log = (m: string) => console.log(`  ${m}`)
const root = postgres(ADMIN, { max: 1, onnotice: () => {} })
const oldDir = mkdtempSync(join(tmpdir(), 'lindy-old-'))
let ok = false

try {
  await root.unsafe(`drop database if exists ${DB} with (force)`)
  await root.unsafe(`create database ${DB}`)

  // 1. Bản đang chạy: chỉ các migration đến --from
  mkdirSync(join(oldDir, 'db', 'migrations'), { recursive: true })
  for (const f of readdirSync(join(ROOT, 'db', 'migrations'))) {
    if (/^\d{4}_.+\.sql$/.test(f) && f.slice(0, 4) <= from)
      cpSync(join(ROOT, 'db', 'migrations', f), join(oldDir, 'db', 'migrations', f))
  }
  const { runRelease, appUrlFrom } = await import('../src/server/ops/release')
  console.log(`1. Bản đang chạy (migration đến ${from}):`)
  process.chdir(oldDir)
  await runRelease({
    adminUrl,
    appPassword,
    initialOwner: { name: 'Linh', phone: '0911000111', password: 'Kiem-tra-nang-cap-2026' },
    log,
  })

  // 2. Dữ liệu đang dùng: lịch hẹn của Linh (chủ DB ghi thẳng, như dữ liệu có sẵn)
  const db = postgres(adminUrl, { max: 1, onnotice: () => {}, transform: postgres.camel })
  const [linh] = await db<{ id: string }[]>`select id from users limit 1`
  const [branch] = await db<{ id: string }[]>`select id from branches where code = 'HTK'`
  const appts: string[] = []
  for (const [h, name, phone] of [
    [9, 'Khách cũ A', '0900111222'],
    [11, 'Khách cũ B', null],
  ] as const) {
    const [a] = await db<{ id: string }[]>`
      insert into appointments (branch_id, customer_display_name, phone, start_at, end_at, guest_count, status,
                                created_by, updated_by, create_request_id, create_request_hash)
      values (${branch!.id}, ${name}, ${phone}, date_trunc('day', now()) + make_interval(hours => ${h} - 7),
              date_trunc('day', now()) + make_interval(hours => ${h} - 5), 1, 'confirmed', ${linh!.id}, ${linh!.id},
              gen_random_uuid(), repeat('0', 64))
      returning id`
    appts.push(a!.id)
  }
  log(`Có ${appts.length} lịch hẹn của bản cũ.`)

  // 3. Bản mới: bước chuẩn bị DB chạy lại với toàn bộ migration (như sau khi bấm Triển khai lại)
  console.log('2. Bản mới (toàn bộ migration):')
  process.chdir(ROOT)
  await runRelease({ adminUrl, appPassword, log })

  // 4. Thử luồng chính bằng service của app, kết nối bằng lindy_app như trên hosting
  console.log('3. Thử luồng chính:')
  process.env.DATABASE_URL = appUrlFrom(adminUrl, appPassword)
  const { closeSql } = await import('../src/server/db/client')
  const { createOrderFromAppointment, updateOrder, confirmOrder } = await import(
    '../src/server/orders/service'
  )
  const { recordPayment } = await import('../src/server/orders/payments')
  const { getAppointment } = await import('../src/server/appointments/service')
  const { overview } = await import('../src/server/reports/service')
  try {
    const perms = await db<{ code: string }[]>`
      select distinct rp.permission_code as code from user_branch_roles ubr
      join role_permissions rp on rp.role_id = ubr.role_id where ubr.user_id = ${linh!.id}`
    const auth = {
      sessionId: 'check',
      userId: linh!.id,
      displayName: 'Linh',
      mustChangePassword: false,
      branches: [{ id: branch!.id, name: 'HTK', shortLabel: 'HTK', perms: perms.map((p) => p.code) }],
    }
    const [svc] = await db<{ id: string }[]>`select id from services where code = 'CB02'`
    const { order } = await createOrderFromAppointment(auth, appts[0]!, {
      createRequestId: crypto.randomUUID(),
    })
    const saved = await updateOrder(auth, order.id, {
      version: order.version,
      customerId: order.customer?.id ?? null,
      serviceDate: order.serviceDate,
      items: [{ type: 'service', serviceId: svc!.id, quantity: 1, staff: [{ userId: linh!.id }] }],
      discounts: [],
    })
    const c = await confirmOrder(auth, saved.id, saved.version)
    await recordPayment(auth, c.id, {
      idempotencyKey: crypto.randomUUID(),
      amount: c.netAmount,
      method: 'cash',
    })
    const a = await getAppointment(auth, appts[0]!)
    const ov = await overview(auth, { period: 'day' })
    log(
      `Đơn ${c.codeLabel} ${c.netAmount}đ đã xác nhận, đã thu; lịch: ${a.status}; Tổng quan: ${ov.revenue?.net}đ`,
    )
    if (a.status !== 'completed' || ov.revenue?.net !== 70000) throw new Error('Luồng chính sai kết quả.')

    const [n] = await db<Record<string, number>[]>`
      select (select count(*)::int from schema_migrations) as migrations,
             (select count(*)::int from services) as services, (select count(*)::int from combos) as combos,
             (select count(*)::int from money_accounts) as accounts,
             (select count(*)::int from customers) as customers`
    log(
      `Migration ${n!.migrations}, dịch vụ ${n!.services}, combo ${n!.combos}, tài khoản tiền ${n!.accounts}, khách ${n!.customers}`,
    )
    const [fp] = await db<{ ok: boolean }[]>`
      select has_function_privilege('app_user', 'app._revoke_user_access(uuid, text)', 'execute') as ok`
    if (fp!.ok) throw new Error('app_user vẫn gọi được hàm nội bộ.')
    log('app_user không gọi được hàm nội bộ.')
    ok = true
  } finally {
    await closeSql()
    await db.end()
  }
} finally {
  process.chdir(ROOT)
  rmSync(oldDir, { recursive: true, force: true })
  await root.unsafe(`drop database if exists ${DB} with (force)`)
  await root.end()
}
console.log(ok ? 'NÂNG CẤP ĐẠT.' : 'NÂNG CẤP KHÔNG ĐẠT.')
if (!ok) process.exit(1)
