// Giả lập nâng cấp DB như trên hosting trước khi triển khai (BAI_HOC_TRIEN_KHAI 4.3).
// DB tạm ở trạng thái bản đang chạy (migration đến --from, có tài khoản chủ, lịch hẹn; từ 0009 có đơn và khoản thu),
// rồi chạy bước chuẩn bị DB của bản mới (runRelease, như lúc app khởi động trên hosting) và thử luồng chính bằng service
// của app: đơn từ lịch, thu tiền; bút toán ghi bù; cọc Tết trừ vào bill; mở sổ và số dư; thu chi; tip, hoàn tiền,
// chứng từ; nhân viên, chấm công; lương, tạm ứng; báo cáo, xuất dữ liệu, sao lưu; nhập dữ liệu cũ.
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

    // Cọc Tết (0012): mùa cọc → lịch 1 khách → ghi, xác nhận cọc 200.000đ → đơn 500.000đ → Làm xong trừ cọc.
    // Lịch nhiều khách chia đều cọc cho từng đơn (S07): thử ở tests/acceptance/coc-tet.test.ts
    await saveSeason(auth, {
      name: 'Tết thử nâng cấp',
      startDate: addDays(today, -1),
      endDate: addDays(today, 5),
      amountPerGuest: 200000,
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
      guestCount: 1,
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

    // Thu chi (0013): Linh lập phiếu chi 50.000đ (duyệt luôn) → Đã chi tiền mặt; chuyển 20.000đ tiền mặt sang ngân hàng
    const { createExpense, actOnExpense } = await import('../src/server/expenses/service')
    const { createTransfer } = await import('../src/server/money/service')
    const ex = await createExpense(auth, {
      createRequestId: crypto.randomUUID(),
      categoryCode: 'supplies',
      amount: 50000,
      note: 'Thử nâng cấp',
    })
    await actOnExpense(auth, ex.id, 'pay', { version: ex.version, method: 'cash' })
    const cash = book.accounts.find((x) => x.type === 'cash')!.id
    const bankId = book.accounts.find((x) => x.type === 'bank')!.id
    const after = await createTransfer(auth, {
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: cash,
      toAccountId: bankId,
      amount: 20000,
    })
    const bal2 = Object.fromEntries(after.accounts.map((x) => [x.type, x.balance]))
    log(`Thu chi: chi 50.000đ, chuyển 20.000đ → Tiền mặt ${bal2.cash}đ, Tài khoản ${bal2.bank}đ`)
    if (bal2.cash !== 1000000 || bal2.bank !== bankExpected + 20000) throw new Error('Thu chi sai số dư.')

    // Hoàn tiền, chứng từ (0014, 0015): đơn cọc ở trên (Làm xong đã xác nhận luôn, S41), thu 300.000đ CK,
    // hoàn 50.000đ TM (app bỏ tip từ S27)
    const { refundOrder } = await import('../src/server/orders/refunds')
    const { addAttachment } = await import('../src/server/attachments/service')
    const c2 = d2
    await recordPayment(auth, c2.id, {
      idempotencyKey: crypto.randomUUID(),
      amount: 300000,
      method: 'transfer',
    })
    const rf = await refundOrder(auth, c2.id, {
      idempotencyKey: crypto.randomUUID(),
      amount: 50000,
      method: 'cash',
      reason: 'Thử nâng cấp',
    })
    const att = await addAttachment(
      auth,
      'refund',
      rf.refunds[0]!.id,
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
    )
    const bal3 = Object.fromEntries((await getBook(auth)).accounts.map((x) => [x.type, x.balance]))
    log(
      `Hoàn: hoàn ${rf.refundedAmount}đ, ${att.items.length} ảnh → Tiền mặt ${bal3.cash}đ, Tài khoản ${bal3.bank}đ`,
    )
    if (bal3.cash !== 950000 || bal3.bank !== bankExpected + 20000 + 300000 || att.items.length !== 1)
      throw new Error('Hoàn tiền sai.')

    // Nhân viên, chấm công (0016): cơ sở cũ có sẵn cài đặt lương, mốc KPI; hồ sơ + chính sách Linh; Vào ca, duyệt công;
    // ngày đóng cửa ngày mai; đơn nghỉ ngày kia
    const { saveProfile, savePolicy, listPeople } = await import('../src/server/staff/service')
    const { checkIn, approveCheckedIn, myMonth } = await import('../src/server/attendance/service')
    const { addClosedDays } = await import('../src/server/attendance/closed-days')
    const { createLeave } = await import('../src/server/attendance/leave')
    const [ps] = await db<{ settings: number; kpi: number }[]>`
      select (select count(*)::int from payroll_settings where branch_id = ${branch!.id}) as settings,
             (select count(*)::int from kpi_policy_versions where branch_id = ${branch!.id}) as kpi`
    if (ps!.settings !== 1 || ps!.kpi !== 1) throw new Error('Thiếu cài đặt lương hoặc mốc KPI của cơ sở cũ.')
    const month = `${today.slice(0, 8)}01`
    await saveProfile(auth, {
      userId: linh!.id,
      startDate: month,
      endDate: null,
      payMethod: 'transfer',
    })
    await savePolicy(auth, {
      userId: linh!.id,
      effectiveMonth: month,
      baseSalary: 3500000,
      commissionBps: 2500,
      leaveDays: 3,
      managerKpi: false,
    })
    await checkIn(auth)
    const ap = await approveCheckedIn(auth, { date: today })
    await addClosedDays(auth, {
      fromDate: addDays(today, 1),
      toDate: addDays(today, 1),
      reason: 'Thử nâng cấp',
    })
    const lv = await createLeave(auth, {
      createRequestId: crypto.randomUUID(),
      fromDate: addDays(today, 2),
      toDate: addDays(today, 2),
      reason: 'Thử nâng cấp',
    })
    const mm = await myMonth(auth, { month: today.slice(0, 7) })
    const st = (d: string) => mm.days.find((x) => x.date === d)?.status ?? '(tháng sau)'
    const people = await listPeople(auth)
    log(
      `Chấm công: duyệt ${ap.approved} người; hôm nay ${st(today)}, mai ${st(addDays(today, 1))}, ngày kia ${st(addDays(today, 2))}; đơn nghỉ ${lv.status}; lương cứng ${people.people[0]?.current?.baseSalary}đ`,
    )
    if (
      ap.approved !== 1 ||
      st(today) !== 'worked' ||
      lv.status !== 'approved' ||
      people.people[0]?.current?.baseSalary !== 3500000
    )
      throw new Error('Chấm công sai.')

    // Vào ca có ảnh (0034): ngày công cũ không mang nhãn tự duyệt; đã vào ca hôm nay thì không gửi thêm ảnh được;
    // việc nền xoá ảnh quá 35 ngày chạy được bằng quyền app_worker
    const { checkInWithPhoto, purgeOldCheckInPhotos } = await import('../src/server/attendance/photo')
    const [aa] = await db<{ n: number }[]>`select count(*)::int as n from attendance_days where auto_approved`
    const photoErr = await checkInWithPhoto(
      auth,
      undefined,
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
    )
      .then(() => null)
      .catch((e: Error) => e.message)
    const purged = await purgeOldCheckInPhotos({ force: true })
    log(`Vào ca có ảnh: ${aa!.n} ngày tự duyệt cũ; gửi ảnh lần hai → "${photoErr}"; xoá ảnh cũ ${purged}`)
    if (aa!.n !== 0 || !photoErr?.includes('đã vào ca') || purged !== 0) throw new Error('Vào ca có ảnh sai.')

    // Lương (0017): sổ doanh thu tính lương ghi bù đơn cũ đã xác nhận; lương tạm tính; tạm ứng Linh tự lập → chi tiền mặt
    const { payslip } = await import('../src/server/payroll/service')
    const { createAdvance, actOnAdvance } = await import('../src/server/payroll/advances')
    const { saveSettings } = await import('../src/server/staff/service')
    if (oldOrder) {
      const [pe] = await db<{ shop: string }[]>`
        select coalesce(sum(shop_revenue), 0) as shop from payroll_revenue_entries where order_id = ${oldOrder}`
      log(`Sổ doanh thu tính lương ghi bù đơn cũ: ${pe!.shop}đ`)
      if (Number(pe!.shop) !== 150000) throw new Error('Ghi bù sổ doanh thu tính lương sai.')
    }
    await saveSettings(auth, { startMonth: month })
    const adv = await createAdvance(auth, {
      createRequestId: crypto.randomUUID(),
      amount: 300000,
      reason: 'Thử nâng cấp',
    })
    await actOnAdvance(auth, adv.id, 'pay', { version: adv.version, method: 'cash' })
    const sl = await payslip(auth, { month: today.slice(0, 7), userId: linh!.id })
    log(
      `Lương tạm tính Linh: phải trả ${sl.line.grossPay}đ (hoa hồng ${sl.line.commission}đ), tạm ứng ${sl.line.advances}đ`,
    )
    if (adv.status !== 'approved' || sl.line.advances !== 300000 || sl.line.commission <= 0)
      throw new Error('Lương, tạm ứng sai.')

    // Hàng bán, người tạo sửa đơn trong ngày (0035): món Kìm có sau nâng cấp; đồng bộ lại sổ doanh thu tính lương của
    // mọi đơn đã xác nhận không sinh dòng mới (hoa hồng, KPI cũ không đổi); đơn có kìm: kìm không vào hoa hồng, KPI
    const { createOrder } = await import('../src/server/orders/service')
    const [kimRow] = await db<{ id: string; n: number }[]>`
      select min(id::text) as id, count(*)::int as n from services where is_retail and name = 'Kìm'`
    const [pr0] = await db<{ n: number }[]>`select count(*)::int as n from payroll_revenue_entries`
    await db`select app._payroll_sync_order(id) from orders where status = 'confirmed'`
    const [pr1] = await db<{ n: number }[]>`select count(*)::int as n from payroll_revenue_entries`
    const ko = await createOrder(auth, {
      createRequestId: crypto.randomUUID(),
      customerId: null,
      serviceDate: today,
      items: [
        { type: 'service', serviceId: svc!.id, quantity: 1, staff: [{ userId: linh!.id }] },
        { type: 'service', serviceId: kimRow!.id, quantity: 1, staff: [] },
      ],
      discounts: [],
    })
    const kd = await markDone(auth, ko.order.id, ko.order.version)
    const [ke] = await db<{ shop: string; comm: string }[]>`
      select coalesce(sum(shop_revenue), 0) as shop, coalesce(sum(commission_base), 0) as comm
      from payroll_revenue_entries where order_id = ${kd.id}`
    log(
      `Hàng bán: ${kimRow!.n} món Kìm; đồng bộ lại sổ lương ${pr0!.n} → ${pr1!.n} dòng; đơn ${kd.codeLabel} ${kd.netAmount}đ (${kd.status}): doanh thu tính KPI ${ke!.shop}đ, cơ sở hoa hồng ${ke!.comm}đ`,
    )
    if (
      kimRow!.n !== 1 ||
      pr0!.n !== pr1!.n ||
      kd.status !== 'confirmed' ||
      kd.netAmount !== 180000 ||
      Number(ke!.shop) !== 70000 ||
      Number(ke!.comm) !== 70000
    )
      throw new Error('Hàng bán, sổ doanh thu tính lương sai.')

    // Báo cáo, xuất dữ liệu, sao lưu (0018): lợi nhuận (Linh), file đơn hàng CSV, bản sao lưu không có mật khẩu
    const { monthReport } = await import('../src/server/reports/service')
    const { exportFile } = await import('../src/server/export/service')
    const { backupDump } = await import('../src/server/export/backup')
    const rep = await monthReport(auth, { month: today.slice(0, 7) })
    const csv = await exportFile(auth, { kind: 'don-hang', month: today.slice(0, 7), format: 'csv' })
    const bk = await backupDump(auth)
    log(
      `Báo cáo: lợi nhuận ước tính ${rep.profit?.profit}đ; file ${csv.filename}; sao lưu ${Math.round(bk.json.length / 1024)} KB`,
    )
    if (!rep.profit || !(csv.body as string).includes('#0002') || bk.json.includes('password_hash'))
      throw new Error('Báo cáo, xuất dữ liệu, sao lưu sai.')

    // Nhập dữ liệu cũ (0019): một tab nhỏ → bảng riêng, không thêm bút toán
    const { importLegacy } = await import('../src/server/legacy/service')
    const [lb] = await db<{ n: number }[]>`select count(*)::int as n from money_ledger_entries`
    const lg = await importLegacy(auth, {
      fileName: 'thang-9-2025.csv',
      label: 'Thử nâng cấp',
      text: 'Ngày,Khách,Linh,Tổng\n05/09/2025,Khách cũ,100000,100000\n06/09/2025,Khách cũ 2,50000,50000',
      mapping: {
        headerRow: 1,
        month: '2025-09',
        date: 0,
        customer: 1,
        phone: null,
        note: null,
        total: 3,
        staff: [{ col: 2, userId: linh!.id }],
      },
    })
    const [la] = await db<{ n: number }[]>`select count(*)::int as n from money_ledger_entries`
    log(
      `Dữ liệu cũ: nhập ${lg.inserted} khoản ${lg.total}đ; bút toán sổ tiền không đổi (${lb!.n} → ${la!.n})`,
    )
    if (lg.inserted !== 2 || lb!.n !== la!.n) throw new Error('Nhập dữ liệu cũ sai.')

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
