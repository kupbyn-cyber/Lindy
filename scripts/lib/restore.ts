// Khôi phục thử một bản sao lưu vào DB tạm ở máy (Đợt 5A, bước 5.6; test 19): dựng DB cùng phiên bản migration, tắt
// trigger (session_replication_role = replica, cần quyền superuser của PostgreSQL local), nạp từng bảng, đặt lại bộ đếm,
// rồi so với tóm tắt trong bản sao lưu (số dòng từng bảng, số dư từng tài khoản, doanh thu từng tháng). Xoá DB tạm khi xong.
// Chỉ dùng PostgreSQL local; không bao giờ chạy vào DB thật.
import postgres from 'postgres'
import type { BackupDump } from '../../src/server/export/backup'
import { migrateUp, readMigrations } from '../../src/server/ops/migrations'
import { assertDisposableDb } from './db-guard'

const DB = 'lindy_restore_check'
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/

export type RestoreResult = { ok: boolean; problems: string[]; tables: number; rows: number }

export async function restoreCheck(
  adminUrl: string,
  dump: BackupDump,
  log: (m: string) => void = () => {},
): Promise<RestoreResult> {
  if (dump.format !== 'lindy-backup-1') throw new Error('Không phải bản sao lưu LINDY OS.')
  const latest = readMigrations().at(-1)!.version
  if (dump.migration !== latest)
    throw new Error(
      `Bản sao lưu ở migration ${dump.migration}, mã nguồn ở ${latest}. Dùng đúng phiên bản app.`,
    )
  const u = new URL(adminUrl)
  u.pathname = `/${DB}`
  const url = u.toString()
  assertDisposableDb(url, ['_check'])
  const root = postgres(adminUrl, { max: 1, onnotice: () => {} })
  const problems: string[] = []
  let rows = 0
  try {
    await root.unsafe(`drop database if exists ${DB} with (force)`)
    await root.unsafe(`create database ${DB}`)
    await migrateUp(url, () => {})
    log(`Đã dựng DB tạm ${DB} (migration ${latest}).`)
    const db = postgres(url, { max: 1, onnotice: () => {} })
    try {
      const tables = (
        await db<{ name: string }[]>`
          select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`
      ).map((t) => t.name)
      const identity = await db<{ table: string; col: string }[]>`
        select c.relname as table, a.attname as col from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and a.attidentity <> '' and not a.attisdropped`
      const names = Object.keys(dump.tables)
      for (const t of names) if (!tables.includes(t)) problems.push(`Bảng ${t} không có trong DB mới.`)
      await db.begin(async (tx) => {
        await tx.unsafe('set local session_replication_role = replica')
        // Xoá dữ liệu nền do migration nạp sẵn để nạp đúng bản sao lưu
        await tx.unsafe(
          `truncate ${tables
            .filter((t) => IDENT.test(t))
            .map((t) => `public.${t}`)
            .join(', ')}`,
        )
        for (const t of names) {
          if (!IDENT.test(t) || !tables.includes(t)) continue
          const data = dump.tables[t]!
          if (data.length === 0) continue
          const override = identity.some((i) => i.table === t) ? 'overriding system value' : ''
          await tx.unsafe(
            `insert into public.${t} ${override} select * from jsonb_populate_recordset(null::public.${t}, $1::text::jsonb)`,
            [JSON.stringify(data)],
          )
          rows += data.length
        }
        for (const i of identity) {
          if (!IDENT.test(i.table) || !IDENT.test(i.col)) continue
          await tx.unsafe(
            `select setval(pg_get_serial_sequence('public.${i.table}', '${i.col}'), coalesce(max(${i.col}), 1),
                           max(${i.col}) is not null) from public.${i.table}`,
          )
        }
      })
      log(`Đã nạp ${rows} dòng của ${names.length} bảng.`)

      // So với tóm tắt lúc sao lưu
      for (const [t, count] of Object.entries(dump.summary.counts)) {
        if (!IDENT.test(t) || !tables.includes(t)) continue
        const [c] = await db.unsafe<{ n: number }[]>(`select count(*)::int as n from public.${t}`)
        if (c!.n !== count) problems.push(`Bảng ${t}: sao lưu ${count} dòng, khôi phục ${c!.n} dòng.`)
      }
      const balances = await db<{ id: string; s: string }[]>`
        select money_account_id as id, sum(amount) as s from money_ledger_entries group by money_account_id`
      for (const [id, s] of Object.entries(dump.summary.balances)) {
        const got = balances.find((b) => b.id === id)
        if (Number(got?.s ?? 0) !== Number(s)) problems.push(`Số dư tài khoản ${id} lệch.`)
      }
      const revenue = await db<{ m: string; s: string }[]>`
        select to_char(service_date, 'YYYY-MM') as m, sum(net_amount) as s from orders
        where status = 'confirmed' group by 1`
      for (const [m, s] of Object.entries(dump.summary.revenueByMonth)) {
        const got = revenue.find((r) => r.m === m)
        if (Number(got?.s ?? 0) !== Number(s)) problems.push(`Doanh thu tháng ${m} lệch.`)
      }
    } finally {
      await db.end()
    }
  } finally {
    await root.unsafe(`drop database if exists ${DB} with (force)`)
    await root.end()
  }
  return { ok: problems.length === 0, problems, tables: Object.keys(dump.tables).length, rows }
}
