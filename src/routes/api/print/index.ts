// GET /api/print — cài đặt máy in bill: thông tin trên bill, trạm in (Linh, print.manage)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { printSetup } from '~/server/print/service'

export const Route = createFileRoute('/api/print/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await printSetup(auth, { branchId }))
        }),
    },
  },
})
