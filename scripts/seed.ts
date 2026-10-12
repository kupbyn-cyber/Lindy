// Tạo dữ liệu nền cho DB dev. Mật khẩu tài khoản mẫu ghi vào .local/tai-khoan-mau.txt, không in ra màn hình [P14].
//   bun scripts/seed.ts
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { loadEnv, ROOT, requireEnv } from './lib/env'
import { seedBooking } from './lib/seed-booking'
import { seedCore } from './lib/seed-core'

loadEnv()
const sql = postgres(requireEnv('MIGRATE_DATABASE_URL'), { onnotice: () => {}, max: 1 })
try {
  const res = await sql.begin((tx) => seedCore(tx as unknown as postgres.Sql))
  await sql.begin((tx) => seedBooking(tx as unknown as postgres.Sql, res.branchIds))
  const fresh = Object.entries(res.users).filter(([, u]) => u.password)
  if (fresh.length > 0) {
    const dir = join(ROOT, '.local')
    if (!existsSync(dir)) mkdirSync(dir)
    const lines = fresh.map(([key, u]) => `${key}@lindy.test\t${u.password}`)
    appendFileSync(
      join(dir, 'tai-khoan-mau.txt'),
      `# Tài khoản mẫu local, tạo ${new Date().toISOString()}\n${lines.join('\n')}\n`,
    )
    console.log(`Đã tạo ${fresh.length} tài khoản mẫu. Mật khẩu ở .local/tai-khoan-mau.txt.`)
  } else {
    console.log('Dữ liệu nền đã có, không tạo thêm tài khoản.')
  }
} finally {
  await sql.end()
}
