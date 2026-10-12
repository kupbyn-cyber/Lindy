// Đăng ký Web Push trên trình duyệt. iPhone: chỉ chạy khi app đã ghim ra màn hình chính (iOS 16.4+).
import { api } from './api'

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'ssr' | 'insecure' | 'ios-not-installed' | 'unsupported' }

export function isIos() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { ok: false, reason: 'ssr' }
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' }
  if (isIos() && !isStandalone()) return { ok: false, reason: 'ios-not-installed' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  return { ok: true }
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Xin quyền (phải gọi từ thao tác bấm của người dùng) rồi đăng ký với server. */
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    throw new Error('Máy chưa cho phép thông báo. Bật lại trong Cài đặt của iPhone.')
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready)
  const { publicKey } = await api<{ publicKey: string | null }>('/api/push/config')
  if (!publicKey) throw new Error('Server chưa cấu hình thông báo đẩy.')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }
  await api('/api/push/subscriptions', { body: sub.toJSON() })
}

export async function disableThisDevice(subscriptionId?: string) {
  const sub = await currentSubscription()
  if (subscriptionId) await api(`/api/push/subscriptions/${subscriptionId}`, { method: 'DELETE' })
  await sub?.unsubscribe()
}
