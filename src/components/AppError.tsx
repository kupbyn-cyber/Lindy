import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isNetworkError } from '~/lib/network'
import { Button } from './ui'

/** Luôn có lối khôi phục, kể cả khi beforeLoad lỗi trước khi khung app được dựng. */
export function AppError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const networkError = isNetworkError(error)
  const busy = useRef(false)
  const [retrying, setRetrying] = useState(false)

  const retry = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRetrying(true)
    try {
      // reset() đơn lẻ không chạy lại beforeLoad đã lỗi.
      await router.invalidate()
      reset?.()
    } catch {
      // Nếu vẫn lỗi, giữ màn khôi phục để người dùng có thể tải lại toàn bộ app.
    } finally {
      busy.current = false
      setRetrying(false)
    }
  }, [router, reset])

  useEffect(() => {
    if (!networkError) return
    const onReconnect = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void retry()
    }
    window.addEventListener('online', onReconnect)
    document.addEventListener('visibilitychange', onReconnect)
    return () => {
      window.removeEventListener('online', onReconnect)
      document.removeEventListener('visibilitychange', onReconnect)
    }
  }, [networkError, retry])

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 pt-[env(safe-area-inset-top)]">
      <p className="wordmark m-0">LINDY OS</p>
      <div role="alert">
        <h1 className="screen-title mt-0 mb-2">
          {networkError ? 'Chưa kết nối được' : 'Chưa mở được trang'}
        </h1>
        <p className="body text-ink-muted m-0">
          {networkError
            ? 'Kiểm tra Wi-Fi hoặc mạng di động rồi thử lại.'
            : 'Thử lại hoặc tải lại app. Nếu vẫn lỗi, báo người quản trị.'}
        </p>
      </div>
      <Button variant="primary" block loading={retrying} loadingText="Đang thử lại…" onClick={retry}>
        Thử lại
      </Button>
      <Button variant="secondary" block onClick={() => window.location.reload()}>
        Tải lại app
      </Button>
    </main>
  )
}
