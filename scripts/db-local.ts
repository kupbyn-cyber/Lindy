// PostgreSQL 16 nhúng (gói embedded-postgres) chạy trong thư mục .pgdata, cổng 5433.
// Dùng khi máy chưa cài PostgreSQL. Cài PostgreSQL thật thì chỉ cần đổi PG_ADMIN_URL trong .env.
//   bun scripts/db-local.ts init | start | stop | status
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnv, ROOT, upsertEnv } from './lib/env'

const BIN = join(ROOT, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin')
const DATA = join(ROOT, '.pgdata')
const PORT = 5433

function run(exe: string, args: string[], detach = false) {
  // pg_ctl start: postmaster thừa hưởng ống stdout nếu bắt đầu ra, làm lệnh treo — nên bỏ qua đầu ra.
  const res = spawnSync(join(BIN, exe), args, { stdio: detach ? 'ignore' : 'pipe', encoding: 'utf8' })
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

function init() {
  if (existsSync(join(DATA, 'PG_VERSION'))) {
    console.log('.pgdata đã có, bỏ qua init.')
    return
  }
  const password = randomBytes(24).toString('hex')
  const dir = mkdtempSync(join(tmpdir(), 'lindy-pg-'))
  const pwfile = join(dir, 'pw')
  writeFileSync(pwfile, password)
  try {
    const res = run('initdb.exe', [
      '-D',
      DATA,
      '-U',
      'postgres',
      `--pwfile=${pwfile}`,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ])
    if (res.code !== 0) throw new Error(`initdb lỗi:\n${res.out}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  upsertEnv({ PG_ADMIN_URL: `postgres://postgres:${password}@localhost:${PORT}/postgres` })
  console.log('Đã tạo cụm PostgreSQL 16 trong .pgdata.')
}

function status() {
  return run('pg_ctl.exe', ['status', '-D', DATA]).code === 0
}

function start() {
  if (!existsSync(join(DATA, 'PG_VERSION'))) init()
  if (status()) {
    console.log(`PostgreSQL đang chạy ở cổng ${PORT}.`)
    return
  }
  const res = run(
    'pg_ctl.exe',
    [
      'start',
      '-D',
      DATA,
      '-o',
      `-p ${PORT} -c listen_addresses=localhost`,
      '-l',
      join(DATA, 'server.log'),
      '-w',
    ],
    true,
  )
  if (res.code !== 0) throw new Error(`pg_ctl start lỗi, xem .pgdata/server.log`)
  console.log(`Đã bật PostgreSQL 16 ở cổng ${PORT}.`)
}

function stop() {
  if (!status()) {
    console.log('PostgreSQL không chạy.')
    return
  }
  const res = run('pg_ctl.exe', ['stop', '-D', DATA, '-m', 'fast', '-w'])
  if (res.code !== 0) throw new Error(`pg_ctl stop lỗi:\n${res.out}`)
  console.log('Đã tắt PostgreSQL.')
}

loadEnv()
const cmd = process.argv[2] ?? 'status'
if (cmd === 'init') init()
else if (cmd === 'start') start()
// ensure: dùng trước "bun run dev" — chỉ bật khi máy này dùng PostgreSQL nhúng (.pgdata đã có), không thì bỏ qua.
else if (cmd === 'ensure') {
  if (existsSync(join(DATA, 'PG_VERSION'))) start()
} else if (cmd === 'stop') stop()
else console.log(status() ? `PostgreSQL đang chạy ở cổng ${PORT}.` : 'PostgreSQL không chạy.')
