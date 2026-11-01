// Bàn phím iOS không co layout viewport: dvh, sticky, fixed đều nằm dưới bàn phím. Hook đo visualViewport rồi ghi chiều cao
// bàn phím vào biến --kb; thanh nút, bảng trượt, hộp thoại, toast cùng đọc biến này (S52). Không có bàn phím thì --kb = 0.
import { useEffect } from 'react'

const MIN_KEYBOARD = 100

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const write = (px: number) => root.style.setProperty('--kb', `${px}px`)
    const measure = () => {
      const h = window.innerHeight - vv.height - vv.offsetTop
      write(h >= MIN_KEYBOARD ? Math.round(h) : 0)
    }
    // Rời ô nhập: trả về 0 ngay, một số bản iOS không báo resize khi bàn phím đóng
    const blur = () => {
      setTimeout(() => {
        if (!document.activeElement?.matches('input, textarea, select')) write(0)
      }, 100)
    }
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    document.addEventListener('focusout', blur)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
      document.removeEventListener('focusout', blur)
      write(0)
    }
  }, [])
}
