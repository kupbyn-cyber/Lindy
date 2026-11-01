// UI17 — Trung tâm thông báo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Button, cx, ScreenHeader } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { formatDateTimeShort } from '~/lib/time'
import type { NotificationItem } from '~/server/notifications/center'

export const Route = createFileRoute('/_app/thong-bao')({
  head: () => ({ meta: [{ title: 'Thông báo · LINDY OS' }] }),
  component: NotificationsPage,
})

function NotificationsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api<{ items: NotificationItem[] }>('/api/notifications?limit=100'),
  })
  const markAll = useMutation({
    mutationFn: () => api('/api/notifications/all/read', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  async function open(n: NotificationItem) {
    if (!n.readAt) {
      await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    await navigate({ to: n.url })
  }

  const items = list.data?.items ?? []
  const unread = items.some((n) => !n.readAt)

  return (
    <section>
      <ScreenHeader
        className="pb-2"
        title="Thông báo"
        actions={
          unread ? (
            <Button
              variant="quiet"
              loading={markAll.isPending}
              loadingText="Đang đánh dấu…"
              onClick={() => markAll.mutate()}
            >
              Đã đọc hết
            </Button>
          ) : null
        }
      />
      {list.isError ? <p className="body px-4 text-danger">{errorText(list.error)}</p> : null}
      {list.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {!list.isLoading && items.length === 0 ? (
        <p className="body px-4 text-ink-muted">Chưa có thông báo.</p>
      ) : null}
      <div className="border-t border-line">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            className="lo-row lo-row-action items-start"
            onClick={() => void open(n)}
          >
            <span className="lo-row-main">
              <span className={cx('lo-row-title', n.readAt ? 'body' : 'body-strong')}>{n.title}</span>
              <span className="caption text-ink-muted whitespace-normal">{n.body}</span>
            </span>
            <span className="lo-row-side">
              <span className="caption text-ink-muted">{formatDateTimeShort(n.createdAt)}</span>
              {!n.readAt ? <span className="lo-chip lo-chip-waiting caption">Mới</span> : null}
            </span>
          </button>
        ))}
      </div>
      <p className="caption px-4 pt-4 text-ink-muted">
        Bật nhận thông báo trên máy này ở{' '}
        <Link to="/them/thong-bao" className="lo-link">
          Thêm → Thông báo
        </Link>
        .
      </p>
    </section>
  )
}
