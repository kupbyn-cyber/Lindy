// POST /api/leave — đăng ký nghỉ (mã yêu cầu chống bấm hai lần). Danh sách đơn nghỉ đi kèm /api/attendance.
import { createFileRoute } from '@tanstack/react-router'
import { createLeave } from '~/server/attendance/leave'
import { LeaveBody } from '~/server/attendance/schema'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/leave/')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, LeaveBody)
          return Response.json(await createLeave(auth, body), { status: 201 })
        }),
    },
  },
})
