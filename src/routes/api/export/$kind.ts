// GET /api/export/:kind?month=YYYY-MM&format=csv|xlsx — Linh tải file (báo cáo tháng, đơn hàng, sổ tiền, thu chi,
// bảng lương, khách hàng). Mỗi lần tải ghi audit.
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { exportFile } from '~/server/export/service'
import { handle, limitWrites } from '~/server/http/route'

export const Route = createFileRoute('/api/export/$kind')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const sp = new URL(request.url).searchParams
          const f = await exportFile(auth, {
            branchId: sp.get('branchId') ?? undefined,
            kind: params.kind,
            month: sp.get('month') ?? undefined,
            format: sp.get('format') ?? undefined,
          })
          return new Response(f.body, {
            headers: {
              'content-type': f.contentType,
              'content-disposition': `attachment; filename="${f.filename}"`,
              'cache-control': 'no-store',
            },
          })
        }),
    },
  },
})
