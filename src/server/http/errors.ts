// Lỗi nghiệp vụ trả về cho máy khách. Câu lỗi tiếng Việt, nói rõ cần làm gì.
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message)
  }
}

export const unauthorized = (msg = 'Phiên đăng nhập đã hết. Đăng nhập lại.') =>
  new AppError(401, msg, 'unauthorized')
export const forbidden = (msg = 'Không có quyền làm việc này.') => new AppError(403, msg, 'forbidden')
export const notFound = (msg = 'Không tìm thấy.') => new AppError(404, msg, 'not_found')
export const conflict = (msg: string, data?: unknown) => new AppError(409, msg, 'conflict', data)
export const invalid = (msg: string, data?: unknown) => new AppError(422, msg, 'invalid', data)
export const tooMany = (msg: string) => new AppError(429, msg, 'rate_limited')

type PgError = { code?: string; message?: string; hint?: string }

/** Đổi lỗi PostgreSQL sang lỗi HTTP. Không lộ chi tiết kỹ thuật ra ngoài. */
export function fromDbError(err: unknown): AppError | undefined {
  const e = err as PgError
  switch (e?.code) {
    case '42501':
      return forbidden(e.message?.startsWith('permission denied') ? undefined : e.message)
    case 'P0001':
      return invalid(e.message ?? 'Dữ liệu không hợp lệ.')
    case '23514':
      return invalid('Dữ liệu không hợp lệ hoặc quá dài.')
    case '23505':
      return conflict('Dữ liệu đã tồn tại.')
    case '22P02':
      return notFound()
    // Không kết nối được PostgreSQL (DB chưa bật, mất mạng tới DB)
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ETIMEDOUT':
    case 'CONNECT_TIMEOUT':
    case 'CONNECTION_CLOSED':
    case 'CONNECTION_ENDED':
    case 'CONNECTION_DESTROYED':
      return dbUnavailable()
    default:
      return undefined
  }
}

export const dbUnavailable = () =>
  new AppError(
    503,
    'Chưa kết nối được dữ liệu. Thử lại sau ít phút; vẫn lỗi thì báo người quản trị.',
    'db_unavailable',
  )
