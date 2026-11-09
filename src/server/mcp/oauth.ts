// OAuth 2.1 (Authorization Code + PKCE S256) cho MCP. Theo mẫu CEN WORK src/lib/mcp/oauth.server.ts.
// - Mã và token là chuỗi ngẫu nhiên đục; DB chỉ lưu SHA-256 (như sessions).
// - Mỗi lần đồng ý = 1 grant; thu hồi grant vô hiệu mọi token của nó. Dùng lại mã/refresh cũ ⇒ thu hồi cả grant.
// - Chỉ tài khoản vai trò Chủ, đang hoạt động, không còn cờ phải đổi mật khẩu được cấp và dùng token; kiểm mỗi lần.
// - Đổi hoặc bị đặt lại mật khẩu ⇒ grant tạo trước đó mất hiệu lực (như web thu hồi phiên) [phản biện vòng 2 L2].
// - Bảng chỉ app_worker chạm; đường này không đọc hay ghi dữ liệu nghiệp vụ.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { type Tx, withWorker } from '../db/client'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  allowedClientHosts,
  type ClientLabel,
  clientLabelFromRedirects,
  MAX_REGISTERED_CLIENTS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './config'

// ---------------------------------------------------------------- Hàm thuần

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export type TokenKind = 'ac' | 'at' | 'rt'

export function randomToken(kind: TokenKind) {
  return `lindymcp_${kind}_${randomBytes(32).toString('base64url')}`
}

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isValidCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && CHALLENGE_RE.test(value)
}

export function verifyPkce(verifier: unknown, challenge: string) {
  if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const expected = Buffer.from(challenge)
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string }

export function validateRedirectUri(raw: unknown): Validation<string> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) {
    return { ok: false, message: 'redirect_uri không hợp lệ.' }
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, message: 'redirect_uri không hợp lệ.' }
  }
  if (url.hash || url.username || url.password) {
    return { ok: false, message: 'redirect_uri không được chứa fragment hoặc thông tin đăng nhập.' }
  }
  const host = url.hostname.toLowerCase()
  const loopback = LOOPBACK_HOSTS.has(host)
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    return { ok: false, message: 'redirect_uri phải dùng https (http chỉ cho máy cục bộ).' }
  }
  if (!allowedClientHosts().includes(host)) {
    return { ok: false, message: 'redirect_uri không thuộc danh sách máy chủ được phép.' }
  }
  return { ok: true, value: raw }
}

export function validateRedirectUris(raw: unknown): Validation<string[]> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) {
    return { ok: false, message: 'redirect_uris phải là mảng 1–5 phần tử.' }
  }
  const out: string[] = []
  for (const item of raw) {
    const checked = validateRedirectUri(item)
    if (!checked.ok) return checked
    if (!out.includes(checked.value)) out.push(checked.value)
  }
  return { ok: true, value: out }
}

/**
 * Mã CSRF cho màn Cho phép: gắn với cookie phiên (HttpOnly, trang khác không đọc được) và toàn bộ tham số
 * authorize, nên không cần thêm bí mật máy chủ.
 */
export function consentCsrfToken(sessionToken: string, canonicalParams: string) {
  return createHash('sha256').update(`lindy-mcp-consent\n${sessionToken}\n${canonicalParams}`).digest('hex')
}

export function safeEqualStrings(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// ---------------------------------------------------------------- Kiểu

export type OAuthClient = {
  clientId: string
  clientName: string | null
  redirectUris: string[]
  clientLabel: ClientLabel
}

export type TokenSet = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  userId: string
  grantId: string
  clientId: string
}

export type OAuthFailure = { error: string; description: string; status: number }
export type OAuthResult<T> = { ok: true; value: T } | ({ ok: false } & OAuthFailure)

function fail(error: string, description: string, status = 400): { ok: false } & OAuthFailure {
  return { ok: false, error, description, status }
}

export type McpPrincipal = {
  userId: string
  grantId: string
  clientId: string
  clientLabel: ClientLabel
  scopes: string[]
  resource: string
}

export type VerifyFailureReason = 'invalid' | 'expired' | 'revoked' | 'wrong_audience' | 'not_allowed'
export type VerifyResult = { ok: true; principal: McpPrincipal } | { ok: false; reason: VerifyFailureReason }

// ---------------------------------------------------------------- Ai được dùng

export type Eligibility = 'ok' | 'inactive' | 'must_change_password' | 'not_owner'

/** Tài khoản đang hoạt động, không còn cờ phải đổi mật khẩu, còn vai trò Chủ ở ít nhất một cơ sở. */
export async function eligibility(tx: Tx, userId: string): Promise<Eligibility> {
  const [u] = await tx<{ isActive: boolean; mustChangePassword: boolean; owner: boolean }[]>`
    select u.is_active, c.must_change_password,
           exists (select 1 from user_branch_roles ubr join roles r on r.id = ubr.role_id
                   where ubr.user_id = u.id and ubr.revoked_at is null and r.code = 'owner') as owner
    from users u join user_credentials c on c.user_id = u.id
    where u.id = ${userId}`
  if (!u?.isActive) return 'inactive'
  if (u.mustChangePassword) return 'must_change_password'
  if (!u.owner) return 'not_owner'
  return 'ok'
}

/** Grant còn dùng được với người này: đủ điều kiện và được tạo sau lần đổi mật khẩu gần nhất. */
async function grantUsable(tx: Tx, userId: string, grantCreatedAt: Date) {
  if ((await eligibility(tx, userId)) !== 'ok') return false
  const [c] = await tx<{ passwordChangedAt: Date }[]>`
    select password_changed_at from user_credentials where user_id = ${userId}`
  return !!c && new Date(grantCreatedAt).getTime() >= new Date(c.passwordChangedAt).getTime()
}

// ---------------------------------------------------------------- Kho dữ liệu

async function issueTokens(tx: Tx, grantId: string, scope: string[]) {
  const accessToken = randomToken('at')
  const refreshToken = randomToken('rt')
  await tx`
    insert into mcp_oauth_tokens (token_hash, kind, grant_id, expires_at) values
      (${sha256Hex(accessToken)}, 'access', ${grantId}, now() + make_interval(secs => ${ACCESS_TOKEN_TTL_SECONDS})),
      (${sha256Hex(refreshToken)}, 'refresh', ${grantId}, now() + make_interval(secs => ${REFRESH_TOKEN_TTL_SECONDS}))`
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: scope.join(' '),
  }
}

async function revokeGrantTx(tx: Tx, grantId: string, reason: string) {
  await tx`
    update mcp_oauth_grants set revoked_at = now(), revoked_reason = ${reason}
    where id = ${grantId} and revoked_at is null`
}

export async function registerClient(input: {
  name: string | null
  redirectUris: string[]
}): Promise<OAuthResult<OAuthClient>> {
  return withWorker(async (tx) => {
    const [count] = await tx<{ n: number }[]>`
      select count(*)::int as n from mcp_oauth_clients where revoked_at is null`
    if ((count?.n ?? 0) >= MAX_REGISTERED_CLIENTS) {
      return fail('temporarily_unavailable', 'Đã đạt giới hạn số client đăng ký.', 503)
    }
    const label = clientLabelFromRedirects(input.redirectUris)
    const [row] = await tx<OAuthClient[]>`
      insert into mcp_oauth_clients (client_name, redirect_uris, client_label)
      values (${input.name}, ${input.redirectUris}, ${label})
      returning client_id, client_name, redirect_uris, client_label`
    return { ok: true as const, value: row! }
  })
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!isUuid(clientId)) return null
  return withWorker(async (tx) => {
    const [row] = await tx<OAuthClient[]>`
      select client_id, client_name, redirect_uris, client_label
      from mcp_oauth_clients where client_id = ${clientId} and revoked_at is null`
    return row ?? null
  })
}

/** Người dùng đã bấm Cho phép: tạo grant + mã đăng nhập dùng một lần. Người không đủ điều kiện → lỗi. */
export async function createGrantWithCode(input: {
  userId: string
  clientId: string
  scope: string[]
  resource: string
  redirectUri: string
  codeChallenge: string
}): Promise<OAuthResult<{ code: string; grantId: string }>> {
  const code = randomToken('ac')
  return withWorker(async (tx) => {
    if ((await eligibility(tx, input.userId)) !== 'ok') {
      return fail('access_denied', 'Chỉ tài khoản Chủ kết nối được AI.', 403)
    }
    const [grant] = await tx<{ id: string }[]>`
      insert into mcp_oauth_grants (user_id, client_id, scope, resource)
      values (${input.userId}, ${input.clientId}, ${input.scope}, ${input.resource})
      returning id`
    await tx`
      insert into mcp_oauth_codes (code_hash, grant_id, redirect_uri, code_challenge, expires_at)
      values (${sha256Hex(code)}, ${grant!.id}, ${input.redirectUri}, ${input.codeChallenge},
              now() + make_interval(secs => ${AUTH_CODE_TTL_SECONDS}))`
    return { ok: true as const, value: { code, grantId: grant!.id } }
  })
}

export async function exchangeCode(input: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  resource?: string | undefined
}): Promise<OAuthResult<TokenSet>> {
  return withWorker(async (tx) => {
    const [row] = await tx<
      {
        redirectUri: string
        codeChallenge: string
        expired: boolean
        usedAt: Date | null
        grantId: string
        userId: string
        clientId: string
        scope: string[]
        resource: string
        grantCreatedAt: Date
        revokedAt: Date | null
      }[]
    >`
      select c.redirect_uri, c.code_challenge, (c.expires_at <= now()) as expired, c.used_at,
             g.id as grant_id, g.user_id, g.client_id, g.scope, g.resource, g.created_at as grant_created_at,
             g.revoked_at
      from mcp_oauth_codes c join mcp_oauth_grants g on g.id = c.grant_id
      where c.code_hash = ${sha256Hex(input.code)}
      for update of c`
    if (!row) return fail('invalid_grant', 'Mã đăng nhập không hợp lệ.')
    if (row.usedAt) {
      // Mã bị dùng lại = có thể đã bị đánh cắp: thu hồi cả grant.
      await revokeGrantTx(tx, row.grantId, 'code_reuse')
      return fail('invalid_grant', 'Mã đăng nhập đã được sử dụng.')
    }
    if (row.expired) return fail('invalid_grant', 'Mã đăng nhập đã hết hạn.')
    if (row.revokedAt) return fail('invalid_grant', 'Quyền đã bị thu hồi.')
    if (row.clientId !== input.clientId) return fail('invalid_grant', 'client_id không khớp.')
    if (row.redirectUri !== input.redirectUri) return fail('invalid_grant', 'redirect_uri không khớp.')
    if (input.resource && input.resource !== row.resource) {
      return fail('invalid_target', 'resource không khớp với yêu cầu đã cấp quyền.')
    }
    if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
      return fail('invalid_grant', 'code_verifier không hợp lệ.')
    }
    if (!(await grantUsable(tx, row.userId, row.grantCreatedAt))) {
      return fail('invalid_grant', 'Tài khoản không còn được kết nối AI.')
    }
    await tx`update mcp_oauth_codes set used_at = now() where code_hash = ${sha256Hex(input.code)}`
    const tokens = await issueTokens(tx, row.grantId, row.scope)
    return {
      ok: true as const,
      value: { ...tokens, userId: row.userId, grantId: row.grantId, clientId: row.clientId },
    }
  })
}

export async function refresh(input: {
  refreshToken: string
  clientId: string
  resource?: string | undefined
}): Promise<OAuthResult<TokenSet>> {
  return withWorker(async (tx) => {
    const [row] = await tx<
      {
        tokenId: string
        expired: boolean
        usedAt: Date | null
        tokenRevokedAt: Date | null
        grantId: string
        userId: string
        clientId: string
        scope: string[]
        resource: string
        grantCreatedAt: Date
        grantRevokedAt: Date | null
        clientRevokedAt: Date | null
      }[]
    >`
      select t.id as token_id, (t.expires_at <= now()) as expired, t.used_at, t.revoked_at as token_revoked_at,
             g.id as grant_id, g.user_id, g.client_id, g.scope, g.resource, g.created_at as grant_created_at,
             g.revoked_at as grant_revoked_at, cl.revoked_at as client_revoked_at
      from mcp_oauth_tokens t
      join mcp_oauth_grants g on g.id = t.grant_id
      join mcp_oauth_clients cl on cl.client_id = g.client_id
      where t.token_hash = ${sha256Hex(input.refreshToken)} and t.kind = 'refresh'
      for update of t`
    if (!row) return fail('invalid_grant', 'Refresh token không hợp lệ.')
    if (row.clientId !== input.clientId) return fail('invalid_grant', 'client_id không khớp.')
    if (row.grantRevokedAt || row.tokenRevokedAt || row.clientRevokedAt) {
      return fail('invalid_grant', 'Refresh token đã bị thu hồi.')
    }
    if (row.usedAt) {
      // Refresh cũ bị dùng lại ⇒ coi như bị lộ, thu hồi cả grant.
      await revokeGrantTx(tx, row.grantId, 'refresh_reuse')
      return fail('invalid_grant', 'Refresh token đã được sử dụng.')
    }
    if (row.expired) return fail('invalid_grant', 'Refresh token đã hết hạn.')
    if (input.resource && input.resource !== row.resource) {
      return fail('invalid_target', 'resource không khớp với grant.')
    }
    if (!(await grantUsable(tx, row.userId, row.grantCreatedAt))) {
      await revokeGrantTx(tx, row.grantId, 'user_not_allowed')
      return fail('invalid_grant', 'Tài khoản không còn được kết nối AI.')
    }
    await tx`update mcp_oauth_tokens set used_at = now() where id = ${row.tokenId}`
    // Gia hạn luôn giữ đúng scope của grant.
    const tokens = await issueTokens(tx, row.grantId, row.scope)
    return {
      ok: true as const,
      value: { ...tokens, userId: row.userId, grantId: row.grantId, clientId: row.clientId },
    }
  })
}

/** RFC 7009: thu hồi cả grant chứa token nếu token thuộc đúng client. Không tìm thấy → null (vẫn coi là xong). */
export async function revokeByToken(token: string, clientId: string) {
  if (!isUuid(clientId)) return null
  return withWorker(async (tx) => {
    const [row] = await tx<{ grantId: string; userId: string }[]>`
      update mcp_oauth_grants g set revoked_at = now(), revoked_reason = 'client_revoke'
      from mcp_oauth_tokens t
      where t.token_hash = ${sha256Hex(token)} and t.grant_id = g.id
        and g.client_id = ${clientId} and g.revoked_at is null
      returning g.id as grant_id, g.user_id`
    return row ?? null
  })
}

/** Thu hồi thủ công một grant (xem docs/MCP.md). */
export async function revokeGrant(grantId: string, reason: string) {
  if (!isUuid(grantId)) return false
  return withWorker(async (tx) => {
    const rows = await tx`
      update mcp_oauth_grants set revoked_at = now(), revoked_reason = ${reason}
      where id = ${grantId} and revoked_at is null returning id`
    return rows.length > 0
  })
}

/**
 * Kiểm access token của một request MCP. Danh tính (userId) CHỈ đến từ đây, không bao giờ từ nội dung request.
 * Kiểm lại quyền Chủ, khoá tài khoản, cờ đổi mật khẩu và lần đổi mật khẩu mỗi lần gọi.
 */
export async function verifyAccessToken(token: string, expectedResource: string): Promise<VerifyResult> {
  return withWorker(async (tx) => {
    const [row] = await tx<
      {
        tokenRevokedAt: Date | null
        expired: boolean
        grantId: string
        userId: string
        clientId: string
        clientLabel: ClientLabel
        scope: string[]
        resource: string
        grantCreatedAt: Date
        grantRevokedAt: Date | null
        clientRevokedAt: Date | null
        stale: boolean
      }[]
    >`
      select t.revoked_at as token_revoked_at, (t.expires_at <= now()) as expired,
             g.id as grant_id, g.user_id, g.client_id, cl.client_label, g.scope, g.resource,
             g.created_at as grant_created_at, g.revoked_at as grant_revoked_at, cl.revoked_at as client_revoked_at,
             (g.last_used_at is null or g.last_used_at < now() - interval '1 minute') as stale
      from mcp_oauth_tokens t
      join mcp_oauth_grants g on g.id = t.grant_id
      join mcp_oauth_clients cl on cl.client_id = g.client_id
      where t.token_hash = ${sha256Hex(token)} and t.kind = 'access'`
    if (!row) return { ok: false as const, reason: 'invalid' as const }
    if (row.tokenRevokedAt || row.grantRevokedAt || row.clientRevokedAt) {
      return { ok: false as const, reason: 'revoked' as const }
    }
    if (row.expired) return { ok: false as const, reason: 'expired' as const }
    if (row.resource !== expectedResource) return { ok: false as const, reason: 'wrong_audience' as const }
    if (!(await grantUsable(tx, row.userId, row.grantCreatedAt))) {
      return { ok: false as const, reason: 'not_allowed' as const }
    }
    if (row.stale) await tx`update mcp_oauth_grants set last_used_at = now() where id = ${row.grantId}`
    return {
      ok: true as const,
      principal: {
        userId: row.userId,
        grantId: row.grantId,
        clientId: row.clientId,
        clientLabel: row.clientLabel,
        scopes: row.scope,
        resource: row.resource,
      },
    }
  })
}
