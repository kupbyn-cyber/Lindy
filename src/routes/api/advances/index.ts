// GET  /api/advances?filter=pending|approved|paid|all — tạm ứng (thợ: của mình), hạn mức tháng này của tôi
// POST /api/advances — đề nghị tạm ứng (mã yêu cầu chống bấm hai lần)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { createAdvance, listAdvances } from '~/server/payroll/advances'
import { ADVANCE_FILTERS, AdvanceBody, type AdvanceFilter } from '~/server/payroll/schema'

export const Route = createFileRoute('/api/advances/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const f = sp.get('filter') as AdvanceFilter | null
          return Response.json(
            await listAdvances(auth, {
              branchId: sp.get('branchId') ?? undefined,
              filter: f && ADVANCE_FILTERS.includes(f) ? f : undefined,
            }),
          )
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, AdvanceBody)
          return Response.json(await createAdvance(auth, body), { status: 201 })
        }),
    },
  },
})
