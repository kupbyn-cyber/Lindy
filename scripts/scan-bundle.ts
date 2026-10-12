// S16 [P14]: quét bundle gửi cho trình duyệt (.output/public), bảo đảm không chứa giá trị bí mật nào trong .env.
// Chạy sau "bun run build". Không in giá trị bí mật, chỉ in tên biến bị lộ.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from './lib/env'

loadEnv()
const SECRET_KEYS = [
  'PG_ADMIN_URL',
  'LINDY_OWNER_PASSWORD',
  'LINDY_APP_PASSWORD',
  'DATABASE_URL',
  'MIGRATE_DATABASE_URL',
  'TEST_DATABASE_URL',
  'TEST_MIGRATE_DATABASE_URL',
  'VAPID_PRIVATE_KEY',
]
const secrets = SECRET_KEYS.map((k) => [k, process.env[k]] as const).filter(([, v]) => v && v.length >= 8)
const dir = join(process.cwd(), '.output', 'public')

function walk(d: string, out: string[]) {
  for (const n of readdirSync(d)) {
    const f = join(d, n)
    if (statSync(f).isDirectory()) walk(f, out)
    else out.push(f)
  }
}

const files: string[] = []
walk(dir, files)
const leaks: string[] = []
for (const f of files) {
  const text = readFileSync(f, 'latin1')
  for (const [k, v] of secrets) if (text.includes(v!)) leaks.push(`${k} trong ${f.slice(dir.length + 1)}`)
  if (/postgres:\/\/|VAPID_PRIVATE_KEY|lindy_owner/.test(text))
    leaks.push(`chuỗi nhạy cảm trong ${f.slice(dir.length + 1)}`)
}
if (leaks.length) {
  console.error(`LỘ BÍ MẬT:\n${leaks.join('\n')}`)
  process.exit(1)
}
console.log(
  `scan-bundle: ${files.length} file trình duyệt, không có bí mật nào (đã so ${secrets.length} giá trị).`,
)
