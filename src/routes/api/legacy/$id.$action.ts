// POST /api/legacy/:id/cancel — Linh huỷ một lần nhập (đánh dấu, không xoá; cần lý do)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { CancelBody } from '~/server/legacy/schema'
import { cancelImport } from '~/server/legacy/service'

export const Route = createFileRoute('/api/legacy/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          if (params.action !== 'cancel') throw notFound()
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, CancelBody)
          return Response.json(await cancelImport(auth, params.id, body.reason))
        }),
    },
  },
})
