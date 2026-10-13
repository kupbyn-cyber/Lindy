import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { login } from '~/server/auth/login'
import { sessionCookie } from '~/server/auth/session'
import { env } from '~/server/env'
import { clientIp } from '~/server/http/client-ip'
import { handle, readBody } from '~/server/http/route'

const Body = z.strictObject({
  identifier: z.string().min(1, 'Nhập SĐT hoặc email.').max(200),
  password: z.string().min(1, 'Nhập mật khẩu.').max(200),
})

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const body = await readBody(request, Body)
          const ip = clientIp(request.headers, env('TRUST_PROXY') === '1', getRequestIP())
          const res = await login({ ...body, ip, userAgent: request.headers.get('user-agent') })
          return Response.json(
            { ok: true, mustChangePassword: res.mustChangePassword },
            { headers: { 'Set-Cookie': sessionCookie(request, res.token) } },
          )
        }),
    },
  },
})
