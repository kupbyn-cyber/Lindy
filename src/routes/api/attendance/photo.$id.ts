// GET /api/attendance/photo/:id — ảnh vào ca (S60: của mình; Linh, Nhung xem cả cơ sở; RLS kiểm)
import { createFileRoute } from '@tanstack/react-router'
import { getCheckInPhoto } from '~/server/attendance/photo'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/attendance/photo/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const data = await getCheckInPhoto(auth, params.id)
          return new Response(new Uint8Array(data), {
            headers: {
              'Content-Type': 'image/jpeg',
              'Content-Disposition': 'inline',
              'Cache-Control': 'private, no-store',
            },
          })
        }),
    },
  },
})
