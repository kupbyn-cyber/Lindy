// GET /api/money — sổ tiền: ngày mở sổ, số dư từng tài khoản (Linh, Nhung)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { getBook } from '~/server/money/service'

export const Route = createFileRoute('/api/money/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await getBook(auth, { branchId }))
        }),
    },
  },
})
