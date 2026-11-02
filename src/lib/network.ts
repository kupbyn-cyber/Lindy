// Safari/PWA có thể mất kết nối ngắn khi mở lại app từ nền.
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error.name === 'TypeError' &&
      /^(Load failed|Failed to fetch|fetch failed|NetworkError when attempting to fetch resource\.?)$/i.test(
        error.message,
      )) ||
      error.name === 'NetworkError')
  )
}

/** Chỉ dùng cho thao tác đọc; thử lại cả việc nhận body, không tự gửi lại thao tác ghi. */
export async function retryNetworkRead<T>(read: () => Promise<T>): Promise<T> {
  const delays = [500, 1500]
  for (let attempt = 0; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      const delay = delays[attempt]
      // SSR không có kết nối trình duyệt cần khôi phục; giữ nguyên lỗi server/quyền/điều hướng.
      if (typeof window === 'undefined' || delay === undefined || !isNetworkError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
