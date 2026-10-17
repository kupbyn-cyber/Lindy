// GET /api/appointments/off?date= — người nghỉ ngày đó (đã duyệt / chờ duyệt) cho đầu màn Lịch (S32).
import { createFileRoute } from '@tanstack/react-router'
import { staffOff } from '~/server/attendance/leave'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/appointments/off')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          return Response.json(
            await staffOff(auth, { branchId: sp.get('branchId') ?? undefined, date: sp.get('date') ?? '' }),
          )
        }),
    },
  },
})
