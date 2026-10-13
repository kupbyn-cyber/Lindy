// Nghiệm thu nhập dữ liệu cũ (Đợt 5B, bước 5.9–5.10): PRD §16; §18 test 29 (nhập lịch sử không sinh tiền vào quỹ),
// 16 (không tự gộp vì trùng tên). Chạy trên cơ sở thử riêng "CS8". File CSV giả lập một tab tháng của Google Sheets.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getCustomer } from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError, fromDbError } from '../../src/server/http/errors'
import { parseAmount, parseCsv, parseDate } from '../../src/server/legacy/parse'
import type { Mapping } from '../../src/server/legacy/schema'
import { analyzeLegacy, cancelImport, importLegacy, listImports } from '../../src/server/legacy/service'
import { monthReport, overview } from '../../src/server/reports/service'
import { type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
const S: Partial<Record<SeedKey, Awaited<ReturnType<typeof sessionOf>>>> = {}
let cs8 = ''
let lanAnh = ''
let bichNgoc = ''
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

// Tab tháng 9/2025: dòng tiêu đề phụ, tiêu đề, dòng hợp lệ, dòng lỗi, dòng trống, dòng tổng
const CSV = [
  'DOANH THU THÁNG 9/2025,,,,,,,,,',
  'Ngày,Tên khách,SĐT,Dịch vụ,Linh,Nhung,Chin,Trang,Hà,Tổng',
  '1/9,Phạm Thu Lệ,0389.001.122,Sơn gel,,"150.000",,,,150000', // 3: khớp khách có sẵn theo SĐT
  '1/9,Khách mới Sheets,0389 003 344,Nối mi,,,200k,,,200000', // 4: khách mới
  '2/9,Khách mới Sheets,0389003344,Dặm mi,,,"100,000",,,100000', // 5: cùng khách mới
  '3/9,Đỗ hạnh dung,,Combo,139000,,,,,139000', // 6: chỉ có tên, giống khách có sẵn → không ghép
  '3/9,Hồng,,Hai thợ,,80000,59000,,,139000', // 7: hai thợ
  '4/9,Sai tổng,,x,,100000,,,,90000', // 8: lỗi sai tổng
  '31/8,Ngoài tháng,,x,,50000,,,,50000', // 9: lỗi ngoài tháng
  ',Thiếu ngày,,x,,50000,,,,50000', // 10: lỗi thiếu ngày
  '5/9,Số lạ,,x,,abc,,,,', // 11: lỗi số tiền
  '6/9,Thợ cũ,,x,,,,,70000,70000', // 12: thợ không có tài khoản
  ',,,,,,,,,', // 13: trống
  'Tổng,,,,139000,230000,359000,,70000,798000', // 14: dòng tổng
  '7/9,Không tiền,,x,,,,,,', // 15: không có số tiền
].join('\r\n')

let mapping: Mapping

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS8', 'Zz cơ sở thử nhập dữ liệu cũ', 'CS8') returning id`
  cs8 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs8})`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs8}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'trang'] as const) S[k] = await sessionOf(k)
  const mk = async (name: string, phone: string | null) =>
    (
      await owner<{ id: string }[]>`
        insert into customers (organization_id, name, phone, created_by, updated_by)
        values (${org!.id}, ${name}, ${phone}, ${uid('linh')}, ${uid('linh')}) returning id`
    )[0]!.id
  lanAnh = await mk('Phạm Thu Lệ', '0389001122')
  bichNgoc = await mk('Đỗ Hạnh Dung', null)
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs8}`
  await owner.end()
  await closeSql()
})

describe('Đọc CSV, số tiền, ngày', () => {
  it('CSV: ngoặc kép, dấu ; , tab, BOM, xuống dòng trong ô', () => {
    expect(parseCsv('﻿a,"b,c","d ""x"""\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd "x"'],
      ['1', '2', '3'],
    ])
    expect(parseCsv('a;b\n"1\n2";3')).toEqual([
      ['a', 'b'],
      ['1\n2', '3'],
    ])
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('Số tiền: 1.250.000; 1,250,000đ; 250k; 1.5k; (50.000); trống; chữ → không đọc được', () => {
    expect(parseAmount('1.250.000')).toBe(1_250_000)
    expect(parseAmount('1,250,000đ')).toBe(1_250_000)
    expect(parseAmount('250k')).toBe(250_000)
    expect(parseAmount('1.5k')).toBe(1_500)
    expect(parseAmount('(50.000)')).toBe(-50_000)
    expect(parseAmount('-50000 VND')).toBe(-50_000)
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount('abc')).toBeNaN()
  })

  it('Ngày: dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, dd/mm và số ngày theo tháng của tab', () => {
    expect(parseDate('13/10/2026', null)).toBe('2026-10-13')
    expect(parseDate('5-9-25', null)).toBe('2025-09-05')
    expect(parseDate('2025-09-05', null)).toBe('2025-09-05')
    expect(parseDate('5/9', '2025-09')).toBe('2025-09-05')
    expect(parseDate('7', '2025-09')).toBe('2025-09-07')
    expect(parseDate('31/2/2025', null)).toBeNull()
    expect(parseDate('7', null)).toBeNull()
  })
})

describe('5.9 — xem trước, ghép cột, kiểm, nhập', () => {
  it('Xem trước: tự nhận dòng tiêu đề, gợi ý ghép cột theo tên cột và tên thợ', async () => {
    const p = await analyzeLegacy(auth('linh'), { branchId: cs8, fileName: 'thang-9.csv', text: CSV })
    if (p.kind !== 'preview') throw new Error('Mong xem trước')
    expect(p.headerRow).toBe(2)
    expect(p.suggested).toMatchObject({ date: 0, customer: 1, phone: 2, note: 3, total: 9 })
    expect(p.suggested.staff).toEqual([
      { col: 4, userId: uid('linh') },
      { col: 5, userId: uid('nhung') },
      { col: 6, userId: uid('chin') },
      { col: 7, userId: uid('trang') },
    ])
    mapping = { ...p.suggested, month: '2025-09', staff: [...p.suggested.staff, { col: 8, userId: null }] }
  })

  it('Kiểm: dòng hợp lệ, lỗi (sai tổng, ngoài tháng, thiếu ngày, số lạ), cảnh báo, tổng theo thợ', async () => {
    const c = await analyzeLegacy(auth('linh'), {
      branchId: cs8,
      fileName: 'thang-9.csv',
      text: CSV,
      mapping,
    })
    if (c.kind !== 'check') throw new Error('Mong kết quả kiểm')
    expect(c).toMatchObject({
      sourceRows: 6,
      rows: 7,
      total: 798_000,
      duplicates: 0,
      newCustomers: 1,
      linkedRows: 1,
    })
    expect(c.errors.map((e) => e.rowNo)).toEqual([8, 9, 10, 11])
    expect(c.errors[0]!.message).toMatch(/Sai tổng/)
    expect(c.warnings.map((w) => w.rowNo)).toEqual(expect.arrayContaining([6, 14, 15]))
    expect(Object.fromEntries(c.byStaff.map((s) => [s.name, s.amount]))).toEqual({
      Chin: 359_000,
      Nhung: 230_000,
      Linh: 139_000,
      Hà: 70_000,
    })
  })

  it('Nhung, thợ không nhập được (API, SQL); thợ không đọc được dữ liệu cũ', async () => {
    expect(
      (await err(analyzeLegacy(auth('nhung'), { branchId: cs8, fileName: 'x.csv', text: CSV }))).status,
    ).toBe(403)
    await expectPgError(
      withUser(
        uid('nhung'),
        (tx) => tx`select app.legacy_import(${cs8}, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      ),
      '42501',
    )
    expect((await err(listImports(auth('trang'), cs8))).status).toBe(403)
  })

  it('Nhập; PRD 29: không sinh tiền vào quỹ, không đơn, không lương; báo cáo tháng cũ hiện riêng', async () => {
    const r = await importLegacy(auth('linh'), {
      branchId: cs8,
      fileName: 'thang-9.csv',
      label: 'Tháng 9/2025',
      text: CSV,
      mapping,
    })
    expect(r).toMatchObject({ inserted: 7, total: 798_000, errorCount: 4, newCustomers: 1 })
    const [x] = await owner<Record<string, number>[]>`
      select (select count(*)::int from money_ledger_entries where branch_id = ${cs8}) as ledger,
             (select count(*)::int from payments where branch_id = ${cs8}) as payments,
             (select count(*)::int from orders where branch_id = ${cs8}) as orders,
             (select count(*)::int from payroll_revenue_entries where branch_id = ${cs8}) as payroll`
    expect(x).toEqual({ ledger: 0, payments: 0, orders: 0, payroll: 0 })
    const m = await monthReport(auth('nhung'), { branchId: cs8, month: '2025-09' })
    expect(m.revenue.net).toBe(0)
    expect(m.legacy).toMatchObject({ total: 798_000, entries: 7 })
    expect((await overview(auth('linh'), { branchId: cs8, period: 'month' })).revenue?.net).toBe(0)
    const staffRows = await withUser(
      uid('trang'),
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from legacy_sales where branch_id = ${cs8}`,
    )
    expect(staffRows[0]!.n).toBe(0)
  })

  it('5.10, PRD 16: lịch sử khách khớp SĐT có dòng cũ; khách mới tạo theo SĐT; chỉ có tên thì không gộp', async () => {
    const lan = await getCustomer(auth('linh'), lanAnh)
    expect(lan.legacy).toEqual([{ saleDate: '2025-09-01', staff: 'Nhung', amount: 150_000, note: 'Sơn gel' }])
    const [nc] = await owner<
      { id: string; name: string }[]
    >`select id, name from customers where phone = '0389003344'`
    expect(nc!.name).toBe('Khách mới Sheets')
    expect((await getCustomer(auth('linh'), nc!.id)).legacy).toHaveLength(2)
    expect((await getCustomer(auth('linh'), bichNgoc)).legacy).toEqual([])
  })

  it('Nhập lại cùng file → không nhân đôi; huỷ lần nhập → báo cáo bỏ dòng cũ; nhập lại sau khi huỷ được', async () => {
    const again = await err(
      importLegacy(auth('linh'), { branchId: cs8, fileName: 'thang-9.csv', text: CSV, mapping }),
    )
    expect(again.status).toBe(422)
    expect(again.message).toMatch(/đã nhập ở lần trước/)
    const c = await analyzeLegacy(auth('linh'), {
      branchId: cs8,
      fileName: 'thang-9.csv',
      text: CSV,
      mapping,
    })
    if (c.kind !== 'check') throw new Error('x')
    expect(c).toMatchObject({ rows: 0, duplicates: 7 })
    const list = await listImports(auth('linh'), cs8)
    expect(list[0]).toMatchObject({
      rowCount: 7,
      skippedCount: 4,
      totalAmount: 798_000,
      firstDate: '2025-09-01',
    })
    expect((await err(cancelImport(auth('linh'), list[0]!.id, ' ', cs8))).status).toBe(422)
    const after = await cancelImport(auth('linh'), list[0]!.id, 'Ghép nhầm cột', cs8)
    expect(after[0]!.cancelledAt).not.toBeNull()
    expect((await monthReport(auth('linh'), { branchId: cs8, month: '2025-09' })).legacy).toBeNull()
    const r = await importLegacy(auth('linh'), { branchId: cs8, fileName: 'thang-9.csv', text: CSV, mapping })
    expect(r.inserted).toBe(7)
    // Không xoá dòng, không xoá lần nhập
    await expectPgError(owner`delete from legacy_sales where branch_id = ${cs8}`, '42501')
  })
})
