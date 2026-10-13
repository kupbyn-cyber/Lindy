// GET  /api/closed-days — ngày quán đóng cửa (31 ngày trước đến một năm sau)
// POST /api/closed-days — Linh thêm một ngày hoặc một khoảng ngày
import { createFileRoute } from '@tanstack/react-router'
import { addClosedDays, listClosedDays } from '~/server/attendance/closed-days'
import { ClosedDaysBody } from '~/server/attendance/schema'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/closed-days/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await listClosedDays(auth, branchId))
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, ClosedDaysBody)
          return Response.json(await addClosedDays(auth, body))
        }),
    },
  },
})
