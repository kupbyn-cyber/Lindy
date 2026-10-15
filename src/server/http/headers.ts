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
  // Vite dev cần kết nối websocket HMR, nên CSP chỉ áp khi chạy bản build.
  if (!opts.dev) headers.set('Content-Security-Policy', CSP)
  else headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'same-origin')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  const isStatic =
    /\.(js|css|png|svg|ico|woff2?|webmanifest)$/.test(opts.path) || opts.path.startsWith('/assets/')
  if (!isStatic && !headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store')
  if (opts.path.startsWith('/api/')) headers.set('Cache-Control', 'no-store')
}
