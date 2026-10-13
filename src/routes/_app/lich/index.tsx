// UI15 — Màn lịch chính (module §7.1): Ngày / Tuần / Danh sách, lọc trạng thái, tìm tên hoặc SĐT, Cần xử lý.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Search as SearchIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppointmentForm } from '~/components/lich/AppointmentForm'
import { AttentionPanel } from '~/components/lich/AttentionPanel'
import { AppointmentRows, DateStrip, DayTimeline, GroupedList, WeekGrid } from '~/components/lich/views'
import { Button, cx, Icon, IconButton, SegmentedControl } from '~/components/ui'
import { errorText } from '~/lib/api'
import { FILTERS, type Filter, useAppointments, useBookingSettings } from '~/lib/appointments'
import { useCan } from '~/lib/me'
import { addDays, formatIsoDate, isIsoDate, startOfWeek, toLocalDate, weekdayLong } from '~/lib/time'

type View = 'ngay' | 'tuan' | 'ds'
type Search = { view?: View; d?: string; loc?: Filter }

export const Route = createFileRoute('/_app/lich/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    view: s.view === 'tuan' || s.view === 'ds' ? s.view : undefined,
    d: typeof s.d === 'string' && isIsoDate(s.d) ? s.d : undefined,
    loc: FILTERS.some((f) => f.value === s.loc) ? (s.loc as Filter) : undefined,
  }),
  head: () => ({ meta: [{ title: 'Lịch hẹn · LINDY OS' }] }),
  component: SchedulePage,
})

function SchedulePage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/lich/' })
  const can = useCan()
  const today = toLocalDate(new Date())
  const view: View = search.view ?? 'ngay'
  const date = search.d ?? today
  const filter: Filter = search.loc ?? 'active'
  const [form, setForm] = useState<{ date: string; startTime: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const range =
    view === 'tuan'
      ? { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) }
      : view === 'ds'
        ? { from: date, to: addDays(date, 13) }
        : { from: date, to: date }
  const list = useAppointments({ ...range, filter, q: searchOpen && qDebounced ? qDebounced : undefined })
  const settings = useBookingSettings()
  const items = list.data?.items ?? []

  const go = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true })

  const canCreate = can('appointments.create')

  return (
    <section className="flex flex-col gap-2 pt-1">
      <div className="flex items-center gap-2 px-4">
        <h1 className="screen-title m-0 flex-1">Lịch hẹn</h1>
        <IconButton
          label={searchOpen ? 'Đóng tìm kiếm' : 'Tìm theo tên hoặc SĐT'}
          onClick={() => setSearchOpen((x) => !x)}
        >
          {searchOpen ? <X size={22} strokeWidth={1.7} /> : <SearchIcon size={22} strokeWidth={1.7} />}
        </IconButton>
        {canCreate ? (
          <IconButton
            label="Tạo lịch"
            className="bg-accent text-on-accent"
            onClick={() => setForm({ date, startTime: date === today ? nextQuarter() : '09:00' })}
          >
            <Icon name="plus" size={22} strokeWidth={2} />
          </IconButton>
        ) : null}
      </div>

      {searchOpen ? (
        <div className="px-4">
          <input
            className="lo-input input-text"
            placeholder="Tên hoặc SĐT khách"
            aria-label="Tìm theo tên hoặc SĐT"
            value={q}
            maxLength={100}
            // biome-ignore lint/a11y/noAutofocus: mở ô tìm thì gõ ngay
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      ) : null}

      {searchOpen && qDebounced ? (
        <>
          <p className="caption m-0 px-4 text-ink-muted">Kết quả tìm “{qDebounced}”</p>
          <AppointmentRows items={items} showDate empty="Không tìm thấy lịch nào." />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 px-4">
            <SegmentedControl
              className="flex-1"
              ariaLabel="Cách xem"
              options={[
                { value: 'ngay', label: 'Ngày' },
                { value: 'tuan', label: 'Tuần' },
                { value: 'ds', label: 'Danh sách' },
              ]}
              value={view}
              onChange={(v) => go({ view: v === 'ngay' ? undefined : (v as View) })}
            />
            <select
              className="lo-input label w-auto! min-w-0 pr-2"
              aria-label="Lọc trạng thái"
              value={filter}
              onChange={(e) =>
                go({ loc: e.target.value === 'active' ? undefined : (e.target.value as Filter) })
              }
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {view === 'ngay' ? (
            <DateStrip value={date} today={today} onChange={(d) => go({ d: d === today ? undefined : d })} />
          ) : (
            <div className="flex items-center justify-between px-2">
              <Button variant="quiet" onClick={() => go({ d: addDays(date, view === 'tuan' ? -7 : -14) })}>
                ← Trước
              </Button>
              <span className="label text-ink-muted">
                {formatIsoDate(range.from).slice(0, 5)} – {formatIsoDate(range.to)}
              </span>
              <Button variant="quiet" onClick={() => go({ d: addDays(date, view === 'tuan' ? 7 : 14) })}>
                Sau →
              </Button>
            </div>
          )}

          {can('appointments.manage_all') && view === 'ngay' && date === today ? (
            <AttentionPanel compact />
          ) : null}

          {list.isError ? <p className="body px-4 text-danger">{errorText(list.error)}</p> : null}

          {view === 'ngay' ? (
            <>
              <p className={cx('caption m-0 px-4 text-ink-muted')}>
                {weekdayLong(date)} {formatIsoDate(date)} ·{' '}
                {list.isLoading ? 'Đang tải…' : `${items.length} lịch`}
                {canCreate ? ' · Chạm khoảng trống để tạo lịch' : ''}
              </p>
              <DayTimeline
                date={date}
                items={items}
                openTime={settings.data?.openTime ?? '09:00'}
                closeTime={settings.data?.closeTime ?? '21:00'}
                onCreateAt={(t) => canCreate && setForm({ date, startTime: t })}
              />
            </>
          ) : view === 'tuan' ? (
            <WeekGrid
              weekStart={range.from}
              today={today}
              items={items}
              onPickDay={(d) => go({ view: undefined, d })}
            />
          ) : (
            <GroupedList items={items} from={range.from} to={range.to} />
          )}
        </>
      )}

      <AppointmentForm
        open={!!form}
        initial={form ?? undefined}
        defaultDurationMin={settings.data?.defaultDurationMin ?? 120}
        depositSeason={settings.data?.depositSeason}
        onClose={() => setForm(null)}
      />
    </section>
  )
}

/** Mốc 15 phút kế tiếp tính từ bây giờ (giờ Việt Nam). */
function nextQuarter() {
  const now = new Date()
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const [h, m] = p.split(':').map(Number) as [number, number]
  const t = Math.min(Math.ceil((h * 60 + m) / 15) * 15, 23 * 60)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
