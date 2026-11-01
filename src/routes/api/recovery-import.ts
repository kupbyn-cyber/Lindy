// POST /api/recovery-import — nhập lại dữ liệu thật sau sự cố 01/11/2026 (chỉ Chủ, dùng một lần).
// Body { payload, commit }: commit = false là chạy thử rồi huỷ. Gỡ route này sau khi dùng xong.
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuth } from '~/server/auth/context'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { RECOVERY_MAX_PAYLOAD, recoveryImport } from '~/server/ops/recovery'

const Body = z.strictObject({ payload: z.string().max(RECOVERY_MAX_PAYLOAD), commit: z.boolean() })

export const Route = createFileRoute('/api/recovery-import')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          const body = await readBody(request, Body, RECOVERY_MAX_PAYLOAD * 2)
          return Response.json(await recoveryImport(auth, body))
        }),
    },
  },
})
