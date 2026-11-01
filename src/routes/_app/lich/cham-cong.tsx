// UI08, UI09 — Chấm công (Đợt 4A, bước 4.5–4.8; PRD §8). Mọi người: công tháng của mình, đăng ký nghỉ. Nhung, Linh:
// duyệt công theo ngày, đơn nghỉ chờ duyệt, bảng công tháng cả quán. Nút hiện theo quyền; server và DB kiểm lại.
import { createFileRoute } from '@tanstack/react-router'
import { DayBoardView, MonthSheetView, MyMonthView } from '~/components/cong/views'
import { Note, ScreenHeader, SegmentedControl } from '~/components/ui'
import { useCan } from '~/lib/me'
import { isIsoDate, isYearMonth, toLocalDate } from '~/lib/time'

type Tab = 'toi' | 'duyet' | 'bang'
type Search = { tab?: Tab; d?: string; m?: string }

export const Route = createFileRoute('/_app/lich/cham-cong')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: s.tab === 'duyet' || s.tab === 'bang' ? s.tab : undefined,
    d: typeof s.d === 'string' && isIsoDate(s.d) ? s.d : undefined,
    m: typeof s.m === 'string' && isYearMonth(s.m) ? s.m : undefined,
  }),
  head: () => ({ meta: [{ title: 'Chấm công · LINDY OS' }] }),
  component: Page,
})

function Page() {
  const can = useCan()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const approver = can('attendance.approve')
  const sheet = approver || can('payroll.read_all_branch')
  const own = can('attendance.own')
  const tab: Tab =
    search.tab && (search.tab !== 'duyet' || approver) && (search.tab !== 'bang' || sheet)
      ? search.tab
      : own
        ? 'toi'
        : approver
          ? 'duyet'
          : 'bang'
  const month = search.m ?? toLocalDate(new Date()).slice(0, 7)
  const set = (next: Search) => void navigate({ search: (s) => ({ ...s, ...next }), replace: true })

  const tabs = [
    ...(own ? [{ value: 'toi', label: 'Của tôi' }] : []),
    ...(approver ? [{ value: 'duyet', label: 'Duyệt công' }] : []),
    ...(sheet ? [{ value: 'bang', label: 'Bảng công' }] : []),
  ]

  return (
    <section className="flex flex-col gap-3 px-4 pt-1 pb-4">
      <div className="flex flex-col gap-1">
        <ScreenHeader className="-mx-4" title="Chấm công" back={{ to: '/lich', label: 'Về lịch' }} />
        <p className="caption m-0 text-ink-muted">
          1 ca 9:00–21:00 = 1 công. Ngày quán đóng cửa không tính nghỉ.
        </p>
      </div>
      {tabs.length > 1 ? (
        <SegmentedControl
          ariaLabel="Chấm công"
          options={tabs}
          value={tab}
          onChange={(v) => set({ tab: v as Tab })}
        />
      ) : null}
      {tabs.length === 0 ? <Note tone="warning">Tài khoản này không dùng chấm công.</Note> : null}
      {tab === 'toi' && own ? <MyMonthView month={month} onMonth={(m) => set({ m })} /> : null}
      {tab === 'duyet' && approver ? <DayBoardView date={search.d} onDate={(d) => set({ d })} /> : null}
      {tab === 'bang' && sheet ? (
        <MonthSheetView
          month={month}
          onMonth={(m) => set({ m })}
          onPickDate={approver ? (d) => set({ tab: 'duyet', d }) : undefined}
        />
      ) : null}
    </section>
  )
}
