// Bọc mọi API route: kiểm Origin cho request ghi, đổi lỗi sang JSON tiếng Việt, không lộ chi tiết kỹ thuật.
import { z } from 'zod'
import { env } from '../env'
import { AppError, forbidden, fromDbError, invalid, tooMany } from './errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const MAX_BODY = 64 * 1024

/** Nguồn hợp lệ: APP_ORIGIN (khi chạy sau proxy) hoặc nguồn của chính request. */
export function expectedOrigin(request: Request) {
  return env('APP_ORIGIN') ?? new URL(request.url).origin
}

/** Chặn request ghi từ trang khác (CSRF). Thiếu Origin thì phải có Sec-Fetch-Site: same-origin. */
export function assertSameOrigin(request: Request) {
  if (SAFE_METHODS.has(request.method)) return
  const origin = request.headers.get('origin')
  if (origin) {
    if (origin !== expectedOrigin(request)) throw forbidden('Yêu cầu không hợp lệ.')
    return
  }
  if (request.headers.get('sec-fetch-site') !== 'same-origin') throw forbidden('Yêu cầu không hợp lệ.')
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    return Response.json({ error: e.message, code: e.code, data: e.data }, { status: e.status })
  }
  if (e instanceof z.ZodError) {
    const first = e.issues[0]
    return Response.json(
      {
        error:
          first?.message && !first.message.startsWith('Invalid') ? first.message : 'Dữ liệu không hợp lệ.',
        code: 'invalid',
      },
      { status: 422 },
    )
  }
  const db = fromDbError(e)
  if (db) return errorResponse(db)
  // Chỉ ghi loại lỗi, không ghi nội dung request, cookie [P14].
  console.error('[api] lỗi không mong đợi:', (e as Error)?.name, (e as Error)?.message)
  return Response.json({ error: 'Có lỗi xảy ra. Thử lại sau.', code: 'internal' }, { status: 500 })
}

export async function handle(request: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    assertSameOrigin(request)
    return await fn()
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * API cho trạm in (Đợt 7): xác thực bằng mã kết nối trong header `Authorization: Bearer …`, không dùng cookie nên
 * không cần kiểm Origin. Thiếu mã → 401.
 */
export async function handleStation(
  request: Request,
  fn: (token: string) => Promise<Response>,
): Promise<Response> {
  try {
    const m = /^Bearer ([\w-]{20,100})$/.exec(request.headers.get('authorization') ?? '')
    if (!m) throw new AppError(401, 'Thiếu mã kết nối trạm in.', 'unauthorized')
    return await fn(m[1]!)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * Đọc body JSON có giới hạn kích thước và kiểm bằng zod (schema nên dùng .strict()). Mặc định 64KB; API nhận file (nhập
 * dữ liệu cũ) đặt giới hạn riêng.
 */
export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  max = MAX_BODY,
): Promise<z.infer<T>> {
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > max) throw invalid('Dữ liệu gửi lên quá lớn.')
  const text = await request.text()
  if (text.length > max) throw invalid('Dữ liệu gửi lên quá lớn.')
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw invalid('Dữ liệu không hợp lệ.')
  }
  return schema.parse(data)
}

export function ok(data: unknown, init?: ResponseInit) {
  return Response.json(data, init)
}

// ---------------------------------------------------------------- Giới hạn tần suất ghi [P11]

const WRITE_LIMIT = 30
const WINDOW_MS = 60_000
const buckets = new Map<string, number[]>()

/** Tối đa 30 thao tác ghi/phút mỗi người. Một server nên giữ trong bộ nhớ là đủ. */
export function limitWrites(userId: string, now = Date.now()) {
  const list = (buckets.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= WRITE_LIMIT) {
    buckets.set(userId, list)
    throw tooMany('Thao tác quá nhanh. Thử lại sau ít phút.')
  }
  list.push(now)
  buckets.set(userId, list)
}

export function resetWriteLimits() {
  buckets.clear()
  sensitive.clear()
}

// ---------------------------------------------------------------- Giới hạn mở hồ sơ có SĐT đầy đủ [P38]

export const SENSITIVE_LIMIT = 60
const SENSITIVE_WINDOW_MS = 10 * 60_000
const sensitive = new Map<string, Map<string, number>>()

/**
 * Hồ sơ khách, chi tiết lịch, chi tiết đơn trả SĐT đầy đủ: mỗi người mở tối đa 60 hồ sơ khác nhau trong 10 phút.
 * Đếm theo hồ sơ khác nhau nên tải lại cùng một hồ sơ (cập nhật tức thời) không bị tính thêm.
 */
export function limitSensitiveReads(userId: string, key: string, now = Date.now()) {
  const seen = sensitive.get(userId) ?? new Map<string, number>()
  for (const [k, t] of seen) if (now - t >= SENSITIVE_WINDOW_MS) seen.delete(k)
  if (!seen.has(key)) {
    if (seen.size >= SENSITIVE_LIMIT) {
      sensitive.set(userId, seen)
      throw tooMany('Mở quá nhiều hồ sơ trong thời gian ngắn. Thử lại sau ít phút.')
    }
    seen.set(key, now)
  }
  sensitive.set(userId, seen)
}
