// Kiểm đầu vào API khách. strict: trường lạ → 422.
import { z } from 'zod'

const name = z.string().trim().min(1, 'Nhập tên khách.').max(100, 'Tên tối đa 100 ký tự.')
const phone = z.string().max(40, 'SĐT quá dài.').nullable().optional()

export const CustomerBody = z.strictObject({ name, phone })
export const UpdateCustomerBody = z.strictObject({ version: z.number().int().min(1), name, phone })
