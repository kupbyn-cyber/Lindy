// UI11 — Khách: tìm theo tên hoặc SĐT (không dấu); chưa gõ thì hiện khách có đơn gần đây (trong phạm vi K09), nhóm
// theo ngày làm gần nhất (S40). Danh sách chỉ hiện SĐT đã che, kể cả SĐT nằm lẫn trong tên; hồ sơ mới có đủ số [P34].
// Tên lẫn SĐT, giờ: Linh, Nhung (sửa được khách) thấy nhãn "Sửa tên".
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Icon, Note, StatusChip } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { maskPhonesInText, nameLooksMessy } from '~/lib/phone'
import { LABEL_TONE } from '~/lib/status-tone'
import { addDays, formatIsoDate, toLocalDate } from '~/lib/time'
import type { CustomerListItem } from '~/server/customers/service'

export const Route = createFileRoute('/_app/khach/')({
  head: () => ({ meta: [{ title: 'Khách · LINDY OS' }] }),
  component: CustomersPage,
})

/** "Hôm nay · 20/10", "Hôm qua · 19/10", "18/10" */
function dayLabel(date: string, today: string) {
  const dm = formatIsoDate(date).slice(0, 5)
  if (date === today) return `Hôm nay · ${dm}`
  if (date === addDays(today, -1)) return `Hôm qua · ${dm}`
  return dm
}

function CustomersPage() {
  const can = useCan()
  const [q, setQ] = useState('')
  const [qd, setQd] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const list = useQuery({
    queryKey: ['customers', 'list', qd],
    queryFn: () => api<{ items: CustomerListItem[] }>(`/api/customers?q=${encodeURIComponent(qd)}`),
    placeholderData: (prev) => prev,
  })
  const items = list.data?.items ?? []
  // Thợ chỉ thấy đơn của mình (K09) nên số lần làm sẽ sai lệch: chỉ hiện cho người xem mọi đơn
  const showVisits = can('order.read_all')
  const canEdit = can('customers.edit')
  const today = toLocalDate(new Date())

  // Chưa gõ: nhóm theo ngày gần nhất (danh sách đã xếp mới nhất trước)
  const groups: { label: string | null; items: CustomerListItem[] }[] = []
  for (const c of items) {
    const label = qd ? null : c.lastDate ? dayLabel(c.lastDate, today) : null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(c)
    else groups.push({ label, items: [c] })
  }

  const meta = (c: CustomerListItem) =>
    [
      c.phoneMasked ?? 'Không có SĐT',
      showVisits && c.visits ? `${c.visits} lần` : null,
      qd ? (c.lastDate ? `gần nhất ${formatIsoDate(c.lastDate)}` : 'chưa có đơn') : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <section className="flex flex-col pt-1">
      <div
        className="sticky z-[5] flex flex-col gap-2 bg-surface px-4 pb-2"
        style={{ top: 'calc(var(--control-h) + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="screen-title m-0">Khách</h1>
          {list.data ? (
            <span className="caption text-ink-muted">
              {qd ? `${items.length} kết quả` : `${items.length} khách`}
            </span>
          ) : null}
        </div>
        <div className="relative">
          <Icon
            name="search"
            size={20}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            className="lo-input input-text"
            style={{ paddingLeft: 40 }}
            placeholder="Tìm tên hoặc SĐT"
            aria-label="Tìm khách theo tên hoặc SĐT"
            value={q}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {list.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(list.error)}</Note>
        </div>
      ) : null}
      {list.isLoading ? <p className="body m-0 px-4 py-2 text-ink-muted">Đang tải…</p> : null}
      {!list.isLoading && items.length === 0 ? (
        <p className="body m-0 px-4 py-3 text-ink-muted">
          {qd.length === 1 ? '' : qd ? 'Không thấy khách nào.' : 'Chưa có khách nào có đơn.'}
        </p>
      ) : null}
      {groups.map((g, gi) => (
        <section key={g.label ?? `g${gi}`}>
          {g.label ? <h2 className="overline m-0 px-4 pt-3 pb-1 text-ink-muted">{g.label}</h2> : null}
          <div className="border-t border-line">
            {g.items.map((c) => (
              <Link key={c.id} to="/khach/$id" params={{ id: c.id }} className="lo-row lo-row-action">
                <span className="lo-row-main">
                  <span className="body lo-row-title">{maskPhonesInText(c.name)}</span>
                  <span className="lo-row-meta caption">{meta(c)}</span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  {canEdit && nameLooksMessy(c.name) ? (
                    <StatusChip tone={LABEL_TONE.renameCustomer}>Sửa tên</StatusChip>
                  ) : null}
                  <Icon name="chevron-right" size={20} className="text-ink-muted" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </section>
  )
}
