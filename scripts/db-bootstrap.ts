// Tạo role và database cho LINDY trên một cụm PostgreSQL (mục 7.1 kế hoạch).
// Cần PG_ADMIN_URL (tài khoản postgres) trong .env. Chạy lại an toàn: role đã có thì giữ nguyên mật khẩu.
//   bun scripts/db-bootstrap.ts
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { loadEnv, requireEnv, upsertEnv } from './lib/env'

loadEnv()
const adminUrl = new URL(requireEnv('PG_ADMIN_URL'))
const host = adminUrl.hostname
const port = adminUrl.port || '5432'
const admin = postgres(adminUrl.toString(), { onnotice: () => {}, max: 1 })

async function roleExists(name: string) {
  const rows = await admin`select 1 from pg_roles where rolname = ${name}`
  return rows.length > 0
}

async function ensureLoginRole(name: string, envKey: string, extra = '') {
  const existing = process.env[envKey]
  if ((await roleExists(name)) && existing) return existing
  const password = randomBytes(24).toString('hex') // hex: không cần escape
  if (await roleExists(name))
    await admin.unsafe(`alter role ${name} with login password '${password}' ${extra}`)
  else await admin.unsafe(`create role ${name} with login password '${password}' ${extra}`)
  return password
}

async function ensureNoLoginRole(name: string) {
  if (!(await roleExists(name))) await admin.unsafe(`create role ${name} nologin`)
}

async function ensureDatabase(name: string) {
  const rows = await admin`select 1 from pg_database where datname = ${name}`
  if (rows.length === 0) await admin.unsafe(`create database ${name} owner lindy_owner encoding 'UTF8'`)
  await admin.unsafe(`revoke all on database ${name} from public`)
  await admin.unsafe(`grant connect, temporary on database ${name} to lindy_app`)
}

try {
  const ownerPw = await ensureLoginRole('lindy_owner', 'LINDY_OWNER_PASSWORD')
  // lindy_app: NOINHERIT và không có quyền trực tiếp trên bảng nào [P4].
  const appPw = await ensureLoginRole('lindy_app', 'LINDY_APP_PASSWORD', 'noinherit')
  await ensureNoLoginRole('app_user')
  await ensureNoLoginRole('app_worker')
  await admin.unsafe('grant app_user to lindy_app with inherit false, set true')
  await admin.unsafe('grant app_worker to lindy_app with inherit false, set true')

  await ensureDatabase('lindy_dev')
  await ensureDatabase('lindy_test')

  const url = (user: string, pw: string, db: string) => `postgres://${user}:${pw}@${host}:${port}/${db}`
  upsertEnv({
    LINDY_OWNER_PASSWORD: ownerPw,
    LINDY_APP_PASSWORD: appPw,
    DATABASE_URL: url('lindy_app', appPw, 'lindy_dev'),
    MIGRATE_DATABASE_URL: url('lindy_owner', ownerPw, 'lindy_dev'),
    TEST_DATABASE_URL: url('lindy_app', appPw, 'lindy_test'),
    TEST_MIGRATE_DATABASE_URL: url('lindy_owner', ownerPw, 'lindy_test'),
  })
  console.log('Đã tạo role lindy_owner, lindy_app, app_user, app_worker và DB lindy_dev, lindy_test.')
} finally {
  await admin.end()
}
