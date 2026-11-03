// Kiểm đầu vào API chấm công, đơn nghỉ, ngày đóng cửa (Đợt 4A). Schema strict: trường lạ (giờ vào ca, người duyệt…) → 422.
import { z } from 'zod'
import { isIsoDate } from '~/lib/time'

const isoDate = (msg: string) => z.string().refine(isIsoDate, msg)
const note = z.string().trim().max(300, 'Tối đa 300 ký tự.').nullable().optional()

export const BranchBody = z.strictObject({ branchId: z.uuid().optional() })

export const DecideBody = z.strictObject({
  branchId: z.uuid().optional(),
  userId: z.uuid(),
  date: isoDate('Chọn ngày.'),
  status: z.enum(['worked', 'leave', 'unexcused'], 'Chọn Đi làm, Nghỉ có phép hoặc Nghỉ không phép.'),
  note,
})

export const ApproveAllBody = z.strictObject({
  branchId: z.uuid().optional(),
  date: isoDate('Chọn ngày.'),
})

export const LeaveBody = z.strictObject({
  branchId: z.uuid().optional(),
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
  fromDate: isoDate('Chọn từ ngày.'),
  toDate: isoDate('Chọn đến ngày.'),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ.')
    .nullable()
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ.')
    .nullable()
    .optional(),
  reason: z.string().trim().min(1, 'Ghi lý do nghỉ.').max(300, 'Tối đa 300 ký tự.'),
})

export const LeaveActionBody = z.strictObject({
  version: z.number().int().min(1),
  note,
})

export const ClosedDaysBody = z.strictObject({
  branchId: z.uuid().optional(),
  fromDate: isoDate('Chọn từ ngày.'),
  toDate: isoDate('Chọn đến ngày.'),
  reason: z.string().trim().min(1, 'Ghi lý do đóng cửa.').max(200, 'Tối đa 200 ký tự.'),
})
