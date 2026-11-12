// PUT /api/service-chips — bộ chip dịch vụ của form lịch (S65; chỉ booking_settings.manage). Đọc qua GET /api/booking-settings.
import { createFileRoute } from '@tanstack/react-router'
import { ServiceChipsBody } from '~/server/appointments/schema'
import { updateServiceChips } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/service-chips')({
  server: {
    handlers: {
      PUT: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          return Response.json(await updateServiceChips(auth, await readBody(request, ServiceChipsBody)))
        }),
    },
  },
})
