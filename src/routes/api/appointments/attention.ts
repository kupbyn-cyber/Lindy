// GET /api/appointments/attention — danh sách Cần xử lý (Linh, Nhung, Chin).
import { createFileRoute } from '@tanstack/react-router'
import { attentionList } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/appointments/attention')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await attentionList(auth, branchId))
        }),
    },
  },
})
