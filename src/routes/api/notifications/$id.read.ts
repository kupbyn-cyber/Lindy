import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites } from '~/server/http/route'
import { markRead } from '~/server/notifications/center'

// POST /api/notifications/:id/read — id = "all" để đánh dấu tất cả.
export const Route = createFileRoute('/api/notifications/$id/read')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          await markRead(auth, params.id === 'all' ? 'all' : params.id)
          return Response.json({ ok: true })
        }),
    },
  },
})
