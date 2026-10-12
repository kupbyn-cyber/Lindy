import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '~/server/auth/context'
import { logout } from '~/server/auth/login'
import { clearSessionCookie } from '~/server/auth/session'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await getAuth(request)
          if (auth) await logout(auth.sessionId, auth.userId)
          return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(request) } })
        }),
    },
  },
})
