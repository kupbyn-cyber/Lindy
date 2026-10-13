// POST /api/attachments/:id/remove — gỡ ảnh (người gửi hoặc Linh); ảnh vẫn lưu, chỉ đánh dấu đã gỡ
import { createFileRoute } from '@tanstack/react-router'
import { removeAttachment } from '~/server/attachments/service'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites } from '~/server/http/route'

export const Route = createFileRoute('/api/attachments/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'remove') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          return Response.json(await removeAttachment(auth, params.id))
        }),
    },
  },
})
