// GET /api/money/entries?from=&to=&accountId= — bút toán theo ngày (≤ 62 ngày), đầu kỳ / vào / ra / cuối kỳ
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { listEntries } from '~/server/money/service'

export const Route = createFileRoute('/api/money/entries')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          return Response.json(
            await listEntries(auth, {
              branchId: sp.get('branchId') ?? undefined,
              from: sp.get('from') ?? undefined,
              to: sp.get('to') ?? undefined,
              accountId: sp.get('accountId') ?? undefined,
            }),
          )
        }),
    },
  },
})
