import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuth } from '~/server/auth/context'
import { changePassword } from '~/server/auth/login'
import { handle, limitWrites, readBody } from '~/server/http/route'

const Body = z.strictObject({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại.').max(200),
  newPassword: z.string().max(200),
})

export const Route = createFileRoute('/api/auth/password')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          // Được gọi cả khi còn cờ phải đổi mật khẩu [P16].
          const auth = await requireAuth(request, { allowMustChange: true })
          limitWrites(auth.userId)
          const body = await readBody(request, Body)
          await changePassword({ userId: auth.userId, sessionId: auth.sessionId, ...body })
          return Response.json({ ok: true })
        }),
    },
  },
})
