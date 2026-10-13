// GET  /api/attachments?ownerType=&ownerId= — ảnh chứng từ của một phiếu (phiếu chi, phiếu hoàn, phiếu Linh lập)
// POST /api/attachments?ownerType=&ownerId= — gửi một ảnh (thân request là ảnh JPEG/PNG ≤ 1MB, máy đã thu nhỏ)
import { createFileRoute } from '@tanstack/react-router'
import { addAttachment, listAttachments, MAX_ATTACHMENT_BYTES } from '~/server/attachments/service'
import { requireAuth } from '~/server/auth/context'
import { invalid } from '~/server/http/errors'
import { handle, limitWrites } from '~/server/http/route'

export const Route = createFileRoute('/api/attachments/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const sp = new URL(request.url).searchParams
          return Response.json(
            await listAttachments(auth, sp.get('ownerType') ?? '', sp.get('ownerId') ?? ''),
          )
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const sp = new URL(request.url).searchParams
          const len = Number(request.headers.get('content-length') ?? 0)
          if (len > MAX_ATTACHMENT_BYTES) throw invalid('Ảnh quá 1MB. Chụp lại hoặc chọn ảnh nhỏ hơn.')
          const bytes = new Uint8Array(await request.arrayBuffer())
          return Response.json(
            await addAttachment(auth, sp.get('ownerType') ?? '', sp.get('ownerId') ?? '', bytes),
            { status: 201 },
          )
        }),
    },
  },
})
