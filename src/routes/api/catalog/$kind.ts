// POST /api/catalog/services — thêm (không có id) hoặc sửa dịch vụ (Linh)
// POST /api/catalog/combos   — thêm hoặc sửa combo (Linh)
// GET  /api/catalog/history?id= — lịch sử giá
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { ComboBody, priceHistory, ServiceBody, saveCombo, saveService } from '~/server/catalog/service'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/catalog/$kind')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          if (params.kind !== 'history') throw notFound()
          const auth = await requireAuth(request)
          const id = new URL(request.url).searchParams.get('id') ?? ''
          return Response.json({ items: await priceHistory(auth, id) })
        }),
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          if (params.kind === 'services')
            return Response.json(await saveService(auth, await readBody(request, ServiceBody)))
          if (params.kind === 'combos')
            return Response.json(await saveCombo(auth, await readBody(request, ComboBody)))
          throw notFound()
        }),
    },
  },
})
