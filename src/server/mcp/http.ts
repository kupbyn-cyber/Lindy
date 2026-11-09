// Tiện ích HTTP cho OAuth/MCP: rate limit trong bộ nhớ, IP client, JSON không cache, CORS mở.
// Theo mẫu CEN WORK src/lib/mcp/http.server.ts. Lindy chạy 1 container nên bộ đếm trong tiến trình là đủ.

import { env } from '../env'
import { clientIp } from '../http/client-ip'
import { AppError } from '../http/errors'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 20_000

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    // Vẫn quá lớn (bị tràn khoá): xoá hết để bộ nhớ không phình — chấp nhận nới tạm thời.
    if (buckets.size > MAX_BUCKETS) buckets.clear()
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Chỉ dùng cho test (như resetWriteLimits). */
export function resetMcpRateLimits() {
  buckets.clear()
}

/** IP client theo cùng luật với đăng nhập (TRUST_PROXY=1 → phần tử cuối X-Forwarded-For). */
export function requestIp(request: Request, socketIp?: string) {
  return clientIp(request.headers, env('TRUST_PROXY') === '1', socketIp)
}

export function newRequestId() {
  return crypto.randomUUID()
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
  requestId?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...extraHeaders,
    },
  })
}

/** CORS mở (không kèm credentials) cho metadata, OAuth và MCP: trình duyệt của client MCP gọi trực tiếp được. */
export const OPEN_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
  'access-control-max-age': '600',
}

export function preflight(headers: Record<string, string> = OPEN_CORS): Response {
  return new Response(null, { status: 204, headers })
}

export function rateLimited(result: RateLimitResult, extra: Record<string, string> = {}): Response {
  return jsonResponse({ error: 'rate_limited', error_description: 'Quá nhiều yêu cầu. Thử lại sau.' }, 429, {
    'retry-after': String(result.retryAfterSeconds),
    ...extra,
  })
}

/**
 * Bọc route OAuth/MCP: không dùng handle() (kiểm Origin cùng trang) vì request đến từ Claude/ChatGPT.
 * Lỗi không lộ chi tiết; chưa có DB → 503.
 */
export async function safeRun(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof AppError && e.status === 503) {
      return jsonResponse({ error: 'temporarily_unavailable' }, 503, OPEN_CORS)
    }
    console.error('[mcp] lỗi không mong đợi:', (e as Error)?.name)
    return jsonResponse({ error: 'server_error' }, 500, OPEN_CORS)
  }
}
