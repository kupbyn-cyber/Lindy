// Kiểm đầu vào API sổ tiền. Schema strict: trường lạ → 422. Số tiền là số nguyên VND.
import { z } from 'zod'
import { isIsoDate } from '~/lib/time'
import { ACCOUNT_NO_RE, normalizeAccountNo } from '~/lib/vietqr'

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

const amount = z
  .number()
  .int('Số tiền phải là số nguyên.')
  .min(1, 'Số tiền phải lớn hơn 0.')
  .max(10_000_000_000)
const reason = z.string().trim().min(1, 'Cần ghi lý do.').max(500, 'Tối đa 500 ký tự.')

/** Phiếu Linh lập (3.14): thu khác, góp vốn, rút vốn (số dương), điều chỉnh (có dấu, khác 0). */
export const VoucherBody = z
  .strictObject({
    branchId: z.uuid().optional(),
    idempotencyKey: z.uuid('Thiếu mã phiếu.'),
    kind: z.enum(['other_income', 'capital_in', 'capital_out', 'adjustment']),
    incomeType: z.enum(['loan', 'supplier_refund', 'other']).nullable().optional(),
    accountId: z.uuid(),
    amount: z
      .number()
      .int('Số tiền phải là số nguyên.')
      .min(-10_000_000_000)
      .max(10_000_000_000)
      .refine((v) => v !== 0, 'Số tiền phải khác 0.'),
    reason,
  })
  .refine((v) => v.kind === 'adjustment' || v.amount > 0, 'Số tiền phải lớn hơn 0.')
  .refine((v) => (v.kind === 'other_income') === !!v.incomeType, 'Chọn loại thu khác.')

export const TransferBody = z
  .strictObject({
    branchId: z.uuid().optional(),
    idempotencyKey: z.uuid('Thiếu mã phiếu.'),
    fromAccountId: z.uuid(),
    toAccountId: z.uuid(),
    amount,
    note: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, 'Chọn hai tài khoản khác nhau.')

export const ReconcileBody = z.strictObject({
  branchId: z.uuid().optional(),
  entryIds: z
    .array(z.string().regex(/^\d{1,18}$/))
    .min(1)
    .max(200),
})

export const CloseDayBody = z.strictObject({
  branchId: z.uuid().optional(),
  date: isoDate,
  counted: z.number().int('Số tiền phải là số nguyên.').min(0, 'Số tiền không âm.').max(10_000_000_000),
  reason: z.string().trim().max(500).nullable().optional(),
})

export const ReviewCloseBody = z.strictObject({ id: z.uuid() })

/** Tài khoản nhận chuyển khoản để vẽ QR (S26): ngân hàng (mã BIN), số tài khoản, tên chủ tài khoản. */
export const BankAccountBody = z.strictObject({
  branchId: z.uuid().optional(),
  bankBin: z.string().regex(/^[0-9]{6}$/, 'Chọn ngân hàng.'),
  accountNo: z
    .string()
    .transform(normalizeAccountNo)
    .refine((s) => ACCOUNT_NO_RE.test(s), 'Số tài khoản gồm 4–19 chữ số hoặc chữ cái, không dấu.'),
  accountName: z.string().trim().min(1, 'Nhập tên chủ tài khoản.').max(60, 'Tối đa 60 ký tự.'),
})
