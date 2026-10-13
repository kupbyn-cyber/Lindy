// POST /api/orders/:id/done | confirm | cancel | approve-discounts | review | payments | tickets
// GET  /api/orders/:id/audit
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { recordPayment } from '~/server/orders/payments'
import { CancelOrderBody, PaymentBody, TicketBody, VersionBody } from '~/server/orders/schema'
import {
  approveDiscounts,
  cancelOrder,
  confirmOrder,
  markDone,
  markReviewed,
  orderAudit,
} from '~/server/orders/service'
import { createTicket } from '~/server/orders/tickets'

export const Route = createFileRoute('/api/orders/$id/$action')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'audit') throw notFound()
          const auth = await requireAuth(request)
          return Response.json({ items: await orderAudit(auth, params.id) })
        }),
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const id = params.id
          switch (params.action) {
            case 'done':
              return Response.json(await markDone(auth, id, (await readBody(request, VersionBody)).version))
            case 'confirm':
              return Response.json(
                await confirmOrder(auth, id, (await readBody(request, VersionBody)).version),
              )
            case 'approve-discounts':
              return Response.json(
                await approveDiscounts(auth, id, (await readBody(request, VersionBody)).version),
              )
            case 'cancel': {
              const body = await readBody(request, CancelOrderBody)
              return Response.json(await cancelOrder(auth, id, body.version, body.reason))
            }
            case 'review':
              return Response.json(await markReviewed(auth, id))
            case 'payments':
              return Response.json(await recordPayment(auth, id, await readBody(request, PaymentBody)), {
                status: 201,
              })
            case 'tickets':
              return Response.json(await createTicket(auth, id, await readBody(request, TicketBody)), {
                status: 201,
              })
            default:
              throw notFound()
          }
        }),
    },
  },
})
