// Nhập dữ liệu cũ từ Google Sheets (Đợt 5B, bước 5.9–5.10; PRD §16, D14, Q42; test 16, 29).
// Linh tải CSV → app đọc dòng tiêu đề, gợi ý ghép cột → Linh ghép cột → app kiểm (ngày, số tiền, tổng, trùng, khách, thợ)
// → nhập dòng hợp lệ vào bảng riêng. Không thành đơn, không vào sổ tiền, không vào lương. Mọi dòng mang nhãn
// "không rõ dịch vụ / chưa biết đã thu tiền".
import { createHash } from 'node:crypto'
import { normalizePhone } from '~/lib/phone'
import { foldVietnamese } from '~/lib/text'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { customerSearchNorm } from '../customers/service'
import { type Tx, withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { parseAmount, parseCsv, parseDate } from './parse'
import type { Mapping } from './schema'

const n = (v: unknown) => Number(v ?? 0)
const fold = (s: string) => foldVietnamese(s).trim()
const MAX_ROWS = 20_000

function requireImport(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'legacy.import')) throw forbidden('Chỉ chủ quán nhập dữ liệu cũ.')
  return branch
}

function readRows(text: string) {
  const rows = parseCsv(text)
  if (rows.length === 0) throw invalid('File trống hoặc không phải CSV.')
  if (rows.length > MAX_ROWS) throw invalid('File quá nhiều dòng. Xuất từng tab tháng.')
  return rows
}

/** Dòng tiêu đề: dòng đầu tiên (trong 10 dòng đầu) có từ 3 ô có chữ */
function guessHeaderRow(rows: string[][]) {
  const i = rows.slice(0, 10).findIndex((r) => r.filter((c) => c.trim() !== '').length >= 3)
  return i < 0 ? 1 : i + 1
}

type Staff = { userId: string; name: string }

async function staffOf(tx: Tx, branchId: string): Promise<Staff[]> {
  return (
    await tx<{ userId: string; displayName: string }[]>`
      select user_id, display_name from app.staff_people(${branchId})`
  ).map((s) => ({ userId: s.userId, name: s.displayName }))
}

function suggest(headers: string[], staff: Staff[]): Mapping {
  const f = headers.map(fold)
  const find = (...keys: string[]) => {
    const i = f.findIndex((h) => keys.some((k) => h === k || h.startsWith(`${k} `) || h.includes(k)))
    return i < 0 ? null : i
  }
  const date = find('ngay', 'date') ?? 0
  const used = new Set<number>([date])
  const pick = (...keys: string[]) => {
    const i = find(...keys)
    if (i == null || used.has(i)) return null
    used.add(i)
    return i
  }
  const phone = pick('sdt', 'so dien thoai', 'dien thoai', 'phone')
  const customer = pick('ten khach', 'khach hang', 'khach', 'ho ten', 'ten')
  const total = pick('tong', 'thanh tien', 'doanh thu', 'tong tien')
  const note = pick('dich vu', 'ghi chu', 'noi dung', 'dv')
  const staffCols = f
    .map((h, col) => ({ h, col }))
    .filter(({ h, col }) => !used.has(col) && staff.some((s) => fold(s.name) === h))
    .map(({ h, col }) => ({ col, userId: staff.find((s) => fold(s.name) === h)!.userId }))
  return { headerRow: 1, month: null, date, customer, phone, note, total, staff: staffCols }
}

export type Issue = { rowNo: number | null; message: string }

type SaleRow = {
  sale_date: string
  row_no: number
  customer_name: string | null
  phone: string | null
  customer_id: string | null
  customer_key: string | null
  note: string | null
  staff_user_id: string | null
  staff_label: string
  amount: number
  fingerprint: string
}

/** Kiểm file theo cách ghép cột; trả các dòng sẽ nhập, lỗi, cảnh báo, tổng theo thợ. */
async function check(tx: Tx, branchId: string, rows: string[][], m: Mapping, staff: Staff[]) {
  const [t] = await tx<{ today: string }[]>`select app.branch_today(${branchId})::text as today`
  const today = t!.today
  const headers = (rows[m.headerRow - 1] ?? []).map((h) => h.trim())
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const label = (col: number) => headers[col] || `Cột ${col + 1}`
  const staffName = (userId: string | null, col: number) =>
    userId ? (staff.find((s) => s.userId === userId)?.name ?? label(col)) : label(col)
  for (const s of m.staff)
    if (s.userId && !staff.some((x) => x.userId === s.userId))
      throw invalid('Thợ ghép cột không thuộc cơ sở.')
  if (m.staff.length === 0 && m.total == null)
    throw invalid('Ghép ít nhất một cột tiền của thợ hoặc cột tổng tiền.')

  type Parsed = {
    rowNo: number
    date: string
    name: string
    phone: string | null
    note: string
    amounts: { userId: string | null; label: string; amount: number }[]
  }
  const parsed: Parsed[] = []
  let sourceErrors = 0
  for (let i = m.headerRow; i < rows.length; i++) {
    const rowNo = i + 1
    const cells = rows[i]!
    const cell = (c: number | null) => (c == null ? '' : (cells[c] ?? '').trim())
    if (cells.every((c) => c.trim() === '')) continue
    const firstText = fold(cells.find((c) => c.trim() !== '') ?? '')
    const dateRaw = cell(m.date)
    if (/^(tong|cong|total)/.test(firstText) && !parseDate(dateRaw, m.month)) {
      warnings.push({ rowNo, message: 'Dòng tổng cộng, bỏ qua.' })
      continue
    }
    const amounts: Parsed['amounts'] = []
    let bad = false
    const cols = m.staff.length ? m.staff : [{ col: m.total!, userId: null }]
    for (const s of cols) {
      const a = parseAmount(cell(s.col))
      if (a != null && Number.isNaN(a)) {
        errors.push({ rowNo, message: `Số tiền "${cell(s.col)}" ở cột "${label(s.col)}" không đọc được.` })
        bad = true
      } else if (a)
        amounts.push({
          userId: s.userId,
          label: m.staff.length ? staffName(s.userId, s.col) : 'Tổng',
          amount: a,
        })
    }
    if (bad) {
      sourceErrors++
      continue
    }
    if (amounts.length === 0) {
      if (dateRaw) warnings.push({ rowNo, message: 'Dòng không có số tiền, bỏ qua.' })
      continue
    }
    const date = parseDate(dateRaw, m.month)
    if (!date) {
      errors.push({ rowNo, message: dateRaw ? `Ngày "${dateRaw}" không đọc được.` : 'Thiếu ngày.' })
      sourceErrors++
      continue
    }
    if (m.month && date.slice(0, 7) !== m.month) {
      errors.push({ rowNo, message: `Ngày ${date.split('-').reverse().join('/')} ngoài tháng của tab.` })
      sourceErrors++
      continue
    }
    if (date > today || date < '2015-01-01') {
      errors.push({ rowNo, message: `Ngày ${date.split('-').reverse().join('/')} không hợp lệ.` })
      sourceErrors++
      continue
    }
    if (m.total != null && m.staff.length) {
      const total = parseAmount(cell(m.total))
      const sum = amounts.reduce((a, x) => a + x.amount, 0)
      if (total != null && (Number.isNaN(total) || total !== sum)) {
        errors.push({
          rowNo,
          message: `Sai tổng: cột tổng ${cell(m.total)}, cộng các thợ ${sum.toLocaleString('vi-VN')}.`,
        })
        sourceErrors++
        continue
      }
    }
    let phone: string | null = null
    if (m.phone != null && cell(m.phone)) {
      const p = normalizePhone(cell(m.phone))
      if (p.ok) phone = p.value
      else warnings.push({ rowNo, message: `SĐT "${cell(m.phone)}" không đọc được, bỏ SĐT.` })
    }
    parsed.push({ rowNo, date, name: cell(m.customer), phone, note: cell(m.note), amounts })
  }

  // Cột có số tiền mà chưa ghép
  const mapped = new Set([m.date, m.customer, m.phone, m.note, m.total, ...m.staff.map((s) => s.col)])
  headers.forEach((h, col) => {
    if (mapped.has(col) || !h) return
    const hits = rows.slice(m.headerRow).filter((r) => {
      const a = parseAmount(r[col] ?? '')
      return a != null && !Number.isNaN(a) && a >= 1000
    }).length
    if (hits >= 3) warnings.push({ rowNo: null, message: `Cột "${h}" có số tiền nhưng chưa ghép.` })
  })

  // Khách: khớp theo SĐT; chỉ có tên thì không tự gộp (test 16), chỉ nhắc khi giống tên khách có sẵn
  const phones = [...new Set(parsed.map((p) => p.phone).filter((p): p is string => !!p))]
  const byPhone = phones.length
    ? await tx<{ id: string; name: string; phone: string }[]>`
        select id, name, phone from customers where phone = any(${phones}::text[])`
    : []
  const names = new Map<string, string>()
  if (parsed.some((p) => !p.phone && p.name)) {
    for (const c of await tx<{ name: string }[]>`select name from customers`) names.set(fold(c.name), c.name)
  }
  const newCustomers = new Map<string, { key: string; name: string; phone: string; search_norm: string }>()
  let linked = 0
  const seen = new Map<string, number>()
  const sales: SaleRow[] = []
  for (const p of parsed) {
    let customerId: string | null = null
    let customerKey: string | null = null
    if (p.phone) {
      const same = byPhone.filter((c) => c.phone === p.phone)
      if (same.length === 1) {
        customerId = same[0]!.id
        linked++
        if (p.name && fold(same[0]!.name) !== fold(p.name))
          warnings.push({
            rowNo: p.rowNo,
            message: `SĐT trùng khách "${same[0]!.name}" (tên khác "${p.name}"), vẫn ghép.`,
          })
      } else if (same.length > 1) {
        warnings.push({ rowNo: p.rowNo, message: 'SĐT dùng chung cho nhiều khách, không ghép hồ sơ.' })
      } else if (p.name) {
        customerKey = p.phone
        if (!newCustomers.has(p.phone))
          newCustomers.set(p.phone, {
            key: p.phone,
            name: p.name.slice(0, 100),
            phone: p.phone,
            search_norm: customerSearchNorm(p.name.slice(0, 100), p.phone),
          })
      }
    } else if (p.name && names.has(fold(p.name))) {
      warnings.push({
        rowNo: p.rowNo,
        message: `Tên giống khách có sẵn "${names.get(fold(p.name))}" nhưng không có SĐT: không tự ghép.`,
      })
    }
    for (const a of p.amounts) {
      const base = [p.date, fold(p.name), p.phone ?? '', fold(a.label), a.amount, fold(p.note)].join('|')
      const k = (seen.get(base) ?? 0) + 1
      seen.set(base, k)
      if (k === 2)
        warnings.push({ rowNo: p.rowNo, message: 'Trùng hoàn toàn với một dòng khác trong file (vẫn nhập).' })
      sales.push({
        sale_date: p.date,
        row_no: p.rowNo,
        customer_name: p.name || null,
        phone: p.phone,
        customer_id: customerId,
        customer_key: customerKey,
        note: p.note || null,
        staff_user_id: a.userId,
        staff_label: a.label,
        amount: a.amount,
        fingerprint: createHash('sha256').update(`${base}#${k}`).digest('hex'),
      })
    }
  }

  // Dòng đã nhập ở lần trước (chưa huỷ)
  const fps = sales.map((s) => s.fingerprint)
  const existing = new Set(
    fps.length
      ? (
          await tx<{ fingerprint: string }[]>`
            select fingerprint from legacy_sales
            where branch_id = ${branchId} and cancelled_at is null and fingerprint = any(${fps}::text[])`
        ).map((r) => r.fingerprint)
      : [],
  )
  const fresh = sales.filter((s) => !existing.has(s.fingerprint))
  const byStaff = new Map<string, number>()
  for (const s of fresh) byStaff.set(s.staff_label, (byStaff.get(s.staff_label) ?? 0) + s.amount)
  const dates = fresh.map((s) => s.sale_date).sort()
  return {
    headers,
    sourceRows: parsed.length,
    sourceErrors,
    rows: fresh.length,
    duplicates: sales.length - fresh.length,
    total: fresh.reduce((a, s) => a + s.amount, 0),
    byStaff: [...byStaff.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    newCustomers: [...newCustomers.values()].filter((c) => fresh.some((s) => s.customer_key === c.key)),
    linkedRows: linked,
    errors: errors.slice(0, 300),
    errorCount: errors.length,
    warnings: warnings.slice(0, 300),
    warningCount: warnings.length,
    fresh,
  }
}

/** Không có cách ghép: trả dòng tiêu đề, vài dòng đầu, gợi ý ghép cột. Có cách ghép: kết quả kiểm. */
export async function analyzeLegacy(
  auth: Auth,
  input: { branchId?: string; fileName: string; text: string; headerRow?: number; mapping?: Mapping },
) {
  const branch = requireImport(auth, input.branchId)
  const rows = readRows(input.text)
  return withUser(auth.userId, async (tx) => {
    const staff = await staffOf(tx, branch.id)
    if (!input.mapping) {
      const headerRow = input.headerRow ?? guessHeaderRow(rows)
      const headers = (rows[headerRow - 1] ?? []).map((h) => h.trim())
      return {
        kind: 'preview' as const,
        headerRow,
        headers,
        preview: rows.slice(headerRow, headerRow + 8),
        dataRows: Math.max(rows.length - headerRow, 0),
        suggested: { ...suggest(headers, staff), headerRow },
        staff,
      }
    }
    const { fresh: _fresh, ...result } = await check(tx, branch.id, rows, input.mapping, staff)
    return {
      kind: 'check' as const,
      ...result,
      newCustomers: result.newCustomers.length,
    }
  })
}

export async function importLegacy(
  auth: Auth,
  input: { branchId?: string; fileName: string; label?: string | null; text: string; mapping: Mapping },
) {
  const branch = requireImport(auth, input.branchId)
  const rows = readRows(input.text)
  return withUser(auth.userId, async (tx) => {
    const staff = await staffOf(tx, branch.id)
    const r = await check(tx, branch.id, rows, input.mapping, staff)
    if (r.fresh.length === 0)
      throw invalid(
        r.duplicates
          ? 'Không có dòng mới: các dòng này đã nhập ở lần trước.'
          : 'Không có dòng hợp lệ để nhập.',
      )
    const [res] = await tx<
      { result: { importId: string; inserted: number; duplicates: number; total: number } }[]
    >`
      select app.legacy_import(
        ${branch.id},
        ${tx.json({ file_name: input.fileName, label: input.label ?? null, mapping: input.mapping, skipped: r.sourceErrors })},
        ${tx.json(r.newCustomers)},
        ${tx.json(r.fresh)}) as result`
    return {
      ...res!.result,
      errorCount: r.errorCount,
      newCustomers: r.newCustomers.length,
    }
  })
}

export async function listImports(auth: Auth, branchId?: string) {
  const branch = requireImport(auth, branchId)
  return withUser(auth.userId, async (tx) => {
    const rows = await tx<
      {
        id: string
        fileName: string
        label: string | null
        rowCount: number
        skippedCount: number
        totalAmount: string
        createdByName: string | null
        createdAt: Date
        cancelledAt: Date | null
        cancelReason: string | null
        firstDate: string | null
        lastDate: string | null
      }[]
    >`
      select i.id, i.file_name, i.label, i.row_count, i.skipped_count, i.total_amount, u.display_name as created_by_name,
             i.created_at, i.cancelled_at, i.cancel_reason,
             (select min(sale_date)::text from legacy_sales s where s.import_id = i.id) as first_date,
             (select max(sale_date)::text from legacy_sales s where s.import_id = i.id) as last_date
      from legacy_imports i left join users u on u.id = i.created_by
      where i.branch_id = ${branch.id}
      order by i.created_at desc
      limit 100`
    return rows.map((r) => ({
      ...r,
      totalAmount: n(r.totalAmount),
      createdAt: new Date(r.createdAt).toISOString(),
      cancelledAt: r.cancelledAt ? new Date(r.cancelledAt).toISOString() : null,
    }))
  })
}

export async function cancelImport(auth: Auth, id: string, reason: string, branchId?: string) {
  requireImport(auth, branchId)
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Không tìm thấy lần nhập.')
  await withUser(auth.userId, (tx) => tx`select app.legacy_import_cancel(${id}, ${reason.trim()})`)
  return listImports(auth, branchId)
}

// ---------------------------------------------------------------- Tra cứu

/** Báo cáo tháng: doanh thu nhập từ Sheets (Linh, Nhung; RLS revenue.read_branch), tách khỏi số của app */
export async function legacyMonth(tx: Tx, branchId: string, from: string, to: string) {
  const rows = await tx<{ name: string; amount: string; n: string }[]>`
    select coalesce(u.display_name, s.staff_label, 'Không rõ thợ') as name, sum(s.amount) as amount, count(*) as n
    from legacy_sales s left join users u on u.id = s.staff_user_id
    where s.branch_id = ${branchId} and s.cancelled_at is null and s.sale_date between ${from}::date and ${to}::date
    group by 1 order by sum(s.amount) desc`
  if (rows.length === 0) return null
  return {
    total: rows.reduce((a, r) => a + n(r.amount), 0),
    entries: rows.reduce((a, r) => a + n(r.n), 0),
    byStaff: rows.map((r) => ({ name: r.name, amount: n(r.amount) })),
  }
}

/** Lịch sử khách: dòng nhập từ Sheets đã ghép hồ sơ (RLS: Linh, Nhung) */
export async function legacyOfCustomer(tx: Tx, customerId: string) {
  const rows = await tx<{ saleDate: string; staff: string; amount: string; note: string | null }[]>`
    select s.sale_date::text, coalesce(u.display_name, s.staff_label, 'Không rõ thợ') as staff, s.amount, s.note
    from legacy_sales s left join users u on u.id = s.staff_user_id
    where s.customer_id = ${customerId} and s.cancelled_at is null
    order by s.sale_date desc, s.id
    limit 200`
  return rows.map((r) => ({ saleDate: r.saleDate, staff: r.staff, amount: n(r.amount), note: r.note }))
}
