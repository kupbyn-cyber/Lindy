// Chạy migration SQL đánh số trong db/migrations. Dùng chung cho script local (scripts/migrate.ts)
// và bước chuẩn bị DB khi app khởi động trên hosting (ops/release.ts).
// - Mỗi file chạy trong một giao dịch; lưu checksum sha256.
// - File đã chạy mà bị sửa → dừng và báo.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

export type Migration = { version: string; name: string; sql: string; checksum: string }

export function migrationsDir() {
  return join(process.cwd(), 'db', 'migrations')
}

export function readMigrations(dir = migrationsDir()): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n')
      return {
        version: file.slice(0, 4),
        name: file,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    })
}

export async function ensureMigrationsTable(sql: postgres.Sql) {
  await sql`
    create table if not exists public.schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`
}

export async function migrateUp(url: string, log: (msg: string) => void = console.log) {
  const sql = postgres(url, { onnotice: () => {}, max: 1 })
  try {
    await ensureMigrationsTable(sql)
    // Khoá để hai tiến trình khởi động cùng lúc không chạy trùng migration.
    await sql`select pg_advisory_lock(7317001)`
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
    return count
  } finally {
    await sql.end()
  }
}
