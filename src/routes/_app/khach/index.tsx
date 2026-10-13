// UI11 — Khách: tìm theo tên hoặc SĐT (không dấu); chưa gõ thì hiện khách có đơn gần đây (trong phạm vi K09).
// Danh sách chỉ hiện SĐT đã che; hồ sơ mới có đủ số [P34].
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Icon, Note, TextField } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { formatIsoDate } from '~/lib/time'

export const Route = createFileRoute('/_app/khach/')({
  head: () => ({ meta: [{ title: 'Khách · LINDY OS' }] }),
  component: CustomersPage,
})

type Hit = { id: string; name: string; phoneMasked: string | null; lastDate?: string }

function CustomersPage() {
  const [q, setQ] = useState('')
  const [qd, setQd] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const list = useQuery({
    queryKey: ['customers', 'list', qd],
    queryFn: () => api<{ items: Hit[] }>(`/api/customers?q=${encodeURIComponent(qd)}`),
    placeholderData: (prev) => prev,
  })
  const items = list.data?.items ?? []

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-2 px-4">
        <h1 className="screen-title m-0">Khách</h1>
        <TextField
          label="Tìm tên hoặc SĐT"
          value={q}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {list.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(list.error)}</Note>
        </div>
      ) : null}
      <div>
        <h2 className="overline m-0 px-4 pb-1 text-ink-muted">{qd ? 'Kết quả' : 'Khách có đơn gần đây'}</h2>
        <div className="border-t border-line">
          {list.isLoading ? <p className="body m-0 px-4 py-2 text-ink-muted">Đang tải…</p> : null}
          {!list.isLoading && items.length === 0 ? (
            <p className="body m-0 px-4 py-3 text-ink-muted">
              {qd.length === 1
                ? 'Gõ ít nhất 2 ký tự.'
                : qd
                  ? 'Không thấy khách nào.'
                  : 'Chưa có khách nào có đơn.'}
            </p>
          ) : null}
          {items.map((c) => (
            <Link key={c.id} to="/khach/$id" params={{ id: c.id }} className="lo-row lo-row-action">
              <span className="lo-row-main">
                <span className="body lo-row-title">{c.name}</span>
                <span className="lo-row-meta caption">
                  {c.phoneMasked ?? 'Không có SĐT'}
                  {c.lastDate ? ` · lần gần nhất ${formatIsoDate(c.lastDate)}` : ''}
                </span>
              </span>
              <Icon name="chevron-right" size={20} className="text-ink-muted" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
