// Chạy migration SQL đánh số trong db/migrations (mục 0.8 kế hoạch).
//   bun scripts/migrate.ts [up|status|reset] [--test] [--confirm=<tên DB>]
// - Mỗi file chạy trong một giao dịch; lưu checksum sha256.
// - File đã chạy mà bị sửa → dừng và báo.
// - reset chỉ chạy với DB localhost tên _dev/_test, ngoài production, và phải gõ lại tên DB [P15].
import postgres from 'postgres'
import { ensureMigrationsTable as ensureTable, migrateUp, readMigrations } from '../src/server/ops/migrations'
import { assertDisposableDb } from './lib/db-guard'
import { loadEnv } from './lib/env'

export { migrateUp, readMigrations }

export async function resetDb(url: string) {
  assertDisposableDb(url)
  const sql = postgres(url, { onnotice: () => {}, max: 1 })
  try {
    await sql.unsafe(
      'drop schema if exists app cascade; drop schema if exists public cascade; create schema public;',
    )
  } finally {
    await sql.end()
  }
}

async function status(url: string) {
  const sql = postgres(url, { onnotice: () => {}, max: 1 })
  try {
    await ensureTable(sql)
    const applied = new Map(
      (
        await sql<
          { version: string; checksum: string }[]
        >`select version, checksum from public.schema_migrations`
      ).map((r) => [r.version, r.checksum]),
    )
    for (const m of readMigrations()) {
      const c = applied.get(m.version)
      const state = !c ? 'chưa chạy' : c === m.checksum ? 'đã chạy' : 'LỆCH CHECKSUM'
      console.log(`  ${m.name}: ${state}`)
    }
  } finally {
    await sql.end()
  }
}

if (import.meta.main) {
  loadEnv()
  const args = process.argv.slice(2)
  const cmd = args.find((a) => !a.startsWith('--')) ?? 'up'
  const test = args.includes('--test')
  const url = process.env[test ? 'TEST_MIGRATE_DATABASE_URL' : 'MIGRATE_DATABASE_URL']
  if (!url) throw new Error('Thiếu MIGRATE_DATABASE_URL. Chạy "bun run db:setup" trước.')
  if (cmd === 'up') await migrateUp(url)
  else if (cmd === 'status') await status(url)
  else if (cmd === 'reset') {
    const db = assertDisposableDb(url)
    const confirm = args.find((a) => a.startsWith('--confirm='))?.slice('--confirm='.length)
    if (confirm !== db) {
      console.error(
        `Xoá toàn bộ dữ liệu DB "${db}". Gõ lại: bun scripts/migrate.ts reset${test ? ' --test' : ''} --confirm=${db}`,
      )
      process.exit(1)
    }
    await resetDb(url)
    console.log(`Đã xoá sạch DB ${db}. Chạy lại migration:`)
    await migrateUp(url)
  } else {
    console.error(`Lệnh không hợp lệ: ${cmd}`)
    process.exit(1)
  }
}
