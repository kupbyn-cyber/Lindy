// Tool đọc vận hành hằng ngày: lịch hẹn, đơn hàng, khách hàng, Cần xem lại (gói 5).
// Mỗi tool gọi đúng service mà route GET tương ứng trong src/routes/api/* đang gọi; quyền do service + RLS quyết.
import { z } from 'zod'
import { LIST_FILTERS } from '../appointments/schema'
import { attentionList, getAppointment, listAppointments } from '../appointments/service'
import { getCustomer, recentCustomers, searchCustomerList } from '../customers/service'
import { limitSensitiveReads } from '../http/route'
import { ORDER_FILTERS } from '../orders/schema'
import { getOrder, listOrders } from '../orders/service'
import { reviewQueue } from '../review/service'
import { SCOPE_READ } from './config'
import { defineTool, isoDate, uuid } from './kit'

const MONEY_NOTE = 'Tiền là số nguyên VND (8450000 = 8.450.000đ).'

export const listAppointmentsTool = defineTool({
  name: 'lindy_list_appointments',
  title: 'Danh sách lịch hẹn',
  description:
    'Lịch hẹn theo khoảng ngày (from, to dạng YYYY-MM-DD, tối đa 62 ngày) hoặc theo từ khoá tên/SĐT khách (q). ' +
    'filter: active (mặc định: đang hẹn, đã đến, xong), customer_cancel (khách báo huỷ), cancelled, no_show. ' +
    'Lịch hẹn không phân thợ và không sinh doanh thu. Giờ theo Asia/Ho_Chi_Minh.',
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    filter: z.enum(LIST_FILTERS).optional(),
    q: z.string().max(100).optional(),
  }),
  run: (args, { auth }) => listAppointments(auth, args),
})

export const getAppointmentTool = defineTool({
  name: 'lindy_get_appointment',
  title: 'Chi tiết lịch hẹn',
  description: `Chi tiết một lịch hẹn (khách, SĐT đầy đủ, giờ, số khách, ghi chú, cọc nếu có, lịch sử). ${MONEY_NOTE}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ id: uuid }),
  run: async ({ id }, { auth }) => {
    limitSensitiveReads(auth.userId, `appointment:${id}`)
    return getAppointment(auth, id)
  },
})

export const listAttentionTool = defineTool({
  name: 'lindy_list_attention',
  title: 'Lịch cần chú ý',
  description:
    'Các lịch hẹn cần chú ý ngay (sắp tới giờ, quá giờ chưa đến, chưa xử lý…), như màn Lịch trong app.',
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({}),
  run: (_args, { auth }) => attentionList(auth),
})

export const listOrdersTool = defineTool({
  name: 'lindy_list_orders',
  title: 'Danh sách đơn hàng',
  description:
    'Đơn hàng theo khoảng ngày làm dịch vụ (from, to dạng YYYY-MM-DD) hoặc từ khoá (q). filter: all (mặc định), ' +
    'in_progress, awaiting_confirmation, confirmed, cancelled, unpaid. Có thể lọc theo thợ (staffId), phương thức ' +
    `thu (method: cash | transfer), review=true để chỉ lấy đơn đang Cần xem lại. Chỉ đơn Đã xác nhận vào doanh thu. ${MONEY_NOTE}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    filter: z.enum(ORDER_FILTERS).optional(),
    q: z.string().max(100).optional(),
    staffId: uuid.optional(),
    method: z.enum(['cash', 'transfer']).optional(),
    review: z.boolean().optional(),
  }),
  run: (args, { auth }) => listOrders(auth, { ...args, filter: args.filter ?? 'all', review: !!args.review }),
})

export const getOrderTool = defineTool({
  name: 'lindy_get_order',
  title: 'Chi tiết đơn hàng',
  description: `Chi tiết một đơn: dòng dịch vụ, thợ, giảm giá, tiền thu, trạng thái, lịch sử. ${MONEY_NOTE}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ id: uuid }),
  run: async ({ id }, { auth }) => {
    limitSensitiveReads(auth.userId, `order:${id}`)
    return getOrder(auth, id)
  },
})

export const searchCustomersTool = defineTool({
  name: 'lindy_search_customers',
  title: 'Tìm khách hàng',
  description:
    'Tìm khách theo tên hoặc SĐT (q). Không có q: khách có đơn gần đây. SĐT trong kết quả bị che; muốn xem đủ SĐT ' +
    'và lịch sử đơn thì gọi lindy_get_customer với id.',
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ q: z.string().max(100).optional() }),
  run: async ({ q }, { auth }) => {
    const text = (q ?? '').trim()
    return { items: text === '' ? await recentCustomers(auth) : await searchCustomerList(auth, text) }
  },
})

export const getCustomerTool = defineTool({
  name: 'lindy_get_customer',
  title: 'Chi tiết khách hàng',
  description: `Hồ sơ một khách: tên, SĐT đầy đủ, lịch sử đơn (để xem khách quay lại, chi tiêu). ${MONEY_NOTE}`,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({ id: uuid }),
  run: async ({ id }, { auth }) => {
    limitSensitiveReads(auth.userId, `customer:${id}`)
    return getCustomer(auth, id)
  },
})

export const reviewQueueTool = defineTool({
  name: 'lindy_review_queue',
  title: 'Cần xem lại',
  description:
    'Danh sách Cần xem lại của Chủ: đơn, phiếu ưu đãi, phiếu hoàn, cọc, phiếu chi, chốt quỹ đang chờ xem. ' +
    MONEY_NOTE,
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({}),
  run: (_args, { auth }) => reviewQueue(auth),
})

export const READ_OPS_TOOLS = [
  listAppointmentsTool,
  getAppointmentTool,
  listAttentionTool,
  listOrdersTool,
  getOrderTool,
  searchCustomersTool,
  getCustomerTool,
  reviewQueueTool,
]
