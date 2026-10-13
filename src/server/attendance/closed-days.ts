// Ngày quán đóng cửa (Đợt 4A, bước 4.4; PRD §8, Q29): không tính là ngày nghỉ, trả lương như đi làm. Linh
// (booking_settings.manage) khai báo trong Cài đặt lịch; mọi người xem được. Không thêm, gỡ trong tháng đã khoá lương.

import { addDays } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, notFound } from '../http/errors'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

export async function listClosedDays(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  return withUser(auth.userId, async (tx) => {
    const [t] = await tx<{ today: string }[]>`select app.branch_today(${branch.id})::text as today`
    const today = t!.today
    // 31 ngày trước đến một năm sau
    const rows = await tx<{ id: string; closedDate: string; reason: string }[]>`
      select id, closed_date::text, reason from shop_closed_days
      where branch_id = ${branch.id} and removed_at is null
        and closed_date between ${addDays(today, -31)}::date and ${addDays(today, 366)}::date
      order by closed_date`
    return { today, days: rows, can: { manage: hasPerm(auth, branch.id, 'booking_settings.manage') } }
  })
}

export type ClosedDaysData = Awaited<ReturnType<typeof listClosedDays>>

export async function addClosedDays(
  auth: Auth,
  input: { branchId?: string; fromDate: string; toDate: string; reason: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'booking_settings.manage'))
    throw forbidden('Chỉ chủ quán khai báo ngày đóng cửa.')
  await withUser(
    auth.userId,
    (tx) => tx`select app.closed_days_add(${branch.id}, ${input.fromDate}::date, ${input.toDate}::date,
                                          ${input.reason.trim()})`,
  )
  return listClosedDays(auth, branch.id)
}

export async function removeClosedDay(auth: Auth, id: string, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!isUuid(id)) throw notFound('Không tìm thấy ngày đóng cửa.')
  if (!hasPerm(auth, branch.id, 'booking_settings.manage')) throw forbidden('Chỉ chủ quán sửa ngày đóng cửa.')
  await withUser(auth.userId, (tx) => tx`select app.closed_day_remove(${id})`)
  return listClosedDays(auth, branch.id)
}
