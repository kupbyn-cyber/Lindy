// POST /api/advances/:id/approve | reject | cancel | pay
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { type AdvanceAction, actOnAdvance } from '~/server/payroll/advances'
import { AdvanceActionBody } from '~/server/payroll/schema'

const ACTIONS: AdvanceAction[] = ['approve', 'reject', 'cancel', 'pay']

export const Route = createFileRoute('/api/advances/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const action = params.action as AdvanceAction
          if (!ACTIONS.includes(action)) throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, AdvanceActionBody)
          return Response.json(await actOnAdvance(auth, params.id, action, body))
        }),
    },
  },
})
