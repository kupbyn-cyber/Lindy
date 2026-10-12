import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle } from '~/server/http/route'
import { toMe } from '~/server/me'

export const Route = createFileRoute('/api/me')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request, { allowMustChange: true })
          return Response.json(toMe(auth))
        }),
    },
  },
})
