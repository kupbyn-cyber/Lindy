// POST /oauth/token — đổi mã đăng nhập / gia hạn token MCP.
import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { safeRun } from '~/server/mcp/http'
import { handleToken } from '~/server/mcp/oauth-http'

const run = (request: Request) => safeRun(() => handleToken(request, getRequestIP()))

export const Route = createFileRoute('/oauth/token')({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
