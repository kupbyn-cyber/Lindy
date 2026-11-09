// POST /oauth/register — đăng ký client động (RFC 7591) cho MCP.
import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { safeRun } from '~/server/mcp/http'
import { handleRegister } from '~/server/mcp/oauth-http'

const run = (request: Request) => safeRun(() => handleRegister(request, getRequestIP()))

export const Route = createFileRoute('/oauth/register')({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
