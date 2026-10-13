// POST /api/attendance/check-in | check-out — Vào ca / Ra ca của chính mình (giờ do DB ghi)
// POST /api/attendance/decide — Nhung, Linh quyết một ngày công; approve-all — duyệt mọi người đã vào ca ngày đó
import { createFileRoute } from '@tanstack/react-router'
import { ApproveAllBody, BranchBody, DecideBody } from '~/server/attendance/schema'
import { approveCheckedIn, checkIn, checkOut, decideDay } from '~/server/attendance/service'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/attendance/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'check-in':
              return Response.json(await checkIn(auth, (await readBody(request, BranchBody)).branchId))
            case 'check-out':
              return Response.json(await checkOut(auth, (await readBody(request, BranchBody)).branchId))
            case 'decide':
              return Response.json(await decideDay(auth, await readBody(request, DecideBody)))
            case 'approve-all':
              return Response.json(await approveCheckedIn(auth, await readBody(request, ApproveAllBody)))
            default:
              throw notFound()
          }
        }),
    },
  },
})
