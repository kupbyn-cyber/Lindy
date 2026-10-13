// POST /api/orders/:id/done | confirm | cancel | approve-discounts | review | payments
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { recordPayment } from '~/server/orders/payments'
import { CancelOrderBody, PaymentBody, VersionBody } from '~/server/orders/schema'
import { approveDiscounts, cancelOrder, confirmOrder, markDone, markReviewed } from '~/server/orders/service'

export const Route = createFileRoute('/api/orders/$id/$action')({
  server: {
    handlers: {
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
            default:
              throw notFound()
          }
        }),
    },
  },
})
