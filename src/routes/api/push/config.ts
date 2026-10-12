import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { vapidPublicKey } from '~/server/notifications/push'

// Khoá công khai VAPID cho trình duyệt đăng ký push. Khoá bí mật không bao giờ rời server [P14].
export const Route = createFileRoute('/api/push/config')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          await requireAuth(request)
          return Response.json({ publicKey: vapidPublicKey() })
        }),
    },
  },
})
