// Chuẩn bị DB khi app khởi động trên hosting (Vibe Hosting Nhân Hòa: DB chỉ có địa chỉ nội bộ, không có dòng lệnh).
// Chỉ chạy khi có DATABASE_ADMIN_URL; ở local DB đã dựng bằng script nên bỏ qua.
//   1. Kiểm user quản trị DB có được tạo role không.
//   2. Tạo role app_user, app_worker (NOLOGIN) và lindy_app (LOGIN, NOINHERIT) như ở local [P4].
//   3. Chạy migration bằng user quản trị (chủ các bảng).
//   4. Dữ liệu nền: tổ chức, cơ sở, quyền, vai trò, cài đặt lịch. Không tạo tài khoản mẫu.
//   5. Chưa có tài khoản nào → tạo tài khoản chủ từ INITIAL_OWNER_*, bắt đổi mật khẩu lần đầu.
// Server chạy bằng lindy_app; DATABASE_URL suy ra từ DATABASE_ADMIN_URL + LINDY_APP_PASSWORD nếu chưa đặt.
import postgres from 'postgres'
import { normalizeLoginPhone } from '~/lib/phone'
import { checkPasswordPolicy, hashPassword } from '../auth/password'
import { env } from '../env'
import { migrateUp } from './migrations'
import { seedBase } from './seed'

const APP_ROLE = 'lindy_app'
const PASSWORD_RE = /^[A-Za-z0-9_-]{24,128}$/
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

type Log = (msg: string) => void
const defaultLog: Log = (m) => console.log(`[release] ${m}`)

export function appUrlFrom(adminUrl: string, appPassword: string) {
  const u = new URL(adminUrl)
  u.username = APP_ROLE
  u.password = appPassword
  return u.toString()
}

export type ReleaseOptions = {
  adminUrl: string
  appPassword: string
  initialOwner?: { name?: string; phone?: string; email?: string; password?: string }
  log?: Log
}

export async function runRelease(opts: ReleaseOptions) {
  const log = opts.log ?? defaultLog
  if (!PASSWORD_RE.test(opts.appPassword)) {
    throw new Error('LINDY_APP_PASSWORD phải dài 24–128 ký tự, chỉ gồm chữ, số, "-" và "_".')
  }
  const dbName = decodeURIComponent(new URL(opts.adminUrl).pathname.replace(/^\//, ''))
  if (!IDENT_RE.test(dbName)) throw new Error(`Tên database không hợp lệ: ${dbName}`)

  const admin = postgres(opts.adminUrl, { onnotice: () => {}, max: 1, transform: postgres.camel })
  try {
    // 1. Quyền của user quản trị
    const [me] = await admin<{ name: string; rolsuper: boolean; rolcreaterole: boolean; version: number }[]>`
      select current_user as name, r.rolsuper, r.rolcreaterole, current_setting('server_version_num')::int as version
      from pg_roles r where r.rolname = current_user`
    log(
      `DB: user ${me!.name}, PostgreSQL ${me!.version}, superuser=${me!.rolsuper}, createrole=${me!.rolcreaterole}`,
    )
    if (me!.version < 160000) throw new Error('Cần PostgreSQL 16 trở lên.')
    if (!me!.rolsuper && !me!.rolcreaterole) {
      throw new Error(
        `User ${me!.name} không được tạo role. Cần đổi sang phương án phân quyền dự phòng (kế hoạch mục 10).`,
      )
    }

    // 2. Role. Tên role là hằng số; mật khẩu đã kiểm chỉ gồm ký tự an toàn nên ghép vào câu lệnh được.
    for (const role of ['app_user', 'app_worker']) {
      const [r] = await admin`select 1 from pg_roles where rolname = ${role}`
      if (!r) await admin.unsafe(`create role ${role} nologin`)
    }
    const [appRole] = await admin`select 1 from pg_roles where rolname = ${APP_ROLE}`
    await admin.unsafe(
      `${appRole ? 'alter' : 'create'} role ${APP_ROLE} with login noinherit password '${opts.appPassword}'`,
    )
    // lindy_app NOINHERIT: không thừa hưởng quyền, phải SET ROLE trong withUser/withWorker [P4].
    await admin.unsafe(`grant app_user, app_worker to ${APP_ROLE}`)
    await admin.unsafe(`grant connect on database "${dbName}" to ${APP_ROLE}`)
    log('Role app_user, app_worker, lindy_app sẵn sàng.')

    // 3. Migration
    await migrateUp(opts.adminUrl, (m) => log(m.trim()))

    // 4–5. Dữ liệu nền và tài khoản chủ đầu tiên
    await admin.begin(async (tx) => {
      const base = await seedBase(tx)
      const [count] = await tx<{ n: number }[]>`select count(*)::int as n from users`
      if ((count?.n ?? 0) > 0) return
      const o = opts.initialOwner ?? {}
      const name = o.name?.trim()
      const phone = o.phone ? normalizeLoginPhone(o.phone) : null
      const email = o.email?.trim().toLowerCase() || null
      if (!name || (!phone && !email) || !o.password) {
        log(
          'Chưa có tài khoản nào. Đặt INITIAL_OWNER_NAME, INITIAL_OWNER_PHONE (hoặc _EMAIL), INITIAL_OWNER_PASSWORD rồi khởi động lại.',
        )
        return
      }
      if (o.phone && !phone) throw new Error('INITIAL_OWNER_PHONE không hợp lệ (số Việt Nam 10–11 chữ số).')
      const policy = checkPasswordPolicy(o.password)
      if (policy) throw new Error(`INITIAL_OWNER_PASSWORD: ${policy}`)
      const [u] = await tx<{ id: string }[]>`
        insert into users (organization_id, display_name, phone, email)
        values (${base.orgId}, ${name}, ${phone}, ${email}) returning id`
      await tx`insert into user_credentials (user_id, password_hash, must_change_password)
               values (${u!.id}, ${await hashPassword(o.password)}, true)`
      await tx`insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
               values (${u!.id}, ${base.branchIds.HTK!}, ${base.roleIds.owner!}, 'release')`
      await tx`insert into audit_logs (actor_label, action, entity_type, entity_id)
               values ('release', 'admin.initial_owner_created', 'user', ${u!.id})`
      log(`Đã tạo tài khoản chủ "${name}". Đăng nhập rồi đổi mật khẩu.`)
    })
  } finally {
    await admin.end()
  }
}

// ---------------------------------------------------------------- Chạy một lần mỗi tiến trình

type ReleaseState = { promise: Promise<void> | null; done: boolean }
const g = globalThis as unknown as { __lindyRelease?: ReleaseState }
g.__lindyRelease ??= { promise: null, done: false }
const state: ReleaseState = g.__lindyRelease

/** Gọi ở đầu mỗi request; chỉ chạy thật ở lần đầu. Lỗi thì lần sau thử lại. */
export function ensureReady(): Promise<void> {
  if (state.done) return Promise.resolve()
  state.promise ??= (async () => {
    const adminUrl = env('DATABASE_ADMIN_URL')
    if (!adminUrl) {
      state.done = true // local: DB dựng bằng script
      return
    }
    const appPassword = env('LINDY_APP_PASSWORD')
    if (!appPassword) throw new Error('Thiếu biến LINDY_APP_PASSWORD.')
    await runRelease({
      adminUrl,
      appPassword,
      initialOwner: {
        name: env('INITIAL_OWNER_NAME'),
        phone: env('INITIAL_OWNER_PHONE'),
        email: env('INITIAL_OWNER_EMAIL'),
        password: env('INITIAL_OWNER_PASSWORD'),
      },
    })
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = appUrlFrom(adminUrl, appPassword)
    // Server không cần quyền quản trị DB nữa.
    delete process.env.DATABASE_ADMIN_URL
    delete process.env.INITIAL_OWNER_PASSWORD
    state.done = true
    defaultLog('Xong. App chạy bằng role lindy_app.')
  })().catch((e) => {
    state.promise = null
    throw e
  })
  return state.promise
}
