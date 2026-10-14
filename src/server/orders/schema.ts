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

// Ưu đãi bù khiếu nại chỉ áp được từ phiếu xử lý (bước 2.18): cả bill, đúng % của phiếu, server kiểm phiếu.
export const DiscountSchema = z
  .strictObject({
    scope: z.union([z.literal('order'), z.number().int().min(0).max(29)]),
    kind: z.enum(['preset_5', 'preset_10', 'birthday', 'manual', 'complaint_compensation']),
    percent: z.number().int().min(1).max(100).nullable().optional(),
    amount: money.nullable().optional(),
    reason: shortText,
    ticketId: z.uuid().nullable().optional(),
  })
  .refine(
    (d) => (d.kind === 'complaint_compensation') === !!d.ticketId,
    'Ưu đãi bù khiếu nại cần phiếu xử lý.',
  )
  .refine(
    (d) => d.kind !== 'complaint_compensation' || d.scope === 'order',
    'Ưu đãi bù khiếu nại áp cho cả bill.',
  )

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

export const UpdateOrderBody = z.strictObject({
  version,
  ...content,
  /** Bắt buộc khi sửa đơn đã xác nhận (D04, bước 2.19). */
  adjustReason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự.').nullable().optional(),
})
export type UpdateOrderInput = z.infer<typeof UpdateOrderBody>
export type OrderContentInput = Pick<UpdateOrderInput, 'customerId' | 'serviceDate' | 'items' | 'discounts'>

export const VersionBody = z.strictObject({ version })
export const CancelOrderBody = z.strictObject({
  version,
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ đơn.').max(500, 'Lý do tối đa 500 ký tự.'),
})

// Tip giữ hộ (Q15, Đợt 3): số tip và cách chia; bỏ trống cách chia = theo phần tiền từng thợ
const tip = z.strictObject({
  amount: z.number().int('Số tiền phải là số nguyên.').min(1, 'Số tip phải lớn hơn 0.').max(10_000_000),
  split: z
    .array(z.strictObject({ userId: z.uuid(), amount: z.number().int().min(0).max(10_000_000) }))
    .max(4, 'Tip chia tối đa 4 thợ.')
    .nullable()
    .optional(),
})

export const PaymentBody = z.strictObject({
  idempotencyKey: z.uuid('Thiếu mã thu tiền.'),
  amount: z.number().int('Số tiền phải là số nguyên.').min(1, 'Số tiền phải lớn hơn 0.').max(100_000_000),
  method: z.enum(['cash', 'transfer']),
  tip: tip.nullable().optional(),
})

export const TipBody = tip.extend({ idempotencyKey: z.uuid('Thiếu mã ghi tip.') })
export const VoidTipBody = z.strictObject({
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ tip.').max(500),
})
export const PayTipsBody = z.strictObject({
  branchId: z.uuid().optional(),
  staffUserId: z.uuid(),
  idempotencyKey: z.uuid('Thiếu mã trả tip.'),
})

// Phiếu hoàn (K18, Đợt 3)
export const RefundBody = z.strictObject({
  idempotencyKey: z.uuid('Thiếu mã phiếu hoàn.'),
  amount: z.number().int('Số tiền phải là số nguyên.').min(1, 'Số hoàn phải lớn hơn 0.').max(100_000_000),
  method: z.enum(['cash', 'transfer']),
  reason: z.string().trim().min(1, 'Cần ghi lý do hoàn tiền.').max(500, 'Tối đa 500 ký tự.'),
})

export const VoidPaymentBody = z.strictObject({
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ khoản thu.').max(500),
})

// Phiếu xử lý dịch vụ (bước 2.18)
export const TicketBody = z
  .strictObject({
    issue: z.string().trim().min(1, 'Ghi vấn đề khách gặp.').max(500, 'Tối đa 500 ký tự.'),
    cause: z.enum(['technical', 'customer_change']),
    outcome: z.enum(['free_fix', 'charged', 'compensation']),
    repairedBy: z.uuid().nullable().optional(),
    compensationPercent: z
      .number()
      .int()
      .min(10, 'Ưu đãi từ 10%.')
      .max(20, 'Ưu đãi tối đa 20%.')
      .nullable()
      .optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (t) => (t.outcome === 'compensation') === (t.compensationPercent != null),
    'Chọn mức ưu đãi 10–20%.',
  )

export const VoidTicketBody = z.strictObject({
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ phiếu.').max(500),
})

// Tạo đơn từ lịch (S06): tên, SĐT từng khách đi cùng (khách 2–4); để trống thì ghi "Khách đi cùng …"
export const FromAppointmentBody = z.strictObject({
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
  guests: z
    .array(
      z.strictObject({
        guestNo: z.number().int().min(2).max(4),
        name: z.string().trim().max(100, 'Tên tối đa 100 ký tự.').nullable().optional(),
        phone: z.string().max(40, 'SĐT quá dài.').nullable().optional(),
      }),
    )
    .max(3)
    .optional(),
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
