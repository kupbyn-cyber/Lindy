// Các endpoint OAuth 2.1: /oauth/register, /oauth/authorize, /oauth/token, /oauth/revoke.
// Theo mẫu CEN WORK src/lib/mcp/oauth-http.server.ts. Người dùng xác thực bằng phiên đăng nhập Lindy;
// chưa đăng nhập thì sang /dang-nhap?next=… rồi quay lại. Chỉ tài khoản Chủ được cấp quyền.
import { getAuth } from '../auth/context'
import { readSessionToken } from '../auth/session'
import { withWorker } from '../db/client'
import { writeMcpAudit } from './audit'
import { type ClientLabel, expandRequestedScope, publicOrigin, resourceUrl, WRITE_SCOPES } from './config'
import { jsonResponse, newRequestId, OPEN_CORS, preflight, rateLimit, rateLimited, requestIp } from './http'
import {
  consentCsrfToken,
  createGrantWithCode,
  eligibility,
  exchangeCode,
  getClient,
  isValidCodeChallenge,
  type OAuthClient,
  refresh,
  registerClient,
  revokeByToken,
  safeEqualStrings,
  validateRedirectUris,
} from './oauth'

const MAX_BODY_BYTES = 16 * 1024

// ---------------------------------------------------------------- Trang HTML

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * CSP riêng của trang Cho phép. Không đặt form-action: Chrome áp form-action cả lên chuỗi chuyển hướng sau khi
 * POST (về redirect_uri của Claude/ChatGPT) [phản biện L1]. Cho phép font của design system.
 */
export const OAUTH_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'"

const PAGE_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  pragma: 'no-cache',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': OAUTH_PAGE_CSP,
}

// Màu theo src/styles/tokens.css (sáng mặc định, tối theo máy)
const PAGE_STYLE = `
  :root{color-scheme:light dark;--surface:#f6f6f7;--raised:#fff;--line:#d9d9dd;--ink:#111113;--muted:#5e5e65;
        --accent:#111113;--on-accent:#fff;--warning:#9c4a00;--warning-soft:#fcebda}
  @media (prefers-color-scheme:dark){:root{--surface:#0b0b0c;--raised:#161618;--line:#2c2c30;--ink:#f3f3f5;
        --muted:#a1a1a8;--accent:#f3f3f5;--on-accent:#111113;--warning:#f0a35e;--warning-soft:#3a2614}}
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:var(--surface);
       color:var(--ink);font:15px/1.5 'Be Vietnam Pro',system-ui,-apple-system,sans-serif;padding:16px;box-sizing:border-box}
  main{width:100%;max-width:30rem;background:var(--raised);border:1px solid var(--line);border-radius:16px;padding:24px}
  h1{font-size:13px;margin:0 0 6px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  h2{font-size:18px;margin:4px 0 12px}
  h3{font-size:13px;margin:16px 0 4px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
  p{margin:8px 0;color:var(--muted)}
  .who{border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:var(--ink)}
  ul{margin:6px 0;padding-left:20px}
  li{margin:4px 0}
  .warn{background:var(--warning-soft);color:var(--warning);border-radius:12px;padding:10px 12px;margin-top:12px}
  .actions{display:flex;gap:12px;margin-top:20px}
  button{flex:1;padding:12px 14px;border-radius:999px;border:1px solid var(--line);font:inherit;cursor:pointer;
         background:transparent;color:var(--ink)}
  .approve{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:600}
  .note{font-size:13px}
`

function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600&display=swap">' +
      `<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>` +
      `<body><main>${body}</main></body></html>`,
    { status, headers: PAGE_HEADERS },
  )
}

function errorPage(message: string, status = 400): Response {
  return htmlPage(
    'Không thể kết nối — LINDY OS',
    `<h1>LINDY OS</h1><h2>Không thể kết nối</h2><p>${escapeHtml(message)}</p>` +
      '<p class="note">Có thể đóng trang này và thử kết nối lại từ ứng dụng.</p>',
    status,
  )
}

// ---------------------------------------------------------------- Đọc body

async function readBodyText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return null
  const text = await request.text()
  return new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES ? null : text
}

/** Form (urlencoded) hoặc JSON phẳng → URLSearchParams. Quá lớn / không hợp lệ → null. */
async function readParams(request: Request): Promise<URLSearchParams | null> {
  const text = await readBodyText(request)
  if (text === null) return null
  const type = (request.headers.get('content-type') ?? '').toLowerCase()
  if (type.includes('application/json')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
      const out = new URLSearchParams()
      for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string') out.set(key, value)
      return out
    } catch {
      return null
    }
  }
  return new URLSearchParams(text)
}

function oauthError(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, status, OPEN_CORS)
}

// ---------------------------------------------------------------- /oauth/register (RFC 7591)

export async function handleRegister(request: Request, socketIp?: string): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method === 'OPTIONS') return preflight()
  if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, OPEN_CORS)
  const limit = rateLimit(`oauth:register:${requestIp(request, socketIp)}`, 10, 60 * 60_000)
  if (!limit.allowed) return rateLimited(limit, OPEN_CORS)

  const text = await readBodyText(request)
  let meta: Record<string, unknown>
  try {
    const parsed = JSON.parse(text ?? '') as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not object')
    meta = parsed as Record<string, unknown>
  } catch {
    return oauthError('invalid_client_metadata', 'Body phải là JSON object hợp lệ.')
  }
  const uris = validateRedirectUris(meta.redirect_uris)
  if (!uris.ok) return oauthError('invalid_redirect_uri', uris.message)
  const authMethod = meta.token_endpoint_auth_method
  if (authMethod !== undefined && authMethod !== 'none') {
    return oauthError('invalid_client_metadata', 'Chỉ hỗ trợ token_endpoint_auth_method = "none" (PKCE).')
  }
  const grantTypes = meta.grant_types
  if (grantTypes !== undefined) {
    const allowed = ['authorization_code', 'refresh_token']
    if (!Array.isArray(grantTypes) || grantTypes.some((g) => typeof g !== 'string' || !allowed.includes(g))) {
      return oauthError('invalid_client_metadata', 'grant_types chỉ gồm authorization_code, refresh_token.')
    }
  }
  const responseTypes = meta.response_types
  if (
    responseTypes !== undefined &&
    (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== 'code'))
  ) {
    return oauthError('invalid_client_metadata', 'response_types chỉ gồm "code".')
  }
  const rawName = typeof meta.client_name === 'string' ? meta.client_name : ''
  const name =
    [...rawName]
      .map((ch) => {
        const c = ch.charCodeAt(0)
        return c < 32 || c === 127 ? ' ' : ch
      })
      .join('')
      .trim()
      .slice(0, 80) || 'MCP client'
  const created = await registerClient({ name, redirectUris: uris.value })
  if (!created.ok) return oauthError(created.error, created.description, created.status)
  return jsonResponse(
    {
      client_id: created.value.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: created.value.clientName,
      redirect_uris: created.value.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'lindy:read lindy:write offline_access',
    },
    201,
    OPEN_CORS,
  )
}

// ---------------------------------------------------------------- /oauth/authorize

type AuthorizeParams = {
  clientId: string
  redirectUri: string
  responseType: string
  scopeRaw: string
  state: string
  codeChallenge: string
  codeChallengeMethod: string
  resources: string[]
}

function readAuthorizeParams(params: URLSearchParams): AuthorizeParams {
  return {
    clientId: params.get('client_id') ?? '',
    redirectUri: params.get('redirect_uri') ?? '',
    responseType: params.get('response_type') ?? '',
    scopeRaw: params.get('scope') ?? '',
    state: params.get('state') ?? '',
    codeChallenge: params.get('code_challenge') ?? '',
    codeChallengeMethod: params.get('code_challenge_method') ?? '',
    resources: params.getAll('resource'),
  }
}

function canonicalParams(p: AuthorizeParams, scope: string[]) {
  return JSON.stringify([
    p.clientId,
    p.redirectUri,
    p.responseType,
    scope.join(' '),
    p.state,
    p.codeChallenge,
    p.codeChallengeMethod,
    p.resources,
  ])
}

function redirectToClient(
  redirectUri: string,
  origin: string,
  values: Record<string, string>,
  status: 302 | 303 = 302,
): Response {
  const target = new URL(redirectUri)
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value)
  target.searchParams.set('iss', origin)
  return new Response(null, {
    status,
    headers: { location: target.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'lindy:read':
    'Xem lịch hẹn, đơn hàng, khách hàng, báo cáo doanh thu, lợi nhuận, sổ tiền, thu chi, cọc, chấm công, lương, tạm ứng.',
  'lindy:write':
    'Tạo, sửa, huỷ lịch hẹn; ghi đề nghị chi; duyệt công, nghỉ, tạm ứng; sửa tên, SĐT khách — chỉ sau khi anh/chị xem bản xem trước và đồng ý.',
  offline_access: 'Giữ kết nối, không phải đăng nhập lại mỗi giờ.',
}

export async function handleAuthorize(request: Request, socketIp?: string): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'POST') return errorPage('Phương thức không được hỗ trợ.', 405)
  const limit = rateLimit(`oauth:authorize:${requestIp(request, socketIp)}`, 60, 60_000)
  if (!limit.allowed) {
    return htmlPage(
      'Quá nhiều yêu cầu — LINDY OS',
      `<h1>LINDY OS</h1><p>Quá nhiều yêu cầu. Thử lại sau ${limit.retryAfterSeconds} giây.</p>`,
      429,
    )
  }
  const origin = publicOrigin(request)
  const url = new URL(request.url)
  let source: URLSearchParams
  if (method === 'POST') {
    const body = await readParams(request)
    if (!body) return errorPage('Yêu cầu không hợp lệ hoặc quá lớn.')
    source = body
  } else {
    source = url.searchParams
  }
  const p = readAuthorizeParams(source)

  // 1) Lỗi không chuyển hướng về client: client_id / redirect_uri chưa tin cậy.
  const client: OAuthClient | null = await getClient(p.clientId)
  if (!client) return errorPage('Ứng dụng yêu cầu kết nối chưa được đăng ký hoặc đã bị thu hồi.')
  if (!p.redirectUri || !client.redirectUris.includes(p.redirectUri)) {
    return errorPage('redirect_uri không khớp với ứng dụng đã đăng ký.')
  }

  // 2) redirect_uri đã tin cậy: báo lỗi về client theo RFC 6749 §4.1.2.1.
  const fail = (error: string, description: string) =>
    redirectToClient(p.redirectUri, origin, {
      error,
      error_description: description,
      ...(p.state ? { state: p.state } : {}),
    })
  if (p.responseType !== 'code') return fail('unsupported_response_type', 'Chỉ hỗ trợ response_type=code.')
  if (p.codeChallengeMethod !== 'S256' || !isValidCodeChallenge(p.codeChallenge)) {
    return fail('invalid_request', 'Bắt buộc PKCE với code_challenge_method=S256.')
  }
  const scope = expandRequestedScope(p.scopeRaw)
  if (!scope) return fail('invalid_scope', 'Có scope không được hỗ trợ.')
  const expectedResource = resourceUrl(origin)
  if (p.resources.some((r) => r !== expectedResource)) {
    return fail('invalid_target', 'resource không phải máy chủ MCP của LINDY OS.')
  }

  // 3) Người dùng: phiên đăng nhập Lindy hiện tại.
  const sessionToken = readSessionToken(request)
  const auth = await getAuth(request)
  if (!auth || !sessionToken) {
    if (method === 'POST') return errorPage('Phiên đăng nhập đã hết hạn. Thử kết nối lại.', 401)
    const back = `${url.pathname}${url.search}`
    return new Response(null, {
      status: 302,
      headers: { location: `/dang-nhap?next=${encodeURIComponent(back)}`, 'cache-control': 'no-store' },
    })
  }
  const allowed = await withWorker((tx) => eligibility(tx, auth.userId))
  if (allowed === 'must_change_password') {
    return errorPage('Đổi mật khẩu trong app trước, rồi kết nối lại.', 403)
  }
  if (allowed !== 'ok') return errorPage('Chỉ tài khoản Chủ kết nối được AI với LINDY OS.', 403)

  const canonical = canonicalParams(p, scope)
  const expectedCsrf = consentCsrfToken(sessionToken, canonical)

  if (method === 'GET') {
    const item = (name: string) => `<li>${escapeHtml(SCOPE_DESCRIPTIONS[name] ?? name)}</li>`
    const writes = scope.filter((s) => (WRITE_SCOPES as readonly string[]).includes(s))
    const reads = scope.filter((s) => !(WRITE_SCOPES as readonly string[]).includes(s))
    const hidden = (name: string, value: string) =>
      `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`
    const appName =
      client.clientLabel === 'claude'
        ? 'Claude'
        : client.clientLabel === 'chatgpt'
          ? 'ChatGPT'
          : 'Ứng dụng AI'
    return htmlPage(
      'Kết nối AI — LINDY OS',
      '<h1>LINDY OS</h1>' +
        `<h2>${escapeHtml(appName)} muốn kết nối với LINDY OS</h2>` +
        `<div class="who">Đang đăng nhập: <strong>${escapeHtml(auth.displayName)}</strong></div>` +
        `<h3>Được xem</h3><ul>${reads.map(item).join('')}</ul>` +
        (writes.length > 0
          ? `<h3>Được ghi</h3><ul>${writes.map(item).join('')}</ul>` +
            '<p class="warn"><strong>AI có thể GHI dữ liệu</strong> (sau khi anh/chị xem trước và đồng ý từng thao tác).</p>'
          : '') +
        '<p class="note">Có thể thu hồi kết nối bất cứ lúc nào.</p>' +
        '<form method="post" action="/oauth/authorize">' +
        hidden('client_id', p.clientId) +
        hidden('redirect_uri', p.redirectUri) +
        hidden('response_type', p.responseType) +
        hidden('scope', p.scopeRaw) +
        hidden('state', p.state) +
        hidden('code_challenge', p.codeChallenge) +
        hidden('code_challenge_method', p.codeChallengeMethod) +
        p.resources.map((r) => hidden('resource', r)).join('') +
        hidden('csrf', expectedCsrf) +
        '<div class="actions">' +
        '<button type="submit" name="decision" value="deny">Từ chối</button>' +
        '<button class="approve" type="submit" name="decision" value="approve">Cho phép</button>' +
        '</div></form>',
    )
  }

  // POST — người dùng bấm nút.
  if (!safeEqualStrings(source.get('csrf') ?? '', expectedCsrf)) {
    return errorPage('Yêu cầu không hợp lệ. Thử kết nối lại.', 403)
  }
  const auditBase = { requestId: newRequestId(), client: client.clientLabel, clientId: client.clientId }
  if (source.get('decision') !== 'approve') {
    await writeMcpAudit(auth.userId, {
      ...auditBase,
      action: 'mcp.oauth.authorize',
      outcome: 'denied',
      errorCode: 'USER_DENIED',
    })
    return redirectToClient(
      p.redirectUri,
      origin,
      {
        error: 'access_denied',
        error_description: 'Người dùng đã từ chối.',
        ...(p.state ? { state: p.state } : {}),
      },
      303,
    )
  }
  const created = await createGrantWithCode({
    userId: auth.userId,
    clientId: client.clientId,
    scope,
    resource: expectedResource,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
  })
  if (!created.ok) return errorPage(created.description, created.status)
  await writeMcpAudit(auth.userId, {
    ...auditBase,
    grantId: created.value.grantId,
    action: 'mcp.oauth.authorize',
    outcome: 'success',
  })
  return redirectToClient(
    p.redirectUri,
    origin,
    { code: created.value.code, ...(p.state ? { state: p.state } : {}) },
    303,
  )
}

// ---------------------------------------------------------------- /oauth/token

export async function handleToken(request: Request, socketIp?: string): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method === 'OPTIONS') return preflight()
  if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, OPEN_CORS)
  const limit = rateLimit(`oauth:token:${requestIp(request, socketIp)}`, 30, 60_000)
  if (!limit.allowed) return rateLimited(limit, OPEN_CORS)
  const params = await readParams(request)
  if (!params) return oauthError('invalid_request', 'Body không hợp lệ hoặc quá lớn.')
  if (request.headers.get('authorization') || params.has('client_secret')) {
    return oauthError('invalid_client', 'Chỉ hỗ trợ public client (PKCE), không dùng client secret.', 401)
  }
  const client = await getClient(params.get('client_id') ?? '')
  if (!client) return oauthError('invalid_client', 'client_id không hợp lệ.', 401)

  const requestId = newRequestId()
  const grantType = params.get('grant_type')
  const resource = params.get('resource') ?? undefined
  let result: Awaited<ReturnType<typeof exchangeCode>>
  if (grantType === 'authorization_code') {
    const code = params.get('code') ?? ''
    const redirectUri = params.get('redirect_uri') ?? ''
    const codeVerifier = params.get('code_verifier') ?? ''
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError('invalid_request', 'Thiếu code, redirect_uri hoặc code_verifier.')
    }
    result = await exchangeCode({ code, clientId: client.clientId, redirectUri, codeVerifier, resource })
  } else if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token') ?? ''
    if (!refreshToken) return oauthError('invalid_request', 'Thiếu refresh_token.')
    result = await refresh({ refreshToken, clientId: client.clientId, resource })
  } else {
    return oauthError('unsupported_grant_type', 'Chỉ hỗ trợ authorization_code và refresh_token.')
  }
  if (!result.ok) return oauthError(result.error, result.description, result.status)

  const tokens = result.value
  await writeMcpAudit(tokens.userId, {
    requestId,
    client: client.clientLabel as ClientLabel,
    clientId: client.clientId,
    grantId: tokens.grantId,
    action: 'mcp.oauth.token',
    outcome: 'success',
    detail: grantType === 'refresh_token' ? 'refresh' : 'code_exchange',
  })
  return jsonResponse(
    {
      access_token: tokens.access_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
    },
    200,
    OPEN_CORS,
    requestId,
  )
}

// ---------------------------------------------------------------- /oauth/revoke (RFC 7009)

export async function handleRevoke(request: Request, socketIp?: string): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method === 'OPTIONS') return preflight()
  if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, OPEN_CORS)
  const limit = rateLimit(`oauth:revoke:${requestIp(request, socketIp)}`, 30, 60_000)
  if (!limit.allowed) return rateLimited(limit, OPEN_CORS)
  const params = await readParams(request)
  if (!params) return oauthError('invalid_request', 'Body không hợp lệ hoặc quá lớn.')
  const token = params.get('token') ?? ''
  const clientId = params.get('client_id') ?? ''
  if (!token || !clientId) return oauthError('invalid_request', 'Thiếu token hoặc client_id.')
  const revoked = await revokeByToken(token, clientId)
  if (revoked) {
    await writeMcpAudit(revoked.userId, {
      requestId: newRequestId(),
      client: 'other',
      clientId,
      grantId: revoked.grantId,
      action: 'mcp.oauth.revoke',
      outcome: 'success',
    })
  }
  // RFC 7009: luôn 200 dù token có tồn tại hay không.
  return jsonResponse({}, 200, OPEN_CORS)
}
