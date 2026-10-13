// Kiểm đầu vào API đơn hàng. Mọi schema strict: trường lạ (status, confirmed_by, branch_id, tổng tiền…) → 422 [P27].
// Máy chỉ gửi lựa chọn (dịch vụ, số lượng, giá áp dụng, thợ, khoản giảm); mọi số tiền do server tính [P26].
import { z } from 'zod'
import { isIsoDate } from '~/lib/time'

const money = z.number().int('Số tiền phải là số nguyên.').min(1, 'Số tiền phải lớn hơn 0.').max(10_000_000)
const shortText = z.string().trim().max(200, 'Tối đa 200 ký tự.').nullable().optional()
const version = z.number().int().min(1)

const staff = z
  .array(
    z.strictObject({
      userId: z.uuid(),
      amount: z.number().int().min(0).max(10_000_000).nullable().optional(),
    }),
  )
  .max(4, 'Một dòng tối đa 4 thợ.')

const common = { staff, unallocatedReason: shortText }

export const ItemSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('service'),
    serviceId: z.uuid(),
    quantity: z.number().int().min(1, 'Số lượng ít nhất 1.').max(20, 'Số lượng tối đa 20.'),
    unitPrice: money.nullable().optional(),
    belowReason: shortText,
    ...common,
  }),
  z.strictObject({ type: z.literal('combo'), comboId: z.uuid(), ...common }),
  z.strictObject({
    type: z.literal('surcharge'),
    name: z.string().trim().min(1, 'Nhập tên phụ thu.').max(100),
    amount: money,
    ...common,
  }),
  z.strictObject({
    type: z.literal('custom'),
    name: z.string().trim().min(1, 'Nhập tên dịch vụ.').max(100),
    amount: money,
    ...common,
  }),
])

// Ưu đãi bù khiếu nại đi kèm phiếu xử lý bảo hành (bước 2.18), chưa nhận ở đây.
export const DiscountSchema = z.strictObject({
  scope: z.union([z.literal('order'), z.number().int().min(0).max(29)]),
  kind: z.enum(['preset_5', 'preset_10', 'birthday', 'manual']),
  percent: z.number().int().min(1).max(100).nullable().optional(),
  amount: money.nullable().optional(),
  reason: shortText,
})

const content = {
  customerId: z.uuid().nullable(),
  serviceDate: z.string().refine(isIsoDate, 'Ngày làm dịch vụ không hợp lệ.'),
  items: z.array(ItemSchema).max(30, 'Một đơn tối đa 30 dòng.'),
  discounts: z.array(DiscountSchema).max(20, 'Một đơn tối đa 20 khoản giảm.'),
}

export const CreateOrderBody = z.strictObject({
  branchId: z.uuid().optional(),
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
  ...content,
})
export type CreateOrderInput = z.infer<typeof CreateOrderBody>

export const UpdateOrderBody = z.strictObject({ version, ...content })
export type UpdateOrderInput = z.infer<typeof UpdateOrderBody>
export type OrderContentInput = Pick<UpdateOrderInput, 'customerId' | 'serviceDate' | 'items' | 'discounts'>

export const VersionBody = z.strictObject({ version })
export const CancelOrderBody = z.strictObject({
  version,
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ đơn.').max(500, 'Lý do tối đa 500 ký tự.'),
})

export const PaymentBody = z.strictObject({
  idempotencyKey: z.uuid('Thiếu mã thu tiền.'),
  amount: z.number().int('Số tiền phải là số nguyên.').min(1, 'Số tiền phải lớn hơn 0.').max(100_000_000),
  method: z.enum(['cash', 'transfer']),
})

export const VoidPaymentBody = z.strictObject({
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ khoản thu.').max(500),
})

export const FromAppointmentBody = z.strictObject({
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
  additional: z.boolean().optional(),
})

export const ORDER_FILTERS = [
  'all',
  'in_progress',
  'awaiting_confirmation',
  'confirmed',
  'cancelled',
  'unpaid',
] as const
export type OrderFilter = (typeof ORDER_FILTERS)[number]
