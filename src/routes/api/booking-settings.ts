// GET/PUT /api/booking-settings — giờ mở cửa, thời lượng mặc định (PUT: chỉ booking_settings.manage).
import { createFileRoute } from '@tanstack/react-router'
import { SettingsBody } from '~/server/appointments/schema'
import { getSettings, updateSettings } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/booking-settings')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await getSettings(auth, branchId))
        }),
      PUT: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          return Response.json(await updateSettings(auth, await readBody(request, SettingsBody)))
        }),
    },
  },
})
