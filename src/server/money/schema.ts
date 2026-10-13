// Kiểm đầu vào API sổ tiền. Schema strict: trường lạ → 422. Số tiền là số nguyên VND.
import { z } from 'zod'
import { isIsoDate } from '~/lib/time'

const isoDate = z.string().refine(isIsoDate, 'Ngày không hợp lệ.')

export const OpenBookBody = z.strictObject({
  branchId: z.uuid().optional(),
  openingDate: isoDate.refine((s) => s.endsWith('-01'), 'Ngày mở sổ phải là ngày 1 của một tháng.'),
  amounts: z
    .array(
      z.strictObject({
        accountId: z.uuid(),
        amount: z
          .number()
          .int('Số tiền phải là số nguyên.')
          .min(0, 'Số dư mở sổ không được âm.')
          .max(10_000_000_000),
      }),
    )
    .min(1)
    .max(10),
})
