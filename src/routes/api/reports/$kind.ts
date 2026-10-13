// GET /api/reports/day?date=   — báo cáo ngày (PRD §11)
// GET /api/reports/month?month= — báo cáo tháng (doanh thu theo ngày, dịch vụ, thợ; khách mới/quay lại)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle } from '~/server/http/route'
import { dayReport, monthReport } from '~/server/reports/service'

export const Route = createFileRoute('/api/reports/$kind')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const branchId = sp.get('branchId') ?? undefined
          if (params.kind === 'day')
            return Response.json(await dayReport(auth, { branchId, date: sp.get('date') ?? undefined }))
          if (params.kind === 'month')
            return Response.json(await monthReport(auth, { branchId, month: sp.get('month') ?? undefined }))
          throw notFound()
        }),
    },
  },
})
