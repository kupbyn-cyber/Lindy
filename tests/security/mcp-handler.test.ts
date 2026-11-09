// MCP (gói 4): endpoint /api/mcp — xác thực, giao thức, lindy_get_me, chặn tham số lạ, lịch sử.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql } from '../../src/server/db/client'
import { invalid } from '../../src/server/http/errors'
import { handleMcpRequest } from '../../src/server/mcp/handler'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { toToolFailure } from '../../src/server/mcp/kit'
import { ownerSql, seed } from '../helpers/db'
import { callTool, MCP_ORIGIN, mcpToken, rpc } from '../helpers/mcp'

const owner = ownerSql()
beforeEach(() => resetMcpRateLimits())
afterAll(async () => {
  await owner.end()
  await closeSql()
})

describe('MCP /api/mcp — xác thực', () => {
  it('không token → 401 có resource_metadata và scope', async () => {
    const { res } = await rpc(null, 'initialize', {})
    expect(res.status).toBe(401)
    const h = res.headers.get('www-authenticate') ?? ''
    expect(h).toContain(`resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`)
    expect(h).toContain('scope="lindy:read lindy:write offline_access"')
  })

  it('token sai → 401', async () => {
    const { res } = await rpc('lindymcp_at_sai', 'initialize', {})
    expect(res.status).toBe(401)
  })

  it('GET → 405', async () => {
    const res = await handleMcpRequest(new Request(`${MCP_ORIGIN}/api/mcp`))
    expect(res.status).toBe(405)
  })
})

describe('MCP /api/mcp — giao thức', () => {
  it('initialize, tools/list, lindy_get_me với token của Linh', async () => {
    const { token } = await mcpToken('linh')
    const init = await rpc(token, 'initialize', { protocolVersion: '2025-06-18' })
    expect(init.res.status).toBe(200)
    expect(init.body?.result?.protocolVersion).toBe('2025-06-18')
    expect(String(init.body?.result?.instructions)).toContain('lindy_preview_')

    const list = await rpc(token, 'tools/list')
    const names = (list.body!.result!.tools as { name: string }[]).map((t) => t.name)
    expect(names).toContain('lindy_get_me')

    const me = await callTool<{ displayName: string; branches: { role: string }[] }>(token, 'lindy_get_me')
    expect(me.isError).toBe(false)
    const [u] = await owner<{ displayName: string }[]>`
      select display_name from users where id = ${seed().users.linh!.id}`
    expect(me.data.displayName).toBe(u!.displayName)
    expect(me.data.displayName).toContain('Linh')
    expect(me.data.branches[0]?.role).toBe('Chủ')
  })

  it('notification → 202, method lạ → -32601, batch → 400', async () => {
    const { token } = await mcpToken('linh')
    const n = await handleMcpRequest(
      new Request(`${MCP_ORIGIN}/api/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }),
    )
    expect(n.status).toBe(202)
    const unknown = await rpc(token, 'resources/list')
    expect(unknown.body?.error?.code).toBe(-32601)
    const batch = await handleMcpRequest(
      new Request(`${MCP_ORIGIN}/api/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]),
      }),
    )
    expect(batch.status).toBe(400)
  })

  it('tham số lạ (userId) → -32602', async () => {
    const { token } = await mcpToken('linh')
    const r = await callTool(token, 'lindy_get_me', { userId: seed().users.trang!.id })
    expect(r.rpcError?.code).toBe(-32602)
  })

  it('mỗi lần gọi tool ghi 1 dòng lịch sử, không có token', async () => {
    const { token, grantId } = await mcpToken('linh')
    await callTool(token, 'lindy_get_me')
    const rows = await owner<{ action: string; details: Record<string, unknown> }[]>`
      select action, details from audit_logs where entity_type = 'mcp' and entity_id = ${grantId}
        and action = 'mcp.tool_call'`
    expect(rows.length).toBe(1)
    expect(rows[0]!.details.tool).toBe('lindy_get_me')
    expect(rows[0]!.details.client).toBe('claude')
    expect(JSON.stringify(rows[0]!.details)).not.toContain('lindymcp_')
  })
})

describe('MCP — đổi lỗi cho AI', () => {
  it('AppError giữ câu; lỗi luật trong SQL (P0001) trả đúng câu của DB; lỗi khác → câu chung', () => {
    expect(toToolFailure(invalid('Thiếu giờ kết thúc.')).message).toBe('Thiếu giờ kết thúc.')
    const pg = Object.assign(new Error('Đổi quyết định công cần ghi lý do.'), { code: 'P0001' })
    expect(toToolFailure(pg)).toEqual({ error: 'invalid', message: 'Đổi quyết định công cần ghi lý do.' })
    expect(toToolFailure(new Error('lộ chi tiết')).message).toBe('Có lỗi xảy ra. Thử lại sau.')
  })
})
