// RFC 9728 — metadata tài nguyên MCP cho /api/mcp (dạng có path).
import { createFileRoute } from '@tanstack/react-router'
import { safeRun } from '~/server/mcp/http'
import { protectedResourceMetadata } from '~/server/mcp/metadata'

const run = (request: Request) => safeRun(async () => protectedResourceMetadata(request))

export const Route = createFileRoute('/.well-known/oauth-protected-resource/api/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
