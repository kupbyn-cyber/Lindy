// UI13 — Báo cáo doanh thu (PRD §11, bước 2.21). Linh, Nhung (revenue.read_branch).
// Doanh thu theo ngày làm dịch vụ, chỉ đơn đã xác nhận; tiền thu theo ngày nhận tiền và tài khoản.
// Cọc, tip, thu chi, chốt quỹ ở Đợt 3; lương ở Đợt 4; xuất CSV/XLSX/PDF ở Đợt 5.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Money, Note, SegmentedControl, TextField } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { formatIsoDate, toLocalDate } from '~/lib/time'
import type { dayReport, monthReport } from '~/server/reports/service'

export const Route = createFileRoute('/_app/them/bao-cao')({
  head: () => ({ meta: [{ title: 'Báo cáo · LINDY OS' }] }),
  component: ReportPage,
})

type Day = Awaited<ReturnType<typeof dayReport>>
type Month = Awaited<ReturnType<typeof monthReport>>

function ReportPage() {
  const can = useCan()
  const today = toLocalDate(new Date())
  const [kind, setKind] = useState<'day' | 'month'>('day')
  const [date, setDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const allowed = can('revenue.read_branch')
  const day = useQuery({
    queryKey: ['orders', 'report', 'day', date],
    queryFn: () => api<Day>(`/api/reports/day?date=${date}`),
    enabled: allowed && kind === 'day',
  })
  const mon = useQuery({
    queryKey: ['orders', 'report', 'month', month],
    queryFn: () => api<Month>(`/api/reports/month?month=${month}`),
    enabled: allowed && kind === 'month',
  })

  if (!allowed) {
    return (
      <div className="px-4 pt-2">
        <Note tone="danger">Chỉ Linh, Nhung xem được báo cáo doanh thu.</Note>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-2 px-4">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Báo cáo doanh thu</h1>
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <SegmentedControl
            ariaLabel="Loại báo cáo"
            options={[
              { value: 'day', label: 'Ngày' },
              { value: 'month', label: 'Tháng' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as 'day' | 'month')}
          />
          {kind === 'day' ? (
            <TextField
              label="Ngày"
              className="[&_.lo-field-label]:sr-only"
              type="date"
              max={today}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          ) : (
            <TextField
              label="Tháng"
              className="[&_.lo-field-label]:sr-only"
              type="month"
              max={today.slice(0, 7)}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          )}
        </div>
      </div>

      {kind === 'day' ? <DayView q={day} /> : <MonthView q={mon} />}

      <div className="px-4">
        <Note>Cọc, tip, thu chi, chốt quỹ có ở Đợt 3; lương ở Đợt 4; xuất file ở Đợt 5.</Note>
      </div>
    </section>
  )
}

function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="overline m-0 px-4 text-ink-muted">{props.title}</h2>
      <div className="mx-4 lo-card flex flex-col gap-1">{props.children}</div>
    </section>
  )
}

function Line(props: { label: string; value?: number; text?: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={props.strong ? 'body-strong' : 'body text-ink-muted'}>{props.label}</span>
      {props.value != null ? (
        <Money
          value={props.value}
          tone={props.negative && props.value > 0 ? 'negative' : undefined}
          className={props.strong ? 'body-strong' : undefined}
        />
      ) : (
        <span className="body">{props.text}</span>
      )}
    </div>
  )
}

function Revenue(props: { r: Day['revenue'] }) {
  const r = props.r
  return (
    <Card title="Doanh thu (đơn đã xác nhận)">
      <Line label="Doanh thu gộp" value={r.gross} />
      <Line label="Giảm giá" value={r.discount} />
      <Line label="Doanh thu thuần" value={r.net} strong />
      <Line label="Đơn · lượt khách" text={`${r.orders} · ${r.guests}`} />
      <Line label="Đã thu của các đơn này" value={r.paid} />
      <Line label="Còn phải thu" value={r.due} negative />
    </Card>
  )
}

function Staff(props: { rows: Day['byStaff'] }) {
  return (
    <Card title="Doanh thu theo thợ">
      {props.rows.length === 0 ? <span className="body text-ink-muted">Chưa có.</span> : null}
      {props.rows.map((s) => (
        <Line key={s.userId} label={`${s.name} · ${s.orders} đơn`} value={s.amount} />
      ))}
    </Card>
  )
}

function Receipts(props: { rows: Day['receipts'] }) {
  return (
    <Card title="Tiền thu theo tài khoản (ngày nhận tiền)">
      {props.rows.length === 0 ? <span className="body text-ink-muted">Chưa có khoản thu.</span> : null}
      {props.rows.map((x) => (
        <Line key={`${x.account}-${x.method}`} label={`${x.account} · ${x.count} lần`} value={x.amount} />
      ))}
    </Card>
  )
}

function Appointments(props: { a: Day['appointments'] }) {
  const a = props.a
  return (
    <Card title="Lịch hẹn">
      <Line label="Tổng lịch (trừ huỷ)" text={String(a.total)} />
      <Line label="Mới đặt" text={String(a.pending)} />
      <Line label="Khách đã đến" text={String(a.arrived)} />
      <Line label="Đã huỷ" text={String(a.cancelled)} />
      <Line label="Khách không đến" text={String(a.noShow)} />
    </Card>
  )
}

function DayView(props: { q: ReturnType<typeof useQuery<Day>> }) {
  const { q } = props
  if (q.isLoading) return <p className="body px-4 text-ink-muted">Đang tải…</p>
  if (q.isError || !q.data) return <Note tone="danger">{errorText(q.error)}</Note>
  const d = q.data
  return (
    <>
      <p className="body m-0 px-4 text-ink-muted">Ngày {formatIsoDate(d.date)}</p>
      <Revenue r={d.revenue} />
      <Card title="Đơn">
        <Line label="Đã xác nhận" text={String(d.orders.confirmed)} />
        <Line label="Chờ xác nhận" text={String(d.orders.awaiting)} />
        <Line label="Đang làm" text={String(d.orders.inProgress)} />
        <Line label="Đã huỷ" text={String(d.orders.cancelled)} />
        <Line label="Cần Linh xem lại" text={String(d.orders.review)} />
      </Card>
      <Staff rows={d.byStaff} />
      <Receipts rows={d.receipts} />
      <Appointments a={d.appointments} />
    </>
  )
}

function MonthView(props: { q: ReturnType<typeof useQuery<Month>> }) {
  const { q } = props
  if (q.isLoading) return <p className="body px-4 text-ink-muted">Đang tải…</p>
  if (q.isError || !q.data) return <Note tone="danger">{errorText(q.error)}</Note>
  const m = q.data
  return (
    <>
      <p className="body m-0 px-4 text-ink-muted">
        Tháng {m.month.slice(5, 7)}/{m.month.slice(0, 4)}
      </p>
      <Revenue r={m.revenue} />
      <Card title="Doanh thu theo ngày">
        {m.byDay.length === 0 ? <span className="body text-ink-muted">Chưa có đơn đã xác nhận.</span> : null}
        {m.byDay.map((d) => (
          <Line key={d.date} label={`${formatIsoDate(d.date).slice(0, 5)} · ${d.orders} đơn`} value={d.net} />
        ))}
      </Card>
      <Card title="Doanh thu theo dịch vụ">
        {m.byService.length === 0 ? <span className="body text-ink-muted">Chưa có.</span> : null}
        {m.byService.map((s) => (
          <Line
            key={`${s.kind}-${s.name}`}
            label={`${s.name}${s.kind === 'custom' ? ' (nhập tay)' : ''} · ${s.quantity}`}
            value={s.net}
          />
        ))}
      </Card>
      <Staff rows={m.byStaff} />
      <Receipts rows={m.receipts} />
      <Card title="Khách">
        <Line label="Khách mới" text={String(m.customers.new)} />
        <Line label="Khách quay lại" text={String(m.customers.returning)} />
        <Line label="Đơn khách lẻ" text={String(m.customers.walkIn)} />
      </Card>
      <Appointments a={m.appointments} />
    </>
  )
}
