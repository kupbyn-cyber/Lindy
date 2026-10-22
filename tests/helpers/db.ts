import postgres from 'postgres'
import { inject } from 'vitest'

export const seed = () => inject('seed')

/** Kết nối thẳng bằng lindy_app, không SET ROLE — dùng để chứng minh bị chặn. */
export function rawAppSql() {
  return postgres(process.env.TEST_DATABASE_URL!, { onnotice: () => {}, max: 2, transform: postgres.camel })
}

/** Kết nối bằng lindy_owner — chỉ dùng để chuẩn bị dữ liệu và kiểm tra trong test. */
export function ownerSql() {
  return postgres(process.env.TEST_MIGRATE_DATABASE_URL!, {
    onnotice: () => {},
    max: 2,
    transform: postgres.camel,
  })
}

/**
 * Đưa đơn Đang làm sang Chờ xác nhận như đơn có từ trước S41 (nay Làm xong là xác nhận luôn; chỉ đơn còn giảm giá
 * chờ duyệt mới dừng ở Chờ xác nhận). Dùng cho test cần đơn Chờ xác nhận mà không muốn đổi số tiền.
 */
export async function toAwaiting(owner: postgres.Sql, orderId: string) {
  await owner`update orders set status = 'awaiting_confirmation' where id = ${orderId} and status = 'in_progress'`
}

export async function expectPgError(p: Promise<unknown>, code: string | string[]) {
  const codes = Array.isArray(code) ? code : [code]
  try {
    await p
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (!codes.includes(err.code ?? ''))
      throw new Error(`Mong lỗi ${codes.join('/')}, nhận ${err.code}: ${err.message}`)
    return err
  }
  throw new Error(`Mong lỗi ${code} nhưng câu lệnh chạy được.`)
}
