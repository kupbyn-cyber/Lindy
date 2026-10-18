// Trạm in (MacBook ở quán), xác thực bằng mã kết nối `Authorization: Bearer …` (Đợt 7):
// GET  /api/print/agent/next   — lấy lệnh in kế tiếp (nội dung bill, khổ giấy) hoặc { job: null }
// POST /api/print/agent/finish — báo in xong / lỗi
import { createFileRoute } from '@tanstack/react-router'
import { notFound } from '~/server/http/errors'
import { handleStation, readBody } from '~/server/http/route'
import { AgentFinishBody } from '~/server/print/schema'
import { agentFinish, agentNext } from '~/server/print/service'

export const Route = createFileRoute('/api/print/agent/$action')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleStation(request, async (token) => {
          if (params.action !== 'next') throw notFound()
          return Response.json(await agentNext(token))
        }),
      POST: ({ request, params }) =>
        handleStation(request, async (token) => {
          if (params.action !== 'finish') throw notFound()
          return Response.json(await agentFinish(token, await readBody(request, AgentFinishBody)))
        }),
    },
  },
})
