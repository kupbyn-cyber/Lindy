// POST /api/appointments/:id/confirm | cancel | report-customer-cancel | arrived | no-show | complete
// POST /api/appointments/:id/create-order   — tạo đơn từ lịch (module §10; additional=true là "Tạo thêm đơn")
// POST /api/appointments/:id/deposits       — ghi khoản cọc (mùa cọc, chờ Nhung, Linh xác nhận)
// GET  /api/appointments/:id/audit
import { createFileRoute } from '@tanstack/react-router'
import { CancelBody, ReportCancelBody, VersionBody } from '~/server/appointments/schema'
import { auditTrail, type Transition, transitionAppointment } from '~/server/appointments/service'
import { requireAuth } from '~/server/auth/context'
import { RecordDepositBody } from '~/server/deposits/schema'
import { recordDeposit } from '~/server/deposits/service'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { FromAppointmentBody } from '~/server/orders/schema'
import { createOrderFromAppointment } from '~/server/orders/service'

const ACTIONS: Record<string, Transition> = {
  confirm: 'confirm',
  cancel: 'cancel',
  'report-customer-cancel': 'report_customer_cancel',
  arrived: 'arrived',
  'no-show': 'no_show',
  complete: 'complete',
}

export const Route = createFileRoute('/api/appointments/$id/$action')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'audit') throw notFound()
          const auth = await requireAuth(request)
          return Response.json({ items: await auditTrail(auth, params.id) })
        }),
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action === 'deposits') {
            const auth = await requireAuth(request)
            limitWrites(auth.userId)
            const body = await readBody(request, RecordDepositBody)
            return Response.json(await recordDeposit(auth, params.id, body), { status: 201 })
          }
          if (params.action === 'create-order') {
            const auth = await requireAuth(request)
            limitWrites(auth.userId)
            const body = await readBody(request, FromAppointmentBody)
            const res = await createOrderFromAppointment(auth, params.id, body)
            return Response.json(res, { status: res.replayed ? 200 : 201 })
          }
          const action = ACTIONS[params.action]
          if (!action) throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body =
            action === 'cancel'
              ? await readBody(request, CancelBody)
              : action === 'report_customer_cancel'
                ? await readBody(request, ReportCancelBody)
                : await readBody(request, VersionBody)
          return Response.json(await transitionAppointment(auth, params.id, action, body))
        }),
    },
  },
})
