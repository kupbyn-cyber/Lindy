// POST /api/accounts/:id/reset-password | role | revoke | lock | unlock (chỉ Chủ)
import { createFileRoute } from '@tanstack/react-router'
import {
  RoleBody,
  resetAccountPassword,
  revokeAccount,
  setAccountActive,
  setAccountRole,
} from '~/server/admin/accounts'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/accounts/$id/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'reset-password':
              return Response.json(await resetAccountPassword(auth, params.id))
            case 'role': {
              const body = await readBody(request, RoleBody)
              await setAccountRole(auth, params.id, body.role)
              return Response.json({ ok: true })
            }
            case 'revoke':
              await revokeAccount(auth, params.id)
              return Response.json({ ok: true })
            case 'lock':
              await setAccountActive(auth, params.id, false)
              return Response.json({ ok: true })
            case 'unlock':
              await setAccountActive(auth, params.id, true)
              return Response.json({ ok: true })
            default:
              throw notFound()
          }
        }),
    },
  },
})
