// Service worker LINDY OS: chỉ xử lý thông báo đẩy và chạm thông báo. Không cache offline (V1 không có offline).
/* eslint-disable no-restricted-globals */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = typeof data.title === 'string' ? data.title : 'LINDY OS'
  const body = typeof data.body === 'string' ? data.body : 'Có thông báo mới — mở app xem.'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  )
})

// Chỉ mở đường dẫn cùng origin; URL lạ thì mở trang chủ [P19].
function safeUrl(raw) {
  try {
    const u = new URL(typeof raw === 'string' ? raw : '/', self.location.origin)
    return u.origin === self.location.origin ? u.pathname + u.search : '/'
  } catch {
    return '/'
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = safeUrl(event.notification.data?.url)
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) return client.navigate(target)
          return
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})
