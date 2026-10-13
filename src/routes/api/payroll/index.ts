// GET /api/payroll?month=YYYY-MM — bảng lương một tháng (Linh, Nhung: mọi người; thợ: của mình)
// GET /api/payroll?view=slip&month=YYYY-MM&userId= — phiếu lương một người
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { payrollMonth, payslip } from '~/server/payroll/service'

export const Route = createFileRoute('/api/payroll/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const branchId = sp.get('branchId') ?? undefined
          const month = sp.get('month') ?? undefined
          if (sp.get('view') === 'slip')
            return Response.json(
              await payslip(auth, { branchId, month: month ?? '', userId: sp.get('userId') ?? '' }),
            )
          return Response.json(await payrollMonth(auth, { branchId, month }))
        }),
    },
  },
})
