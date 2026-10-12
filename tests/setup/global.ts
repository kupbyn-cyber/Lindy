// Dựng lại DB test trước mỗi lần chạy: chỉ chấp nhận localhost và tên _test [P15].
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'
import { assertDisposableDb } from '../../scripts/lib/db-guard'
import { seedBooking } from '../../scripts/lib/seed-booking'
import { seedCore } from '../../scripts/lib/seed-core'
import { migrateUp, resetDb } from '../../scripts/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    seed: {
      branchIds: Record<string, string>
      users: Record<string, { id: string; email: string; password: string }>
    }
  }
}

export default async function setup(project: TestProject) {
  const ownerUrl = process.env.TEST_MIGRATE_DATABASE_URL
  const appUrl = process.env.TEST_DATABASE_URL
  if (!ownerUrl || !appUrl)
    throw new Error('Thiếu TEST_DATABASE_URL / TEST_MIGRATE_DATABASE_URL. Chạy "bun run db:setup".')
  assertDisposableDb(ownerUrl, ['_test'])
  assertDisposableDb(appUrl, ['_test'])
  process.env.PASSWORD_HASH_N = '1024'

  await resetDb(ownerUrl)
  await migrateUp(ownerUrl, () => {})

  const passwords: Record<string, string> = {}
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'])
    passwords[k] = `Test-${randomBytes(6).toString('hex')}`
  const sql = postgres(ownerUrl, { onnotice: () => {}, max: 1 })
  try {
    const res = await seedCore(sql, { withSecondBranch: true, passwords })
    await seedBooking(sql, res.branchIds)
    const users: Record<string, { id: string; email: string; password: string }> = {}
    for (const [key, u] of Object.entries(res.users)) {
      users[key] = { id: u.id, email: `${key}@lindy.test`, password: passwords[key]! }
    }
    project.provide('seed', { branchIds: res.branchIds, users })
  } finally {
    await sql.end()
  }
}
