// GET /api/demo — trạng thái dữ liệu dùng thử (chỉ Chủ, S12)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { demoStatus } from '~/server/ops/demo'

export const Route = createFileRoute('/api/demo/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await demoStatus(auth))
        }),
    },
  },
})
