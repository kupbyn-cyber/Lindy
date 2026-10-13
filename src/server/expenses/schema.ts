// Kiểm đầu vào API đề nghị chi. Schema strict: trường lạ (status, approved_by, required_level…) → 422.
import { z } from 'zod'

const version = z.number().int().min(1)

export const ExpenseBody = z.strictObject({
  branchId: z.uuid().optional(),
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
  categoryCode: z.string().regex(/^[a-z_]{2,30}$/, 'Chọn nhóm chi.'),
  amount: z
    .number()
    .int('Số tiền phải là số nguyên.')
    .min(1, 'Số tiền phải lớn hơn 0.')
    .max(100_000_000, 'Một phiếu tối đa 100.000.000đ.'),
  note: z.string().trim().min(1, 'Ghi nội dung chi.').max(300, 'Tối đa 300 ký tự.'),
})

export const ExpenseActionBody = z.strictObject({
  version,
  reason: z.string().trim().max(500, 'Tối đa 500 ký tự.').nullable().optional(),
  /** "Đã chi": chi từ tiền mặt hay chuyển khoản */
  method: z.enum(['cash', 'transfer']).nullable().optional(),
})

export const EXPENSE_FILTERS = ['pending', 'approved', 'paid', 'closed', 'all'] as const
export type ExpenseFilter = (typeof EXPENSE_FILTERS)[number]
