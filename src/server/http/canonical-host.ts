// Mở app bằng tên miền khác APP_ORIGIN (tên miền cũ *.n2.tinhgon.xyz) thì chuyển sang tên miền chính (T05).
// Không chuyển: thao tác ghi (đã chặn bằng kiểm Origin), /api/health, API trạm in (trạm in cũ vẫn chạy),
// và địa chỉ nội bộ (localhost, IP, tên máy trong cụm) để hosting kiểm tra container không bị chuyển đi.

const KEEP_PATHS = ['/api/health', '/api/print/agent/']

function isInternalHost(hostname: string) {
  const h = hostname.toLowerCase()
  if (!h.includes('.') || h.startsWith('[') || /^\d+(\.\d+){3}$/.test(h)) return true
  return /(^|\.)localhost$|\.(local|internal|svc|lan)$/.test(h)
}

/** Tên miền người dùng gõ: lấy từ proxy (X-Forwarded-Host, giá trị đầu) hoặc Host của request. */
function requestHost(request: Request) {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  return (forwarded || new URL(request.url).host).toLowerCase()
}

/** Địa chỉ cần chuyển tới, hoặc null nếu giữ nguyên. */
export function canonicalRedirect(request: Request, appOrigin: string | undefined): string | null {
  if (!appOrigin || (request.method !== 'GET' && request.method !== 'HEAD')) return null
  let target: URL
  try {
    target = new URL(appOrigin)
  } catch {
    return null
  }
  const host = requestHost(request)
  const hostname = host.replace(/:\d+$/, '')
  if (host === target.host || isInternalHost(hostname)) return null
  const url = new URL(request.url)
  if (KEEP_PATHS.some((p) => (p.endsWith('/') ? url.pathname.startsWith(p) : url.pathname === p))) return null
  return `${target.origin}${url.pathname}${url.search}`
}
