// POST /api/print/settings — Linh: thông tin in trên bill, khổ giấy
// POST /api/print/stations — Linh: tạo mã kết nối trạm in (trả mã một lần)
// POST /api/print/revoke   — Linh: thu hồi mã kết nối
// POST /api/print/test     — Linh: in thử
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { PrintSettingsBody, RevokeBody, StationBody, TestPrintBody } from '~/server/print/schema'
import { createStation, printTest, revokeStation, savePrintSettings } from '~/server/print/service'

export const Route = createFileRoute('/api/print/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'settings':
              return Response.json(await savePrintSettings(auth, await readBody(request, PrintSettingsBody)))
            case 'stations':
              return Response.json(await createStation(auth, await readBody(request, StationBody)), {
                status: 201,
              })
            case 'revoke':
              return Response.json(await revokeStation(auth, await readBody(request, RevokeBody)))
            case 'test':
              return Response.json(await printTest(auth, await readBody(request, TestPrintBody)), {
                status: 201,
              })
            default:
              throw notFound()
          }
        }),
    },
  },
})
