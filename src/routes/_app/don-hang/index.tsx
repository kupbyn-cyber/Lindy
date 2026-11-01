// UI03 — Danh sách đơn (PRD §6.4): lọc ngày, trạng thái, tìm tên/SĐT/mã đơn; tổng doanh thu đơn đã xác nhận.
// K09: thợ chỉ thấy đơn mình tạo và đơn có phần mình làm, tổng chỉ có phần của mình.
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Icon, IconButton, Money, Note, ScreenHeader, SegmentedControl, StatusChip } from '~/components/ui'
import { errorText } from '~/lib/api'
import {
  ORDER_FILTERS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  type OrderFilterValue,
  type OrderListItem,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  useOrders,
} from '~/lib/orders'
import { addDays, formatIsoDate, isIsoDate, toLocalDate } from '~/lib/time'

// xl: chỉ đơn cần Linh xem lại (P31, K18, K15), trong 31 ngày gần nhất
type Search = { d?: string; loc?: OrderFilterValue; xl?: boolean }

export const Route = createFileRoute('/_app/don-hang/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    d: typeof s.d === 'string' && isIsoDate(s.d) ? s.d : undefined,
    loc: ORDER_FILTERS.some((f) => f.value === s.loc) ? (s.loc as OrderFilterValue) : undefined,
    xl: s.xl === true || s.xl === 'true' ? true : undefined,
  }),
  head: () => ({ meta: [{ title: 'Đơn hàng · LINDY OS' }] }),
  component: OrdersPage,
})

function OrdersPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/don-hang/' })
  const today = toLocalDate(new Date())
  const date = search.d ?? today
  const filter = search.loc ?? 'all'
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [qd, setQd] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  const review = !!search.xl
  const list = useOrders(
    review
      ? { from: today, to: today, filter: 'all', review: true }
      : { from: date, to: date, filter, q: qd || undefined },
  )
  // P41: Đang làm, Chờ xác nhận, Cần xem lại xem mọi ngày (server bỏ lọc ngày)
  const allDates = review || filter === 'in_progress' || filter === 'awaiting_confirmation'
  const go = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true })
  const dayChoice = date === today ? 'today' : date === addDays(today, -1) ? 'yesterday' : 'other'
  const s = list.data?.summary

  return (
    <section className="flex flex-col gap-3">
      <ScreenHeader
        title="Đơn hàng"
        actions={
          <IconButton
            label={searchOpen ? 'Đóng tìm kiếm' : 'Tìm tên, SĐT, mã đơn'}
            onClick={() => {
              setSearchOpen((x) => !x)
              setQ('')
            }}
          >
            <Icon name={searchOpen ? 'x' : 'search'} size={22} />
          </IconButton>
        }
      />
      <div className="flex flex-col gap-2 px-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <SegmentedControl
            ariaLabel="Ngày"
            options={[
              { value: 'today', label: 'Hôm nay' },
              { value: 'yesterday', label: 'Hôm qua' },
            ]}
            value={dayChoice}
            onChange={(v) => go({ d: v === 'today' ? undefined : addDays(today, -1) })}
          />
          <input
            type="date"
            aria-label="Chọn ngày"
            className="lo-input input-text w-[150px]"
            max={today}
            value={date}
            onChange={(e) =>
              e.target.value && go({ d: e.target.value === today ? undefined : e.target.value })
            }
          />
        </div>
        {searchOpen ? (
          <input
            className="lo-input input-text"
            placeholder="Tên, SĐT, #mã"
            aria-label="Tìm tên, SĐT, mã đơn"
            value={q}
            enterKeyHint="search"
            // biome-ignore lint/a11y/noAutofocus: mở ô tìm thì gõ ngay
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        ) : null}
        <select
          aria-label="Lọc trạng thái"
          className="lo-input input-text"
          value={filter}
          onChange={(e) =>
            go({ loc: e.target.value === 'all' ? undefined : (e.target.value as OrderFilterValue) })
          }
        >
          {ORDER_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {review ? (
        <div className="px-4">
          <Note>
            Đơn cần Linh xem lại, mọi ngày.{' '}
            <button type="button" className="lo-link" onClick={() => go({ xl: undefined })}>
              Bỏ lọc
            </button>
          </Note>
        </div>
      ) : null}

      {allDates && !review ? (
        <div className="px-4">
          <Note>Đang xem mọi ngày, mới nhất trước.</Note>
        </div>
      ) : null}

      {s && !allDates ? (
        <div className="mx-4 lo-card flex flex-col gap-1">
          <span className="overline text-ink-muted">
            {date === today ? 'Hôm nay' : formatIsoDate(date)} · {s.orderCount} đơn đã xác nhận
            {s.awaitingCount ? ` · ${s.awaitingCount} chờ xác nhận` : ''}
          </span>
          {s.netAmount != null ? (
            <>
              <Row label="Doanh thu thuần" value={s.netAmount} strong />
              <Row label="Tiền đã thu" value={s.paidAmount ?? 0} />
              <Row label="Còn khách nợ" value={s.dueAmount ?? 0} />
              {s.discountAmount ? <Row label="Giảm giá" value={s.discountAmount} /> : null}
            </>
          ) : null}
          {s.byStaff.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-t border-line pt-1">
              {s.byStaff.map((b) => (
                <Row
                  key={b.userId}
                  label={list.data?.revenueAll ? b.name : 'Doanh thu của bạn'}
                  value={b.amount}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {list.isError ? <Note tone="danger">{errorText(list.error)}</Note> : null}
      <div className="border-t border-line">
        {list.isLoading ? <p className="body m-0 px-4 py-2 text-ink-muted">Đang tải…</p> : null}
        {list.data && list.data.items.length === 0 ? (
          <p className="body m-0 px-4 py-3 text-ink-muted">Không có đơn nào.</p>
        ) : null}
        {list.data?.items.map((o) => (
          <OrderRow key={o.id} o={o} showDate={allDates} />
        ))}
      </div>
    </section>
  )
}

function Row(props: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={props.strong ? 'body-strong' : 'body text-ink-muted'}>{props.label}</span>
      <Money value={props.value} className={props.strong ? 'body-strong' : undefined} />
    </div>
  )
}

/** Một dòng đơn (design OrderRow): mã, khách, giờ, thợ bên trái; tiền, trạng thái bên phải. */
export function OrderRow(props: { o: OrderListItem; showDate?: boolean }) {
  const o = props.o
  const chip =
    o.status === 'confirmed' ? (
      <StatusChip tone={PAYMENT_TONE[o.paymentStatus]}>{PAYMENT_LABEL[o.paymentStatus]}</StatusChip>
    ) : (
      <StatusChip tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</StatusChip>
    )
  return (
    <Link to="/don-hang/$id" params={{ id: o.id }} className="lo-row lo-row-action">
      <span className="lo-row-main">
        <span className="body lo-row-title">
          <span className="label text-ink-muted">{o.codeLabel}</span> {o.customerName ?? 'Khách lẻ'}
        </span>
        <span className="lo-row-meta caption">
          {props.showDate ? `${formatIsoDate(o.serviceDate).slice(0, 5)} ` : ''}
          {o.createdTime}
          {o.staffNames.length ? ` · ${o.staffNames.join(', ')}` : ''}
          {o.needsApproval ? ' · giảm chờ duyệt' : ''}
          {o.needsOwnerReview ? ' · cần xem lại' : ''}
        </span>
      </span>
      <span className="lo-row-side">
        <Money value={o.netAmount} tone={o.status === 'cancelled' ? 'muted' : undefined} />
        {chip}
      </span>
    </Link>
  )
}
