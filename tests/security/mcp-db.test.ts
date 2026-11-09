// MCP (gói 1): bảng OAuth/intent chỉ app_worker chạm; bản sao lưu không có bảng MCP; authForUser khớp phiên web.
import { afterAll, describe, expect, it } from 'vitest'
import { authForUser } from '../../src/server/auth/context'
import { closeSql, withUser, withWorker } from '../../src/server/db/client'
import { sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const MCP_TABLES = [
  'mcp_oauth_clients',
  'mcp_oauth_grants',
  'mcp_oauth_codes',
  'mcp_oauth_tokens',
  'mcp_write_intents',
] as const

const owner = ownerSql()
afterAll(async () => {
  await owner.end()
  await closeSql()
})

describe('MCP — bảng OAuth và intent', () => {
  it('app_user không đọc được bảng MCP', async () => {
    const { users } = seed()
    for (const t of MCP_TABLES) {
      await expectPgError(
        withUser(users.linh!.id, (tx) => tx`select * from ${tx(t)}`),
        '42501',
      )
    }
  })

  it('app_worker đọc được, nhưng không xoá được dòng', async () => {
    const [c] = await withWorker(
      (tx) => tx<{ clientId: string }[]>`
        insert into mcp_oauth_clients (client_name, redirect_uris) values ('test', ${['https://claude.ai/cb']})
        returning client_id`,
    )
    expect(c!.clientId).toBeTruthy()
    await expectPgError(
      withWorker((tx) => tx`delete from mcp_oauth_clients where client_id = ${c!.clientId}`),
      '42501',
    )
  })
})

describe('MCP — sao lưu', () => {
  it('bản sao lưu không chứa bảng MCP', async () => {
    const [r] = await owner<{ dump: string }[]>`select app.backup_dump()::text as dump`
    const tables = Object.keys((JSON.parse(r!.dump) as { tables: Record<string, unknown> }).tables)
    expect(tables).toContain('orders')
    for (const t of MCP_TABLES) expect(tables).not.toContain(t)
  })
})

describe('MCP — authForUser', () => {
  it('ra cùng cơ sở và quyền như phiên web', async () => {
    const linh = await sessionOf('linh')
    const a = await authForUser(linh.auth.userId, '00000000-0000-0000-0000-000000000000')
    expect(a).not.toBeNull()
    expect(a!.displayName).toBe(linh.auth.displayName)
    const norm = (bs: typeof linh.auth.branches) => bs.map((b) => ({ ...b, perms: [...b.perms].sort() }))
    expect(norm(a!.branches)).toEqual(norm(linh.auth.branches))
  })

  it('tài khoản còn cờ phải đổi mật khẩu → null', async () => {
    const { users } = seed()
    const id = users.mai!.id
    const [before] = await owner<{ m: boolean }[]>`
      select must_change_password as m from user_credentials where user_id = ${id}`
    await owner`update user_credentials set must_change_password = true where user_id = ${id}`
    try {
      expect(await authForUser(id, '00000000-0000-0000-0000-000000000000')).toBeNull()
    } finally {
      await owner`update user_credentials set must_change_password = ${before!.m} where user_id = ${id}`
    }
  })
})
