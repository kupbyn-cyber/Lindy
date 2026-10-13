// POST /api/tips/:id/void — huỷ khoản tip ghi nhầm (chưa trả thợ, chưa đối soát; có lý do)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { VoidTipBody } from '~/server/orders/schema'
import { voidTip } from '~/server/orders/tips'

export const Route = createFileRoute('/api/tips/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'void') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, VoidTipBody)
          return Response.json(await voidTip(auth, params.id, body.reason))
        }),
    },
  },
})
