// Đọc biến môi trường theo từng lần gọi (không đọc ở cấp module để không lọt vào bundle trình duyệt) [P14].
import { existsSync } from 'node:fs'

let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  if (process.env.NODE_ENV !== 'production' && existsSync('.env')) process.loadEnvFile('.env')
}

export function env(name: string): string | undefined {
  ensureLoaded()
  return process.env[name]
}

export function requiredEnv(name: string): string {
  const value = env(name)
  if (!value) throw new Error(`Thiếu biến môi trường ${name}.`)
  return value
}
