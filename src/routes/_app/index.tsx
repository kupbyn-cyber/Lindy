// UI02 — Tổng quan. Đợt 1 chỉ có phần lịch (lịch hôm nay, Cần xử lý); số tiền có từ Đợt 2.
import { createFileRoute } from '@tanstack/react-router'
import { TodaySummary } from '~/components/lich/TodaySummary'
import { useMe } from '~/lib/me'

export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: 'Tổng quan · LINDY OS' }] }),
  component: Overview,
})

function Overview() {
  const me = useMe()
  return (
    <section className="flex flex-col gap-6 px-4 pt-2">
      <div>
        <h1 className="screen-title m-0">Tổng quan</h1>
        <p className="body m-0 text-ink-muted">Chào {me.displayName}.</p>
      </div>
      <TodaySummary />
    </section>
  )
}
