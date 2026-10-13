// GET  /api/customers?q=   — tìm khách theo tên/SĐT (tối đa 20, SĐT đã che)
// POST /api/customers      — tạo khách; trả kèm khách khác đã dùng SĐT này (Q06)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { CustomerBody } from '~/server/customers/schema'
import { createCustomer, searchCustomers } from '~/server/customers/service'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/customers/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const q = new URL(request.url).searchParams.get('q') ?? ''
          return Response.json({ items: await searchCustomers(auth, q.slice(0, 100)) })
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, CustomerBody)
          return Response.json(await createCustomer(auth, body), { status: 201 })
        }),
    },
  },
})
