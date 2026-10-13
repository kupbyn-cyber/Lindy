// Luật lint riêng [P13]: cấm sql.unsafe ngoài db/ và scripts/migrate.ts.
// SQL động là đường duy nhất để chèn câu truy vấn; mọi truy vấn trong app dùng tagged template.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
// Chỉ mã dựng DB được dùng SQL động: chạy file migration, tạo role (tên role là hằng số, mật khẩu đã kiểm
// chỉ gồm ký tự an toàn). Không file nào trong danh sách nhận dữ liệu do người dùng app gửi lên.
const allowed = new Set([
  'scripts/migrate.ts',
  'scripts/db-bootstrap.ts',
  'scripts/check-upgrade.ts',
  'scripts/lint-sql.ts',
  'src/server/ops/migrations.ts',
  'src/server/ops/release.ts',
  'tests/setup/global.ts',
  'tests/integration/release.test.ts',
])
const scanDirs = ['src', 'scripts', 'tests']
const pattern = /\.unsafe\s*\(/

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
}

const files: string[] = []
for (const d of scanDirs) {
  try {
    walk(join(root, d), files)
  } catch {
    // thư mục chưa có
  }
}

const violations: string[] = []
for (const file of files) {
  const rel = relative(root, file).replaceAll('\\', '/')
  if (allowed.has(rel)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (pattern.test(line)) violations.push(`${rel}:${i + 1}: cấm dùng sql.unsafe ngoài migration`)
  })
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exit(1)
}
console.log(`lint-sql: ${files.length} file, không có sql.unsafe.`)
