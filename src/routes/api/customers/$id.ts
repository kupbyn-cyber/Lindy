// GET /api/customers/:id — hồ sơ khách (đủ SĐT), lịch sử đơn trong phạm vi được xem (K09)
// PUT /api/customers/:id — sửa tên, SĐT (Nhung, Linh); bắt buộc version
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { UpdateCustomerBody } from '~/server/customers/schema'
import { getCustomer, updateCustomer } from '~/server/customers/service'
import { handle, limitSensitiveReads, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/customers/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitSensitiveReads(auth.userId, `customer:${params.id}`) // có SĐT đầy đủ [P38]
          return Response.json(await getCustomer(auth, params.id))
        }),
      PUT: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, UpdateCustomerBody)
          return Response.json(await updateCustomer(auth, params.id, body))
        }),
    },
  },
})
