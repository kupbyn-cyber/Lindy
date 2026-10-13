// Kiểm đầu vào API lương, tạm ứng (Đợt 4B). Schema strict: trường lạ (số đã trả, người duyệt…) → 422.
import { z } from 'zod'

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Chọn tháng.')
const money = (msg: string) =>
  z.number().int('Số tiền phải là số nguyên.').min(1, msg).max(1_000_000_000, 'Số tiền quá lớn.')

export const LockBody = z.strictObject({ branchId: z.uuid().optional(), month })

export const AdjustmentBody = z.strictObject({
  branchId: z.uuid().optional(),
  month,
  userId: z.uuid(),
  kind: z.enum(['bonus', 'deduction'], 'Chọn thưởng thêm hoặc khấu trừ.'),
  amount: money('Số tiền phải lớn hơn 0.'),
  reason: z.string().trim().min(1, 'Cần ghi lý do.').max(300, 'Tối đa 300 ký tự.'),
})

export const VoidAdjustmentBody = z.strictObject({
  reason: z.string().trim().max(300, 'Tối đa 300 ký tự.').nullable().optional(),
})

export const PayBody = z.strictObject({
  branchId: z.uuid().optional(),
  month,
  userId: z.uuid(),
  amount: money('Số tiền trả phải lớn hơn 0.'),
  method: z.enum(['cash', 'transfer']),
  idempotencyKey: z.uuid('Thiếu mã yêu cầu.'),
})

export const AdvanceBody = z.strictObject({
  branchId: z.uuid().optional(),
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
  amount: money('Số tiền phải lớn hơn 0.'),
  reason: z.string().trim().min(1, 'Ghi lý do tạm ứng.').max(300, 'Tối đa 300 ký tự.'),
})

export const AdvanceActionBody = z.strictObject({
  version: z.number().int().min(1),
  note: z.string().trim().max(300, 'Tối đa 300 ký tự.').nullable().optional(),
  /** "Đã chi": tiền mặt hay chuyển khoản */
  method: z.enum(['cash', 'transfer']).nullable().optional(),
})

export const ADVANCE_FILTERS = ['pending', 'approved', 'paid', 'all'] as const
export type AdvanceFilter = (typeof ADVANCE_FILTERS)[number]
