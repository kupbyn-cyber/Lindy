import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { listMySubscriptions, registerSubscription, SubscriptionBody } from '~/server/notifications/push'

export const Route = createFileRoute('/api/push/subscriptions')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const items = await listMySubscriptions(auth)
          return Response.json({
            items: items.map((s) => ({
              ...s,
              thisDevice: s.sessionId === auth.sessionId,
              sessionId: undefined,
            })),
          })
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, SubscriptionBody)
          const id = await registerSubscription(auth, body, request.headers.get('user-agent'))
          return Response.json({ id })
        }),
    },
  },
})
