// MCP (gói 2): lõi OAuth — cấp, đổi mã, gia hạn, thu hồi, kiểm token; chỉ tài khoản Chủ.
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { closeSql } from '../../src/server/db/client'
import { expandRequestedScope } from '../../src/server/mcp/config'
import {
  createGrantWithCode,
  exchangeCode,
  refresh,
  registerClient,
  revokeByToken,
  validateRedirectUri,
  verifyAccessToken,
  verifyPkce,
} from '../../src/server/mcp/oauth'
import { ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
afterAll(async () => {
  await owner.end()
  await closeSql()
})

const RESOURCE = 'http://localhost:3000/api/mcp'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const SCOPE = ['lindy:read', 'lindy:write', 'offline_access']

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function newClient() {
  const r = await registerClient({ name: 'Claude', redirectUris: [REDIRECT] })
  if (!r.ok) throw new Error(r.description)
  return r.value
}

async function connect(userId: string) {
  const client = await newClient()
  const p = pkce()
  const g = await createGrantWithCode({
    userId,
    clientId: client.clientId,
    scope: SCOPE,
    resource: RESOURCE,
    redirectUri: REDIRECT,
    codeChallenge: p.challenge,
  })
  if (!g.ok) throw new Error(g.description)
  const t = await exchangeCode({
    code: g.value.code,
    clientId: client.clientId,
    redirectUri: REDIRECT,
    codeVerifier: p.verifier,
    resource: RESOURCE,
  })
  if (!t.ok) throw new Error(t.description)
  return { client, code: g.value.code, verifier: p.verifier, tokens: t.value }
}

describe('MCP OAuth — hàm thuần', () => {
  it('PKCE S256 đúng/sai', () => {
    const p = pkce()
    expect(verifyPkce(p.verifier, p.challenge)).toBe(true)
    expect(verifyPkce(`${p.verifier}x`, p.challenge)).toBe(false)
    expect(verifyPkce('ngắn', p.challenge)).toBe(false)
  })
  it('redirect_uri chỉ nhận https của Claude/ChatGPT hoặc máy cục bộ', () => {
    expect(validateRedirectUri(REDIRECT).ok).toBe(true)
    expect(validateRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect').ok).toBe(true)
    expect(validateRedirectUri('http://localhost:6274/cb').ok).toBe(true)
    expect(validateRedirectUri('https://evil.example.com/cb').ok).toBe(false)
    expect(validateRedirectUri('http://claude.ai/cb').ok).toBe(false)
    expect(validateRedirectUri('https://claude.ai/cb#x').ok).toBe(false)
  })
  it('scope: không gửi hoặc chỉ xin đọc → cấp cả ba; scope lạ → null', () => {
    expect(expandRequestedScope(undefined)).toEqual(SCOPE)
    expect(expandRequestedScope('lindy:read offline_access')).toEqual(SCOPE)
    expect(expandRequestedScope('lindy:write')).toEqual(['lindy:write'])
    expect(expandRequestedScope('lindy:read admin')).toBeNull()
  })
})

describe('MCP OAuth — luồng đủ', () => {
  it('đăng ký → mã → token → kiểm token', async () => {
    const { users } = seed()
    const { client, tokens } = await connect(users.linh!.id)
    expect(client.clientLabel).toBe('claude')
    expect(tokens.scope).toBe(SCOPE.join(' '))
    const v = await verifyAccessToken(tokens.access_token, RESOURCE)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.principal.userId).toBe(users.linh!.id)
      expect(v.principal.scopes).toEqual(SCOPE)
      expect(v.principal.clientLabel).toBe('claude')
    }
    expect((await verifyAccessToken(tokens.access_token, 'https://khac.example/api/mcp')).ok).toBe(false)
    expect((await verifyAccessToken(tokens.refresh_token, RESOURCE)).ok).toBe(false)
  })

  it('PKCE sai bị từ chối', async () => {
    const { users } = seed()
    const client = await newClient()
    const p = pkce()
    const g = await createGrantWithCode({
      userId: users.linh!.id,
      clientId: client.clientId,
      scope: SCOPE,
      resource: RESOURCE,
      redirectUri: REDIRECT,
      codeChallenge: p.challenge,
    })
    if (!g.ok) throw new Error(g.description)
    const t = await exchangeCode({
      code: g.value.code,
      clientId: client.clientId,
      redirectUri: REDIRECT,
      codeVerifier: pkce().verifier,
    })
    expect(t.ok).toBe(false)
  })

  it('mã dùng hai lần ⇒ cả grant bị thu hồi', async () => {
    const { users } = seed()
    const c = await connect(users.linh!.id)
    const again = await exchangeCode({
      code: c.code,
      clientId: c.client.clientId,
      redirectUri: REDIRECT,
      codeVerifier: c.verifier,
    })
    expect(again.ok).toBe(false)
    expect((await verifyAccessToken(c.tokens.access_token, RESOURCE)).ok).toBe(false)
  })

  it('gia hạn xoay vòng; dùng lại refresh cũ ⇒ thu hồi cả grant', async () => {
    const { users } = seed()
    const c = await connect(users.linh!.id)
    const r1 = await refresh({ refreshToken: c.tokens.refresh_token, clientId: c.client.clientId })
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.value.scope).toBe(SCOPE.join(' '))
    expect((await verifyAccessToken(r1.value.access_token, RESOURCE)).ok).toBe(true)
    const reuse = await refresh({ refreshToken: c.tokens.refresh_token, clientId: c.client.clientId })
    expect(reuse.ok).toBe(false)
    expect((await verifyAccessToken(r1.value.access_token, RESOURCE)).ok).toBe(false)
  })

  it('thu hồi theo token', async () => {
    const { users } = seed()
    const c = await connect(users.linh!.id)
    expect(await revokeByToken(c.tokens.access_token, c.client.clientId)).not.toBeNull()
    expect((await verifyAccessToken(c.tokens.access_token, RESOURCE)).ok).toBe(false)
  })
})

describe('MCP OAuth — chỉ tài khoản Chủ', () => {
  it('Quản lý, Thợ không tạo được grant', async () => {
    const { users } = seed()
    const client = await newClient()
    for (const k of ['nhung', 'chin', 'trang'] as const) {
      const g = await createGrantWithCode({
        userId: users[k]!.id,
        clientId: client.clientId,
        scope: SCOPE,
        resource: RESOURCE,
        redirectUri: REDIRECT,
        codeChallenge: pkce().challenge,
      })
      expect(g.ok).toBe(false)
    }
  })

  it('đổi mật khẩu ⇒ access và refresh token cũ bị từ chối', async () => {
    const { users } = seed()
    const id = users.linh!.id
    const c = await connect(id)
    const [before] = await owner<{ t: Date }[]>`
      select password_changed_at as t from user_credentials where user_id = ${id}`
    await owner`update user_credentials set password_changed_at = now() + interval '1 second' where user_id = ${id}`
    try {
      expect((await verifyAccessToken(c.tokens.access_token, RESOURCE)).ok).toBe(false)
      const r = await refresh({ refreshToken: c.tokens.refresh_token, clientId: c.client.clientId })
      expect(r.ok).toBe(false)
    } finally {
      await owner`update user_credentials set password_changed_at = ${before!.t} where user_id = ${id}`
    }
  })

  it('bị khoá hoặc mất vai trò Chủ ⇒ token cũ bị từ chối ngay', async () => {
    const { users } = seed()
    const id = users.linh!.id
    const c = await connect(id)
    await owner`update users set is_active = false where id = ${id}`
    try {
      expect((await verifyAccessToken(c.tokens.access_token, RESOURCE)).ok).toBe(false)
    } finally {
      await owner`update users set is_active = true where id = ${id}`
    }
    expect((await verifyAccessToken(c.tokens.access_token, RESOURCE)).ok).toBe(true)
    const [ubr] = await owner<{ id: string }[]>`
      select ubr.id from user_branch_roles ubr join roles r on r.id = ubr.role_id
      where ubr.user_id = ${id} and ubr.revoked_at is null and r.code = 'owner' limit 1`
    await owner`update user_branch_roles set revoked_at = now() where id = ${ubr!.id}`
    try {
      expect((await verifyAccessToken(c.tokens.access_token, RESOURCE)).ok).toBe(false)
    } finally {
      await owner`update user_branch_roles set revoked_at = null where id = ${ubr!.id}`
    }
  })
})
