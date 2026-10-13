// Khôi phục thử bản sao lưu LINDY OS vào DB tạm ở máy và so số liệu (Đợt 5A, bước 5.6; test 19).
//   bun scripts/restore-check.ts --file=lindy-sao-luu-2026-10-13.json   (file Linh tải ở Thêm → Xuất dữ liệu)
//   bun scripts/restore-check.ts --from=dev                              (tự sao lưu DB dev rồi khôi phục thử)
// Cần PG_ADMIN_URL (PostgreSQL local, quyền superuser). Không in dữ liệu ra màn hình.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import type { BackupDump } from '../src/server/export/backup'
import { loadEnv, requireEnv } from './lib/env'
import { restoreCheck } from './lib/restore'

loadEnv()
const admin = requireEnv('PG_ADMIN_URL')
if (!['localhost', '127.0.0.1'].includes(new URL(admin).hostname))
  throw new Error('Chỉ chạy với PostgreSQL local.')
const file = process.argv.find((a) => a.startsWith('--file='))?.slice(7)
const fromDev = process.argv.includes('--from=dev')
if (!file && !fromDev) {
  console.error('Dùng: bun scripts/restore-check.ts --file=đường-dẫn.json  hoặc  --from=dev')
  process.exit(1)
}

let dump: BackupDump
if (file) {
  dump = JSON.parse(readFileSync(file, 'utf8')) as BackupDump
} else {
  // Chủ DB gọi hàm sao lưu (không cần tài khoản app)
  const dev = postgres(requireEnv('MIGRATE_DATABASE_URL'), { max: 1, onnotice: () => {} })
  try {
    const [r] = await dev<{ dump: BackupDump }[]>`select app.backup_dump() as dump`
    dump = r!.dump
  } finally {
    await dev.end()
  }
}
console.log(
  `Bản sao lưu: migration ${dump.migration}, lúc ${dump.exportedAt}, ${Object.keys(dump.tables).length} bảng.`,
)
const res = await restoreCheck(admin, dump, (m) => console.log(`  ${m}`))
for (const p of res.problems) console.log(`  ✗ ${p}`)
console.log(
  res.ok ? 'KHÔI PHỤC ĐẠT: số dòng, số dư, doanh thu từng tháng khớp bản sao lưu.' : 'KHÔI PHỤC KHÔNG ĐẠT.',
)
if (!res.ok) process.exit(1)
