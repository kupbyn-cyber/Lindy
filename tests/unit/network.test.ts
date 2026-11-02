import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isNetworkError, retryNetworkRead } from '../../src/lib/network'

describe('Khôi phục lỗi mạng khi kiểm tra phiên trên app ghim', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('Safari lỗi hai lần rồi nối lại: giữ nguyên kết quả phiên', async () => {
    const me = { userId: 'user-1', mustChangePassword: false }
    const read = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValue(me)
    const result = retryNetworkRead(read)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(result).resolves.toBe(me)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('mất mạng kéo dài: dừng sau ba lần, giữ lỗi cho màn khôi phục', async () => {
    const error = new TypeError('Load failed')
    const read = vi.fn().mockRejectedValue(error)
    const result = expect(retryNetworkRead(read)).rejects.toBe(error)
    await vi.runAllTimersAsync()
    await result
    expect(read).toHaveBeenCalledTimes(3)
  })

  it.each([
    new Error('Không có quyền'),
    new TypeError('Cannot read properties of undefined'),
    new DOMException('Đã huỷ', 'AbortError'),
    { isRedirect: true, to: '/dang-nhap' },
  ])('không thử lại lỗi nghiệp vụ, lỗi code, huỷ hoặc chuyển trang: %s', async (error) => {
    const read = vi.fn().mockRejectedValue(error)
    await expect(retryNetworkRead(read)).rejects.toBe(error)
    expect(read).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('SSR không thử lại lỗi máy chủ', async () => {
    vi.stubGlobal('window', undefined)
    const error = new TypeError('fetch failed')
    const read = vi.fn().mockRejectedValue(error)
    await expect(retryNetworkRead(read)).rejects.toBe(error)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('phiên hết hạn trả null ngay để route chuyển về đăng nhập', async () => {
    const read = vi.fn().mockResolvedValue(null)
    await expect(retryNetworkRead(read)).resolves.toBeNull()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it.each([
    new TypeError('Load failed'),
    new TypeError('Failed to fetch'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new DOMException('Connection lost', 'NetworkError'),
  ])('nhận diện lỗi kết nối của trình duyệt: %s', (error) => {
    expect(isNetworkError(error)).toBe(true)
  })
})
