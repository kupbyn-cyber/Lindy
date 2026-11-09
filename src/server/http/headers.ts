// Header bảo mật cho mọi response [P18].
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // TanStack Start chèn script hydrate nội tuyến
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:", // blob: cho ảnh thành phẩm ghép khung trên máy (S18)
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export function applySecurityHeaders(headers: Headers, opts: { path: string; dev: boolean }) {
  // Trang Cho phép kết nối AI (/oauth/*) tự đặt CSP không có form-action: Chrome áp form-action cả lên chuyển
  // hướng sau khi POST về claude.ai/chatgpt.com, CSP chung sẽ chặn bước đó (MCP, phản biện L1).
  const keepOwnCsp = opts.path.startsWith('/oauth/') && headers.has('Content-Security-Policy')
  // Vite dev cần kết nối websocket HMR, nên CSP chỉ áp khi chạy bản build.
  if (!keepOwnCsp) headers.set('Content-Security-Policy', opts.dev ? "frame-ancestors 'none'" : CSP)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'same-origin')
  headers.set('X-Frame-Options', 'DENY')
  // Camera của chính app cho màn chụp vào ca (S59); trang khác nhúng vào không dùng được
  headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')
  const isStatic =
    /\.(js|css|png|svg|ico|woff2?|webmanifest)$/.test(opts.path) || opts.path.startsWith('/assets/')
  if (!isStatic && !headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store')
  if (opts.path.startsWith('/api/')) headers.set('Cache-Control', 'no-store')
}
