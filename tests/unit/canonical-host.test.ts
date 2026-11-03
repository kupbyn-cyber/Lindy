import { describe, expect, it } from 'vitest'
import { canonicalRedirect } from '../../src/server/http/canonical-host'

const ORIGIN = 'https://lindy.aiduocviec.com'

function req(url: string, init: { method?: string; host?: string } = {}) {
  const headers = new Headers()
  if (init.host) headers.set('x-forwarded-host', init.host)
  return new Request(url, { method: init.method ?? 'GET', headers })
}

describe('Chuyển tên miền cũ sang tên miền chính (T05)', () => {
  it('tên miền cũ: chuyển sang tên miền chính, giữ đường dẫn và tham số', () => {
    expect(canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/lich?ngay=2026-11-04'), ORIGIN)).toBe(
      'https://lindy.aiduocviec.com/lich?ngay=2026-11-04',
    )
  })

  it('proxy báo tên miền qua X-Forwarded-Host', () => {
    expect(canonicalRedirect(req('http://10.0.0.5:3000/', { host: 'lindy.n2.tinhgon.xyz' }), ORIGIN)).toBe(
      'https://lindy.aiduocviec.com/',
    )
  })

  it('đúng tên miền chính: giữ nguyên', () => {
    expect(canonicalRedirect(req('https://lindy.aiduocviec.com/'), ORIGIN)).toBeNull()
    expect(
      canonicalRedirect(req('http://10.0.0.5:3000/', { host: 'Lindy.AiDuocViec.com' }), ORIGIN),
    ).toBeNull()
  })

  it('thao tác ghi không chuyển (kiểm Origin vẫn chặn)', () => {
    expect(
      canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/api/auth/login', { method: 'POST' }), ORIGIN),
    ).toBeNull()
  })

  it('/api/health và API trạm in giữ chạy ở tên miền cũ', () => {
    expect(canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/api/health'), ORIGIN)).toBeNull()
    expect(canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/api/print/agent/next'), ORIGIN)).toBeNull()
    expect(canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/api/print/jobs'), ORIGIN)).not.toBeNull()
  })

  it.each([
    'http://localhost:3000/',
    'http://127.0.0.1:3000/',
    'http://[::1]:3000/',
    'http://lindy-web:3000/',
    'http://lindy.default.svc:3000/',
    'http://app.localhost:3000/',
  ])('địa chỉ nội bộ %s: giữ nguyên', (url) => {
    expect(canonicalRedirect(req(url), ORIGIN)).toBeNull()
  })

  it('chưa đặt hoặc đặt sai APP_ORIGIN: giữ nguyên', () => {
    expect(canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/'), undefined)).toBeNull()
    expect(canonicalRedirect(req('https://lindy.n2.tinhgon.xyz/'), 'khong-phai-url')).toBeNull()
  })
})
