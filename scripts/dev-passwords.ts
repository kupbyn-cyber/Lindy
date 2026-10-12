// CHỈ DÙNG Ở LOCAL: đặt mật khẩu cố định cho 4 tài khoản mẫu @lindy.test để thử giao diện.
// Chỉ chạy trên DB localhost tên _dev [P15]. Không bao giờ dùng cho tài khoản thật.
//   bun scripts/dev-passwords.ts
import postgres from 'postgres'
import { hashPassword } from '../src/server/auth/password'
import { assertDisposableDb } from './lib/db-guard'
import { loadEnv, requireEnv } from './lib/env'

export const DEV_PASSWORD = 'lindy-dev-2026'

loadEnv()
const url = requireEnv('MIGRATE_DATABASE_URL')
assertDisposableDb(url, ['_dev'])
const sql = postgres(url, { onnotice: () => {}, max: 1 })
try {
  const hash = await hashPassword(DEV_PASSWORD)
  const rows = await sql`
    update user_credentials set password_hash = ${hash}, must_change_password = false
    where user_id in (select id from users where email like '%@lindy.test') returning user_id`
  await sql`delete from login_attempts`
  console.log(
    `Đã đặt mật khẩu dev cho ${rows.length} tài khoản mẫu (xem DEV_PASSWORD trong scripts/dev-passwords.ts).`,
  )
} finally {
  await sql.end()
}
