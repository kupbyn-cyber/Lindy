// Cấu hình MCP (kế hoạch docs/vibe/mcp/plan.md). Theo mẫu CEN WORK src/lib/mcp/config.server.ts.
import { env } from '../env'

export const MCP_PATH = '/api/mcp'
export const SERVER_NAME = 'lindy-os'
export const SERVER_VERSION = '1.0.0'

export const SCOPE_READ = 'lindy:read'
export const SCOPE_WRITE = 'lindy:write'
export const SCOPE_OFFLINE = 'offline_access'
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE, SCOPE_OFFLINE] as const
export const WRITE_SCOPES = [SCOPE_WRITE] as const
export type Scope = (typeof SUPPORTED_SCOPES)[number]

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const AUTH_CODE_TTL_SECONDS = 5 * 60
export const MAX_REGISTERED_CLIENTS = 500

/** Phiên bản giao thức MCP hỗ trợ, mới nhất trước. */
export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const

/** Máy chủ được nhận redirect_uri (Claude, ChatGPT, công cụ chạy trên máy). */
const ALLOWED_REDIRECT_HOSTS = [
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  'platform.openai.com',
  'localhost',
  '127.0.0.1',
  '[::1]',
]

export function allowedClientHosts() {
  return ALLOWED_REDIRECT_HOSTS
}

export type ClientLabel = 'claude' | 'chatgpt' | 'other'

/** Nhãn app để lịch sử phân biệt Claude/ChatGPT (dùng chung tài khoản Linh, không tách được người). */
export function clientLabelFromRedirects(uris: readonly string[]): ClientLabel {
  for (const raw of uris) {
    let host = ''
    try {
      host = new URL(raw).hostname.toLowerCase()
    } catch {
      continue
    }
    if (host === 'claude.ai' || host === 'claude.com' || host.endsWith('.claude.ai')) return 'claude'
    if (host === 'chatgpt.com' || host.endsWith('.openai.com') || host.endsWith('.chatgpt.com'))
      return 'chatgpt'
  }
  return 'other'
}

/**
 * Xin cả ba scope khi client không gửi scope hoặc chỉ xin bộ đọc (± offline_access), như CEN
 * (docs/cen-mcp-oauth.md "Cấp scope theo vai trò"). Xin tường minh khác thì giữ nguyên. Trả null nếu có scope lạ.
 */
export function expandRequestedScope(raw: string | null | undefined): Scope[] | null {
  const parts = [...new Set((raw ?? '').trim().split(/\s+/).filter(Boolean))]
  const supported = new Set<string>(SUPPORTED_SCOPES)
  if (parts.some((p) => !supported.has(p))) return null
  const readOnly = parts.every((p) => p === SCOPE_READ || p === SCOPE_OFFLINE)
  if (parts.length === 0 || readOnly) return [...SUPPORTED_SCOPES]
  return parts as Scope[]
}

/**
 * Địa chỉ công khai: APP_ORIGIN nếu có (https://lindy.aiduocviec.com trên hosting), không thì origin của request
 * — giống expectedOrigin() ở src/server/http/route.ts.
 */
export function publicOrigin(request: Request): string {
  const configured = env('APP_ORIGIN')
  if (configured) return configured.replace(/\/+$/, '')
  return new URL(request.url).origin
}

export function resourceUrl(origin: string) {
  return `${origin}${MCP_PATH}`
}

export function protectedResourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`
}
