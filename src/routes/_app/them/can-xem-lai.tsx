// Cần xem lại (PRD §5.2, UI02; Đợt 3B-2 bước 3.21). Linh (review_queue.read) xem một chỗ mọi việc người khác tự làm:
// đơn Nhung tự xác nhận / sửa / huỷ, phiếu ưu đãi, phiếu hoàn, cọc xử lý khác gợi ý, phiếu chi Nhung tự duyệt, chốt quỹ
// lệch. Mỗi dòng mở đúng phiếu; "Đã xem" đánh dấu ngay ở đây.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Money, Note, ScreenHeader, StatusChip, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { LABEL_TONE } from '~/lib/status-tone'
import type { ReviewItem, reviewQueue } from '~/server/review/service'

export const Route = createFileRoute('/_app/them/can-xem-lai')({
  head: () => ({ meta: [{ title: 'Cần xem lại · LINDY OS' }] }),
  component: Page,
})

type Data = Awaited<ReturnType<typeof reviewQueue>>

const KIND: Record<ReviewItem['kind'], string> = {
  order: 'Đơn',
  ticket: 'Ưu đãi',
  refund: 'Hoàn tiền',
  deposit: 'Cọc',
  expense: 'Phiếu chi',
  day_close: 'Chốt quỹ',
}

function reviewCall(i: ReviewItem): [string, Record<string, unknown>] {
  switch (i.kind) {
    case 'order':
      return [`/api/orders/${i.id}/review`, {}]
    case 'ticket':
      return [`/api/tickets/${i.id}/review`, {}]
    case 'refund':
      return [`/api/refunds/${i.id}/review`, {}]
    case 'deposit':
      return [`/api/deposits/${i.id}/review`, {}]
    case 'expense':
      return [`/api/expenses/${i.id}/review`, { version: 1 }]
    case 'day_close':
      return ['/api/money/review-close', { id: i.id }]
  }
}

function Page() {
  const can = useCan()
  const allowed = can('review_queue.read')
  const q = useQuery({
    queryKey: ['orders', 'review-queue'],
    queryFn: () => api<Data>('/api/review'),
    enabled: allowed,
  })
  if (!allowed) {
    return (
      <div className="px-4 pt-2">
        <Note tone="danger">Chỉ chủ quán xem danh sách Cần xem lại.</Note>
      </div>
    )
  }
  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-1 px-4">
        <ScreenHeader className="-mx-4" title="Cần xem lại" back={{ to: '/them', label: 'Về Thêm' }} />
      </div>
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {q.data && q.data.items.length === 0 ? (
        <p className="body m-0 px-4 text-ink-muted">Không còn việc nào cần xem lại.</p>
      ) : null}
      <div className="border-t border-line">
        {q.data?.items.map((i) => (
          <Row key={`${i.kind}-${i.id}`} i={i} />
        ))}
      </div>
    </section>
  )
}

function Row(props: { i: ReviewItem }) {
  const { i } = props
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function seen() {
    setBusy(true)
    try {
      const [path, body] = reviewCall(i)
      await api(path, { body })
      await qc.invalidateQueries({ queryKey: ['orders'] })
      void qc.invalidateQueries({ queryKey: ['money'] })
      void qc.invalidateQueries({ queryKey: ['appointments'] })
      toast('Đã đánh dấu đã xem.')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const title = (
    <>
      <StatusChip tone={LABEL_TONE.reviewKind}>{KIND[i.kind]}</StatusChip>{' '}
      <span className="body">{i.title}</span>
    </>
  )
  return (
    <div className="flex flex-col gap-1 border-b border-line bg-surface-raised px-4 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1">
          {i.link.to === 'order' && i.link.id ? (
            <Link to="/don-hang/$id" params={{ id: i.link.id }} className="lo-link">
              {title}
            </Link>
          ) : i.link.to === 'appointment' && i.link.id ? (
            <Link to="/lich/$id" params={{ id: i.link.id }} className="lo-link">
              {title}
            </Link>
          ) : i.link.to === 'expenses' ? (
            <Link to="/them/thu-chi" className="lo-link">
              {title}
            </Link>
          ) : (
            <Link to="/them/chot-ngay" className="lo-link">
              {title}
            </Link>
          )}
        </span>
        {i.amount != null ? <Money value={i.amount} /> : null}
      </div>
      <span className="caption break-words text-ink-muted">
        {i.at} · {i.detail}
      </span>
      <Button variant="quiet" loading={busy} onClick={() => void seen()}>
        Đã xem
      </Button>
    </div>
  )
}
