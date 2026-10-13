// Kết nối PostgreSQL. lindy_app không có quyền trực tiếp trên bảng nào [P4]:
// mọi truy vấn phải đi qua withUser (role app_user, RLS theo người) hoặc withWorker (role app_worker).
import postgres from 'postgres'
import { env } from '../env'
import { dbUnavailable } from '../http/errors'

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql

let pool: Sql | undefined

export function getSql(): Sql {
  if (!pool) {
    const url = env('DATABASE_URL')
    // Chưa có DATABASE_URL (bước chuẩn bị DB trên hosting chưa xong) → báo "Chưa kết nối được dữ liệu", không 500.
    if (!url) throw dbUnavailable()
    pool = postgres(url, {
      max: 10,
      idle_timeout: 30,
      onnotice: () => {},
      transform: postgres.camel,
    })
  }
  return pool
}

export async function closeSql() {
  const p = pool
  pool = undefined
  if (p) await p.end({ timeout: 5 })
}

/** Giao dịch dưới danh tính người dùng: SET LOCAL ROLE app_user + app.user_id. */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getSql().begin(async (tx) => {
    await tx`set local role app_user`
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  }) as Promise<T>
}

/** Giao dịch của hệ thống: đăng nhập, phiên, gửi push, việc định kỳ. */
export async function withWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getSql().begin(async (tx) => {
    await tx`set local role app_worker`
    return fn(tx)
  }) as Promise<T>
}
