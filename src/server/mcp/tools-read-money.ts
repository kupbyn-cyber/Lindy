// Tool đọc số liệu kinh doanh: báo cáo, lợi nhuận, sổ tiền, thu chi, cọc, chấm công, lương, tạm ứng (gói 6).
// Mỗi tool gọi đúng service mà route GET tương ứng trong src/routes/api/* đang gọi; quyền do service + RLS quyết.
import { z } from 'zod'
import { dayBoard, monthSheet } from '../attendance/service'
import { listSeasons } from '../deposits/service'
import { EXPENSE_FILTERS } from '../expenses/schema'
import { listExpenses } from '../expenses/service'
import { getBook, listEntries } from '../money/service'
import { listAdvances } from '../payroll/advances'
import { ADVANCE_FILTERS } from '../payroll/schema'
import { payrollMonth } from '../payroll/service'
import { dayReport, monthReport, overview } from '../reports/service'
import { SCOPE_READ } from './config'
import { defineTool, isoDate, isoMonth, uuid } from './kit'

const MONEY = 'Tiền là số nguyên VND (8450000 = 8.450.000đ).'
const REVENUE =
  'Chỉ đơn Đã xác nhận mới vào doanh thu; doanh thu ghi theo ngày làm dịch vụ; lịch hẹn không sinh doanh thu.'

export const overviewTool = defineTool({
  name: 'lindy_overview',
  title: 'Tổng quan',
  description: `Tổng quan nhanh như trang chủ app: hôm nay hoặc tháng này (period: day | month). ${REVENUE} ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ period: z.enum(['day', 'month']).optional() }),
  run: ({ period }, { auth }) => overview(auth, { period: period ?? 'day' }),
})

export const dayReportTool = defineTool({
  name: 'lindy_day_report',
  title: 'Báo cáo ngày',
  description: `Báo cáo một ngày (date YYYY-MM-DD, mặc định hôm nay): doanh thu, khách, theo thợ, theo dịch vụ. ${REVENUE} ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ date: isoDate.optional() }),
  run: (args, { auth }) => dayReport(auth, args),
})

export const monthReportTool = defineTool({
  name: 'lindy_month_report',
  title: 'Báo cáo tháng',
  description:
    'Báo cáo một tháng (month YYYY-MM, mặc định tháng này): doanh thu, khách, theo thợ, theo dịch vụ, cọc mất, ' +
    `doanh thu nhập từ Google Sheets (legacy, tách riêng), lợi nhuận ước tính (profit). Tháng đã chốt dùng số đã chốt. ${REVENUE} ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ month: isoMonth.optional() }),
  run: (args, { auth }) => monthReport(auth, args),
})

export const monthProfitTool = defineTool({
  name: 'lindy_month_profit',
  title: 'Lợi nhuận tháng',
  description:
    'Lợi nhuận ước tính một tháng (month YYYY-MM): doanh thu, chi phí vận hành, chi phí nhân sự, lợi nhuận. ' +
    `Lấy đúng số của màn Lợi nhuận (tháng đã chốt tính trên số đã chốt). ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ month: isoMonth.optional() }),
  // Không gọi thẳng monthProfit (nhận tx + doanh thu tính sẵn, không kiểm profit.read) [phản biện L4]
  run: async (args, { auth }) => {
    const r = await monthReport(auth, args)
    return { month: r.month, closed: r.closed ?? null, profit: r.profit }
  },
})

export const moneyBookTool = defineTool({
  name: 'lindy_money_book',
  title: 'Sổ tiền',
  description: `Sổ tiền: số dư từng tài khoản (tiền mặt, ngân hàng…), việc cần đối soát, chốt quỹ. ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({}),
  run: (_args, { auth }) => getBook(auth, {}),
})

export const moneyEntriesTool = defineTool({
  name: 'lindy_money_entries',
  title: 'Bút toán sổ tiền',
  description:
    'Các khoản thu/chi đã vào sổ tiền theo khoảng ngày (from, to YYYY-MM-DD), có thể lọc một tài khoản (accountId) ' +
    `hoặc chỉ khoản chưa đối soát (unreconciled). ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    accountId: uuid.optional(),
    unreconciled: z.boolean().optional(),
  }),
  run: (args, { auth }) => listEntries(auth, { ...args, unreconciled: !!args.unreconciled }),
})

export const listExpensesTool = defineTool({
  name: 'lindy_list_expenses',
  title: 'Thu chi — đề nghị chi',
  description:
    'Đề nghị chi và trạng thái (filter: pending | approved | paid | closed | all), theo khoảng ngày (from, to). ' +
    MONEY,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({
    filter: z.enum(EXPENSE_FILTERS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  }),
  run: (args, { auth }) => listExpenses(auth, args),
})

export const depositSeasonsTool = defineTool({
  name: 'lindy_deposit_seasons',
  title: 'Mùa cọc',
  description: `Các mùa cọc (vd Tết) và cài đặt cọc. Cọc của từng lịch hẹn xem qua lindy_get_appointment. ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({}),
  run: (_args, { auth }) => listSeasons(auth),
})

export const attendanceMonthTool = defineTool({
  name: 'lindy_attendance_month',
  title: 'Bảng công tháng',
  description:
    'Bảng công cả quán một tháng (month YYYY-MM): ngày đi làm, nghỉ, trạng thái duyệt của từng người.',
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ month: isoMonth.optional() }),
  run: (args, { auth }) => monthSheet(auth, args),
})

export const attendanceDayTool = defineTool({
  name: 'lindy_attendance_day',
  title: 'Bảng công ngày',
  description:
    'Bảng công một ngày (date YYYY-MM-DD, không nhận ngày tương lai): giờ vào ca, trạng thái công (decided), ' +
    'nghỉ của từng người. Dùng trước khi duyệt công.',
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ date: isoDate.optional() }),
  run: (args, { auth }) => dayBoard(auth, args),
})

export const payrollMonthTool = defineTool({
  name: 'lindy_payroll_month',
  title: 'Bảng lương tháng',
  description: `Bảng lương một tháng (month YYYY-MM): lương cứng, hoa hồng, tip, tạm ứng, thực nhận của từng người, trạng thái khoá/chi. ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ month: isoMonth.optional() }),
  run: (args, { auth }) => payrollMonth(auth, args),
})

export const listAdvancesTool = defineTool({
  name: 'lindy_list_advances',
  title: 'Tạm ứng',
  description: `Phiếu tạm ứng lương (filter: pending | approved | paid | all) kèm phiên bản để duyệt. ${MONEY}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ filter: z.enum(ADVANCE_FILTERS).optional() }),
  run: (args, { auth }) => listAdvances(auth, args),
})

export const READ_MONEY_TOOLS = [
  overviewTool,
  dayReportTool,
  monthReportTool,
  monthProfitTool,
  moneyBookTool,
  moneyEntriesTool,
  listExpensesTool,
  depositSeasonsTool,
  attendanceMonthTool,
  attendanceDayTool,
  payrollMonthTool,
  listAdvancesTool,
]
