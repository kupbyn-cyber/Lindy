// GET /api/print/jobs/:id — trạng thái lệnh in (đang chờ, đang in, đã in, lỗi, hết hạn)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { jobStatus } from '~/server/print/service'

export const Route = createFileRoute('/api/print/jobs/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await jobStatus(auth, params.id))
        }),
    },
  },
})
