// Chạy migration SQL đánh số trong db/migrations (mục 0.8 kế hoạch).
//   bun scripts/migrate.ts [up|status|reset] [--test] [--confirm=<tên DB>]
// - Mỗi file chạy trong một giao dịch; lưu checksum sha256.
// - File đã chạy mà bị sửa → dừng và báo.
// - reset chỉ chạy với DB localhost tên _dev/_test, ngoài production, và phải gõ lại tên DB [P15].
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { assertDisposableDb } from './lib/db-guard'
import { loadEnv, ROOT } from './lib/env'

const MIGRATIONS_DIR = join(ROOT, 'db', 'migrations')

type Migration = { version: string; name: string; sql: string; checksum: string }

export function readMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n')
      return {
        version: file.slice(0, 4),
        name: file,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    })
}

async function ensureTable(sql: postgres.Sql) {
  await sql`
    create table if not exists public.schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`
}

export async function migrateUp(url: string, log = console.log) {
  const sql = postgres(url, { onnotice: () => {}, max: 1 })
  try {
    await ensureTable(sql)
    const applied = new Map(
      (
        await sql<{ version: string; checksum: string; name: string }[]>`
        select version, checksum, name from public.schema_migrations`
      ).map((r) => [r.version, r]),
    )
    let count = 0
    for (const m of readMigrations()) {
      const done = applied.get(m.version)
      if (done) {
        if (done.checksum !== m.checksum) {
          throw new Error(
            `Migration ${m.name} đã chạy nhưng nội dung bị sửa (lệch checksum). Tạo file mới thay vì sửa.`,
          )
        }
        continue
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql)
        await tx`insert into public.schema_migrations (version, name, checksum) values (${m.version}, ${m.name}, ${m.checksum})`
      })
      log(`  ✓ ${m.name}`)
      count++
    }
    log(count === 0 ? 'Không có migration mới.' : `Đã chạy ${count} migration.`)
  } finally {
    await sql.end()
  }
}

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
