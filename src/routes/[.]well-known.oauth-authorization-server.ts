// RFC 8414 — metadata máy chủ cấp quyền OAuth cho MCP.
import { createFileRoute } from '@tanstack/react-router'
import { safeRun } from '~/server/mcp/http'
import { authorizationServerMetadata } from '~/server/mcp/metadata'

const run = (request: Request) => safeRun(async () => authorizationServerMetadata(request))

export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
