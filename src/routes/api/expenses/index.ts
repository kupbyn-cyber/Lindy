// GET  /api/expenses?filter=pending|approved|paid|closed|all&from=&to= — đề nghị chi (thợ: phiếu của mình)
// POST /api/expenses — đề nghị chi (mã yêu cầu chống bấm hai lần)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { EXPENSE_FILTERS, ExpenseBody, type ExpenseFilter } from '~/server/expenses/schema'
import { createExpense, listExpenses } from '~/server/expenses/service'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/expenses/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const f = sp.get('filter') as ExpenseFilter | null
          return Response.json(
            await listExpenses(auth, {
              branchId: sp.get('branchId') ?? undefined,
              filter: f && EXPENSE_FILTERS.includes(f) ? f : undefined,
              from: sp.get('from') ?? undefined,
              to: sp.get('to') ?? undefined,
            }),
          )
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, ExpenseBody)
          return Response.json(await createExpense(auth, body), { status: 201 })
        }),
    },
  },
})
