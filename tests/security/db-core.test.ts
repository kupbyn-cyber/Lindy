// Bước 0.9–0.10: role, RLS, audit chỉ thêm. Test bảo mật S06, S07, S17.
import { afterAll, describe, expect, it } from 'vitest'
import { assertDisposableDb } from '../../scripts/lib/db-guard'
import { closeSql, withUser, withWorker } from '../../src/server/db/client'
import { expectPgError, ownerSql, rawAppSql, seed } from '../helpers/db'

const raw = rawAppSql()
const owner = ownerSql()

afterAll(async () => {
  await raw.end()
  await owner.end()
  await closeSql()
})

describe('S06 — quên withUser/withWorker thì bị chặn [P4]', () => {
  it('lindy_app đọc thẳng bảng → bị chặn (không có quyền schema nên không thấy bảng)', async () => {
    // 42P01: lindy_app không có USAGE trên schema public nên không thấy bảng; 42501: thấy nhưng không có quyền.
    await expectPgError(raw`select id from public.users`, ['42501', '42P01'])
    await expectPgError(raw`select id from public.branches`, ['42501', '42P01'])
    await expectPgError(raw`select id from public.user_credentials`, ['42501', '42P01'])
  })
  it('qua withUser thì đọc được', async () => {
    const { users } = seed()
    const rows = await withUser(users.trang!.id, (tx) => tx`select id from branches`)
    expect(rows.length).toBe(1)
  })
})

describe('S07 — app_user không đọc được mật khẩu, phiên [P5]', () => {
  it('user_credentials, sessions, login_attempts → permission denied', async () => {
    const { users } = seed()
    await expectPgError(
      withUser(users.linh!.id, (tx) => tx`select * from user_credentials`),
      '42501',
    )
    await expectPgError(
      withUser(users.linh!.id, (tx) => tx`select * from sessions`),
      '42501',
    )
    await expectPgError(
      withUser(users.linh!.id, (tx) => tx`select * from login_attempts`),
      '42501',
    )
  })
  it('users chỉ lộ cột hiển thị; select * bị chặn', async () => {
    const { users } = seed()
    await expectPgError(
      withUser(users.linh!.id, (tx) => tx`select * from users`),
      '42501',
    )
    const rows = await withUser(users.linh!.id, (tx) => tx`select id, display_name from users`)
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('Không xoá vĩnh viễn [P20]', () => {
  it('app_user không DELETE, TRUNCATE được', async () => {
    const { users } = seed()
    await expectPgError(
      withUser(users.linh!.id, (tx) => tx`delete from branches`),
      '42501',
    )
    await expectPgError(
      withUser(users.linh!.id, (tx) => tx`truncate audit_logs`),
      '42501',
    )
    await expectPgError(
      withWorker((tx) => tx`delete from sessions`),
      '42501',
    )
  })
  it('audit_logs: người dùng ghi được dưới tên mình, không sửa được; chủ DB cũng không sửa, xoá, truncate', async () => {
    const { users } = seed()
    await withUser(
      users.trang!.id,
      (tx) => tx`insert into audit_logs (actor_user_id, action) values (${users.trang!.id}, 'test.write')`,
    )
    await expectPgError(
      withUser(
        users.trang!.id,
        (tx) => tx`insert into audit_logs (actor_user_id, action) values (${users.linh!.id}, 'test.fake')`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(users.trang!.id, (tx) => tx`update audit_logs set action = 'x'`),
      '42501',
    )
    await expectPgError(owner`update audit_logs set action = 'x'`, '42501')
    await expectPgError(owner`delete from audit_logs`, '42501')
    await expectPgError(owner`truncate audit_logs`, '42501')
  })
})

describe('RLS theo cơ sở [P12]', () => {
  it('người ở HTK không thấy CS2 và ngược lại', async () => {
    const { users, branchIds } = seed()
    const trang = await withUser(users.trang!.id, (tx) => tx<{ id: string }[]>`select id from branches`)
    expect(trang.map((b) => b.id)).toEqual([branchIds.HTK])
    const mai = await withUser(users.mai!.id, (tx) => tx<{ id: string }[]>`select id from branches`)
    expect(mai.map((b) => b.id)).toEqual([branchIds.CS2])
  })
  it('chỉ thấy tên người cùng cơ sở', async () => {
    const { users } = seed()
    const rows = await withUser(users.mai!.id, (tx) => tx<{ id: string }[]>`select id from users`)
    expect(rows.map((r) => r.id)).toEqual([users.mai!.id])
  })
})

describe('withUser [0.10]', () => {
  it('giao dịch song song không lẫn app.user_id', async () => {
    const { users } = seed()
    const ids = [users.linh!.id, users.nhung!.id, users.chin!.id, users.trang!.id]
    const got = await Promise.all(
      ids.map((id) =>
        withUser(id, async (tx) => {
          await tx`select pg_sleep(0.05)`
          const [r] = await tx<{ uid: string }[]>`select app.uid() as uid`
          return r!.uid
        }),
      ),
    )
    expect(got).toEqual(ids)
  })
  it('lỗi giữa chừng thì rollback hết', async () => {
    const { users } = seed()
    await expect(
      withUser(users.trang!.id, async (tx) => {
        await tx`insert into audit_logs (actor_user_id, action) values (${users.trang!.id}, 'test.rollback')`
        throw new Error('dừng')
      }),
    ).rejects.toThrow('dừng')
    const rows = await owner`select 1 from audit_logs where action = 'test.rollback'`
    expect(rows.length).toBe(0)
  })
})

describe('S17 — chặn xoá nhầm DB thật [P15]', () => {
  it('chỉ nhận localhost và tên _dev/_test, ngoài production', () => {
    expect(() => assertDisposableDb('postgres://u:p@db.example.com:5432/lindy_test')).toThrow('localhost')
    expect(() => assertDisposableDb('postgres://u:p@localhost:5432/lindy')).toThrow('_dev')
    expect(() => assertDisposableDb('postgres://u:p@localhost:5432/lindy_dev', ['_test'])).toThrow('_test')
    expect(assertDisposableDb('postgres://u:p@localhost:5433/lindy_test')).toBe('lindy_test')
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(() => assertDisposableDb('postgres://u:p@localhost:5433/lindy_test')).toThrow('production')
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
