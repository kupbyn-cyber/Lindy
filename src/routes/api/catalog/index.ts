// GET /api/catalog — danh mục dịch vụ và combo (C09); máy lọc, tìm ngay trên điện thoại
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { getCatalog } from '~/server/orders/service'

export const Route = createFileRoute('/api/catalog/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json(await getCatalog(auth))
        }),
    },
  },
})
