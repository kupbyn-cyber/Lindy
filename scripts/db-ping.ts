// Kiểm kết nối bằng lindy_app và chứng minh lindy_app không đọc thẳng được bảng [P4].
import postgres from 'postgres'
import { loadEnv, requireEnv } from './lib/env'

loadEnv()
const sql = postgres(requireEnv('DATABASE_URL'), { onnotice: () => {}, max: 1 })
try {
  const [r] = await sql<{ v: string }[]>`select current_user as v`
  console.log(`Kết nối được bằng ${r?.v}.`)
  try {
    await sql`select 1 from public.users limit 1`
    console.error('LỖI: lindy_app đọc thẳng được bảng users.')
    process.exitCode = 1
  } catch {
    console.log('lindy_app không đọc thẳng được bảng (đúng thiết kế).')
  }
} finally {
  await sql.end()
}
