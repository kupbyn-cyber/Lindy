// GET /api/customers/:id/compensations?excludeOrder= — ưu đãi bù khiếu nại còn dùng được của khách (bước 2.18)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { customerCompensations } from '~/server/orders/tickets'

export const Route = createFileRoute('/api/customers/$id/compensations')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const exclude = new URL(request.url).searchParams.get('excludeOrder')
          return Response.json({ items: await customerCompensations(auth, params.id, exclude) })
        }),
    },
  },
})
