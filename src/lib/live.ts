// Nhận cập nhật tức thời qua SSE; mất kết nối thì tự nối lại; quay lại app thì tải lại; SSE hỏng thì làm mới mỗi 30 giây.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

const FALLBACK_POLL_MS = 30_000

export function useLiveEvents(branchId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!branchId || typeof window === 'undefined' || !('EventSource' in window)) return
    let es: EventSource | null = null
    let healthy = false
    let stopped = false

    const refreshAll = () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    }

    const connect = () => {
      if (stopped) return
      es?.close()
      es = new EventSource('/api/events')
      es.addEventListener('ready', () => {
        if (!healthy) refreshAll() // vừa nối lại: tải lại khoảng đang xem
        healthy = true
      })
      es.addEventListener('appointments', () => void qc.invalidateQueries({ queryKey: ['appointments'] }))
      es.addEventListener('notifications', () => void qc.invalidateQueries({ queryKey: ['notifications'] }))
      es.onerror = () => {
        healthy = false
        // EventSource tự nối lại; nếu server đóng hẳn (phiên hết hạn) thì readyState = CLOSED.
        if (es?.readyState === EventSource.CLOSED) setTimeout(connect, 5000)
      }
    }

    connect()
    const poll = setInterval(() => {
      if (!healthy && document.visibilityState === 'visible') refreshAll()
    }, FALLBACK_POLL_MS)

    // iPhone tạm dừng kết nối khi app chạy nền; quay lại thì nối lại và tải lại.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshAll()
      if (!es || es.readyState === EventSource.CLOSED) connect()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)

    return () => {
      stopped = true
      es?.close()
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [branchId, qc])
}
