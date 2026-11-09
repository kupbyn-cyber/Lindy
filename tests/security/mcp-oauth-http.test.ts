// MCP (gói 3): endpoint OAuth + màn Cho phép + CSP + quay lại sau đăng nhập.
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { safeNext } from '../../src/lib/safe-next'
import { closeSql } from '../../src/server/db/client'
import { applySecurityHeaders } from '../../src/server/http/headers'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { authorizationServerMetadata, protectedResourceMetadata } from '../../src/server/mcp/metadata'
import { handleAuthorize, handleRegister, handleToken, OAUTH_PAGE_CSP } from '../../src/server/mcp/oauth-http'
import { sessionOf } from '../helpers/auth'

const ORIGIN = 'http://localhost:3000'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

beforeEach(() => resetMcpRateLimits())
afterAll(async () => {
  await closeSql()
})

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

async function register(redirectUris: string[] = [REDIRECT]) {
  return handleRegister(
    new Request(`${ORIGIN}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: redirectUris }),
    }),
  )
}

function authorizeQuery(clientId: string, challenge: string, scope?: string) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    state: 'st1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: `${ORIGIN}/api/mcp`,
  })
  if (scope !== undefined) q.set('scope', scope)
  return q
}

function csrfOf(html: string) {
  return /name="csrf" value="([0-9a-f]{64})"/.exec(html)?.[1] ?? ''
}

async function consent(cookie: string, clientId: string, challenge: string, scope?: string) {
  const q = authorizeQuery(clientId, challenge, scope)
  const page = await handleAuthorize(new Request(`${ORIGIN}/oauth/authorize?${q}`, { headers: { cookie } }))
  expect(page.status).toBe(200)
  const html = await page.text()
  const form = new URLSearchParams(q)
  form.set('csrf', csrfOf(html))
  form.set('decision', 'approve')
  const res = await handleAuthorize(
    new Request(`${ORIGIN}/oauth/authorize`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }),
  )
  return { page, html, res }
}

async function token(clientId: string, code: string, verifier: string) {
  return handleToken(
    new Request(`${ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
      }).toString(),
    }),
  )
}

describe('MCP OAuth HTTP — metadata', () => {
  it('URL theo origin của request khi không có APP_ORIGIN', async () => {
    const pr = (await protectedResourceMetadata(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`),
    ).json()) as Record<string, unknown>
    expect(pr.resource).toBe(`${ORIGIN}/api/mcp`)
    expect(pr.authorization_servers).toEqual([ORIGIN])
    const as = (await authorizationServerMetadata(
      new Request(`${ORIGIN}/.well-known/oauth-authorization-server`),
    ).json()) as Record<string, unknown>
    expect(as.registration_endpoint).toBe(`${ORIGIN}/oauth/register`)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
  })
})

describe('MCP OAuth HTTP — đăng ký', () => {
  it('nhận redirect của Claude, từ chối máy chủ lạ', async () => {
    const ok = await register()
    expect(ok.status).toBe(201)
    const bad = await register(['https://evil.example.com/cb'])
    expect(bad.status).toBe(400)
  })
})

describe('MCP OAuth HTTP — authorize', () => {
  it('chưa đăng nhập → sang /dang-nhap?next=', async () => {
    const { client_id } = (await (await register()).json()) as { client_id: string }
    const q = authorizeQuery(client_id, pkce().challenge)
    const res = await handleAuthorize(new Request(`${ORIGIN}/oauth/authorize?${q}`))
    expect(res.status).toBe(302)
    const loc = res.headers.get('location') ?? ''
    expect(loc.startsWith('/dang-nhap?next=')).toBe(true)
    expect(safeNext(decodeURIComponent(loc.slice('/dang-nhap?next='.length)))).toBeTruthy()
  })

  it('Quản lý, Thợ bị chặn ở màn Cho phép', async () => {
    const { client_id } = (await (await register()).json()) as { client_id: string }
    for (const k of ['nhung', 'trang'] as const) {
      const s = await sessionOf(k)
      const q = authorizeQuery(client_id, pkce().challenge)
      const res = await handleAuthorize(
        new Request(`${ORIGIN}/oauth/authorize?${q}`, { headers: { cookie: s.cookie } }),
      )
      expect(res.status).toBe(403)
      expect(await res.text()).toContain('Chỉ tài khoản Chủ')
    }
  })

  it('Chủ bấm Cho phép → mã về đúng redirect; không gửi scope → có quyền ghi; đổi được token', async () => {
    const linh = await sessionOf('linh')
    const { client_id } = (await (await register()).json()) as { client_id: string }
    const p = pkce()
    const { page, html, res } = await consent(linh.cookie, client_id, p.challenge)
    expect(page.headers.get('content-security-policy')).toBe(OAUTH_PAGE_CSP)
    expect(OAUTH_PAGE_CSP).not.toContain('form-action')
    expect(html).toContain('AI có thể GHI dữ liệu')
    expect(res.status).toBe(303)
    const loc = new URL(res.headers.get('location') ?? '')
    expect(`${loc.origin}${loc.pathname}`).toBe(REDIRECT)
    expect(loc.searchParams.get('state')).toBe('st1')
    const code = loc.searchParams.get('code') ?? ''
    expect(code).toMatch(/^lindymcp_ac_/)
    const t = await token(client_id, code, p.verifier)
    expect(t.status).toBe(200)
    const body = (await t.json()) as { scope: string; access_token: string }
    expect(body.scope.split(' ')).toContain('lindy:write')
    expect(body.access_token).toMatch(/^lindymcp_at_/)
  })

  it('CSRF sai bị từ chối', async () => {
    const linh = await sessionOf('linh')
    const { client_id } = (await (await register()).json()) as { client_id: string }
    const q = authorizeQuery(client_id, pkce().challenge)
    q.set('csrf', '0'.repeat(64))
    q.set('decision', 'approve')
    const res = await handleAuthorize(
      new Request(`${ORIGIN}/oauth/authorize`, {
        method: 'POST',
        headers: { cookie: linh.cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: q.toString(),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('redirect_uri chưa đăng ký → trang lỗi, không chuyển hướng', async () => {
    const linh = await sessionOf('linh')
    const { client_id } = (await (await register()).json()) as { client_id: string }
    const q = authorizeQuery(client_id, pkce().challenge)
    q.set('redirect_uri', 'https://claude.ai/khac')
    const res = await handleAuthorize(
      new Request(`${ORIGIN}/oauth/authorize?${q}`, { headers: { cookie: linh.cookie } }),
    )
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('MCP — CSP và quay lại sau đăng nhập', () => {
  it('bản build giữ CSP riêng của /oauth/*, trang khác vẫn CSP chung', () => {
    const own = new Headers({ 'Content-Security-Policy': OAUTH_PAGE_CSP })
    applySecurityHeaders(own, { path: '/oauth/authorize', dev: false })
    expect(own.get('Content-Security-Policy')).toBe(OAUTH_PAGE_CSP)
    const app = new Headers()
    applySecurityHeaders(app, { path: '/', dev: false })
    expect(app.get('Content-Security-Policy')).toContain("form-action 'self'")
    const redirect = new Headers()
    applySecurityHeaders(redirect, { path: '/oauth/authorize', dev: false })
    expect(redirect.get('Content-Security-Policy')).toContain("form-action 'self'")
  })

  it('safeNext chỉ nhận /oauth/authorize?', () => {
    expect(safeNext('/oauth/authorize?client_id=x')).toBe('/oauth/authorize?client_id=x')
    expect(safeNext('/')).toBeUndefined()
    expect(safeNext('//evil.example.com')).toBeUndefined()
    expect(safeNext('https://evil.example.com/oauth/authorize?')).toBeUndefined()
    expect(safeNext('/oauth/authorize?\\evil')).toBeUndefined()
  })
})
