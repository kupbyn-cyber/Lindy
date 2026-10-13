// POST /api/refunds/:id/review — Linh đánh dấu đã xem phiếu hoàn do Nhung lập (K18)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites } from '~/server/http/route'
import { reviewRefund } from '~/server/orders/refunds'

export const Route = createFileRoute('/api/refunds/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'review') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          return Response.json(await reviewRefund(auth, params.id))
        }),
    },
  },
})
