// GET /api/orders/:id — chi tiết đơn
// PUT /api/orders/:id — lưu cả đơn; bắt buộc version (lệch → 409 kèm bản mới)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { UpdateOrderBody } from '~/server/orders/schema'
import { getOrder, updateOrder } from '~/server/orders/service'

export const Route = createFileRoute('/api/orders/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await getOrder(auth, params.id))
        }),
      PUT: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, UpdateOrderBody)
          return Response.json(await updateOrder(auth, params.id, body))
        }),
    },
  },
})
