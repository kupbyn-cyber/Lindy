// POST /api/expenses/:id/approve | reject | cancel | pay | review
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { ExpenseActionBody } from '~/server/expenses/schema'
import { actOnExpense, type ExpenseAction } from '~/server/expenses/service'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

const ACTIONS: ExpenseAction[] = ['approve', 'reject', 'cancel', 'pay', 'review']

export const Route = createFileRoute('/api/expenses/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const action = params.action as ExpenseAction
          if (!ACTIONS.includes(action)) throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, ExpenseActionBody)
          return Response.json(await actOnExpense(auth, params.id, action, body))
        }),
    },
  },
})
