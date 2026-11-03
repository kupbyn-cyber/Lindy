// Xuất file (Đợt 5A, bước 5.4; PRD §11, §15, test 19; K25, Q40). Chỉ Linh (data.export) tải; bảng lương toàn quán cần
// thêm payroll.export_all_branch. Mỗi lần tải ghi audit. Báo cáo tháng là XLSX nhiều trang; các loại khác CSV hoặc XLSX.
import { LEDGER_LABEL } from '~/lib/money-book'
import { formatIsoDate, isYearMonth, monthRange, toLocalDate } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { payrollMonth } from '../payroll/service'
import { monthReport } from '../reports/service'
import { type Table, toCsv } from './csv'
import { type Sheet, toXlsx } from './xlsx'

export const EXPORT_KINDS = {
  'bao-cao-thang': { label: 'Báo cáo tháng', formats: ['xlsx'], monthly: true },
  'don-hang': { label: 'Đơn hàng tháng', formats: ['csv', 'xlsx'], monthly: true },
  'so-tien': { label: 'Sổ tiền tháng', formats: ['csv', 'xlsx'], monthly: true },
  'thu-chi': { label: 'Thu chi tháng', formats: ['csv', 'xlsx'], monthly: true },
  'bang-luong': { label: 'Bảng lương tháng', formats: ['csv', 'xlsx'], monthly: true },
  'khach-hang': { label: 'Khách hàng', formats: ['csv', 'xlsx'], monthly: false },
} as const

export type ExportKind = keyof typeof EXPORT_KINDS
export type ExportFormat = 'csv' | 'xlsx'

const n = (v: unknown) => Number(v ?? 0)
const d = (iso: string | null) => (iso ? formatIsoDate(iso) : '')
const dt = (x: Date | string | null) => (x ? `${formatIsoDate(toLocalDate(x))}` : '')

const ORDER_STATUS: Record<string, string> = {
  in_progress: 'Đang làm',
  awaiting_confirmation: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
}
const EXPENSE_STATUS: Record<string, string> = {
  requested: 'Chờ duyệt',
  approved: 'Đã duyệt, chờ chi',
  paid: 'Đã chi',
  rejected: 'Từ chối',
  cancelled: 'Đã huỷ',
}

/** Quyền tải: Linh (data.export, K25); bảng lương thêm payroll.export_all_branch (Q40). */
export function canExport(auth: Auth, branchId: string, kind: ExportKind) {
  if (!hasPerm(auth, branchId, 'data.export')) return false
  if (kind === 'bang-luong') return hasPerm(auth, branchId, 'payroll.export_all_branch')
  return true
}

export async function exportFile(
  auth: Auth,
  input: { branchId?: string; kind: string; month?: string; format?: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!(input.kind in EXPORT_KINDS)) throw notFound()
  const kind = input.kind as ExportKind
  const meta = EXPORT_KINDS[kind]
  if (!canExport(auth, branch.id, kind)) throw forbidden('Chỉ chủ quán tải file.')
  const format = (input.format ?? meta.formats[0]) as ExportFormat
  if (!(meta.formats as readonly string[]).includes(format))
    throw invalid('Loại file này không có định dạng đó.')
  const month = input.month ?? toLocalDate(new Date()).slice(0, 7)
  if (meta.monthly && !isYearMonth(month)) throw invalid('Chọn tháng.')

  const sheets = await build(auth, branch.id, kind, month)
  await withUser(
    auth.userId,
    (tx) => tx`
      insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
      values (${auth.userId}, ${branch.id}, ${`export.${kind}`}, 'branch', ${branch.id},
              ${tx.json({ month: meta.monthly ? month : null, format, rows: sheets.reduce((a, s) => a + s.rows.length, 0) })})`,
  )
  const base = `lindy-${kind}${meta.monthly ? `-${month}` : `-${toLocalDate(new Date())}`}`
  if (format === 'csv') {
    return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: toCsv(sheets[0]!) }
  }
  return {
    filename: `${base}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: toXlsx(sheets),
  }
}

async function build(auth: Auth, branchId: string, kind: ExportKind, month: string): Promise<Sheet[]> {
  const { first, last } = monthRange(month)
  switch (kind) {
    case 'bao-cao-thang':
      return reportSheets(auth, branchId, month)
    case 'bang-luong': {
      const p = await payrollMonth(auth, { branchId, month })
      return [
        {
          name: `Lương ${month}`,
          headers: [
            'Nhân viên',
            'Trạng thái',
            'Ngày trong tháng',
            'Nghỉ được hưởng',
            'Công chuẩn',
            'Ngày vắng',
            'Ngày đóng cửa',
            'Ngày chưa duyệt',
            'Lương cứng',
            'Điều chỉnh ngày công',
            '% hoa hồng',
            'Cơ sở hoa hồng',
            'Hoa hồng',
            'Doanh thu quán (KPI)',
            '% KPI',
            'Thưởng KPI',
            'Thưởng thêm',
            'Khấu trừ khác',
            'Nghỉ theo giờ (phút)',
            'Trừ nghỉ theo giờ',
            'Trừ tạm ứng vượt tháng trước',
            'Lương phải trả',
            'Tạm ứng',
            'Chuyển trừ tháng sau',
            'Phải trả sau tạm ứng',
            'Đã trả',
            'Còn phải trả',
            'Cách nhận lương',
          ],
          rows: p.lines.map((l) => [
            l.name,
            p.status === 'locked' ? 'Đã khoá' : 'Tạm tính',
            l.daysInMonth,
            l.leaveAllowance,
            l.standardDays,
            l.absentDays,
            l.closedDays,
            l.pendingDays,
            l.baseSalary,
            l.attendanceAdjustment,
            l.commissionBps / 100,
            l.commissionBase,
            l.commission,
            l.shopRevenue,
            l.kpiBps / 100,
            l.kpiBonus,
            l.bonus,
            l.deduction - l.hourlyLeaveDeduction,
            l.hourlyLeaveMinutes,
            l.hourlyLeaveDeduction,
            l.carryIn,
            l.grossPay,
            l.advances,
            l.carriedOut,
            l.payable,
            l.paid,
            l.remaining,
            l.payMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
          ]),
        },
      ]
    }
    default:
      return withUser(auth.userId, async (tx) => {
        if (kind === 'don-hang') {
          const rows = await tx<Record<string, unknown>[]>`
            select o.code, o.service_date::text as service_date, o.status, c.name as customer, c.phone,
                   (select string_agg(distinct u.display_name, ', ') from order_staff_allocations a
                      join users u on u.id = a.staff_user_id
                    where a.order_id = o.id and a.rev = o.content_rev) as staff,
                   o.gross_amount, o.discount_amount, o.net_amount,
                   (select coalesce(sum(amount), 0) from payments p where p.order_id = o.id and p.voided_at is null) as paid,
                   (select coalesce(sum(amount), 0) from order_refunds r where r.order_id = o.id) as refunded,
                   uc.display_name as created_by, uf.display_name as confirmed_by, o.confirmed_at, o.cancel_reason
            from orders o
            left join customers c on c.id = o.customer_id
            left join users uc on uc.id = o.created_by
            left join users uf on uf.id = o.confirmed_by
            where o.branch_id = ${branchId} and o.service_date between ${first}::date and ${last}::date
            order by o.service_date, o.code`
          return [
            sheet(`Đơn ${month}`, {
              headers: [
                'Mã đơn',
                'Ngày làm',
                'Trạng thái',
                'Khách',
                'SĐT',
                'Thợ',
                'Tiền gộp',
                'Giảm giá',
                'Tiền thuần',
                'Đã thu',
                'Đã hoàn',
                'Còn phải thu',
                'Người tạo',
                'Người xác nhận',
                'Ngày xác nhận',
                'Lý do huỷ',
              ],
              rows: rows.map((r) => {
                const net = n(r.netAmount)
                const paid = n(r.paid)
                const refunded = n(r.refunded)
                return [
                  `#${String(r.code).padStart(4, '0')}`,
                  d(r.serviceDate as string),
                  ORDER_STATUS[r.status as string] ?? String(r.status),
                  (r.customer as string) ?? 'Khách lẻ',
                  (r.phone as string) ?? '',
                  (r.staff as string) ?? '',
                  n(r.grossAmount),
                  n(r.discountAmount),
                  net,
                  paid,
                  refunded,
                  r.status === 'confirmed' ? Math.max(net - paid, 0) : null,
                  r.createdBy as string,
                  (r.confirmedBy as string) ?? '',
                  dt(r.confirmedAt as Date | null),
                  (r.cancelReason as string) ?? '',
                ]
              }),
            }),
          ]
        }
        if (kind === 'so-tien') {
          const rows = await tx<Record<string, unknown>[]>`
            select e.business_date::text as business_date, m.name as account, e.entry_type, e.amount, e.note,
                   u.display_name as created_by,
                   exists (select 1 from money_ledger_reconciliations x where x.entry_id = e.id) as reconciled
            from money_ledger_entries e
            join money_accounts m on m.id = e.money_account_id
            left join users u on u.id = e.created_by
            where e.branch_id = ${branchId} and e.business_date between ${first}::date and ${last}::date
            order by e.business_date, e.id`
          return [
            sheet(`Sổ tiền ${month}`, {
              headers: ['Ngày', 'Tài khoản', 'Loại', 'Số tiền', 'Ghi chú', 'Người ghi', 'Đã khớp sao kê'],
              rows: rows.map((r) => [
                d(r.businessDate as string),
                r.account as string,
                LEDGER_LABEL[r.entryType as string] ?? String(r.entryType),
                n(r.amount),
                (r.note as string) ?? '',
                (r.createdBy as string) ?? '',
                r.reconciled ? 'Có' : '',
              ]),
            }),
          ]
        }
        if (kind === 'thu-chi') {
          const rows = await tx<Record<string, unknown>[]>`
            select e.requested_at, c.name as category, e.note, e.amount, e.status, ur.display_name as requested_by,
                   ua.display_name as approved_by, e.paid_at, m.name as account
            from expense_requests e
            join expense_categories c on c.code = e.category_code
            left join users ur on ur.id = e.requested_by
            left join users ua on ua.id = e.approved_by
            left join money_accounts m on m.id = e.paid_account_id
            where e.branch_id = ${branchId}
              and ((e.requested_at at time zone app.branch_tz(${branchId}))::date between ${first}::date and ${last}::date
                   or (e.paid_at at time zone app.branch_tz(${branchId}))::date between ${first}::date and ${last}::date)
            order by e.requested_at`
          return [
            sheet(`Thu chi ${month}`, {
              headers: [
                'Ngày đề nghị',
                'Nhóm chi',
                'Nội dung',
                'Số tiền',
                'Trạng thái',
                'Người đề nghị',
                'Người duyệt',
                'Ngày chi',
                'Tài khoản chi',
              ],
              rows: rows.map((r) => [
                dt(r.requestedAt as Date),
                r.category as string,
                r.note as string,
                n(r.amount),
                EXPENSE_STATUS[r.status as string] ?? String(r.status),
                (r.requestedBy as string) ?? '',
                (r.approvedBy as string) ?? '',
                dt(r.paidAt as Date | null),
                (r.account as string) ?? '',
              ]),
            }),
          ]
        }
        // Khách hàng: tên, SĐT, lịch sử đơn (CRM tối giản, D10-B)
        const rows = await tx<Record<string, unknown>[]>`
          select c.name, c.phone, count(o.id) filter (where o.status = 'confirmed') as orders,
                 coalesce(sum(o.net_amount) filter (where o.status = 'confirmed'), 0) as revenue,
                 max(o.service_date) filter (where o.status = 'confirmed')::text as last_date, c.created_at
          from customers c
          left join orders o on o.customer_id = c.id and o.branch_id = ${branchId}
          group by c.id
          order by c.name`
        return [
          sheet('Khách hàng', {
            headers: ['Tên', 'SĐT', 'Số đơn đã xác nhận', 'Doanh thu', 'Lần làm gần nhất', 'Ngày tạo hồ sơ'],
            rows: rows.map((r) => [
              r.name as string,
              (r.phone as string) ?? '',
              n(r.orders),
              n(r.revenue),
              d((r.lastDate as string) ?? null),
              dt(r.createdAt as Date),
            ]),
          }),
        ]
      })
  }
}

const sheet = (name: string, t: Table): Sheet => ({ name, ...t })

/** Báo cáo tháng (PRD §11) thành nhiều trang; lợi nhuận chỉ khi người tải có profit.read (Linh). */
async function reportSheets(auth: Auth, branchId: string, month: string): Promise<Sheet[]> {
  const m = await monthReport(auth, { branchId, month })
  const r = m.revenue
  const summary: [string, string | number][] = [
    ['Tháng', `${month.slice(5, 7)}/${month.slice(0, 4)}`],
    ['Số đơn đã xác nhận', r.orders],
    ['Lượt khách', r.guests],
    ['Doanh thu gộp', r.gross],
    ['Giảm giá', r.discount],
    ['Đã hoàn tiền', r.refunded],
    ['Doanh thu thuần', r.net],
    ['Đã thu của các đơn này', r.paid],
    ['Còn phải thu', r.due],
    ['Doanh thu cọc khách bỏ hẹn (ngoài hoa hồng, KPI)', m.deposits.forfeited],
    ['Khách mới', m.customers.new],
    ['Khách quay lại', m.customers.returning],
    ['Lịch hẹn (trừ huỷ)', m.appointments.total],
    ['Lịch huỷ', m.appointments.cancelled],
    ['Khách không đến', m.appointments.noShow],
  ]
  if (m.closed) {
    summary.push(
      ['Đã chốt (khoá lương) lúc', dt(m.closed.at)],
      ['Doanh thu thuần đã chốt', m.closed.figures.net],
      ['Phát sinh sau khi chốt', m.closed.after.net],
    )
  }
  const sheets: Sheet[] = [
    sheet('Tổng hợp', { headers: ['Chỉ số', 'Giá trị'], rows: summary }),
    sheet('Theo ngày', {
      headers: ['Ngày', 'Số đơn', 'Doanh thu thuần'],
      rows: m.byDay.map((x) => [d(x.date), x.orders, x.net]),
    }),
    sheet('Theo thợ', {
      headers: ['Thợ', 'Số đơn', 'Doanh thu'],
      rows: m.byStaff.map((x) => [x.name, x.orders, x.amount]),
    }),
    sheet('Theo dịch vụ', {
      headers: ['Dịch vụ', 'Loại dòng', 'Số lượng', 'Doanh thu (chưa trừ hoàn)'],
      rows: m.byService.map((x) => [x.name, x.kind, x.quantity, x.net]),
    }),
  ]
  if (m.cashflow) {
    const f = m.cashflow
    sheets.push(
      sheet('Dòng tiền', {
        headers: ['Khoản', 'Số tiền'],
        rows: [
          ...f.accounts.flatMap((a) => [
            [`${a.name} — đầu tháng`, a.opening] as [string, number],
            [`${a.name} — cuối tháng`, a.closing] as [string, number],
          ]),
          ...f.inflows.map((l) => [`Vào: ${l.label}`, l.amount] as [string, number]),
          ['Tổng tiền vào', f.totalIn],
          ...f.outflows.map((l) => [`Ra: ${l.label}`, l.amount] as [string, number]),
          ['Tổng tiền ra', f.totalOut],
          ['Chuyển nội bộ (không tính vào tổng)', f.transfers],
          ...f.byCategory.map((c) => [`Chi nhóm: ${c.name}`, c.amount] as [string, number]),
        ],
      }),
    )
  }
  if (m.payroll) {
    const p = m.payroll
    sheets.push(
      sheet('Lương', {
        headers: ['Khoản', 'Số tiền'],
        rows: [
          ['Trạng thái', p.locked ? 'Đã khoá' : 'Tạm tính'],
          ['Số người', p.people],
          ['Lương phải trả', p.grossPay],
          ['Trong đó hoa hồng', p.commission],
          ['Trong đó thưởng KPI quản lý', p.kpiBonus],
          ['Tạm ứng đã chi', p.advances],
          ['Đã trả', p.paid],
          ['Còn phải trả', p.remaining],
        ],
      }),
    )
  }
  if (m.profit) {
    const p = m.profit
    sheets.push(
      sheet('Lợi nhuận ước tính', {
        headers: ['Khoản', 'Số tiền'],
        rows: [
          ['Doanh thu thuần', p.revenue],
          ['Doanh thu cọc khách bỏ hẹn', p.forfeited],
          ...p.operating.map((e) => [`Chi vận hành: ${e.name}`, -e.amount] as [string, number]),
          ...p.staff.map((e) => [`Chi nhân sự ngoài bảng lương: ${e.name}`, -e.amount] as [string, number]),
          [
            p.payroll.fromApp ? 'Lương phải trả (bảng lương)' : 'Lương (làm trên Sheets, không có trên app)',
            -p.payroll.amount,
          ],
          ['Lợi nhuận ước tính', p.profit],
          ...p.excluded.map((x) => [`Không tính: ${x.label}`, x.amount] as [string, number]),
        ],
      }),
    )
  }
  return sheets
}
