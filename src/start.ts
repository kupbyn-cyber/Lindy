// Middleware toàn cục: chuẩn bị DB ở request đầu tiên (hosting), khởi động tiến trình nền, header bảo mật [P18].
// Kiểm Origin (CSRF) nằm trong handle() của từng API route ghi; app không dùng server function để ghi.
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { applySecurityHeaders } from './server/http/headers'

const serverSetup = createMiddleware().server(async ({ next, request }) => {
  // Import động để mã server không lọt vào bundle trình duyệt.
  const { ensureReady } = await import('./server/ops/release')
  const { ensureWorker } = await import('./server/worker')
  try {
    await ensureReady()
    ensureWorker()
  } catch (e) {
    // Chưa sẵn sàng (thiếu biến môi trường, DB chưa chạy): trang vẫn hiện; API báo "Chưa kết nối được dữ liệu".
    console.error('[release] chưa sẵn sàng:', (e as Error).message)
  }
  const result = await next()
  try {
    applySecurityHeaders(result.response.headers, {
      path: new URL(request.url).pathname,
      // Theo bản build, không theo NODE_ENV (hosting có thể không đặt).
      dev: import.meta.env.DEV,
    })
  } catch {
    // Response có header bất biến (hiếm) — bỏ qua.
  }
  return result
})

// Tên miền cũ → tên miền chính trong APP_ORIGIN (T05). 307 để đổi lại được mà trình duyệt không nhớ mãi.
const canonicalHost = createMiddleware().server(async ({ next, request }) => {
  const { canonicalRedirect } = await import('./server/http/canonical-host')
  const { env } = await import('./server/env')
  const location = canonicalRedirect(request, env('APP_ORIGIN'))
  if (location) {
    throw new Response(null, { status: 307, headers: { location, 'cache-control': 'no-store' } })
  }
  return next()
})

// Server function (getMeFn) cũng được chặn gọi từ trang khác.
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalHost, csrfMiddleware, serverSetup],
}))
