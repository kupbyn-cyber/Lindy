// GET /api/overview?period=day|month — số liệu Tổng quan (Linh, Nhung: toàn quán; thợ: của mình)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { overview } from '~/server/reports/service'

export const Route = createFileRoute('/api/overview')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const period = sp.get('period') === 'month' ? 'month' : 'day'
          return Response.json(await overview(auth, { branchId: sp.get('branchId') ?? undefined, period }))
        }),
    },
  },
})
