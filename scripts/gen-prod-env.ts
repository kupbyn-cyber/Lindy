// Sinh bí mật cho bản chạy thật vào .local/prod-env.txt (không commit, không in ra màn hình) [P14].
// Khoá VAPID và mật khẩu role ở đây KHÁC bản local. Chạy lại sẽ không ghi đè file đã có.
//   bun scripts/gen-prod-env.ts
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import webpush from 'web-push'

const dir = join(process.cwd(), '.local')
const file = join(dir, 'prod-env.txt')
if (existsSync(file)) {
  console.log('.local/prod-env.txt đã có, giữ nguyên (xoá file nếu muốn sinh lại).')
  process.exit(0)
}
if (!existsSync(dir)) mkdirSync(dir)
const vapid = webpush.generateVAPIDKeys()
const appPassword = randomBytes(32).toString('base64url')

writeFileSync(
  file,
  `# Bí mật cho LINDY OS trên Vibe Hosting Nhân Hòa — sinh ${new Date().toISOString()}
# Dán các dòng dưới vào tab Environment của project Lindy. KHÔNG gửi file này cho ai, không commit.

LINDY_APP_PASSWORD=${appPassword}
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
`,
)
console.log('Đã ghi bí mật vào .local/prod-env.txt (3 dòng). Mở file đó để dán vào hosting.')
