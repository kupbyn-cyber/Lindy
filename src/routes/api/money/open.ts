// POST /api/money/open — mở sổ: ngày 1 của tháng + số dư mở sổ từng tài khoản (Linh, một lần)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { OpenBookBody } from '~/server/money/schema'
import { openBook } from '~/server/money/service'

export const Route = createFileRoute('/api/money/open')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, OpenBookBody)
          return Response.json(await openBook(auth, body))
        }),
    },
  },
})
