// Kiểm đầu vào API khách. strict: trường lạ → 422.
import { z } from 'zod'

export const CustomerBody = z.strictObject({
  name: z.string().trim().min(1, 'Nhập tên khách.').max(100, 'Tên tối đa 100 ký tự.'),
  phone: z.string().max(40, 'SĐT quá dài.').nullable().optional(),
})
