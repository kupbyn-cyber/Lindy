// Ba khối của màn Chấm công (Đợt 4A, UI08, UI09): công tháng của tôi, duyệt công theo ngày (Nhung, Linh), bảng công
// tháng. Số liệu và quyền do server tính; ở đây chỉ hiện.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, cx, Note, SegmentedControl, Sheet, StatusChip, TextArea, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { DAY_LABEL, DAY_SHORT, DAY_TONE, type DayCounts, type DayStatus } from '~/lib/attendance'
import { useCan } from '~/lib/me'
import type { ChipTone } from '~/lib/status-tone'
import { formatIsoDate, toLocalTime, weekdayOf, weekdayShort } from '~/lib/time'
import type { DayBoard, DayView, MonthSheet, myMonth } from '~/server/attendance/service'
import { DateNav, LeaveList, LeaveSheet, MonthNav } from './parts'

type MyMonth = Awaited<ReturnType<typeof myMonth>>

const times = (d: { checkIn: string | null; checkOut: string | null }) =>
  d.checkIn ? `${toLocalTime(d.checkIn)}${d.checkOut ? `–${toLocalTime(d.checkOut)}` : ''}` : ''

/** Câu tóm tắt ngày nghỉ: "Đã nghỉ 2/3 ngày được hưởng" */
function absentLine(c: DayCounts, leaveDays: number | null) {
  const extra = leaveDays != null && c.absent > leaveDays ? c.absent - leaveDays : 0
  return {
    text: `Đã nghỉ ${c.absent}${leaveDays != null ? `/${leaveDays}` : ''} ngày được hưởng`,
    extra,
  }
}

// ---------------------------------------------------------------- Của tôi

export function MyMonthView(props: { month: string; onMonth: (m: string) => void }) {
  const can = useCan()
  const [leaveOpen, setLeaveOpen] = useState(false)
  const q = useQuery({
    queryKey: ['attendance', 'me', props.month],
    queryFn: () => api<MyMonth>(`/api/attendance?view=me&month=${props.month}`),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  if (q.isError) return <Note tone="danger">{errorText(q.error)}</Note>
  if (!d) return <p className="body m-0 text-ink-muted">Đang tải…</p>
  if (!d.profile)
    return <Note tone="warning">Chưa có hồ sơ nhân viên. Linh thêm ngày vào làm ở Thêm → Nhân viên.</Note>
  const a = absentLine(d.counts, d.leaveDays)
  // Ngày chưa tới chỉ hiện khi có nghỉ đã duyệt; mới nhất lên trên
  const days = d.days.filter((x) => x.status !== 'future' && x.status !== 'out').reverse()
  const mine = d.leaves.filter((l) => l.status === 'requested' || l.status === 'approved')

  return (
    <div className="flex flex-col gap-3">
      <MonthNav month={props.month} onChange={props.onMonth} />
      <section className="lo-card flex flex-col gap-1">
        <span className="body-strong">{a.text}</span>
        <span className="caption text-ink-muted">
          {d.counts.worked} ngày đi làm · {d.counts.pending} chưa duyệt
          {d.counts.closed ? ` · ${d.counts.closed} ngày quán đóng cửa` : ''}
          {d.counts.out ? ` · ${d.counts.out} ngày ngoài thời gian làm` : ''}
        </span>
        {a.extra ? (
          <Note tone="warning">
            Vượt {a.extra} ngày: trừ {a.extra} ngày lương (nghỉ không phép tính như nghỉ thường, không phạt
            thêm).
          </Note>
        ) : null}
        <span className="caption text-ink-muted">
          Ngày chưa duyệt chưa tính là ngày nghỉ. Quên vào ca thì báo Nhung bổ sung công.
        </span>
      </section>
      <Button block onClick={() => setLeaveOpen(true)}>
        Đăng ký nghỉ
      </Button>
      {mine.length ? (
        <section className="flex flex-col">
          <h2 className="overline m-0 text-ink-muted">Đơn nghỉ</h2>
          <LeaveList items={mine} />
        </section>
      ) : null}
      <section className="flex flex-col">
        <h2 className="overline m-0 text-ink-muted">Từng ngày</h2>
        <div className="flex flex-col">
          {days.map((x) => (
            <DayRow key={x.date} d={x} today={d.today} />
          ))}
          {days.length === 0 ? <p className="body m-0 text-ink-muted">Chưa có ngày nào.</p> : null}
        </div>
      </section>
      <LeaveSheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        today={d.today}
        approver={can('attendance.approve')}
      />
    </div>
  )
}

function DayRow(props: { d: DayView; today: string }) {
  const { d } = props
  return (
    <div className="flex items-center gap-2 border-t border-line py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="body">
          {weekdayShort(d.date)} {formatIsoDate(d.date).slice(0, 5)}
          {d.date === props.today ? ' · hôm nay' : ''}
        </span>
        {times(d) || d.note || d.closedReason ? (
          <span className="caption text-ink-muted">
            {[times(d), d.closedReason, d.note].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
      <StatusChip tone={DAY_TONE[d.status]}>{DAY_LABEL[d.status]}</StatusChip>
    </div>
  )
}

// ---------------------------------------------------------------- Duyệt công theo ngày

export function DayBoardView(props: { date?: string; onDate: (d: string) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['attendance', 'day', props.date ?? 'today']
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<DayBoard>(`/api/attendance?view=day${props.date ? `&date=${props.date}` : ''}`),
    placeholderData: (prev) => prev,
  })
  const [open, setOpen] = useState<DayBoard['people'][number] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const d = q.data
  if (q.isError) return <Note tone="danger">{errorText(q.error)}</Note>
  if (!d) return <p className="body m-0 text-ink-muted">Đang tải…</p>

  async function approveAll() {
    if (!d) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ approved: number; board: DayBoard }>('/api/attendance/approve-all', {
        body: { date: d.date },
      })
      qc.setQueryData(key, r.board)
      void qc.invalidateQueries({ queryKey: ['attendance'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(`Đã duyệt công ${r.approved} người.`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <DateNav date={d.date} today={d.today} onChange={props.onDate} />
      {d.locked ? <Note tone="warning">Tháng này đã khoá bảng lương: không sửa công được.</Note> : null}
      {d.checkedInPending && !d.locked ? (
        <Button block variant="primary" loading={busy} onClick={() => void approveAll()}>
          Duyệt {d.checkedInPending} người đã vào ca
        </Button>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      <div className="-mx-4 border-t border-line">
        {d.people.map((p) => (
          <button
            key={p.userId}
            type="button"
            className="lo-row lo-row-action w-full border-0 bg-transparent text-left"
            disabled={p.status === 'closed' || d.locked}
            onClick={() => setOpen(p)}
          >
            <span className="lo-row-main">
              <span className="body lo-row-title">{p.name}</span>
              <span className="lo-row-meta caption">
                {[
                  times(p) || (p.status === 'closed' ? '' : 'Chưa vào ca'),
                  p.hasLeave ? 'có đơn nghỉ đã duyệt' : '',
                  p.note,
                ]
                  .filter(Boolean)
                  .join(' · ') || ' '}
              </span>
            </span>
            <span className="lo-row-side">
              <StatusChip tone={DAY_TONE[p.status]}>{DAY_LABEL[p.status]}</StatusChip>
            </span>
          </button>
        ))}
        {d.people.length === 0 ? (
          <p className="body m-0 px-4 py-2 text-ink-muted">
            Chưa có ai có hồ sơ nhân viên. Linh thêm ở Thêm → Nhân viên.
          </p>
        ) : null}
      </div>
      {d.pendingLeaves.length ? (
        <section className="flex flex-col">
          <h2 className="overline m-0 text-ink-muted">Đơn nghỉ chờ duyệt</h2>
          <LeaveList items={d.pendingLeaves} showName />
        </section>
      ) : null}
      {open ? (
        <DecideSheet
          person={open}
          date={d.date}
          onDone={(b) => {
            qc.setQueryData(key, b)
            void qc.invalidateQueries({ queryKey: ['attendance'] })
            void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  )
}

type Decision = 'worked' | 'leave' | 'unexcused'

function DecideSheet(props: {
  person: DayBoard['people'][number]
  date: string
  onDone: (b: DayBoard) => void
  onClose: () => void
}) {
  const p = props.person
  const toast = useToast()
  const current: Decision | null = p.decided
  const [status, setStatus] = useState<Decision>(
    current ?? (p.checkIn ? 'worked' : p.hasLeave ? 'leave' : 'unexcused'),
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cùng luật với DB (app.attendance_decide)
  const needNote = (status === 'worked' && !p.checkIn) || (!!current && current !== status)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const b = await api<DayBoard>('/api/attendance/decide', {
        body: { userId: p.userId, date: props.date, status, note: note.trim() || null },
      })
      toast(`Đã ghi ${DAY_LABEL[status].toLowerCase()} cho ${p.name}.`)
      props.onDone(b)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      title={`${p.name} · ${weekdayShort(props.date)} ${formatIsoDate(props.date)}`}
      onClose={props.onClose}
      footer={
        <Button block variant="primary" loading={busy} onClick={() => void save()}>
          Lưu
        </Button>
      }
    >
      <p className="body m-0 text-ink-muted">
        {p.checkIn ? `Vào ca ${times(p)}` : 'Không có giờ vào ca'}
        {p.hasLeave ? ' · có đơn nghỉ đã duyệt' : ''}
        {current ? ` · đang ghi: ${DAY_LABEL[current].toLowerCase()}` : ''}
      </p>
      <SegmentedControl
        ariaLabel="Công ngày này"
        options={[
          { value: 'worked', label: 'Đi làm' },
          { value: 'leave', label: 'Nghỉ có phép' },
          { value: 'unexcused', label: 'Không phép' },
        ]}
        value={status}
        onChange={(v) => setStatus(v as Decision)}
      />
      <TextArea
        label={needNote ? 'Lý do (bắt buộc)' : 'Ghi chú (không bắt buộc)'}
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}

// ---------------------------------------------------------------- Bảng công tháng

const CELL: Record<ChipTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  progress: 'bg-progress-soft text-progress',
  waiting: 'bg-waiting-soft text-waiting',
  neutral: 'bg-surface-sunken text-ink-muted',
}
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

/** onPickDate (Nhung, Linh): chạm một ngày đã qua để mở Duyệt công ngày đó */
export function MonthSheetView(props: {
  month: string
  onMonth: (m: string) => void
  onPickDate?: (date: string) => void
}) {
  const q = useQuery({
    queryKey: ['attendance', 'month', props.month],
    queryFn: () => api<MonthSheet>(`/api/attendance?view=month&month=${props.month}`),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  if (q.isError) return <Note tone="danger">{errorText(q.error)}</Note>
  if (!d) return <p className="body m-0 text-ink-muted">Đang tải…</p>
  // Lưới bắt đầu thứ hai
  const lead = (weekdayOf(d.first) + 6) % 7
  return (
    <div className="flex flex-col gap-3">
      <MonthNav month={props.month} onChange={props.onMonth} />
      <p className="caption m-0 text-ink-muted">
        {(['worked', 'leave', 'unexcused', 'closed', 'pending', 'out'] as DayStatus[])
          .map((s) => `${DAY_SHORT[s]} ${DAY_LABEL[s].toLowerCase()}`)
          .join(' · ')}
      </p>
      {d.people.length === 0 ? (
        <p className="body m-0 text-ink-muted">Chưa có dữ liệu công tháng này.</p>
      ) : null}
      {d.people.map((p) => {
        const a = absentLine(p.counts, p.leaveDays)
        return (
          <section key={p.userId} className="lo-card flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="body-strong">{p.name}</span>
              <span className={cx('caption', a.extra ? 'text-danger' : 'text-ink-muted')}>
                {a.text.replace('Đã nghỉ', 'Nghỉ')}
              </span>
            </div>
            <span className="caption text-ink-muted">
              {p.counts.worked} đi làm · {p.counts.leave} có phép · {p.counts.unexcused} không phép
              {p.counts.closed ? ` · ${p.counts.closed} đóng cửa` : ''}
              {p.counts.out ? ` · ${p.counts.out} ngoài thời gian làm` : ''}
              {p.counts.pending ? ` · ${p.counts.pending} chưa duyệt` : ''}
            </span>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK.map((w) => (
                <span key={w} className="caption text-ink-muted">
                  {w}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: ô trống đầu tháng, cố định
                <span key={`b${i}`} />
              ))}
              {p.days.map((x) => (
                <button
                  key={x.date}
                  type="button"
                  aria-label={`${formatIsoDate(x.date)}: ${DAY_LABEL[x.status]}`}
                  disabled={!props.onPickDate || x.date > d.today || x.status === 'out'}
                  onClick={() => props.onPickDate?.(x.date)}
                  className={cx(
                    'caption flex flex-col items-center rounded border-0 py-0.5',
                    CELL[DAY_TONE[x.status]],
                    x.date === d.today && 'ring-1 ring-ink',
                  )}
                >
                  <span className="text-ink-muted">{Number(x.date.slice(8))}</span>
                  <span className="label">{DAY_SHORT[x.status]}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
