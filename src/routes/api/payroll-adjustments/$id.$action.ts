// POST /api/payroll-adjustments/:id/void — Linh huỷ thưởng thêm / khấu trừ của tháng chưa khoá
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { VoidAdjustmentBody } from '~/server/payroll/schema'
import { voidAdjustment } from '~/server/payroll/service'

export const Route = createFileRoute('/api/payroll-adjustments/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'void') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, VoidAdjustmentBody)
          return Response.json(await voidAdjustment(auth, params.id, body))
        }),
    },
  },
})
