// Sao lưu và khôi phục (Đợt 5A, bước 5.6): PRD §18 test 19; S65, S66 (kế hoạch Đợt 5 mục 10.2).
// Khôi phục thử cần PG_ADMIN_URL (PostgreSQL local, superuser) — có sẵn khi dựng bằng "bun run db:setup".
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { restoreCheck } from '../../scripts/lib/restore'
import { closeSql } from '../../src/server/db/client'
import { type BackupDump, backupDump, resetBackupLimit } from '../../src/server/export/backup'
import { AppError } from '../../src/server/http/errors'
import { type SeedKey, sessionOf } from '../helpers/auth'
import { ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
const S: Partial<Record<SeedKey, Awaited<ReturnType<typeof sessionOf>>>> = {}

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'trang'] as const) S[k] = await sessionOf(k)
  resetBackupLimit()
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})

const htk = () => seed().branchIds.HTK!

describe('5.6 — sao lưu, khôi phục (PRD 19)', () => {
  it('S65, S66: chỉ Linh tải; không có mật khẩu, phiên, đăng ký push; có audit; tải liền nhau bị chặn', async () => {
    for (const k of ['nhung', 'trang'] as const) {
      const e = await backupDump(S[k]!.auth, htk()).catch((x) => x)
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).status).toBe(403)
    }
    const { filename, json } = await backupDump(S.linh!.auth, htk())
    const dump = JSON.parse(json) as BackupDump
    expect(filename).toMatch(/^lindy-sao-luu-\d{4}-\d{2}-\d{2}\.json$/)
    expect(dump.format).toBe('lindy-backup-1')
    for (const t of [
      'user_credentials',
      'sessions',
      'login_attempts',
      'push_subscriptions',
      'notification_deliveries',
    ])
      expect(dump.tables[t]).toBeUndefined()
    const text = JSON.stringify(dump)
    for (const secret of ['password_hash', 'token_hash', 'p256dh']) expect(text).not.toContain(secret)
    expect(dump.tables.orders?.length).toBe(dump.summary.counts.orders)
    const [a] = await owner<{ n: number }[]>`
      select count(*)::int as n from audit_logs where action = 'backup.downloaded' and actor_user_id = ${seed().users.linh!.id}`
    expect(a!.n).toBe(1)
    const again = await backupDump(S.linh!.auth, htk()).catch((x) => x)
    expect((again as AppError).status).toBe(429)
  })

  it.skipIf(!process.env.PG_ADMIN_URL)(
    'Khôi phục bản sao lưu vào DB tạm: số dòng, số dư, doanh thu từng tháng khớp',
    async () => {
      resetBackupLimit()
      const dump = JSON.parse((await backupDump(S.linh!.auth, htk())).json) as BackupDump
      const res = await restoreCheck(process.env.PG_ADMIN_URL!, dump)
      expect(res.problems).toEqual([])
      expect(res.ok).toBe(true)
      expect(res.rows).toBeGreaterThan(0)
    },
    120_000,
  )
})
