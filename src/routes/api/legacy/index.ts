// GET  /api/legacy — các lần nhập dữ liệu cũ (Linh)
// POST /api/legacy — nhập: { fileName, label, text (CSV), mapping } → dòng hợp lệ vào bảng dữ liệu cũ
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { ImportBody, LEGACY_MAX_BODY } from '~/server/legacy/schema'
import { importLegacy, listImports } from '~/server/legacy/service'

export const Route = createFileRoute('/api/legacy/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
          return Response.json(await listImports(auth, branchId))
        }),
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, ImportBody, LEGACY_MAX_BODY)
          return Response.json(await importLegacy(auth, body), { status: 201 })
        }),
    },
  },
})
