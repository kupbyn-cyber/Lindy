// GET /api/money/day-close?date= — xem trước chốt quỹ (lý thuyết, việc còn treo) và các lần chốt gần đây
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { dayClosePreview } from '~/server/money/service'

export const Route = createFileRoute('/api/money/day-close')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          return Response.json(
            await dayClosePreview(auth, {
              branchId: sp.get('branchId') ?? undefined,
              date: sp.get('date') ?? undefined,
            }),
          )
        }),
    },
  },
})
