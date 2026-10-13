// Kiểm đầu vào API tiền cọc và mùa cọc. Schema strict: trường lạ (status, confirmed_by, resolved_amount…) → 422.
import { z } from 'zod'
import { isIsoDate } from '~/lib/time'

const reason = (msg: string) => z.string().trim().min(1, msg).max(500, 'Tối đa 500 ký tự.')
const isoDate = z.string().refine(isIsoDate, 'Ngày không hợp lệ.')

export const RecordDepositBody = z.strictObject({
  idempotencyKey: z.uuid('Thiếu mã ghi cọc.'),
  amount: z
    .number()
    .int('Số tiền phải là số nguyên.')
    .min(1, 'Số tiền phải lớn hơn 0.')
    .max(10_000_000, 'Số cọc tối đa 10.000.000đ.'),
  method: z.enum(['cash', 'transfer']),
  note: z.string().trim().max(300, 'Tối đa 300 ký tự.').nullable().optional(),
})

export const DepositVersionBody = z.strictObject({ version: z.number().int().min(1) })
export const VoidDepositBody = z.strictObject({
  version: z.number().int().min(1),
  reason: reason('Cần ghi lý do huỷ khoản cọc.'),
})
export const ResolveDepositBody = z.strictObject({
  version: z.number().int().min(1),
  reason: reason('Cần ghi lý do hoàn hoặc giữ cọc.'),
  /** Hoàn cọc: chi từ tiền mặt hay chuyển khoản; bỏ trống = tài khoản đã nhận cọc */
  method: z.enum(['cash', 'transfer']).nullable().optional(),
})

export const SeasonBody = z
  .strictObject({
    branchId: z.uuid().optional(),
    id: z.uuid().nullable().optional(),
    name: z.string().trim().min(1, 'Nhập tên mùa cọc.').max(60),
    startDate: isoDate,
    endDate: isoDate,
    amountPerGuest: z.number().int().min(1000).max(10_000_000),
    refundNoticeHours: z.number().int().min(1).max(168),
    forfeitOwnerUserId: z.uuid('Chọn người nhận phần cọc bỏ hẹn.'),
    isActive: z.boolean(),
  })
  .refine((s) => s.endDate >= s.startDate, 'Ngày kết thúc phải từ ngày bắt đầu trở đi.')
