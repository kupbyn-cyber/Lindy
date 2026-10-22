// Nghiệm thu báo cáo, xuất dữ liệu (Đợt 5A, bước 5.2–5.4): PRD §18 test 27 (phần lợi nhuận), 19 (phần xuất); K23, K24,
// K25; test bảo mật S63, S64, S67, S68 (kế hoạch Đợt 5 mục 10.2). Chạy trên cơ sở thử riêng "CS7".
// Tháng khoá thử M = hai tháng trước (đã qua ngày nháp); tháng hiện tại để thử lợi nhuận tạm tính.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMonths, monthRange, toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { actOnExpense, createExpense } from '../../src/server/expenses/service'
import { safeText, toCsv } from '../../src/server/export/csv'
import { exportFile } from '../../src/server/export/service'
import { crc32, toXlsx } from '../../src/server/export/xlsx'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { createVoucher, openBook } from '../../src/server/money/service'
import { recordPayment } from '../../src/server/orders/payments'
import { confirmOrder, createOrder, getOrder, markDone } from '../../src/server/orders/service'
import { actOnAdvance, createAdvance } from '../../src/server/payroll/advances'
import { lockMonth, payslip } from '../../src/server/payroll/service'
import { monthReport, overview } from '../../src/server/reports/service'
import { savePolicy, saveProfile } from '../../src/server/staff/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed, toAwaiting } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
const thisMonth = today.slice(0, 7)
const M = addMonths(thisMonth, -2)
let cs7 = ''
const acc: Record<'cash' | 'bank', string> = { cash: '', bank: '' }

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

async function order(serviceDate: string, amount: number, confirm = true, customerId: string | null = null) {
  const { order } = await createOrder(auth('nhung'), {
    branchId: cs7,
    createRequestId: rid(),
    customerId,
    serviceDate,
    items: [{ type: 'custom', name: 'Dịch vụ', amount, staff: [{ userId: uid('trang') }] }] as never,
    discounts: [],
  })
  // S41: Làm xong là xác nhận luôn; confirm = false → đơn Chờ xác nhận (như đơn có từ trước S41)
  if (confirm) return markDone(auth('nhung'), order.id, order.version)
  await toAwaiting(owner, order.id)
  return getOrder(auth('nhung'), order.id)
}

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS7', 'Zz cơ sở thử báo cáo', 'CS7') returning id`
  cs7 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs7})`
  await owner`insert into payroll_settings (branch_id, start_month) values (${cs7}, ${`${M}-01`}::date)`
  await owner`
    insert into money_accounts (branch_id, code, name, type)
    values (${cs7}, 'cash', 'Tiền mặt CS7', 'cash'), (${cs7}, 'bank', 'Tài khoản CS7', 'bank')`
  for (const r of await owner<{ id: string; type: 'cash' | 'bank' }[]>`
    select id, type from money_accounts where branch_id = ${cs7}`)
    acc[r.type] = r.id
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs7}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'chin', 'trang'] as const) S[k] = await sessionOf(k)
  // Một người có lương: Trang 3.500.000đ từ tháng M
  await saveProfile(auth('linh'), {
    branchId: cs7,
    userId: uid('trang'),
    startDate: `${M}-01`,
    endDate: null,
    payMethod: 'cash',
  })
  await savePolicy(auth('linh'), {
    branchId: cs7,
    userId: uid('trang'),
    effectiveMonth: `${M}-01`,
    baseSalary: 3_500_000,
    commissionBps: 2500,
    leaveDays: 3,
    managerKpi: false,
  })
  await openBook(auth('linh'), {
    branchId: cs7,
    openingDate: `${M}-01`,
    amounts: [
      { accountId: acc.cash, amount: 10_000_000 },
      { accountId: acc.bank, amount: 0 },
    ],
  })
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs7}`
  await owner.end()
  await closeSql()
})

describe('5.2 — lợi nhuận ước tính (K23, PRD 27)', () => {
  it('Tháng này: doanh thu − chi vận hành − chi nhân sự ngoài bảng lương − lương; vốn, tạm ứng hiện riêng', async () => {
    const o = await order(today, 1_000_000)
    await recordPayment(auth('nhung'), o.id, { idempotencyKey: rid(), amount: 1_000_000, method: 'cash' })
    const pay = async (categoryCode: string, amount: number) => {
      const e = await createExpense(auth('linh'), {
        branchId: cs7,
        createRequestId: rid(),
        categoryCode,
        amount,
        note: 'Thử',
      })
      await actOnExpense(auth('linh'), e.id, 'pay', { version: e.version, method: 'cash' })
    }
    await pay('supplies', 100_000)
    await pay('bonus', 50_000)
    await createVoucher(auth('linh'), {
      branchId: cs7,
      idempotencyKey: rid(),
      kind: 'capital_in',
      accountId: acc.bank,
      amount: 1_000_000,
      reason: 'Góp vốn',
    })
    const a = await createAdvance(auth('trang'), {
      branchId: cs7,
      createRequestId: rid(),
      amount: 200_000,
      reason: 'Ứng',
    })
    const ok = await actOnAdvance(auth('linh'), a.id, 'approve', { version: a.version })
    await actOnAdvance(auth('linh'), a.id, 'pay', { version: ok.version, method: 'cash' })

    const r = await monthReport(auth('linh'), { branchId: cs7, month: thisMonth })
    const p = r.profit!
    const line = (await payslip(auth('linh'), { branchId: cs7, month: thisMonth, userId: uid('trang') })).line
    const salary =
      line.baseSalary +
      line.attendanceAdjustment +
      line.commission +
      line.kpiBonus +
      line.bonus -
      line.deduction
    expect(p).toMatchObject({ revenue: 1_000_000, operatingTotal: 100_000, staffTotal: 50_000 })
    expect(p.payroll).toMatchObject({ fromApp: true, amount: salary })
    expect(p.profit).toBe(1_000_000 - 100_000 - 50_000 - salary)
    expect(p.excluded).toEqual(
      expect.arrayContaining([
        { label: 'Góp vốn', amount: 1_000_000 },
        { label: 'Tạm ứng đã chi (nhân viên nợ quán)', amount: -200_000 },
      ]),
    )
    const ov = await overview(auth('linh'), { branchId: cs7, period: 'month' })
    expect(ov.profit).toBe(p.profit)
  })

  it('PRD 27: Nhung xem số dư nhưng không xem lợi nhuận; thợ cũng không', async () => {
    const r = await monthReport(auth('nhung'), { branchId: cs7, month: thisMonth })
    expect(r.profit).toBeNull()
    expect(r.cashflow).not.toBeNull()
    expect((await overview(auth('nhung'), { branchId: cs7, period: 'month' })).profit).toBeNull()
    expect((await overview(auth('trang'), { branchId: cs7, period: 'month' })).profit).toBeNull()
  })
})

describe('5.3 — báo cáo đã chốt (K24)', () => {
  it('Khoá lương tháng M → chụp số; đơn tháng M xác nhận muộn hiện ở "phát sinh sau khi chốt"', async () => {
    const { first, last } = monthRange(M)
    await owner`
      insert into attendance_days (branch_id, user_id, work_date, status, decided_by, decided_at)
      select ${cs7}, ${uid('trang')}, g::date, 'worked', ${uid('linh')}, now()
      from generate_series(${first}::date, ${last}::date, interval '1 day') g`
    await order(`${M}-10`, 400_000)
    const late = await order(`${M}-20`, 300_000, false)
    await lockMonth(auth('linh'), { branchId: cs7, month: M })
    const r1 = await monthReport(auth('linh'), { branchId: cs7, month: M })
    expect(r1.closed?.figures).toMatchObject({ orders: 1, net: 400_000 })
    expect(r1.closed?.after).toMatchObject({ orders: 0, net: 0 })
    await confirmOrder(auth('nhung'), late.id, late.version)
    const r2 = await monthReport(auth('linh'), { branchId: cs7, month: M })
    expect(r2.closed?.figures.net).toBe(400_000)
    expect(r2.closed?.after).toMatchObject({ orders: 1, net: 300_000 })
    expect(r2.closed?.after.byStaff).toEqual([{ userId: uid('trang'), name: 'Trang', amount: 300_000 }])
    // Lợi nhuận tháng đã chốt tính trên số đã chốt
    expect(r2.profit?.revenue).toBe(400_000)
    // S67: bản chụp không sửa, không xoá
    await expectPgError(
      owner`update month_report_snapshots set figures = '{}' where branch_id = ${cs7}`,
      '42501',
    )
    await expectPgError(owner`delete from month_report_snapshots where branch_id = ${cs7}`, '42501')
  })
})

describe('5.4 — xuất file (K25, PRD 19)', () => {
  it('S63, S64: chỉ Linh tải; Nhung, Chin, thợ → 403', async () => {
    for (const k of ['nhung', 'chin', 'trang'] as const) {
      expect(
        (await err(exportFile(auth(k), { branchId: cs7, kind: 'don-hang', month: thisMonth }))).status,
      ).toBe(403)
    }
    expect(
      (await err(exportFile(auth('nhung'), { branchId: cs7, kind: 'bang-luong', month: M, format: 'csv' })))
        .status,
    ).toBe(403)
  })

  it('Đơn hàng CSV: có BOM, mỗi đơn một dòng, tiền là số; S68: tên khách dạng công thức thành chữ; có audit', async () => {
    const [c] = await owner<{ id: string }[]>`
      insert into customers (organization_id, name, created_by, updated_by)
      select organization_id, '=HYPERLINK("http://x","bấm")', ${uid('linh')}, ${uid('linh')} from branches
      where id = ${cs7} returning id`
    await order(today, 250_000, true, c!.id)
    const f = await exportFile(auth('linh'), {
      branchId: cs7,
      kind: 'don-hang',
      month: thisMonth,
      format: 'csv',
    })
    expect(f.filename).toBe(`lindy-don-hang-${thisMonth}.csv`)
    const text = f.body as string
    expect(text.startsWith('﻿Mã đơn,Ngày làm,Trạng thái,Khách')).toBe(true)
    expect(text).toContain(`"'=HYPERLINK(""http://x"",""bấm"")"`)
    expect(text).toMatch(/,250000,0,250000,0,0,250000,/)
    const [a] = await owner<{ n: number }[]>`
      select count(*)::int as n from audit_logs where action = 'export.don-hang' and actor_user_id = ${uid('linh')}`
    expect(a!.n).toBeGreaterThan(0)
  })

  it('Báo cáo tháng XLSX nhiều trang (có lợi nhuận cho Linh); bảng lương, sổ tiền, thu chi, khách hàng tải được', async () => {
    const f = await exportFile(auth('linh'), { branchId: cs7, kind: 'bao-cao-thang', month: M })
    const bytes = f.body as Uint8Array
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // "PK"
    const raw = new TextDecoder().decode(bytes)
    for (const name of [
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'Tổng hợp',
      'Lợi nhuận ước tính',
      'Phát sinh sau khi chốt',
    ])
      expect(raw).toContain(name)
    for (const kind of ['bang-luong', 'so-tien', 'thu-chi', 'khach-hang'])
      expect(
        (await exportFile(auth('linh'), { branchId: cs7, kind, month: M, format: 'xlsx' })).filename,
      ).toMatch(/\.xlsx$/)
    const p = await exportFile(auth('linh'), { branchId: cs7, kind: 'bang-luong', month: M, format: 'csv' })
    expect(p.body as string).toContain('Trang,Đã khoá,')
    expect(
      (await err(exportFile(auth('linh'), { branchId: cs7, kind: 'bao-cao-thang', month: M, format: 'csv' })))
        .status,
    ).toBe(422)
  })

  it('Bộ ghi: CRC32 đúng, ô công thức có dấu nháy, XLSX một trang đúng cấu trúc zip', () => {
    expect(crc32(new TextEncoder().encode('hello')).toString(16)).toBe('3610a686')
    expect(safeText('=1+1')).toBe("'=1+1")
    expect(safeText('-5')).toBe("'-5")
    expect(safeText('Lan')).toBe('Lan')
    expect(toCsv({ headers: ['A'], rows: [[-5], ['-5']] })).toBe("﻿A\r\n-5\r\n'-5\r\n")
    const z = toXlsx([{ name: 'T', headers: ['A'], rows: [['x']] }])
    const v = new DataView(z.buffer)
    // Bản ghi kết thúc: 6 file
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(6)
  })
})

describe('Dọn dẹp', () => {
  it('Không ai khác ngoài Linh gọi được hàm sao lưu (S66)', async () => {
    for (const k of ['nhung', 'trang'] as const)
      await expectPgError(
        withUser(uid(k), (tx) => tx`select app.backup_dump()`),
        '42501',
      )
  })
})
