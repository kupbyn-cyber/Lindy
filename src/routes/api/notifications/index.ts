import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { listNotifications } from '~/server/notifications/center'

export const Route = createFileRoute('/api/notifications/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50) || 50
          return Response.json({ items: await listNotifications(auth, limit) })
        }),
    },
  },
})
