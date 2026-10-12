// Khung xem lịch (bước 1.10–1.11): thanh ngày kéo ngang, Ngày (trục giờ, cột song song), Tuần, Danh sách.
// Ô lịch không hiện SĐT (B08). Không cuộn ngang trang; chỉ thanh ngày cuộn ngang bên trong.
import { Link } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { cx, StatusChip } from '~/components/ui'
import { type ListItem, layoutDay, STATUS_LABEL, STATUS_TONE } from '~/lib/appointments'
import { addDays, formatIsoDate, hhmmToMinutes, minutesToHHMM, weekdayLong, weekdayShort } from '~/lib/time'

// ---------------------------------------------------------------- Thanh ngày

export function DateStrip(props: { value: string; today: string; onChange: (d: string) => void }) {
  const days = Array.from({ length: 29 }, (_, i) => addDays(props.value, i - 14))
  const ref = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: cuộn ngày đang chọn vào giữa mỗi khi đổi ngày
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="date"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [props.value])
  return (
    <div
      ref={ref}
      className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
      role="tablist"
      aria-label="Chọn ngày"
    >
      {days.map((d) => {
        const on = d === props.value
        const isToday = d === props.today
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={on}
            aria-current={on ? 'date' : undefined}
            onClick={() => props.onChange(d)}
            className={cx(
              'flex min-h-[52px] min-w-[44px] flex-col items-center justify-center rounded-[var(--radius-md)] border-0',
              on ? 'bg-accent text-on-accent' : 'bg-transparent text-ink',
            )}
          >
            <span className={cx('caption', !on && 'text-ink-muted')}>{weekdayShort(d)}</span>
            <span className={cx('body-strong', isToday && !on && 'text-accent')}>
              {Number(d.slice(8, 10))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Ô lịch

function blockClass(it: ListItem) {
  return cx(
    'absolute overflow-hidden rounded-[6px] border px-1.5 py-0.5 text-left',
    it.status === 'pending' && 'border-accent bg-accent-soft text-ink',
    it.status === 'confirmed' && 'border-line-strong bg-surface-raised text-ink',
    (it.status === 'arrived' || it.status === 'in_progress') && 'border-success bg-success-soft text-ink',
    it.status === 'completed' && 'border-line bg-surface-sunken text-ink-muted',
    (it.status === 'cancelled' || it.status === 'no_show') &&
      'border-line bg-surface-sunken text-ink-muted line-through',
  )
}

function Badges(props: { it: ListItem; compact?: boolean }) {
  const { it } = props
  return (
    <>
      {it.customerCancelReported ? <StatusChip tone="warning">Khách báo huỷ</StatusChip> : null}
      {!props.compact || it.status !== 'confirmed' ? (
        <StatusChip tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</StatusChip>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Ngày: trục giờ dọc

const PX_PER_MIN = 64 / 60
const GUTTER = 44
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

export function DayTimeline(props: {
  date: string
  items: ListItem[]
  openTime: string
  closeTime: string
  onCreateAt: (time: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  // Mở sẵn ở 08:00 mỗi khi đổi ngày
  // biome-ignore lint/correctness/useExhaustiveDependencies: chạy lại khi đổi ngày là chủ ý
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 8 * 60 * PX_PER_MIN - 8
  }, [props.date])

  const placed = layoutDay(props.items, PX_PER_MIN)
  const openTop = hhmmToMinutes(props.openTime) * PX_PER_MIN
  const closeTop = hhmmToMinutes(props.closeTime) * PX_PER_MIN
  const total = 24 * 60 * PX_PER_MIN

  function onEmptyClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = Math.max(0, Math.min(23 * 60 + 45, Math.floor((e.clientY - rect.top) / PX_PER_MIN / 15) * 15))
    props.onCreateAt(minutesToHHMM(min))
  }

  return (
    <div
      ref={scroller}
      className="relative overflow-y-auto border-t border-line"
      style={{
        height: 'calc(100dvh - 250px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        minHeight: 360,
      }}
    >
      <div className="relative" style={{ height: total }}>
        {/* Ngoài giờ mở cửa tô nền khác */}
        <div
          className="absolute right-0 bg-surface-sunken"
          style={{ left: GUTTER, top: 0, height: openTop }}
        />
        <div
          className="absolute right-0 bg-surface-sunken"
          style={{ left: GUTTER, top: closeTop, bottom: 0 }}
        />
        {HOURS.map((hh, h) => (
          <div
            key={hh}
            className="absolute right-0 left-0 border-t border-line"
            style={{ top: h * 60 * PX_PER_MIN }}
          >
            <span className="caption absolute -top-2 left-1 bg-surface px-0.5 text-ink-muted">{hh}:00</span>
          </div>
        ))}
        {/* Vùng chạm để tạo lịch. Bàn phím dùng nút + ở đầu trang. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: vùng chạm trên trục giờ, có nút + thay thế */}
        <div
          className="absolute top-0 right-0 bottom-0 cursor-pointer"
          style={{ left: GUTTER }}
          onClick={onEmptyClick}
          onKeyDown={() => {}}
          role="presentation"
        >
          {placed.map((p) => (
            <Link
              key={p.id}
              to="/lich/$id"
              params={{ id: p.id }}
              className={blockClass(p)}
              style={{
                top: p.top,
                height: p.height,
                left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                width: `calc(${100 / p.cols}% - 4px)`,
              }}
            >
              <span className="caption block truncate font-semibold">
                {p.startTime} {p.name}
              </span>
              {p.height > 34 ? (
                <span className="caption block truncate text-ink-muted">
                  {[p.serviceSummary, p.guestCount > 1 ? `${p.guestCount} khách` : null]
                    .filter(Boolean)
                    .join(' · ') || STATUS_LABEL[p.status]}
                </span>
              ) : null}
              {p.height > 54 ? (
                <span className="mt-0.5 flex flex-wrap gap-1">
                  <Badges it={p} compact />
                </span>
              ) : p.customerCancelReported ? (
                <span className="caption block truncate text-warning">Khách báo huỷ</span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Tuần: 7 cột hẹp

export function WeekGrid(props: {
  weekStart: string
  today: string
  items: ListItem[]
  onPickDay: (d: string) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(props.weekStart, i))
  return (
    <div className="grid grid-cols-7 border-t border-line">
      {days.map((d) => {
        const list = props.items.filter((it) => it.date === d)
        return (
          <div key={d} className="min-w-0 border-r border-line last:border-r-0">
            <button
              type="button"
              onClick={() => props.onPickDay(d)}
              className={cx(
                'flex min-h-[48px] w-full flex-col items-center justify-center border-0 border-b border-line bg-transparent',
                d === props.today ? 'text-accent' : 'text-ink',
              )}
              aria-label={`${weekdayLong(d)} ${formatIsoDate(d)}, ${list.length} lịch`}
            >
              <span className="caption">{weekdayShort(d)}</span>
              <span className="body-strong">{Number(d.slice(8, 10))}</span>
            </button>
            <div className="flex flex-col gap-0.5 p-0.5">
              {list.map((it) => (
                <Link
                  key={it.id}
                  to="/lich/$id"
                  params={{ id: it.id }}
                  className={cx(blockClass(it), 'relative! block min-h-[36px]')}
                >
                  <span className="caption block">{it.startTime}</span>
                  <span className="caption block truncate">{it.name}</span>
                </Link>
              ))}
              {list.length === 0 ? <span className="caption py-2 text-center text-ink-muted">—</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Danh sách

export function AppointmentRows(props: { items: ListItem[]; showDate?: boolean; empty?: string }) {
  if (props.items.length === 0) {
    return <p className="body px-4 py-3 text-ink-muted">{props.empty ?? 'Không có lịch.'}</p>
  }
  return (
    <div className="border-t border-line">
      {props.items.map((it) => (
        <Link key={it.id} to="/lich/$id" params={{ id: it.id }} className="lo-row lo-row-action">
          <span className="lo-row-main">
            <span className="lo-row-title body-strong">
              {it.startTime}–{it.endTime} · {it.name}
            </span>
            <span className="lo-row-meta caption">
              {[
                props.showDate ? `${weekdayShort(it.date)} ${formatIsoDate(it.date)}` : null,
                it.guestCount > 1 ? `${it.guestCount} khách` : null,
                it.serviceSummary,
                it.outsideHours ? 'Ngoài giờ' : null,
              ]
                .filter(Boolean)
                .join(' · ') || ' '}
            </span>
          </span>
          <span className="lo-row-side">
            <Badges it={it} />
          </span>
        </Link>
      ))}
    </div>
  )
}

export function GroupedList(props: { items: ListItem[]; from: string; to: string }) {
  const days: string[] = []
  for (let d = props.from; d <= props.to; d = addDays(d, 1)) days.push(d)
  const withItems = days.filter((d) => props.items.some((it) => it.date === d))
  if (withItems.length === 0)
    return <p className="body px-4 py-3 text-ink-muted">Không có lịch trong khoảng này.</p>
  return (
    <div className="flex flex-col gap-4">
      {withItems.map((d) => (
        <section key={d}>
          <h2 className="overline m-0 px-4 pb-1 text-ink-muted">
            {weekdayLong(d)} {formatIsoDate(d)}
          </h2>
          <AppointmentRows items={props.items.filter((it) => it.date === d)} />
        </section>
      ))}
    </div>
  )
}
