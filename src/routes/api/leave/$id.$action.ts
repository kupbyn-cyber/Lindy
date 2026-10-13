// POST /api/leave/:id/approve | reject | cancel
import { createFileRoute } from '@tanstack/react-router'
import { actOnLeave, type LeaveAction } from '~/server/attendance/leave'
import { LeaveActionBody } from '~/server/attendance/schema'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

const ACTIONS: LeaveAction[] = ['approve', 'reject', 'cancel']

export const Route = createFileRoute('/api/leave/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const action = params.action as LeaveAction
          if (!ACTIONS.includes(action)) throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, LeaveActionBody)
          return Response.json(await actOnLeave(auth, params.id, action, body))
        }),
    },
  },
})
