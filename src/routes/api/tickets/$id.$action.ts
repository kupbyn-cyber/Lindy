// POST /api/tickets/:id/void   — huỷ phiếu xử lý (có lý do, khi ưu đãi chưa dùng)
// POST /api/tickets/:id/review — Linh đánh dấu đã xem phiếu ưu đãi do người khác lập (K15)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { VoidTicketBody } from '~/server/orders/schema'
import { markTicketReviewed, voidTicket } from '~/server/orders/tickets'

export const Route = createFileRoute('/api/tickets/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          if (params.action === 'void') {
            const body = await readBody(request, VoidTicketBody)
            return Response.json(await voidTicket(auth, params.id, body.reason))
          }
          if (params.action === 'review') return Response.json(await markTicketReviewed(auth, params.id))
          throw notFound()
        }),
    },
  },
})
