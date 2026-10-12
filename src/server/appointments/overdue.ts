// Việc nền: lịch đã qua giờ kết thúc mà chưa đánh dấu đến/không đến (K02) → báo một lần cho người có quyền lịch mở rộng.
import { formatIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
import { withWorker } from '../db/client'
import { emitSystemEvent } from '../notifications/emit'

export async function notifyOverdue() {
  return withWorker(async (tx) => {
    // Chỉ xét lịch kết thúc trong 24 giờ qua, để lần đầu chạy không báo dồn lịch cũ.
    const rows = await tx<
      { id: string; branchId: string; customerDisplayName: string; startAt: Date; timezone: string }[]
    >`
      select a.id, a.branch_id, a.customer_display_name, a.start_at, b.timezone
      from appointments a join branches b on b.id = a.branch_id
      where a.status in ('pending', 'confirmed')
        and a.end_at < now() and a.end_at > now() - interval '24 hours'
        and not exists (select 1 from notification_events e where e.dedupe_key = 'overdue:' || a.id::text)
      order by a.end_at
      limit 100`
    for (const r of rows) {
      const when = `${toLocalTime(r.startAt, r.timezone)} ${formatIsoDate(toLocalDate(r.startAt, r.timezone)).slice(0, 5)}`
      await emitSystemEvent(tx, {
        branchId: r.branchId,
        type: 'appointment.overdue',
        entityType: 'appointment',
        entityId: r.id,
        dedupeKey: `overdue:${r.id}`,
        title: `Lịch ${when} · ${r.customerDisplayName} đã qua giờ`,
        body: 'Chưa đánh dấu Khách đã đến hoặc Khách không đến.',
        pushBody: `Lịch ${when} đã qua giờ, chưa đánh dấu — mở app xử lý.`,
        url: `/lich/${r.id}`,
      })
    }
    return rows.length
  })
}
