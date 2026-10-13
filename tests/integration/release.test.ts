// Bước chuẩn bị DB khi app khởi động trên hosting: chạy trên một database tạm (lindy_release_test)
// bằng tài khoản quản trị local, giống user lindy_db trên hosting.
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appUrlFrom, runRelease } from '../../src/server/ops/release'

const ADMIN = process.env.PG_ADMIN_URL
const DB = 'lindy_release_test'
const run = ADMIN && process.env.LINDY_APP_PASSWORD ? describe : describe.skip

function urlFor(db: string) {
  const u = new URL(ADMIN!)
  u.pathname = `/${db}`
  return u.toString()
}

run('runRelease', () => {
  const root = ADMIN ? postgres(ADMIN, { max: 1, onnotice: () => {} }) : null
  const adminUrl = urlFor(DB)
  const appPassword = process.env.LINDY_APP_PASSWORD!
  const logs: string[] = []

  beforeAll(async () => {
    const u = new URL(ADMIN!)
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('Chỉ chạy với PostgreSQL local.')
    await root!.unsafe(`drop database if exists ${DB} with (force)`)
    await root!.unsafe(`create database ${DB}`)
  })
  afterAll(async () => {
    await root!.unsafe(`drop database if exists ${DB} with (force)`)
    await root!.end()
  })

  it('lần đầu: tạo role, chạy migration, dữ liệu nền, tài khoản chủ bắt đổi mật khẩu', async () => {
    await runRelease({
      adminUrl,
      appPassword,
      initialOwner: { name: 'Linh', phone: '0911 000 111', password: 'Ngà-mực-2027' },
      log: (m) => logs.push(m),
    })
    expect(logs.some((l) => l.includes('Đã tạo tài khoản chủ'))).toBe(true)

    const db = postgres(adminUrl, { max: 1, onnotice: () => {}, transform: postgres.camel })
    try {
      const [m] = await db`select count(*)::int as n from schema_migrations`
      expect(m!.n).toBeGreaterThanOrEqual(5)
      const [u] =
        await db`select u.phone, c.must_change_password from users u join user_credentials c on c.user_id = u.id`
      expect(u!.phone).toBe('0911000111')
      expect(u!.mustChangePassword).toBe(true)
      const [r] =
        await db`select count(*)::int as n from role_permissions rp join roles r on r.id = rp.role_id
                           where r.code = 'owner' and rp.permission_code = 'users.manage'`
      expect(r!.n).toBe(1)
    } finally {
      await db.end()
    }

    // App kết nối bằng lindy_app: không đọc thẳng bảng được, SET ROLE thì được [P4]
    const app = postgres(appUrlFrom(adminUrl, appPassword), { max: 1, onnotice: () => {} })
    try {
      await expect(app`select 1 from public.users`).rejects.toMatchObject({
        code: expect.stringMatching(/42501|42P01/),
      })
      const rows = await app.begin(async (tx) => {
        await tx`set local role app_user`
        return tx`select id from branches`
      })
      expect(rows.length).toBe(0) // chưa đặt app.user_id → RLS không cho thấy gì
    } finally {
      await app.end()
    }
  })

  it('chạy lại: không lỗi, không tạo thêm tài khoản', async () => {
    await runRelease({
      adminUrl,
      appPassword,
      initialOwner: { name: 'Người khác', phone: '0911000222', password: 'Ngà-mực-2027' },
      log: () => {},
    })
    const db = postgres(adminUrl, { max: 1, onnotice: () => {} })
    try {
      const [u] = await db`select count(*)::int as n from users`
      expect(u!.n).toBe(1)
    } finally {
      await db.end()
    }
  })

  it('mật khẩu role yếu hoặc mật khẩu chủ không đạt K04 → dừng, báo rõ', async () => {
    await expect(runRelease({ adminUrl, appPassword: 'ngan', log: () => {} })).rejects.toThrow(
      'LINDY_APP_PASSWORD',
    )
  })
})
