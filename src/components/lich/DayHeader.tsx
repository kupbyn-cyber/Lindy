// Thẻ đầu màn Lịch, kiểu xem Ngày (S32): ngày và số lịch; người nghỉ ngày đó nổi bật (đã duyệt, chờ duyệt) để các bạn
// chủ động sắp lịch; Cần xử lý (Linh, Nhung, Chin, chỉ hôm nay). Không còn dòng hướng dẫn thao tác.
import { useQuery } from '@tanstack/react-query'
import { UserX } from 'lucide-react'
import { api } from '~/lib/api'
import { formatIsoDate, weekdayLong } from '~/lib/time'
import type { staffOff } from '~/server/attendance/leave'
import { AttentionPanel } from './AttentionPanel'

type Off = Awaited<ReturnType<typeof staffOff>>

export function DayHeader(props: { date: string; count: number | null; showAttention: boolean }) {
  const q = useQuery({
    queryKey: ['appointments', 'off', props.date],
    queryFn: () => api<Off>(`/api/appointments/off?date=${props.date}`),
  })
  const off = q.data?.off ?? []
  const pending = q.data?.pending ?? []
  return (
    <section className="mx-4 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-raised">
      <p className="body-strong m-0 px-3 py-2">
        {weekdayLong(props.date)} {formatIsoDate(props.date).slice(0, 5)} ·{' '}
        {props.count == null ? 'Đang tải…' : `${props.count} lịch`}
      </p>
      {q.data ? (
        off.length || pending.length ? (
          <div className="flex items-start gap-2 border-t border-line bg-warning-soft px-3 py-2 text-warning">
            <UserX size={18} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="flex min-w-0 flex-col">
              {off.length ? <span className="body-strong break-words">Nghỉ: {off.join(', ')}</span> : null}
              {pending.length ? (
                <span className={off.length ? 'caption break-words' : 'body-strong break-words'}>
                  {pending.join(', ')} xin nghỉ, chờ duyệt
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="caption m-0 border-t border-line px-3 py-2 text-ink-muted">
            Đủ nhân sự, không ai nghỉ
          </p>
        )
      ) : null}
      {props.showAttention ? <AttentionPanel compact /> : null}
    </section>
  )
}
