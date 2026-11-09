// RFC 9728 — metadata tài nguyên MCP (dạng gốc).
import { createFileRoute } from '@tanstack/react-router'
import { safeRun } from '~/server/mcp/http'
import { protectedResourceMetadata } from '~/server/mcp/metadata'

const run = (request: Request) => safeRun(async () => protectedResourceMetadata(request))

export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
