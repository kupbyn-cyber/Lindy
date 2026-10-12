import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, requireBranch } from '~/server/auth/context'
import { handle, limitWrites } from '~/server/http/route'
import { sendSelfTest } from '~/server/notifications/push'

// Gửi thông báo thử cho chính mình, để kiểm máy này nhận được push chưa.
export const Route = createFileRoute('/api/push/test')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const branch = requireBranch(auth, null)
          await sendSelfTest(auth, branch.id)
          return Response.json({ ok: true })
        }),
    },
  },
})
