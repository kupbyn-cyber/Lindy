// GET /api/staff?branchId= — thợ trong cơ sở để chia tiền trên đơn
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { getStaff } from '~/server/orders/service'

export const Route = createFileRoute('/api/staff/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json({ items: await getStaff(auth, branchId) })
        }),
    },
  },
})
