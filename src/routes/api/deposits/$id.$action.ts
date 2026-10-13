// POST /api/deposits/:id/confirm  — Nhung, Linh xác nhận tiền cọc đã vào
// POST /api/deposits/:id/void     — huỷ khoản cọc ghi nhầm (có lý do)
// POST /api/deposits/:id/refund   — hoàn cọc (Linh, Nhung, Chin; có lý do)
// POST /api/deposits/:id/forfeit  — giữ cọc: doanh thu cọc khách bỏ hẹn (Linh, Nhung, Chin; có lý do)
// POST /api/deposits/:id/review   — Linh đánh dấu đã xem (Cần xem lại)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { DepositVersionBody, ResolveDepositBody, VoidDepositBody } from '~/server/deposits/schema'
import { confirmDeposit, resolveDeposit, reviewDeposit, voidDeposit } from '~/server/deposits/service'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/deposits/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'confirm': {
              const body = await readBody(request, DepositVersionBody)
              return Response.json(await confirmDeposit(auth, params.id, body.version))
            }
            case 'void': {
              const body = await readBody(request, VoidDepositBody)
              return Response.json(await voidDeposit(auth, params.id, body.version, body.reason))
            }
            case 'refund':
            case 'forfeit': {
              const body = await readBody(request, ResolveDepositBody)
              return Response.json(await resolveDeposit(auth, params.id, params.action, body))
            }
            case 'review':
              return Response.json(await reviewDeposit(auth, params.id))
            default:
              throw notFound()
          }
        }),
    },
  },
})
