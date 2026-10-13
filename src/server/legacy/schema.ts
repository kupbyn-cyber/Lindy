// Kiểm đầu vào API nhập dữ liệu cũ (Đợt 5B). Schema strict.
import { z } from 'zod'

const col = z.number().int().min(0).max(199)

export const MappingBody = z.strictObject({
  /** Dòng tiêu đề (đếm từ 1) */
  headerRow: z.number().int().min(1).max(50),
  /** Tháng của tab "YYYY-MM": cho ngày chỉ có số ngày, và để báo ngày ngoài tháng */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  date: col,
  customer: col.nullable(),
  phone: col.nullable(),
  note: col.nullable(),
  total: col.nullable(),
  /** Cột tiền của từng thợ; userId null = thợ không có tài khoản (giữ tên cột) */
  staff: z.array(z.strictObject({ col, userId: z.uuid().nullable() })).max(30),
})

export type Mapping = z.infer<typeof MappingBody>

const MAX_TEXT = 2_000_000

export const AnalyzeBody = z.strictObject({
  branchId: z.uuid().optional(),
  fileName: z.string().trim().min(1).max(200),
  text: z.string().min(1, 'File trống.').max(MAX_TEXT, 'File quá lớn (tối đa 2MB). Xuất từng tab tháng.'),
  headerRow: z.number().int().min(1).max(50).optional(),
  mapping: MappingBody.optional(),
})

export const ImportBody = z.strictObject({
  branchId: z.uuid().optional(),
  fileName: z.string().trim().min(1).max(200),
  label: z.string().trim().max(100).nullable().optional(),
  text: z.string().min(1).max(MAX_TEXT),
  mapping: MappingBody,
})

export const CancelBody = z.strictObject({
  reason: z.string().trim().min(1, 'Cần ghi lý do huỷ lần nhập.').max(300),
})

export const LEGACY_MAX_BODY = MAX_TEXT + 64 * 1024
