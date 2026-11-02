import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../src/components/AppError'

function errorRouter(beforeLoad: () => Promise<void>) {
  const root = createRootRoute()
  const page = createRoute({ getParentRoute: () => root, path: '/', beforeLoad })
  return createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultErrorComponent: AppError,
    isServer: true,
  })
}

describe('Màn khôi phục khi route kiểm tra phiên thất bại', () => {
  it('beforeLoad lỗi Load failed vẫn hiện nút khôi phục bằng tiếng Việt', async () => {
    const router = errorRouter(async () => {
      throw new TypeError('Load failed')
    })
    await router.load()
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }))
    expect(html).toContain('Chưa kết nối được')
    expect(html).toContain('Thử lại')
    expect(html).toContain('Tải lại app')
    expect(html).not.toContain('Something went wrong')
  })

  it('invalidate chạy lại beforeLoad đã lỗi và khôi phục context phiên', async () => {
    const beforeLoad = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValue({
        me: { userId: 'user-1' },
      })
    const router = errorRouter(beforeLoad)
    await router.load()
    expect(router.state.matches.at(-1)?.status).toBe('error')
    await router.invalidate()
    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(router.state.matches.at(-1)?.context).toMatchObject({ me: { userId: 'user-1' } })
  })

  it('lỗi server không lộ thông tin kỹ thuật trên màn hình', async () => {
    const router = errorRouter(async () => {
      throw new Error('private-database-detail')
    })
    await router.load()
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }))
    expect(html).toContain('Chưa mở được trang')
    expect(html).not.toContain('private-database-detail')
  })
})
