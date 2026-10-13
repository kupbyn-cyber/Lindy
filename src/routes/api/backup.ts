// GET /api/backup — Linh tải bản sao lưu dữ liệu nghiệp vụ (JSON)
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { backupDump } from '~/server/export/backup'
import { handle } from '~/server/http/route'

export const Route = createFileRoute('/api/backup')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          const { filename, json } = await backupDump(auth, branchId)
          return new Response(json, {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'content-disposition': `attachment; filename="${filename}"`,
              'cache-control': 'no-store',
            },
          })
        }),
    },
  },
})
