// POST /api/appointments/check — cảnh báo cho form (§8). Dùng POST để SĐT không nằm trên URL.
import { createFileRoute } from '@tanstack/react-router'
import { CheckBody } from '~/server/appointments/schema'
import { checkWarnings } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { handle, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/appointments/check')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await checkWarnings(auth, await readBody(request, CheckBody)))
        }),
    },
  },
})
