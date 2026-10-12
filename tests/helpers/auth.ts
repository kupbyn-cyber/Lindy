import { randomUUID } from 'node:crypto'
import { login } from '../../src/server/auth/login'
import { loadSession } from '../../src/server/auth/session'
import { seed } from './db'

let ipSeq = 0

export type SeedKey = 'linh' | 'nhung' | 'chin' | 'trang' | 'mai'

export async function sessionOf(key: SeedKey) {
  const u = seed().users[key]!
  const s = await login({
    identifier: u.email,
    password: u.password,
    ip: `10.9.${Math.floor(ipSeq / 200)}.${ipSeq++ % 200}`,
    userAgent: 'test',
  })
  const auth = (await loadSession(s.token))!
  return { ...s, auth, cookie: `lindy_sid=${s.token}` }
}

export const rid = () => randomUUID()
