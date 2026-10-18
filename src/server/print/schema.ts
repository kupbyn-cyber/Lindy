// Kiểm đầu vào API in bill (Đợt 7). Schema strict: trường lạ → 422.
import { z } from 'zod'

export const PrintSettingsBody = z.strictObject({
  branchId: z.uuid().optional(),
  infoLines: z.string().max(300, 'Thông tin quán tối đa 300 ký tự.'),
  thanks: z.string().max(200, 'Lời cảm ơn tối đa 200 ký tự.'),
  paperWidth: z.union([z.literal(384), z.literal(576)]),
})

export const StationBody = z.strictObject({
  branchId: z.uuid().optional(),
  name: z.string().trim().min(1, 'Đặt tên trạm in.').max(60, 'Tên tối đa 60 ký tự.'),
})

export const RevokeBody = z.strictObject({ stationId: z.uuid() })

export const PrintKeyBody = z.strictObject({ idempotencyKey: z.uuid('Thiếu mã lệnh in.') })

export const TestPrintBody = z.strictObject({
  branchId: z.uuid().optional(),
  idempotencyKey: z.uuid('Thiếu mã lệnh in.'),
})

export const AgentFinishBody = z.strictObject({
  jobId: z.uuid(),
  ok: z.boolean(),
  error: z.string().max(300).nullable().optional(),
})
