import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites } from '~/server/http/route'
import { disableSubscription } from '~/server/notifications/push'

// Tắt nhận thông báo trên một máy của chính mình; máy của người khác → 404 [P12].
export const Route = createFileRoute('/api/push/subscriptions/$id')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          await disableSubscription(auth, params.id)
          return Response.json({ ok: true })
        }),
    },
  },
})
