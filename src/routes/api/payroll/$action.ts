// POST /api/payroll/lock — Linh khoá bảng lương tháng; adjust — thưởng thêm / khấu trừ; pay — trả lương
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { AdjustmentBody, LockBody, PayBody } from '~/server/payroll/schema'
import { addAdjustment, lockMonth, payOut } from '~/server/payroll/service'

export const Route = createFileRoute('/api/payroll/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'lock':
              return Response.json(await lockMonth(auth, await readBody(request, LockBody)))
            case 'adjust':
              return Response.json(await addAdjustment(auth, await readBody(request, AdjustmentBody)))
            case 'pay':
              return Response.json(await payOut(auth, await readBody(request, PayBody)))
            default:
              throw notFound()
          }
        }),
    },
  },
})
