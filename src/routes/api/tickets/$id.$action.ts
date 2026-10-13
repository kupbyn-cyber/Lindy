// POST /api/tickets/:id/void — huỷ phiếu xử lý (có lý do, khi ưu đãi chưa dùng)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { VoidTicketBody } from '~/server/orders/schema'
import { voidTicket } from '~/server/orders/tickets'

export const Route = createFileRoute('/api/tickets/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'void') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, VoidTicketBody)
          return Response.json(await voidTicket(auth, params.id, body.reason))
        }),
    },
  },
})
