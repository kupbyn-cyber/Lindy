// GET /api/people — nhân viên trong cơ sở: hồ sơ, chính sách lương theo tháng, mốc KPI (Linh, Nhung)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { listPeople } from '~/server/staff/service'

export const Route = createFileRoute('/api/people/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await listPeople(auth, branchId))
        }),
    },
  },
})
