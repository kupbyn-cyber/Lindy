// GET  /api/tips — tip đang giữ theo thợ (Nhung, Linh: mọi thợ; thợ: của mình), các lần trả gần đây
// POST /api/tips — trả tiền mặt cho thợ toàn bộ tip đang giữ (Nhung, Linh)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { PayTipsBody } from '~/server/orders/schema'
import { payTips, tipSummary } from '~/server/orders/tips'

export const Route = createFileRoute('/api/tips/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await tipSummary(auth, { branchId }))
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          return Response.json(await payTips(auth, await readBody(request, PayTipsBody)))
        }),
    },
  },
})
