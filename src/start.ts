// Middleware toàn cục: header bảo mật cho mọi response [P18].
// Kiểm Origin (CSRF) nằm trong handle() của từng API route ghi; app không dùng server function để ghi.
import { createMiddleware, createStart } from '@tanstack/react-start'
import { applySecurityHeaders } from './server/http/headers'

const securityHeaders = createMiddleware().server(async ({ next, request }) => {
  // Khởi động tiến trình nền (push, việc định kỳ) ở request đầu tiên. Import động để không lọt vào bundle trình duyệt.
  const { ensureWorker } = await import('./server/worker')
  ensureWorker()
  const result = await next()
  try {
    applySecurityHeaders(result.response.headers, {
      path: new URL(request.url).pathname,
      dev: process.env.NODE_ENV !== 'production',
    })
  } catch {
    // Response có header bất biến (hiếm) — bỏ qua.
  }
  return result
})

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}))
