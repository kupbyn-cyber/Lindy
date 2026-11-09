// GET/POST /oauth/authorize — màn Cho phép kết nối AI (chỉ tài khoản Chủ).
import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { safeRun } from '~/server/mcp/http'
import { handleAuthorize } from '~/server/mcp/oauth-http'

const run = (request: Request) => safeRun(() => handleAuthorize(request, getRequestIP()))

export const Route = createFileRoute('/oauth/authorize')({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
})
