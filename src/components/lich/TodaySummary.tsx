// Phần lịch trên Tổng quan (bước 1.14): lịch hôm nay (tổng, Mới đặt, Khách báo huỷ) và Cần xử lý.
// Thợ chỉ thấy lịch chung; Linh, Nhung, Chin thấy thêm Cần xử lý.
import { Link } from '@tanstack/react-router'
import { useAppointments } from '~/lib/appointments'
import { useCan } from '~/lib/me'
import { toLocalDate } from '~/lib/time'
import { AttentionPanel } from './AttentionPanel'
import { AppointmentRows } from './views'

export function TodaySummary() {
  const can = useCan()
  const today = toLocalDate(new Date())
  const q = useAppointments({ from: today, to: today, filter: 'active' })
  const items = (q.data?.items ?? []).filter((i) => i.status !== 'no_show')
  const pending = items.filter((i) => i.status === 'pending').length
  const reported = items.filter((i) => i.customerCancelReported).length

  return (
    <>
      <section className="lo-card flex flex-col gap-1">
        <span className="overline text-ink-muted">Lịch hôm nay</span>
        <span className="body">
          {q.isLoading
            ? 'Đang tải…'
            : `${items.length} lịch · ${pending} Mới đặt · ${reported} Khách báo huỷ`}
        </span>
        <Link to="/lich" className="label text-accent">
          Xem lịch hôm nay →
        </Link>
      </section>
      {can('appointments.manage_all') ? (
        <section className="-mx-4 flex flex-col gap-2">
          <h2 className="overline m-0 px-4 text-ink-muted">Cần xử lý</h2>
          <AttentionPanel />
        </section>
      ) : (
        <section className="-mx-4">
          <h2 className="overline m-0 px-4 pb-1 text-ink-muted">Lịch hôm nay</h2>
          <AppointmentRows items={items} empty="Hôm nay chưa có lịch." />
        </section>
      )}
    </>
  )
}
