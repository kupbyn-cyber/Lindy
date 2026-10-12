import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { getPreferences, PreferenceBody, setPreference } from '~/server/notifications/center'

export const Route = createFileRoute('/api/notifications/preferences')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json({ items: await getPreferences(auth) })
        }),
      PUT: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          await setPreference(auth, await readBody(request, PreferenceBody))
          return Response.json({ ok: true })
        }),
    },
  },
})
