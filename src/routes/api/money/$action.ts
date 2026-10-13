// POST /api/money/voucher       — Linh: thu khác, góp vốn, rút vốn, điều chỉnh
// POST /api/money/transfer      — Nhung, Linh: chuyển nội bộ giữa hai tài khoản
// POST /api/money/reconcile     — Nhung, Linh: đánh dấu khoản ngân hàng đã khớp sao kê
// POST /api/money/close-day     — Nhung, Linh: chốt quỹ tiền mặt cuối ngày
// POST /api/money/review-close  — Linh: đã xem bản chốt có chênh lệch
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import {
  CloseDayBody,
  ReconcileBody,
  ReviewCloseBody,
  TransferBody,
  VoucherBody,
} from '~/server/money/schema'
import { closeDay, createTransfer, createVoucher, reconcile, reviewDayClose } from '~/server/money/service'

export const Route = createFileRoute('/api/money/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'voucher':
              return Response.json(await createVoucher(auth, await readBody(request, VoucherBody)))
            case 'transfer':
              return Response.json(await createTransfer(auth, await readBody(request, TransferBody)))
            case 'reconcile':
              return Response.json(await reconcile(auth, await readBody(request, ReconcileBody)))
            case 'close-day':
              return Response.json(await closeDay(auth, await readBody(request, CloseDayBody)))
            case 'review-close':
              return Response.json(await reviewDayClose(auth, await readBody(request, ReviewCloseBody)))
            default:
              throw notFound()
          }
        }),
    },
  },
})
