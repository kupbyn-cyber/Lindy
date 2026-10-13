// GET /api/customers/:id — chi tiết khách (đủ SĐT)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { getCustomer } from '~/server/customers/service'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/customers/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await getCustomer(auth, params.id))
        }),
    },
  },
})
