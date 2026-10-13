// Kiểm đầu vào API lịch hẹn. Mọi schema dùng strict: trường lạ (status, created_by, branch_id…) → 422 [P2].
import { z } from 'zod'
import { isHHMM, isIsoDate } from '~/lib/time'

const name = z.string().trim().min(1, 'Nhập tên khách.').max(100, 'Tên tối đa 100 ký tự.')
const phone = z.string().max(40, 'SĐT quá dài.').nullable().optional()
const date = z.string().refine(isIsoDate, 'Ngày không hợp lệ.')
const time = z.string().refine(isHHMM, 'Giờ không hợp lệ.')
const guests = z
  .number()
  .int('Số khách phải là số nguyên.')
  .min(1, 'Ít nhất 1 khách.')
  .max(4, 'Một lịch tối đa 4 khách.') // K05
const service = z.string().trim().max(200, 'Dịch vụ dự kiến tối đa 200 ký tự.').nullable().optional()
const notes = z.string().trim().max(1000, 'Ghi chú tối đa 1.000 ký tự.').nullable().optional()
const version = z.number().int().min(1)
const reason = z.string().trim().max(500, 'Lý do tối đa 500 ký tự.')

// Hồ sơ khách có sẵn (module §10); không chọn thì chỉ lưu tên hiển thị
const customerId = z.uuid().nullable().optional()

export const CreateBody = z.strictObject({
  branchId: z.uuid().optional(),
  customerId,
  customerDisplayName: name,
  phone,
  date,
  startTime: time,
  endTime: time,
  guestCount: guests,
  serviceSummary: service,
  notes,
  confirm: z.boolean().optional(),
  createRequestId: z.uuid('Thiếu mã yêu cầu.'),
})
export type CreateInput = z.infer<typeof CreateBody>

export const UpdateBody = z.strictObject({
  version,
  customerId,
  customerDisplayName: name.optional(),
  phone,
  date: date.optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  guestCount: guests.optional(),
  serviceSummary: service,
  notes,
})
export type UpdateInput = z.infer<typeof UpdateBody>

export const VersionBody = z.strictObject({ version })
export const CancelBody = z.strictObject({ version, reason: reason.optional() })
export const ReportCancelBody = z.strictObject({ version, note: reason.optional() })

export const CheckBody = z.strictObject({
  branchId: z.uuid().optional(),
  date,
  startTime: time,
  endTime: time,
  phone,
  excludeId: z.uuid().optional(),
})

export const SettingsBody = z.strictObject({
  branchId: z.uuid().optional(),
  openTime: time,
  closeTime: time,
  defaultDurationMin: z.number().int().min(15, 'Ít nhất 15 phút.').max(720, 'Tối đa 720 phút.'),
})

export const LIST_FILTERS = [
  'active',
  'pending',
  'confirmed',
  'customer_cancel',
  'cancelled',
  'no_show',
] as const
export type ListFilter = (typeof LIST_FILTERS)[number]
