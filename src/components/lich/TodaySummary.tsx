// Phần lịch trên Tổng quan: thẻ lịch hôm nay (tổng, yêu cầu huỷ) và danh sách lịch hôm nay.
// "Cần xử lý" của lịch nằm trong thẻ Cần xử lý chung của Tổng quan (S14).
import { Link } from '@tanstack/react-router'
import { useAppointments } from '~/lib/appointments'
import { toLocalDate } from '~/lib/time'
import { AppointmentRows } from './views'

export function TodaySummary() {
  const today = toLocalDate(new Date())
  const q = useAppointments({ from: today, to: today, filter: 'active' })
  const items = (q.data?.items ?? []).filter((i) => i.status !== 'no_show')
  const reported = items.filter((i) => i.customerCancelReported).length

  return (
    <section className="-mx-4 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 px-4">
        <h2 className="overline m-0 text-ink-muted">
          Lịch hôm nay
          {q.isLoading ? '' : ` · ${items.length} lịch${reported ? ` · ${reported} yêu cầu huỷ` : ''}`}
        </h2>
        <Link to="/lich" className="label lo-link">
          Mở lịch →
        </Link>
      </div>
      <AppointmentRows items={items} empty="Hôm nay chưa có lịch." />
    </section>
  )
}
