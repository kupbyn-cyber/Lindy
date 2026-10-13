// Giả lập nâng cấp DB như trên hosting trước khi triển khai (BAI_HOC_TRIEN_KHAI 4.3).
// DB tạm ở trạng thái bản đang chạy (migration đến --from, có tài khoản chủ, lịch hẹn; từ 0009 có đơn và khoản thu),
// rồi chạy bước chuẩn bị DB của bản mới (runRelease, như lúc app khởi động trên hosting) và thử luồng chính bằng service
// của app: đơn từ lịch, thu tiền; bút toán ghi bù; cọc Tết trừ vào bill; mở sổ và số dư.
//   bun scripts/check-upgrade.ts --from=0010
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

  // Bản cũ đã có đơn hàng (từ 0009): một đơn đã xác nhận 150.000đ, thu 100.000đ tiền mặt (nhập nhầm, đã huỷ) và
  // 150.000đ chuyển khoản. Bản mới phải ghi bù đúng bút toán cho các khoản thu này (0011).
  let oldOrder: string | null = null
  if (from >= '0009') {
    oldOrder = await db.begin(async (tx) => {
      const [o] = await tx<{ id: string }[]>`
        insert into orders (branch_id, service_date, gross_amount, discount_amount, net_amount, created_by, updated_by,
                            create_request_id, create_request_hash)
        values (${branch!.id}, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 150000, 0, 150000, ${linh!.id},
                ${linh!.id}, gen_random_uuid(), repeat('0', 64))
        returning id`
      await tx`
        insert into order_items (order_id, rev, position, line_type, name, unit, price_mode, list_min, list_max,
                                 unit_price, quantity, gross_amount, line_discount_amount, order_discount_amount,
                                 discount_amount, net_amount)
        values (${o!.id}, 1, 0, 'custom', 'Dịch vụ cũ', 'lần', 'fixed', 150000, 150000, 150000, 1, 150000, 0, 0, 0,
                150000)`
      await tx`
        insert into order_staff_allocations (order_id, rev, item_position, staff_user_id, allocated_net_amount,
                                             commission_base_amount)
        values (${o!.id}, 1, 0, ${linh!.id}, 150000, 150000)`
      await tx`update orders set status = 'confirmed' where id = ${o!.id}`
      const accs = await tx<{ id: string; type: string }[]>`
        select id, type from money_accounts where branch_id = ${branch!.id}`
      const acc = (t: string) => accs.find((x) => x.type === t)!.id
      const [p1] = await tx<{ id: string }[]>`
        insert into payments (order_id, branch_id, amount, method, money_account_id, recorded_by, idempotency_key)
        values (${o!.id}, ${branch!.id}, 100000, 'cash', ${acc('cash')}, ${linh!.id}, gen_random_uuid())
        returning id`
      await tx`update payments set void_reason = 'Nhập nhầm', voided_at = now() where id = ${p1!.id}`
      await tx`
        insert into payments (order_id, branch_id, amount, method, money_account_id, recorded_by, idempotency_key)
        values (${o!.id}, ${branch!.id}, 150000, 'transfer', ${acc('bank')}, ${linh!.id}, gen_random_uuid())`
      return o!.id
    })
    log('Có 1 đơn đã xác nhận, 2 khoản thu (1 khoản đã huỷ) của bản cũ.')
  }

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
  const { getAppointment, createAppointment } = await import('../src/server/appointments/service')
  const { overview } = await import('../src/server/reports/service')
  const { openBook, getBook } = await import('../src/server/money/service')
  const { saveSeason, recordDeposit, confirmDeposit } = await import('../src/server/deposits/service')
  const { markDone } = await import('../src/server/orders/service')
  const { addDays, toLocalDate } = await import('../src/lib/time')
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
    // Bút toán ghi bù cho khoản thu của bản cũ: tiền mặt +100.000đ rồi −100.000đ (huỷ), chuyển khoản +150.000đ
    if (oldOrder) {
      const rows = await db<{ type: string; entryType: string; amount: string }[]>`
        select m.type, e.entry_type, e.amount from money_ledger_entries e
        join money_accounts m on m.id = e.money_account_id
        join payments p on e.source_type = 'payment' and p.id = e.source_id
        where p.order_id = ${oldOrder} order by e.entry_type, m.type`
      const got = rows.map((r) => `${r.type}:${r.entryType}:${r.amount}`).join(' ')
      log(`Bút toán ghi bù: ${got}`)
      if (got !== 'bank:payment:150000 cash:payment:100000 cash:payment_void:-100000')
        throw new Error('Ghi bù bút toán khoản thu cũ sai.')
    }

    const today = toLocalDate(new Date())
    const net0 = (await overview(auth, { period: 'day' })).revenue?.net ?? 0
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
    if (a.status !== 'completed' || (ov.revenue?.net ?? 0) - net0 !== 70000)
      throw new Error('Luồng chính sai kết quả.')

    // Cọc Tết (0012): mùa cọc → lịch 2 khách → ghi, xác nhận cọc 200.000đ → đơn 500.000đ → Làm xong trừ cọc
    await saveSeason(auth, {
      name: 'Tết thử nâng cấp',
      startDate: addDays(today, -1),
      endDate: addDays(today, 5),
      amountPerGuest: 100000,
      refundNoticeHours: 12,
      forfeitOwnerUserId: linh!.id,
      isActive: true,
    })
    const { appointment } = await createAppointment(auth, {
      customerDisplayName: 'Khách Tết',
      phone: null,
      date: today,
      startTime: '15:00',
      endTime: '16:00',
      guestCount: 2,
      serviceSummary: null,
      notes: null,
      createRequestId: crypto.randomUUID(),
    })
    const withDep = await recordDeposit(auth, appointment.id, {
      idempotencyKey: crypto.randomUUID(),
      amount: 200000,
      method: 'transfer',
    })
    const dep = withDep.deposit!.items[0]!
    await confirmDeposit(auth, dep.id, dep.version)
    const { order: o2 } = await createOrderFromAppointment(auth, appointment.id, {
      createRequestId: crypto.randomUUID(),
    })
    const s2 = await updateOrder(auth, o2.id, {
      version: o2.version,
      customerId: null,
      serviceDate: o2.serviceDate,
      items: [{ type: 'custom', name: 'Dịch vụ Tết', amount: 500000, staff: [{ userId: linh!.id }] }],
      discounts: [],
    })
    const d2 = await markDone(auth, s2.id, s2.version)
    log(`Cọc 200.000đ trừ vào đơn ${d2.codeLabel} 500.000đ: đã thu ${d2.paidAmount}đ, còn ${d2.dueAmount}đ`)
    if (d2.paidAmount !== 200000 || d2.dueAmount !== 300000) throw new Error('Trừ cọc vào bill sai.')

    // Mở sổ ngày 1 tháng này: số dư = mở sổ + tiền vào từ ngày 1
    const book = await openBook(auth, {
      openingDate: `${today.slice(0, 8)}01`,
      amounts: (await getBook(auth)).accounts.map((x) => ({
        accountId: x.id,
        amount: x.type === 'cash' ? 1000000 : 2000000,
      })),
    })
    const bal = Object.fromEntries(book.accounts.map((x) => [x.type, x.balance]))
    log(`Mở sổ: Tiền mặt ${bal.cash}đ, Tài khoản ${bal.bank}đ`)
    const bankExpected = 2000000 + 200000 + (oldOrder ? 150000 : 0)
    if (bal.cash !== 1070000 || bal.bank !== bankExpected) throw new Error('Số dư sau mở sổ sai.')

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
