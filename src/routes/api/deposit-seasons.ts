// GET  /api/deposit-seasons — các mùa cọc của cơ sở, mùa đang bật hôm nay
// POST /api/deposit-seasons — Linh thêm hoặc sửa mùa cọc (booking_settings.manage)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { SeasonBody } from '~/server/deposits/schema'
import { listSeasons, saveSeason } from '~/server/deposits/service'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/deposit-seasons')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await listSeasons(auth, branchId))
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, SeasonBody)
          return Response.json(await saveSeason(auth, body))
        }),
    },
  },
})
