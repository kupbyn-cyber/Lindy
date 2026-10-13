// Chuẩn bị DB khi app khởi động trên hosting (DB chỉ có địa chỉ nội bộ, không có dòng lệnh).
// Chạy khi có chuỗi kết nối quản trị (xem pickAdminUrl); ở local DB đã dựng bằng script nên bỏ qua.
//   1. Kiểm user quản trị DB có được tạo role không.
//   2. Tạo role app_user, app_worker (NOLOGIN) và lindy_app (LOGIN, NOINHERIT) như ở local [P4].
//   3. Chạy migration bằng user quản trị (chủ các bảng).
//   4. Dữ liệu nền: tổ chức, cơ sở, quyền, vai trò, cài đặt lịch. Không tạo tài khoản mẫu.
//   5. Chưa có tài khoản nào → tạo tài khoản chủ từ INITIAL_OWNER_*, bắt đổi mật khẩu lần đầu.
// Server chạy bằng lindy_app; DATABASE_URL suy ra từ chuỗi quản trị + LINDY_APP_PASSWORD nếu chưa đặt.
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
    throw new ReleaseError(
      'bad_LINDY_APP_PASSWORD',
      'LINDY_APP_PASSWORD phải dài 24–128 ký tự, chỉ gồm chữ, số, "-" và "_".',
    )
  }
  let parsed: URL
  try {
    parsed = new URL(opts.adminUrl)
  } catch {
    throw new ReleaseError('bad_admin_url', 'Chuỗi kết nối DB quản trị không đúng dạng postgres://…')
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!IDENT_RE.test(dbName))
    throw new ReleaseError('bad_db_name', 'Tên database trong chuỗi kết nối DB quản trị không hợp lệ.')

  const admin = postgres(opts.adminUrl, { onnotice: () => {}, max: 1, transform: postgres.camel })
  try {
    // 1. Quyền của user quản trị
    const [me] = await admin<{ name: string; rolsuper: boolean; rolcreaterole: boolean; version: number }[]>`
      select current_user as name, r.rolsuper, r.rolcreaterole, current_setting('server_version_num')::int as version
      from pg_roles r where r.rolname = current_user`
    log(
      `DB: user ${me!.name}, PostgreSQL ${me!.version}, superuser=${me!.rolsuper}, createrole=${me!.rolcreaterole}`,
    )
    if (me!.version < 160000) throw new ReleaseError('pg_version_old', 'Cần PostgreSQL 16 trở lên.')
    if (!me!.rolsuper && !me!.rolcreaterole) {
      throw new ReleaseError(
        'cannot_create_role',
        'User quản trị DB không được tạo role. Cần đổi sang phương án phân quyền dự phòng (kế hoạch mục 10).',
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
    let hasAccounts = true
    await admin.begin(async (tx) => {
      const base = await seedBase(tx)
      const [count] = await tx<{ n: number }[]>`select count(*)::int as n from users`
      if ((count?.n ?? 0) > 0) return
      hasAccounts = false
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
      if (o.phone && !phone) {
        throw new ReleaseError(
          'bad_INITIAL_OWNER_PHONE',
          'INITIAL_OWNER_PHONE không hợp lệ (số Việt Nam 10–11 chữ số).',
        )
      }
      const policy = checkPasswordPolicy(o.password)
      if (policy) throw new ReleaseError('bad_INITIAL_OWNER_PASSWORD', `INITIAL_OWNER_PASSWORD: ${policy}`)
      const [u] = await tx<{ id: string }[]>`
        insert into users (organization_id, display_name, phone, email)
        values (${base.orgId}, ${name}, ${phone}, ${email}) returning id`
      await tx`insert into user_credentials (user_id, password_hash, must_change_password)
               values (${u!.id}, ${await hashPassword(o.password)}, true)`
      await tx`insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
               values (${u!.id}, ${base.branchIds.HTK!}, ${base.roleIds.owner!}, 'release')`
      await tx`insert into audit_logs (actor_label, action, entity_type, entity_id)
               values ('release', 'admin.initial_owner_created', 'user', ${u!.id})`
      hasAccounts = true
      log(`Đã tạo tài khoản chủ "${name}". Đăng nhập rồi đổi mật khẩu.`)
    })
    return { hasAccounts }
  } finally {
    await admin.end()
  }
}

// ---------------------------------------------------------------- Chạy một lần mỗi tiến trình

export type ReleaseProblem = { code: string; text: string }
type AdminUrl = { url: string; source: string }
type ReleaseState = {
  promise: Promise<void> | null
  done: boolean
  problem: ReleaseProblem | null
  hasAccounts: boolean | null
  // undefined: chưa tìm; null: không có chuỗi kết nối quản trị
  admin: AdminUrl | null | undefined
}
const g = globalThis as unknown as { __lindyRelease?: ReleaseState }
g.__lindyRelease ??= { promise: null, done: false, problem: null, hasAccounts: null, admin: undefined }
const state: ReleaseState = g.__lindyRelease

// Biến có thể chứa chuỗi kết nối quản trị. Ngoài DATABASE_ADMIN_URL, hosting có thể tự điền các biến
// trong .env.example (Vibe Host Mắt Bão) bằng tài khoản quản trị DB của nó.
const ADMIN_URL_VARS = ['DATABASE_ADMIN_URL', 'DATABASE_URL', 'MIGRATE_DATABASE_URL', 'PG_ADMIN_URL']

function dbUser(url: string) {
  try {
    return decodeURIComponent(new URL(url).username)
  } catch {
    return null
  }
}

/**
 * Chọn chuỗi kết nối quản trị: DATABASE_ADMIN_URL nếu có. Bản production nhận thêm DATABASE_URL,
 * MIGRATE_DATABASE_URL, PG_ADMIN_URL khi user không phải lindy_app (hosting tự điền).
 */
export function pickAdminUrl(
  get: (name: string) => string | undefined,
  production: boolean,
): AdminUrl | null {
  const explicit = get('DATABASE_ADMIN_URL')
  if (explicit) return { url: explicit, source: 'DATABASE_ADMIN_URL' }
  if (!production) return null
  for (const source of ADMIN_URL_VARS.slice(1)) {
    const url = get(source)
    if (url && dbUser(url) !== APP_ROLE) return { url, source }
  }
  return null
}

/** Rút chuỗi quản trị ra khỏi process.env để getSql() không mở pool bằng tài khoản quản trị. */
function takeAdminUrl(production: boolean) {
  const picked = pickAdminUrl(env, production)
  if (picked) {
    for (const name of ADMIN_URL_VARS) {
      const url = process.env[name]
      if (url && dbUser(url) !== APP_ROLE) delete process.env[name]
    }
  }
  return picked
}

class ReleaseError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Đổi lỗi sang mã + câu do mình viết, để /api/health báo được mà không lộ chuỗi kết nối, mật khẩu
 * (hosting không có log lúc chạy).
 */
export function classifyReleaseError(e: unknown): ReleaseProblem {
  if (e instanceof ReleaseError) return { code: e.code, text: e.message }
  const err = e as { code?: string; message?: string }
  switch (err?.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return { code: 'db_host_not_found', text: 'Không tìm thấy máy chủ DB. Kiểm tra biến ở dbUrlFrom.' }
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'CONNECT_TIMEOUT':
      return {
        code: 'db_unreachable',
        text: 'Không kết nối được DB. Kiểm tra DB đang chạy và biến ở dbUrlFrom.',
      }
    case '28P01':
      return { code: 'db_auth_failed', text: 'Sai user hoặc mật khẩu trong biến ở dbUrlFrom.' }
    case '3D000':
      return { code: 'db_not_found', text: 'Tên database trong biến ở dbUrlFrom không tồn tại.' }
    case '42501':
      return {
        code: 'db_permission',
        text: 'User DB trong biến ở dbUrlFrom thiếu quyền (tạo role hoặc tạo bảng).',
      }
    default:
      if (err?.message?.startsWith('Invalid URL') || err?.code === 'ERR_INVALID_URL') {
        return { code: 'bad_admin_url', text: 'Biến ở dbUrlFrom không đúng dạng postgres://…' }
      }
      return { code: `other${err?.code ? `_${err.code}` : ''}`, text: 'Lỗi khác khi chuẩn bị DB.' }
  }
}

function base64urlBytes(v: string) {
  return /^[A-Za-z0-9_-]+$/.test(v) ? Buffer.from(v, 'base64url').length : -1
}

/** Tên các biến có giá trị sai dạng (dán thiếu ký tự…), không kèm giá trị. */
export function badEnvNames(get: (name: string) => string | undefined) {
  const bad: string[] = []
  const pub = get('VAPID_PUBLIC_KEY')
  if (pub && base64urlBytes(pub) !== 65) bad.push('VAPID_PUBLIC_KEY')
  const priv = get('VAPID_PRIVATE_KEY')
  if (priv && base64urlBytes(priv) !== 32) bad.push('VAPID_PRIVATE_KEY')
  const subject = get('VAPID_SUBJECT')
  if (subject && !/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(subject)) bad.push('VAPID_SUBJECT')
  const origin = get('APP_ORIGIN')
  if (origin) {
    try {
      if (new URL(origin).origin !== origin) bad.push('APP_ORIGIN')
    } catch {
      bad.push('APP_ORIGIN')
    }
  }
  return bad
}

/** Trạng thái để /api/health hiển thị (không có giá trị bí mật). */
export function releaseStatus() {
  const required = ['LINDY_APP_PASSWORD', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APP_ORIGIN']
  const missingEnv = required.filter((k) => !env(k))
  if (!state.done && state.admin === null) missingEnv.unshift('DATABASE_ADMIN_URL')
  return {
    ready: state.done && !!env('DATABASE_URL'),
    problem: state.problem,
    // false: DB chưa có tài khoản nào → đặt INITIAL_OWNER_NAME, _PHONE, _PASSWORD rồi khởi động lại.
    hasAccounts: state.hasAccounts,
    missingEnv,
    badEnv: badEnvNames(env),
    // Tên biến đã lấy chuỗi kết nối quản trị (không có giá trị).
    dbUrlFrom: state.admin?.source ?? null,
  }
}

/** Gọi ở đầu mỗi request; chỉ chạy thật ở lần đầu. Lỗi thì lần sau thử lại. */
export function ensureReady(): Promise<void> {
  if (state.done) return Promise.resolve()
  // Bản build production (import.meta.env.PROD) kể cả khi hosting không đặt NODE_ENV.
  return prepareDatabase(import.meta.env.PROD || env('NODE_ENV') === 'production')
}

/** Phần chung của ensureReady và scripts/release.ts (chạy trước khi bật server trong container). */
export function prepareDatabase(production: boolean): Promise<void> {
  if (state.done) return Promise.resolve()
  if (state.admin === undefined) state.admin = takeAdminUrl(production)
  state.promise ??= (async () => {
    const admin = state.admin
    if (!admin) {
      if (production && !env('DATABASE_URL')) {
        throw new ReleaseError(
          'missing_DATABASE_ADMIN_URL',
          'Thiếu DATABASE_URL: website chưa gắn cơ sở dữ liệu (hoặc đặt DATABASE_ADMIN_URL).',
        )
      }
      state.done = true // local: DB dựng bằng script; hoặc DATABASE_URL đã là lindy_app
      return
    }
    const adminUrl = admin.url
    const appPassword = env('LINDY_APP_PASSWORD')
    if (!appPassword) throw new ReleaseError('missing_LINDY_APP_PASSWORD', 'Thiếu biến LINDY_APP_PASSWORD.')
    if (!PASSWORD_RE.test(appPassword)) {
      throw new ReleaseError(
        'bad_LINDY_APP_PASSWORD',
        'LINDY_APP_PASSWORD sai dạng (24–128 ký tự chữ, số, - và _).',
      )
    }
    const res = await runRelease({
      adminUrl,
      appPassword,
      initialOwner: {
        name: env('INITIAL_OWNER_NAME'),
        phone: env('INITIAL_OWNER_PHONE'),
        email: env('INITIAL_OWNER_EMAIL'),
        password: env('INITIAL_OWNER_PASSWORD'),
      },
    })
    // DATABASE_URL lindy_app đặt sẵn thì giữ; còn lại suy ra từ chuỗi quản trị.
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = appUrlFrom(adminUrl, appPassword)
    // Server không cần quyền quản trị DB nữa.
    state.admin = { url: '', source: admin.source }
    delete process.env.INITIAL_OWNER_PASSWORD
    state.done = true
    state.problem = null
    state.hasAccounts = res.hasAccounts
    defaultLog('Xong. App chạy bằng role lindy_app.')
  })().catch((e) => {
    state.promise = null
    state.problem = classifyReleaseError(e)
    throw e
  })
  return state.promise
}
