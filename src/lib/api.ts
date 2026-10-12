// Gọi API từ trình duyệt. Lỗi server trả câu tiếng Việt; giữ nguyên để hiện cho người dùng.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message)
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Mất kết nối mạng. Kiểm tra mạng rồi thử lại.', 'network')
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string; data?: unknown }
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/login')) {
      window.location.href = '/dang-nhap'
    }
    throw new ApiError(res.status, d.error ?? 'Có lỗi xảy ra. Thử lại sau.', d.code, d.data)
  }
  return data as T
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra. Thử lại sau.')
