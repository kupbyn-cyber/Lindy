// Đọc và ghi .env cho script local. Không bao giờ in giá trị bí mật ra màn hình [P14].
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = process.cwd()
export const ENV_PATH = join(ROOT, '.env')

export function loadEnv() {
  if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH)
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Thiếu biến ${name} trong .env. Chạy "bun run db:setup" trước.`)
  return value
}

/** Thêm hoặc thay một dòng KEY=value trong .env. Chỉ in tên biến, không in giá trị. */
export function upsertEnv(entries: Record<string, string>) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : []
  for (const [key, value] of Object.entries(entries)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`))
    const line = `${key}=${value}`
    if (idx >= 0) lines[idx] = line
    else lines.push(line)
    process.env[key] = value
  }
  writeFileSync(ENV_PATH, `${lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n')}\n`)
  console.log(`Đã ghi vào .env: ${Object.keys(entries).join(', ')}`)
}
