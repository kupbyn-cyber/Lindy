// GET  /api/accounts — danh sách tài khoản của cơ sở (chỉ Chủ)
// POST /api/accounts — tạo tài khoản; trả mật khẩu tạm một lần
import { createFileRoute } from '@tanstack/react-router'
import { CreateAccountBody, createAccount, listAccounts } from '~/server/admin/accounts'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'

export const Route = createFileRoute('/api/accounts/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          return Response.json({ items: await listAccounts(auth) })
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const res = await createAccount(auth, await readBody(request, CreateAccountBody))
          return Response.json(res, { status: 201 })
        }),
    },
  },
})
