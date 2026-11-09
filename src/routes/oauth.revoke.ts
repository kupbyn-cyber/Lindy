// POST /oauth/revoke — thu hồi token MCP (RFC 7009).
import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { safeRun } from '~/server/mcp/http'
import { handleRevoke } from '~/server/mcp/oauth-http'

const run = (request: Request) => safeRun(() => handleRevoke(request, getRequestIP()))

export const Route = createFileRoute('/oauth/revoke')({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
