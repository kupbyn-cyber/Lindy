// Kiểm đầu vào API nhân viên (Đợt 4A, bước 4.2–4.3). Schema strict: trường lạ → 422.
import { z } from 'zod'
import { isIsoDate } from '~/lib/time'

const isoDate = (msg: string) => z.string().refine(isIsoDate, msg)
// Q36, test 40: chính sách chỉ có hiệu lực từ ngày 1 của tháng
const firstOfMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, 'Chính sách lương chỉ có hiệu lực từ ngày 1 của tháng.')
const money = (msg: string) => z.number().int(msg).min(0, msg).max(1_000_000_000, msg)
const bps = z.number().int('Phần trăm tối đa 2 chữ số thập phân.').min(0).max(10_000)

export const ProfileBody = z.strictObject({
  branchId: z.uuid().optional(),
  userId: z.uuid(),
  startDate: isoDate('Chọn ngày vào làm.'),
  endDate: isoDate('Ngày nghỉ việc không hợp lệ.').nullable(),
  payMethod: z.enum(['cash', 'transfer'], 'Chọn cách nhận lương.'),
})

export const PolicyBody = z.strictObject({
  branchId: z.uuid().optional(),
  userId: z.uuid(),
  effectiveMonth: firstOfMonth,
  baseSalary: money('Lương cứng không hợp lệ.'),
  /** 2500 = 25% */
  commissionBps: bps,
  leaveDays: z
    .number()
    .int()
    .min(0, 'Ngày nghỉ được hưởng từ 0 đến 15.')
    .max(15, 'Ngày nghỉ được hưởng từ 0 đến 15.'),
  managerKpi: z.boolean(),
  reason: z.string().trim().max(300, 'Tối đa 300 ký tự.').nullable().optional(),
})

export const KpiBody = z.strictObject({
  branchId: z.uuid().optional(),
  effectiveMonth: firstOfMonth,
  tier1Min: money('Mốc bậc 1 không hợp lệ.').refine((v) => v > 0, 'Mốc bậc 1 phải lớn hơn 0.'),
  tier1Bps: bps,
  tier2Min: money('Mốc bậc 2 không hợp lệ.'),
  tier2Bps: bps,
})

export const SettingsBody = z.strictObject({
  branchId: z.uuid().optional(),
  startMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, 'Chọn tháng.')
    .nullable(),
})
