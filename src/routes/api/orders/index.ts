// GET  /api/orders?from=&to=&filter=&q=&staffId=&method=&review=  — danh sách (K09: thợ chỉ thấy đơn của mình)
// POST /api/orders — đã đóng (S16): mọi đơn tạo từ lịch qua POST /api/appointments/:id/create-order
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { forbidden, invalid } from '~/server/http/errors'
import { handle } from '~/server/http/route'
import { ORDER_FILTERS, type OrderFilter } from '~/server/orders/schema'
import { listOrders } from '~/server/orders/service'

export const Route = createFileRoute('/api/orders/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const filter = (sp.get('filter') ?? 'all') as OrderFilter
          if (!ORDER_FILTERS.includes(filter)) throw invalid('Bộ lọc không hợp lệ.')
          const method = sp.get('method')
          if (method && method !== 'cash' && method !== 'transfer') throw invalid('Phương thức không hợp lệ.')
          return Response.json(
            await listOrders(auth, {
              branchId: sp.get('branchId') ?? undefined,
              from: sp.get('from') ?? undefined,
              to: sp.get('to') ?? undefined,
              filter,
              q: sp.get('q')?.slice(0, 100) ?? undefined,
              staffId: sp.get('staffId') ?? undefined,
              method: (method as 'cash' | 'transfer' | null) ?? undefined,
              review: sp.get('review') === '1',
            }),
          )
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          await requireAuth(request)
          throw forbidden('Đơn chỉ tạo từ lịch. Tạo lịch cho khách (kể cả khách vãng lai) rồi bấm Tạo đơn.')
        }),
    },
  },
})
