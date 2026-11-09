// POST /api/mcp — máy chủ MCP cho Claude/ChatGPT (OAuth Bearer). Không dùng handle(): request đến từ trang khác.
import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { handleMcpRequest } from '~/server/mcp/handler'
import { safeRun } from '~/server/mcp/http'

const run = (request: Request) => safeRun(() => handleMcpRequest(request, getRequestIP()))

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
      OPTIONS: ({ request }) => run(request),
    },
  },
})
