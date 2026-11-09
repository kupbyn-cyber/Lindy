// Tiện ích test MCP: cấp token thật qua lõi OAuth, gọi /api/mcp qua handler.
import { createHash, randomBytes } from 'node:crypto'
import { handleMcpRequest } from '../../src/server/mcp/handler'
import { createGrantWithCode, exchangeCode, registerClient } from '../../src/server/mcp/oauth'
import type { SeedKey } from './auth'
import { seed } from './db'

export const MCP_ORIGIN = 'http://localhost:3000'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const ALL = ['lindy:read', 'lindy:write', 'offline_access']

export async function mcpToken(key: SeedKey, scope: string[] = ALL) {
  const c = await registerClient({ name: 'Claude', redirectUris: [REDIRECT] })
  if (!c.ok) throw new Error(c.description)
  const verifier = randomBytes(32).toString('base64url')
  const g = await createGrantWithCode({
    userId: seed().users[key]!.id,
    clientId: c.value.clientId,
    scope,
    resource: `${MCP_ORIGIN}/api/mcp`,
    redirectUri: REDIRECT,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  })
  if (!g.ok) throw new Error(g.description)
  const t = await exchangeCode({
    code: g.value.code,
    clientId: c.value.clientId,
    redirectUri: REDIRECT,
    codeVerifier: verifier,
  })
  if (!t.ok) throw new Error(t.description)
  return { token: t.value.access_token, grantId: t.value.grantId }
}

let seq = 0

export async function rpc(token: string | null, method: string, params?: unknown) {
  const res = await handleMcpRequest(
    new Request(`${MCP_ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
    }),
  )
  const text = await res.text()
  return { res, body: text ? (JSON.parse(text) as RpcBody) : null }
}

export type RpcBody = {
  jsonrpc: '2.0'
  id: number | null
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

type ToolResult = {
  isError?: boolean
  content: { type: string; text: string }[]
  structuredContent?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

/** Gọi tool; trả kết quả tool và dữ liệu đã parse từ text. */
export async function callTool<T = Record<string, unknown>>(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ rpcError?: { code: number; message: string }; result?: ToolResult; data: T; isError: boolean }> {
  const { body } = await rpc(token, 'tools/call', { name, arguments: args })
  if (body?.error) return { rpcError: body.error, data: {} as T, isError: true }
  const result = body!.result as unknown as ToolResult
  return { result, data: JSON.parse(result.content[0]!.text) as T, isError: !!result.isError }
}
