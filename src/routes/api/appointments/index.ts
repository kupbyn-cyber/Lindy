// GET  /api/appointments?from=&to=&filter=&q=   — danh sách (không có SĐT, ghi chú)
// POST /api/appointments                           — tạo lịch; confirm=true là "Tạo và chốt"
import { createFileRoute } from '@tanstack/react-router'
import { CreateBody, LIST_FILTERS, type ListFilter } from '~/server/appointments/schema'
import { createAppointment, listAppointments } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { invalid } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/appointments/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const filter = (sp.get('filter') ?? 'active') as ListFilter
          if (!LIST_FILTERS.includes(filter)) throw invalid('Bộ lọc không hợp lệ.')
          const res = await listAppointments(auth, {
            branchId: sp.get('branchId') ?? undefined,
            from: sp.get('from') ?? undefined,
            to: sp.get('to') ?? undefined,
            filter,
            q: sp.get('q')?.slice(0, 100) ?? undefined,
          })
          return Response.json(res)
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, CreateBody)
          const res = await createAppointment(auth, body)
          return Response.json(res, { status: res.replayed ? 200 : 201 })
        }),
    },
  },
})
