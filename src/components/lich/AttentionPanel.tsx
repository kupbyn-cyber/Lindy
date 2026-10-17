// Danh sách Cần xử lý (§7.1) cho Linh, Nhung, Chin: yêu cầu huỷ (S04), quá giờ chưa đánh dấu (K02).
// Cọc (Đợt 3): cọc chờ xác nhận (Nhung, Linh), lịch chưa cọc (K16), cọc chờ hoàn/giữ (Linh, Nhung, Chin).
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '~/components/ui'
import { api } from '~/lib/api'
import type { ListItem } from '~/lib/appointments'
import { AppointmentRows } from './views'

type Attention = {
  customerCancel: ListItem[]
  overdue: ListItem[]
  depositsToConfirm: ListItem[]
  depositsMissing: ListItem[]
  depositsToResolve: ListItem[]
  depositsToReview: ListItem[]
}

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
  const groups = [
    {
      key: 'overdue',
      items: d.overdue,
      title: 'Quá giờ, chưa tạo đơn hoặc huỷ',
      short: 'quá giờ chưa xử lý',
      tone: 'text-danger',
    },
    {
      key: 'depositsToConfirm',
      items: d.depositsToConfirm ?? [],
      title: 'Cọc chờ xác nhận tiền đã vào',
      short: 'cọc chờ xác nhận',
      tone: 'text-warning',
    },
    {
      key: 'depositsToResolve',
      items: d.depositsToResolve ?? [],
      title: 'Cọc chờ hoàn hoặc giữ',
      short: 'cọc chờ hoàn/giữ',
      tone: 'text-warning',
    },
    {
      key: 'depositsToReview',
      items: d.depositsToReview ?? [],
      title: 'Cọc xử lý khác gợi ý — Linh xem lại',
      short: 'cọc cần xem lại',
      tone: 'text-warning',
    },
    {
      key: 'customerCancel',
      items: d.customerCancel,
      title: 'Yêu cầu huỷ lịch',
      short: 'yêu cầu huỷ',
      tone: 'text-warning',
    },
    {
      key: 'depositsMissing',
      items: d.depositsMissing ?? [],
      title: 'Mùa cọc: lịch chưa cọc',
      short: 'chưa cọc',
      tone: 'text-ink-muted',
    },
  ]
  const total = groups.reduce((s, g) => s + g.items.length, 0)
  if (total === 0)
    return props.compact ? null : <p className="body m-0 text-ink-muted">Không có việc cần xử lý.</p>

  const summary = groups
    .filter((g) => g.items.length)
    .map((g) => `${g.items.length} ${g.short}`)
    .join(' · ')

  return (
    // compact: một dòng nằm trong thẻ đầu màn Lịch (DayHeader, S32)
    <section className={props.compact ? 'border-t border-line' : ''}>
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
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.key}>
                <p className={`overline m-0 px-4 pb-1 ${g.tone}`}>{g.title}</p>
                <AppointmentRows items={g.items} showDate />
              </div>
            ))}
        </div>
      ) : null}
    </section>
  )
}
