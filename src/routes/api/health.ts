// GET /api/health — trạng thái app trên hosting (hosting không có log lúc chạy).
// Chỉ có tên biến còn thiếu và mã lỗi do mình đặt; không có giá trị biến, chuỗi kết nối hay mật khẩu.
import { createFileRoute } from '@tanstack/react-router'
import { handle } from '~/server/http/route'
import { releaseStatus } from '~/server/ops/release'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(request, async () => {
          const s = releaseStatus()
          return Response.json(s, { status: s.ready ? 200 : 503 })
        }),
    },
  },
})
