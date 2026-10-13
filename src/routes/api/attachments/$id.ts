// GET /api/attachments/:id — tải ảnh chứng từ (chỉ người xem được phiếu gốc; RLS kiểm)
import { createFileRoute } from '@tanstack/react-router'
import { getAttachment } from '~/server/attachments/service'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/attachments/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const a = await getAttachment(auth, params.id)
          return new Response(new Uint8Array(a.data), {
            headers: {
              'Content-Type': a.mime,
              'Content-Disposition': 'inline',
              'Cache-Control': 'private, no-store',
            },
          })
        }),
    },
  },
})
