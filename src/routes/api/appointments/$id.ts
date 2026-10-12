// GET   /api/appointments/:id — chi tiết (có SĐT đầy đủ, B08)
// PATCH /api/appointments/:id — sửa; bắt buộc version
import { createFileRoute } from '@tanstack/react-router'
import { UpdateBody } from '~/server/appointments/schema'
import { getAppointment, updateAppointment } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/appointments/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await getAppointment(auth, params.id))
        }),
      PATCH: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, UpdateBody)
          return Response.json(await updateAppointment(auth, params.id, body))
        }),
    },
  },
})
