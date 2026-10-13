// GET /api/review — danh sách Cần xem lại của Linh (đơn, phiếu ưu đãi, phiếu hoàn, cọc, phiếu chi, chốt quỹ)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { reviewQueue } from '~/server/review/service'

export const Route = createFileRoute('/api/review')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await reviewQueue(auth, { branchId }))
        }),
    },
  },
})
