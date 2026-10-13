// POST /api/legacy/analyze — { fileName, text (CSV), headerRow?, mapping? }: không ghép cột → dòng tiêu đề, vài dòng
// đầu, gợi ý ghép cột; có ghép cột → kết quả kiểm (dòng nhập được, lỗi, cảnh báo, tổng theo thợ). Không ghi gì.
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { AnalyzeBody, LEGACY_MAX_BODY } from '~/server/legacy/schema'
import { analyzeLegacy } from '~/server/legacy/service'

export const Route = createFileRoute('/api/legacy/analyze')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, AnalyzeBody, LEGACY_MAX_BODY)
          return Response.json(await analyzeLegacy(auth, body))
        }),
    },
  },
})
