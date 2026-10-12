// SSE: cập nhật tức thời cho các máy đang mở app (bước 0.18).
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { readSessionToken } from '~/server/auth/session'
import { handle } from '~/server/http/route'
import { openStream } from '~/server/notifications/hub'

export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const stream = await openStream({
            token: readSessionToken(request)!,
            userId: auth.userId,
            sessionId: auth.sessionId,
            branchIds: auth.branches
              .filter((b) => b.perms.includes('appointments.read_branch'))
              .map((b) => b.id),
            signal: request.signal,
          })
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-store',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            },
          })
        }),
    },
  },
})
