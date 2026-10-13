// UI02 — Tổng quan (PRD §5.2). Linh, Nhung: doanh thu thuần, tiền đã thu, còn khách nợ, doanh thu từng thợ,
// Cần xử lý. Thợ: số của mình và lịch chung. Tiền trong quỹ có ở Đợt 3.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { TodaySummary } from '~/components/lich/TodaySummary'
import { Money, SegmentedControl, SummaryCard } from '~/components/ui'
import { api } from '~/lib/api'
import { useMe } from '~/lib/me'
import { formatIsoDate } from '~/lib/time'
import type { overview } from '~/server/reports/service'

export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: 'Tổng quan · LINDY OS' }] }),
  component: Overview,
})

type Data = Awaited<ReturnType<typeof overview>>

function Overview() {
  const me = useMe()
  const [period, setPeriod] = useState<'day' | 'month'>('day')
  const q = useQuery({
    queryKey: ['orders', 'overview', period],
    queryFn: () => api<Data>(`/api/overview?period=${period}`),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  const r = d?.revenue
  const a = d?.attention
  const periodLabel = d
    ? period === 'day'
      ? `Hôm nay, ${formatIsoDate(d.to)}`
      : `Tháng ${d.to.slice(5, 7)}/${d.to.slice(0, 4)}`
    : ''

  return (
    <section className="flex flex-col gap-4 px-4 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="screen-title m-0">Tổng quan</h1>
          <p className="body m-0 text-ink-muted">{periodLabel || `Chào ${me.displayName}.`}</p>
        </div>
        <SegmentedControl
          ariaLabel="Khoảng thời gian"
          options={[
            { value: 'day', label: 'Hôm nay' },
            { value: 'month', label: 'Tháng' },
          ]}
          value={period}
          onChange={(v) => setPeriod(v as 'day' | 'month')}
        />
      </div>

      {r ? (
        <SummaryCard
          label="Doanh thu thuần"
          value={r.net}
          rows={[
            { label: 'Tiền đã thu', value: r.paid },
            { label: 'Còn khách nợ', value: r.due, tone: r.due > 0 ? 'negative' : undefined },
          ]}
          footnote={`${r.orders} đơn · ${r.guests} lượt khách · ${r.unpaidOrders} chưa thu đủ${
            a?.awaiting ? ` · ${a.awaiting} chờ xác nhận` : ''
          }`}
        />
      ) : d ? (
        <section className="lo-card flex flex-col gap-1">
          <span className="overline text-ink-muted">Doanh thu của bạn</span>
          <Money value={d.mine ?? 0} size="xl" />
          <span className="caption text-ink-muted">
            Tính đơn đã xác nhận có phần bạn làm{d.byStaff[0] ? ` · ${d.byStaff[0].orders} đơn` : ''}.
          </span>
        </section>
      ) : null}

      {a && (a.awaiting || a.myInProgress || a.ownerApproval || a.review) ? (
        <section className="flex flex-col gap-1">
          <h2 className="overline m-0 text-ink-muted">Cần xử lý · đơn hàng</h2>
          <div className="-mx-4 border-t border-line">
            {a.awaiting ? (
              <AttentionLink
                to="/don-hang"
                search={{ loc: 'awaiting_confirmation' }}
                text={`${a.awaiting} đơn chờ xác nhận`}
              />
            ) : null}
            {a.ownerApproval ? (
              <AttentionLink
                to="/don-hang"
                search={{}}
                text={`${a.ownerApproval} đơn giảm trên 20% chờ Linh duyệt`}
              />
            ) : null}
            {a.review ? (
              <AttentionLink
                to="/don-hang"
                search={{ xl: true }}
                text={`${a.review} đơn Nhung tự xác nhận cần xem lại`}
              />
            ) : null}
            {a.myInProgress ? (
              <AttentionLink
                to="/don-hang"
                search={{ loc: 'in_progress' }}
                text={`${a.myInProgress} đơn của bạn đang làm, chưa bấm Làm xong`}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {r && d.byStaff.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="overline m-0 text-ink-muted">
            Doanh thu thợ {period === 'day' ? 'hôm nay' : 'tháng này'}
          </h2>
          <div className="lo-card grid grid-cols-2 gap-x-4 gap-y-1">
            {d.byStaff.map((s) => (
              <div key={s.userId} className="flex items-baseline justify-between gap-2">
                <span className="body">{s.name}</span>
                <Money value={s.amount} size="sm" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <TodaySummary />
    </section>
  )
}

function AttentionLink(props: {
  to: '/don-hang'
  search: { loc?: 'awaiting_confirmation' | 'in_progress'; xl?: boolean }
  text: string
}) {
  return (
    <Link to={props.to} search={props.search} className="lo-row lo-row-action">
      <span className="body">{props.text}</span>
      <span className="label text-accent">Xem</span>
    </Link>
  )
}
