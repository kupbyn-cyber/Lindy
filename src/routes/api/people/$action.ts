// POST /api/people/profile | policy | kpi | settings — Linh sửa hồ sơ, chính sách lương, mốc KPI, tháng bắt đầu
import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '~/server/auth/context'
import { notFound } from '~/server/http/errors'
import { handle, limitWrites, readBody } from '~/server/http/route'
import { KpiBody, PolicyBody, ProfileBody, SettingsBody } from '~/server/staff/schema'
import { saveKpi, savePolicy, saveProfile, saveSettings } from '~/server/staff/service'

export const Route = createFileRoute('/api/people/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(request, async () => {
          const auth = await requireAuth(request)
          limitWrites(auth.userId)
          switch (params.action) {
            case 'profile':
              return Response.json(await saveProfile(auth, await readBody(request, ProfileBody)))
            case 'policy':
              return Response.json(await savePolicy(auth, await readBody(request, PolicyBody)))
            case 'kpi':
              return Response.json(await saveKpi(auth, await readBody(request, KpiBody)))
            case 'settings':
              return Response.json(await saveSettings(auth, await readBody(request, SettingsBody)))
            default:
              throw notFound()
          }
        }),
    },
  },
})
