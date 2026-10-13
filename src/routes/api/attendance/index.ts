// GET /api/attendance?view=today | me&month= | day&date= | month&month=
//   today: thẻ Vào ca trên Tổng quan; me: công tháng của tôi, đơn nghỉ; day: duyệt công một ngày (Nhung, Linh);
//   month: bảng công tháng (Nhung, Linh mọi người; thợ của mình)
import { createFileRoute } from '@tanstack/react-router'
import { dayBoard, monthSheet, myMonth, myToday } from '~/server/attendance/service'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/attendance/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          const branchId = sp.get('branchId') ?? undefined
          switch (sp.get('view') ?? 'today') {
            case 'today':
              return Response.json(await myToday(auth, branchId))
            case 'me':
              return Response.json(await myMonth(auth, { branchId, month: sp.get('month') ?? undefined }))
            case 'day':
              return Response.json(await dayBoard(auth, { branchId, date: sp.get('date') ?? undefined }))
            case 'month':
              return Response.json(await monthSheet(auth, { branchId, month: sp.get('month') ?? undefined }))
            default:
              throw notFound()
          }
        }),
    },
  },
})
