// POST /api/payments/:id/void — huỷ khoản thu nhập nhầm (có lý do, khi chưa đối soát)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { voidPayment } from '~/server/orders/payments'
import { VoidPaymentBody } from '~/server/orders/schema'

export const Route = createFileRoute('/api/payments/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'void') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, VoidPaymentBody)
          return Response.json(await voidPayment(auth, params.id, body.reason))
        }),
    },
  },
})
