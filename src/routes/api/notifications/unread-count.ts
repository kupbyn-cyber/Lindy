import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { unreadCount } from '~/server/notifications/center'

export const Route = createFileRoute('/api/notifications/unread-count')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json({ count: await unreadCount(auth) })
        }),
    },
  },
})
