// POST /api/demo/load   — nạp gói dữ liệu thử (chỉ Chủ, chưa nạp lần nào). App còn dữ liệu cũ thì gửi
//                         { replaceExisting: true, confirm: "XOA DU LIEU THU" } để dọn trước rồi nạp.
// POST /api/demo/golive — xoá sạch dữ liệu, bắt đầu dùng thật; body { confirm: "XOA DU LIEU THU" } (một lần, S12)
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { goLive, loadDemo } from '~/server/ops/demo'

const GoLiveBody = z.strictObject({ confirm: z.string().max(50) })
const LoadBody = z.strictObject({
  replaceExisting: z.boolean().optional(),
  confirm: z.string().max(50).optional(),
})

export const Route = createFileRoute('/api/demo/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          if (params.action === 'load')
            return Response.json(await loadDemo(auth, await readBody(request, LoadBody)))
          if (params.action === 'golive') {
            const body = await readBody(request, GoLiveBody)
            return Response.json(await goLive(auth, body))
          }
          throw notFound()
        }),
    },
  },
})
