// Khung xem lịch (bước 1.10–1.11, sửa ở Đợt 6B): thanh ngày kéo ngang, Ngày (trục giờ, cột song song), Tuần,
// Danh sách. Ô lịch theo thứ tự số khách – tên – SĐT – giờ, kèm dấu chưa cọc (S10). Trục giờ phóng to/thu nhỏ bằng
// hai ngón tay, nhớ cỡ trên máy; vuốt trái/phải sang ngày (tuần) bên cạnh. Không cuộn ngang trang.
import { Link } from '@tanstack/react-router'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx, StatusChip } from '~/components/ui'
import { DEPOSIT_STATE_CHIP, type ListItem, layoutDay, STATUS_LABEL, STATUS_TONE } from '~/lib/appointments'
import { LABEL_TONE } from '~/lib/status-tone'
import {
  addDays,
  formatIsoDate,
  hhmmToMinutes,
  minutesToHHMM,
  toLocalDate,
  toLocalTime,
  weekdayLong,
  weekdayShort,
} from '~/lib/time'

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
      className="flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
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
              'flex min-h-[46px] min-w-[42px] flex-col items-center justify-center rounded-[var(--radius-md)] border-0',
              on ? 'bg-accent text-on-accent' : 'bg-transparent text-ink',
            )}
          >
            <span className={cx('caption', !on && 'text-ink-muted')}>{weekdayShort(d)}</span>
            {/* Màu nhấn trùng màu chữ nên hôm nay dùng dấu đỏ như lịch iPhone */}
            <span
              className={cx(
                'body-strong min-w-6 rounded-full px-1 text-center',
                isToday && !on && 'bg-cal-now text-on-cal-now',
              )}
            >
              {Number(d.slice(8, 10))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Cử chỉ: vuốt ngang, hai ngón

/**
 * Vuốt trái/phải (S10): chỉ nhận khi vuốt ngang rõ ràng (≥ 60px, lệch dọc < 30°) và không bắt đầu sát mép trái
 * 24px (Safari dùng mép trái để quay lại). Trong lúc vuốt, nội dung trượt theo ngón tay rồi trả về chỗ cũ.
 */
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  onSwipe: (dir: 1 | -1) => void,
  /** Đổi khi phần tử được dựng lại (key đổi) để gắn lại sự kiện */
  remountKey: string,
) {
  const cb = useRef(onSwipe)
  cb.current = onSwipe
  // biome-ignore lint/correctness/useExhaustiveDependencies: remountKey báo phần tử mới sau khi đổi ngày
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let x0 = 0
    let y0 = 0
    let mode: 'idle' | 'pending' | 'horizontal' | 'vertical' = 'idle'
    const move = (dx: number) => {
      el.style.transform = dx ? `translateX(${Math.max(-80, Math.min(80, dx * 0.4))}px)` : ''
    }
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || e.touches[0]!.clientX < 24) {
        mode = 'idle'
        return
      }
      x0 = e.touches[0]!.clientX
      y0 = e.touches[0]!.clientY
      mode = 'pending'
      el.style.transition = ''
    }
    const moveH = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'vertical') return
      if (e.touches.length !== 1) {
        mode = 'idle'
        move(0)
        return
      }
      const dx = e.touches[0]!.clientX - x0
      const dy = e.touches[0]!.clientY - y0
      if (mode === 'pending') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        mode = Math.abs(dy) < Math.abs(dx) * 0.58 ? 'horizontal' : 'vertical'
        if (mode === 'vertical') return
      }
      e.preventDefault()
      move(dx)
    }
    const end = (e: TouchEvent) => {
      if (mode !== 'horizontal') {
        mode = 'idle'
        return
      }
      const dx = (e.changedTouches[0]?.clientX ?? x0) - x0
      mode = 'idle'
      el.style.transition = 'transform 140ms ease-out'
      move(0)
      if (Math.abs(dx) >= 60) cb.current(dx < 0 ? 1 : -1)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', moveH, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', moveH)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref, remountKey])
}

const ZOOM_KEY = 'lindy.lich.pxPerHour'
const ZOOM_MIN = 28
const ZOOM_MAX = 120
const ZOOM_DEFAULT = 48

function readZoom() {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    return v >= ZOOM_MIN && v <= ZOOM_MAX ? v : ZOOM_DEFAULT
  } catch {
    return ZOOM_DEFAULT
  }
}

/**
 * Phóng to/thu nhỏ trục giờ bằng hai ngón tay (S10), giữ mốc giờ dưới hai ngón đứng yên. Chặn phóng to cả trang
 * trong vùng lịch. Trên máy tính: Ctrl + lăn chuột (trackpad chụm hai ngón cũng gửi sự kiện này).
 */
function usePinchZoom(scroller: RefObject<HTMLDivElement | null>) {
  // Server dựng cỡ mặc định; cỡ đã nhớ đọc sau khi gắn vào trang (tránh lệch khi hydrate)
  const [pxPerHour, setPx] = useState(ZOOM_DEFAULT)
  const [loaded, setLoaded] = useState(false)
  const pxRef = useRef(ZOOM_DEFAULT)
  // Vị trí cuộn cần đặt sau khi trục giờ vẽ lại ở cỡ mới (trước đó trang chưa đủ cao để cuộn tới)
  const pendingScroll = useRef<number | null>(null)
  useEffect(() => {
    const v = readZoom()
    pxRef.current = v
    setPx(v)
    setLoaded(true)
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: đặt lại vị trí cuộn mỗi khi đổi cỡ
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pendingScroll.current != null) {
      el.scrollTop = pendingScroll.current
      pendingScroll.current = null
    }
  }, [pxPerHour])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const save = (v: number) => {
      try {
        localStorage.setItem(ZOOM_KEY, String(Math.round(v)))
      } catch {}
    }
    // Đổi cỡ, giữ phút đang nằm ở toạ độ clientY đứng yên trên màn hình
    const apply = (next: number, clientY: number) => {
      const v = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next))
      const rect = el.getBoundingClientRect()
      const offset = clientY - rect.top
      const top = pendingScroll.current ?? el.scrollTop
      const minute = ((top + offset) / pxRef.current) * 60
      pxRef.current = v
      pendingScroll.current = Math.max(0, (minute / 60) * v - offset)
      setPx(v)
    }
    let d0 = 0
    let px0 = 0
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        d0 = dist(e.touches)
        px0 = pxRef.current
      }
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !d0) return
      e.preventDefault()
      apply(px0 * (dist(e.touches) / d0), (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2)
    }
    const end = (e: TouchEvent) => {
      if (d0 && e.touches.length < 2) {
        d0 = 0
        save(pxRef.current)
      }
    }
    const gesture = (e: Event) => e.preventDefault() // Safari: không phóng to cả trang
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      apply(pxRef.current * Math.exp(-e.deltaY / 200), e.clientY)
      save(pxRef.current)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    el.addEventListener('gesturestart', gesture)
    el.addEventListener('gesturechange', gesture)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('gesturestart', gesture)
      el.removeEventListener('gesturechange', gesture)
      el.removeEventListener('wheel', wheel)
    }
  }, [scroller])
  return { pxPerHour, loaded }
}

// ---------------------------------------------------------------- Ô lịch

/**
 * Màu ô lịch kiểu lịch iPhone (S31): nền màu nhạt, vạch trái đậm, chữ cùng tông, theo trạng thái. Hồng mận = đã chốt;
 * xanh = khách đã đến, đang làm; xám = xong; xám mờ gạch ngang = huỷ, không đến. Chưa cọc, cọc chờ xác nhận, yêu cầu
 * huỷ: vạch trái cam (thấy cả khi ô quá thấp). Mọi cặp chữ/nền đạt ≥ 4.5:1, vạch đạt 3:1 (tokens.json).
 */
const CAL = {
  booked: {
    box: 'bg-cal-booked-bg text-cal-booked-ink',
    bar: 'border-l-cal-booked-bar',
    dot: 'bg-cal-booked-bar',
    sub: 'text-cal-booked-sub',
  },
  active: {
    box: 'bg-cal-active-bg text-cal-active-ink',
    bar: 'border-l-cal-active-bar',
    dot: 'bg-cal-active-bar',
    sub: 'text-cal-active-sub',
  },
  done: {
    box: 'bg-cal-done-bg text-cal-done-ink',
    bar: 'border-l-cal-done-bar',
    dot: 'bg-cal-done-bar',
    sub: 'text-cal-done-sub',
  },
  cancel: {
    box: 'bg-cal-cancel-bg text-cal-cancel-ink line-through',
    bar: 'border-l-cal-cancel-bar',
    dot: 'bg-cal-cancel-bar',
    sub: 'text-cal-cancel-ink',
  },
}

function calTone(it: ListItem) {
  if (it.status === 'arrived' || it.status === 'in_progress') return CAL.active
  if (it.status === 'completed') return CAL.done
  if (it.status === 'cancelled' || it.status === 'no_show') return CAL.cancel
  return CAL.booked
}

/** Lịch còn hiệu lực mà chưa cọc, cọc chờ xác nhận hoặc khách báo huỷ: vạch cam */
function needsDepositBar(it: ListItem) {
  const t = calTone(it)
  return (
    (t === CAL.booked || t === CAL.active) &&
    (it.customerCancelReported || it.depositState === 'missing' || it.depositState === 'pending')
  )
}

function blockClass(it: ListItem) {
  const t = calTone(it)
  return cx(
    'absolute overflow-hidden rounded-[6px] border-l-4 px-1.5 py-0.5 text-left',
    t.box,
    needsDepositBar(it) ? 'border-l-cal-deposit-bar' : t.bar,
  )
}

/** Số khách – tên – dịch vụ – giờ (S65, thay SĐT của S10; SĐT xem ở chi tiết, Danh sách) */
function cellParts(it: ListItem) {
  return [
    it.guestCount > 1 ? `${it.guestCount} khách` : null,
    it.name,
    it.serviceSummary,
    `${it.startTime}–${it.endTime}`,
  ].filter(Boolean) as string[]
}

function Badges(props: { it: ListItem }) {
  const { it } = props
  const dep = it.depositState ? DEPOSIT_STATE_CHIP[it.depositState] : undefined
  return (
    <>
      {it.customerCancelReported ? (
        <StatusChip tone={LABEL_TONE.cancelRequested}>Yêu cầu huỷ</StatusChip>
      ) : null}
      {dep ? <StatusChip tone={dep.tone}>{dep.label}</StatusChip> : null}
      {/* Lịch nào cũng đã chốt (S02): chỉ hiện trạng thái khác */}
      {it.status !== 'confirmed' && it.status !== 'pending' ? (
        <StatusChip tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</StatusChip>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Ngày: trục giờ dọc

const GUTTER = 40
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

/**
 * Giờ hiện tại (giờ Việt Nam) khi `date` là hôm nay, tự cập nhật mỗi 30 giây; ngày khác → null. Chỉ tính sau khi mở trên
 * máy (không tính lúc dựng trang ở server) để giờ không lệch.
 */
function useNowOn(date: string) {
  const [now, setNow] = useState<{ date: string; time: string } | null>(null)
  useEffect(() => {
    const read = () => {
      const d = new Date()
      setNow({ date: toLocalDate(d), time: toLocalTime(d) })
    }
    read()
    const t = setInterval(read, 30_000)
    return () => clearInterval(t)
  }, [])
  return now && now.date === date ? now.time : null
}

export function DayTimeline(props: {
  date: string
  items: ListItem[]
  openTime: string
  closeTime: string
  onCreateAt: (time: string) => void
  onSwipe: (dir: 1 | -1) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const swipeLayer = useRef<HTMLDivElement>(null)
  const { pxPerHour, loaded } = usePinchZoom(scroller)
  const pxPerMin = pxPerHour / 60
  useSwipe(swipeLayer, props.onSwipe, props.date)
  const now = useNowOn(props.date)

  // Mở sẵn ở 08:00 mỗi khi đổi ngày (và khi vừa đọc cỡ đã nhớ)
  // biome-ignore lint/correctness/useExhaustiveDependencies: chạy lại khi đổi ngày là chủ ý
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 8 * pxPerHour - 8
  }, [props.date, loaded])

  const placed = layoutDay(props.items, pxPerMin)
  const openTop = hhmmToMinutes(props.openTime) * pxPerMin
  const closeTop = hhmmToMinutes(props.closeTime) * pxPerMin
  const total = 24 * pxPerHour
  const halfHours = pxPerHour >= 72

  function onEmptyClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = Math.max(0, Math.min(23 * 60 + 45, Math.floor((e.clientY - rect.top) / pxPerMin / 15) * 15))
    props.onCreateAt(minutesToHHMM(min))
  }

  return (
    <div
      ref={scroller}
      className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-y-contain border-t border-line"
    >
      <div ref={swipeLayer} key={props.date} className="lo-day-enter relative" style={{ height: total }}>
        {/* Ngoài giờ mở cửa tô nền khác */}
        <div className="absolute right-0 bg-cal-closed" style={{ left: GUTTER, top: 0, height: openTop }} />
        <div className="absolute right-0 bg-cal-closed" style={{ left: GUTTER, top: closeTop, bottom: 0 }} />
        {HOURS.map((hh, h) => (
          <div
            key={hh}
            className="absolute right-0 border-t border-line"
            style={{ left: GUTTER, top: h * pxPerHour }}
          >
            {/* Kẻ giờ bắt đầu từ cột nội dung; nhãn không có nền để lộ ánh sáng nền */}
            <span className="caption absolute -top-2 text-ink-muted" style={{ left: 4 - GUTTER }}>
              {hh}:00
            </span>
          </div>
        ))}
        {halfHours
          ? HOURS.map((hh, h) => (
              <div
                key={`${hh}h`}
                className="absolute right-0 border-t border-dashed border-line"
                style={{ left: GUTTER, top: h * pxPerHour + pxPerHour / 2 }}
              />
            ))
          : null}
        {/* Vùng chạm để tạo lịch. Bàn phím dùng nút + ở đầu trang. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: vùng chạm trên trục giờ, có nút + thay thế */}
        <div
          className="absolute top-0 right-0 bottom-0 cursor-pointer"
          style={{ left: GUTTER }}
          onClick={onEmptyClick}
          onKeyDown={() => {}}
          role="presentation"
        >
          {placed.map((p) => {
            const parts = cellParts(p)
            const dep = p.depositState ? DEPOSIT_STATE_CHIP[p.depositState] : undefined
            const tone = calTone(p)
            return (
              <Link
                key={p.id}
                to="/lich/$id"
                params={{ id: p.id }}
                className={blockClass(p)}
                aria-label={`${parts.join(', ')}${p.customerCancelReported ? ', yêu cầu huỷ' : ''}${dep ? `, ${dep.label}` : ''}`}
                style={{
                  top: p.top,
                  height: p.height,
                  left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                  width: `calc(${100 / p.cols}% - 4px)`,
                }}
              >
                {/* Ô cao: mỗi phần một dòng; ô thấp: một dòng, cắt bớt từ phải */}
                {p.height >= 58 ? (
                  <>
                    <span className="caption block truncate font-semibold">
                      {parts.slice(0, p.guestCount > 1 ? 2 : 1).join(' · ')}
                    </span>
                    {parts.slice(p.guestCount > 1 ? 2 : 1).map((s) => (
                      <span
                        key={s}
                        className={cx(
                          'caption',
                          // Ô đủ cao: dịch vụ được hai dòng (line-clamp cần bỏ "block"), còn lại một dòng cắt bớt
                          s === p.serviceSummary && p.height >= 90
                            ? 'line-clamp-2 [overflow-wrap:anywhere]'
                            : 'block truncate',
                          tone.sub,
                        )}
                      >
                        {s}
                      </span>
                    ))}
                    {p.customerCancelReported ? (
                      <span className="caption block truncate text-cal-deposit-ink">Yêu cầu huỷ</span>
                    ) : dep ? (
                      // Đã cọc là trạng thái tốt: chữ thường; chưa cọc, cọc chờ: chữ cam như vạch
                      <span
                        className={cx(
                          'caption block truncate',
                          p.depositState === 'held' ? tone.sub : 'text-cal-deposit-ink',
                        )}
                      >
                        {dep.label}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="caption block truncate">
                    <span className="font-semibold">
                      {parts.slice(0, p.guestCount > 1 ? 2 : 1).join(' · ')}
                    </span>
                    <span className={tone.sub}>
                      {' · '}
                      {parts.slice(p.guestCount > 1 ? 2 : 1).join(' · ')}
                    </span>
                  </span>
                )}
              </Link>
            )
          })}
        </div>
        {/* Vạch giờ hiện tại kiểu lịch iPhone (S34): chỉ ngày hôm nay, nằm trên ô lịch, chạm xuyên qua */}
        {now ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 left-0"
            style={{ top: hhmmToMinutes(now) * pxPerMin }}
          >
            <div
              className="absolute right-0 border-t-2 border-cal-now"
              style={{ left: GUTTER - 2, top: -1 }}
            />
            <span className="caption absolute left-0.5 -translate-y-1/2 rounded-full bg-cal-now px-1 font-semibold text-on-cal-now">
              {now}
            </span>
          </div>
        ) : null}
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
  onSwipe: (dir: 1 | -1) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(props.weekStart, i))
  const ref = useRef<HTMLDivElement>(null)
  useSwipe(ref, props.onSwipe, props.weekStart)
  return (
    <div ref={ref} key={props.weekStart} className="lo-day-enter grid grid-cols-7 border-t border-line">
      {days.map((d) => {
        const list = props.items.filter((it) => it.date === d)
        return (
          <div key={d} className="min-w-0 border-r border-line last:border-r-0">
            <button
              type="button"
              onClick={() => props.onPickDay(d)}
              className={cx(
                'flex min-h-[44px] w-full flex-col items-center justify-center border-0 border-b border-line bg-transparent text-ink',
              )}
              aria-label={`${weekdayLong(d)} ${formatIsoDate(d)}, ${list.length} lịch`}
            >
              <span className="caption">{weekdayShort(d)}</span>
              <span
                className={cx(
                  'body-strong min-w-6 rounded-full px-1 text-center',
                  d === props.today && 'bg-cal-now text-on-cal-now',
                )}
              >
                {Number(d.slice(8, 10))}
              </span>
            </button>
            <div className="flex flex-col gap-0.5 p-0.5">
              {list.map((it) => (
                <Link
                  key={it.id}
                  to="/lich/$id"
                  params={{ id: it.id }}
                  className={cx(blockClass(it), 'relative! block min-h-[34px] px-1!')}
                >
                  {/* Cột hẹp ~50px: tên hai dòng, 12px, để còn đọc được */}
                  <span className="line-clamp-2 text-[12px] leading-[15px] font-semibold [overflow-wrap:anywhere]">
                    {it.guestCount > 1 ? `${it.guestCount} · ` : ''}
                    {it.name}
                  </span>
                  {it.serviceSummary ? (
                    <span
                      className={cx(
                        'line-clamp-1 text-[12px] leading-[15px] [overflow-wrap:anywhere]',
                        calTone(it).sub,
                      )}
                    >
                      {it.serviceSummary}
                    </span>
                  ) : null}
                  <span className={cx('block text-[12px] leading-[15px]', calTone(it).sub)}>
                    {it.startTime}
                  </span>
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
          {/* Vạch màu trạng thái, cùng màu ô lịch ở màn Ngày, Tuần (S31) */}
          <span
            aria-hidden="true"
            className={cx(
              'w-1 shrink-0 self-stretch rounded-full',
              needsDepositBar(it) ? 'bg-cal-deposit-bar' : calTone(it).dot,
            )}
          />
          <span className="lo-row-main flex-1">
            <span className="lo-row-title body-strong">
              {it.guestCount > 1 ? `${it.guestCount} khách · ` : ''}
              {it.name}
            </span>
            <span className="lo-row-meta caption">
              {[
                it.phone,
                props.showDate
                  ? `${weekdayShort(it.date)} ${formatIsoDate(it.date)} ${it.startTime}–${it.endTime}`
                  : `${it.startTime}–${it.endTime}`,
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
