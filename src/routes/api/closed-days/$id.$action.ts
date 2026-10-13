// POST /api/closed-days/:id/remove — Linh gỡ một ngày đóng cửa (đánh dấu, không xoá)
import { createFileRoute } from '@tanstack/react-router'
import { removeClosedDay } from '~/server/attendance/closed-days'
import { BranchBody } from '~/server/attendance/schema'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/closed-days/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'remove') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, BranchBody)
          return Response.json(await removeClosedDay(auth, params.id, body.branchId))
        }),
    },
  },
})
