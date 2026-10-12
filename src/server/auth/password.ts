// Băm mật khẩu bằng scrypt có sẵn của Node [P23]. Lưu tham số cùng hash để nâng sau.
// Định dạng: scrypt$N$r$p$salt(base64url)$hash(base64url)
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { env } from '../env'

const KEYLEN = 32

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password.normalize('NFKC'),
      salt,
      KEYLEN,
      { N, r, p, maxmem: 256 * N * r + 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    )
  })
}

function cost() {
  // Test có thể hạ chi phí qua PASSWORD_HASH_N để chạy nhanh; mặc định 2^17.
  const n = Number(env('PASSWORD_HASH_N') ?? 131072)
  return Number.isInteger(n) && n >= 1024 ? n : 131072
}

export async function hashPassword(password: string): Promise<string> {
  const N = cost()
  const r = 8
  const p = 1
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, N, r, p)
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string]
  const expected = Buffer.from(hashB64, 'base64url')
  const key = await scrypt(password, Buffer.from(saltB64, 'base64url'), Number(n), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

let dummyHash: Promise<string> | undefined
/** Hash giả dùng khi không có tài khoản, để thời gian trả lời như nhau [P8]. */
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return dummyHash
}

// Mật khẩu phổ biến bị chặn (K04). Danh sách ngắn, đủ chặn kiểu đặt dễ đoán nhất.
const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  '88888888',
  '66666666',
  '12341234',
  '11223344',
  '12121212',
  '123123123',
  'password',
  'password1',
  'passw0rd',
  'abc12345',
  'abcd1234',
  'qwerty123',
  'qwertyui',
  '1qaz2wsx',
  'iloveyou',
  'admin123',
  'matkhau1',
  'matkhau123',
  'lindy123',
  'lindyos1',
  'lindy2026',
  'lindy2027',
  'anhyeuem',
  'zxcvbnm1',
  '123qweasd',
])

/** Trả về câu lỗi nếu mật khẩu không đạt K04, ngược lại null. */
export function checkPasswordPolicy(password: string): string | null {
  if (password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.'
  if (password.length > 200) return 'Mật khẩu quá dài.'
  if (COMMON.has(password.toLowerCase())) return 'Mật khẩu quá dễ đoán. Chọn mật khẩu khác.'
  if (/^(.)\1+$/.test(password)) return 'Mật khẩu quá dễ đoán. Chọn mật khẩu khác.'
  return null
}
