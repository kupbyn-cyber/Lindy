// Danh sách Cần xử lý (§7.1) cho Linh, Nhung, Chin: Mới đặt chưa chốt, Khách báo huỷ, quá giờ chưa đánh dấu (K02).
// Cọc chờ xác nhận thêm ở Đợt 3.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '~/components/ui'
import { api } from '~/lib/api'
import type { ListItem } from '~/lib/appointments'
import { AppointmentRows } from './views'

type Attention = { pending: ListItem[]; customerCancel: ListItem[]; overdue: ListItem[] }

export function useAttention() {
  return useQuery({
    queryKey: ['appointments', 'attention'],
    queryFn: () => api<Attention>('/api/appointments/attention'),
    refetchInterval: 5 * 60_000,
  })
}

export function AttentionPanel(props: { compact?: boolean }) {
  const q = useAttention()
  const [open, setOpen] = useState(!props.compact)
  const d = q.data
  if (!d) return null
  const total = d.pending.length + d.customerCancel.length + d.overdue.length
  if (total === 0)
    return props.compact ? null : <p className="body m-0 text-ink-muted">Không có việc cần xử lý.</p>

  const summary = [
    d.overdue.length ? `${d.overdue.length} quá giờ chưa đánh dấu` : null,
    d.customerCancel.length ? `${d.customerCancel.length} Khách báo huỷ` : null,
    d.pending.length ? `${d.pending.length} Mới đặt` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      className={props.compact ? 'mx-4 rounded-[var(--radius-md)] border border-line bg-surface-raised' : ''}
    >
      {props.compact ? (
        <div className="flex items-center gap-2 px-3 py-1">
          <span className="label flex-1">
            <span className="overline text-ink-muted">Cần xử lý</span> · {summary}
          </span>
          <Button variant="quiet" onClick={() => setOpen((x) => !x)}>
            {open ? 'Ẩn' : 'Xem'}
          </Button>
        </div>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-3 pb-2">
          {d.overdue.length ? (
            <div>
              <p className="overline m-0 px-4 pb-1 text-danger">Quá giờ, chưa đánh dấu đến/không đến</p>
              <AppointmentRows items={d.overdue} showDate />
            </div>
          ) : null}
          {d.customerCancel.length ? (
            <div>
              <p className="overline m-0 px-4 pb-1 text-warning">Khách báo huỷ</p>
              <AppointmentRows items={d.customerCancel} showDate />
            </div>
          ) : null}
          {d.pending.length ? (
            <div>
              <p className="overline m-0 px-4 pb-1 text-ink-muted">Mới đặt, chưa chốt</p>
              <AppointmentRows items={d.pending} showDate />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
