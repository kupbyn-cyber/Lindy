// UI02 — Tổng quan, làm lại ở Đợt 6E (S14) cho mọi người. Đầu trang là các chỉ số chữ to: Linh, Nhung thấy số toàn
// quán (doanh thu hôm nay, số khách hôm nay, đã thu / còn nợ, tiền mặt và tài khoản, doanh thu tháng); thợ thấy số
// của chính mình (K09). Biểu đồ doanh thu 30 ngày. "Cần xử lý" gộp thành một thẻ đếm số việc, bấm vào mới xem.
// S44: Linh, Nhung cũng làm khách nên có ô chuyển Toàn quán · Cá nhân; Cá nhân hiện chỉ số và biểu đồ như màn của thợ.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type CSSProperties, type ReactNode, useState } from 'react'
import { AttendanceCard } from '~/components/cong/AttendanceCard'
import { AttentionPanel, useAttention } from '~/components/lich/AttentionPanel'
import { TodaySummary } from '~/components/lich/TodaySummary'
import { cx, Icon, Money, SegmentedControl } from '~/components/ui'
import { api } from '~/lib/api'
import { useCan, useMe } from '~/lib/me'
import { formatVND } from '~/lib/money'
import { formatIsoDate, formatYearMonth, weekdayLong } from '~/lib/time'
import type { HomeBlock, overview } from '~/server/reports/service'

export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: 'Tổng quan · LINDY OS' }] }),
  component: Overview,
})

type Data = Awaited<ReturnType<typeof overview>>

function Overview() {
  const me = useMe()
  const can = useCan()
  // Số liệu tháng cho phần dưới (thợ, cọc, lãi); chỉ số đầu trang và biểu đồ ở data.home
  const q = useQuery({
    queryKey: ['orders', 'overview', 'month'],
    queryFn: () => api<Data>('/api/overview?period=month'),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  // S44: người xem số toàn quán chuyển được sang số của chính mình
  const both = can('revenue.read_branch')
  const [view, setView] = useState<HomeBlock['scope']>('branch')
  const h = view === 'mine' && d?.homeMine ? d.homeMine : d?.home
  const month = d ? d.to.slice(5, 7) : ''

  return (
    <section className="flex flex-col gap-4 px-4 pt-2">
      <div>
        <h1 className="screen-title m-0">Tổng quan</h1>
        <p className="body m-0 text-ink-muted">
          {d ? `${weekdayLong(d.to)} ${formatIsoDate(d.to)} · ` : ''}Chào {me.displayName}.
        </p>
      </div>

      {both ? (
        <SegmentedControl
          ariaLabel="Xem doanh thu"
          options={[
            { value: 'branch', label: 'Toàn quán' },
            { value: 'mine', label: 'Cá nhân' },
          ]}
          value={view}
          onChange={(v) => setView(v as HomeBlock['scope'])}
        />
      ) : null}

      {q.isError ? (
        <p className="body m-0 text-danger">Không tải được số liệu. Kéo xuống để thử lại.</p>
      ) : null}

      {d && h ? <Tiles h={h} money={d.money} myPay={d.myPay} month={month} /> : <TilesSkeleton />}

      <AttendanceCard />

      {h ? <RevenueChart key={h.scope} series={h.series} mine={h.scope === 'mine'} /> : null}

      {d ? <AttentionCard d={d} canManageBooking={can('appointments.manage_all')} /> : null}

      <TodaySummary />

      {d?.profit != null ? (
        <Link to="/them/bao-cao" className="lo-card flex flex-col gap-1 no-underline">
          <span className="flex items-baseline justify-between gap-2">
            <span className="body">Lãi/lỗ tạm tính tháng {month}</span>
            <Money value={d.profit} tone={d.profit < 0 ? 'negative' : undefined} />
          </span>
          <span className="caption text-ink-muted">Doanh thu đến hôm nay, đã trừ lương cả tháng.</span>
        </Link>
      ) : null}

      {d?.deposits &&
      (d.deposits.held || d.deposits.pending || d.deposits.forfeited || d.deposits.received) ? (
        <section className="flex flex-col gap-1">
          <h2 className="overline m-0 text-ink-muted">Cọc Tết</h2>
          <div className="lo-card flex flex-col gap-1">
            <DepLine label="Cọc đang giữ (chưa phải doanh thu)" value={d.deposits.held} />
            {d.deposits.pending ? <DepLine label="Cọc chờ xác nhận" value={d.deposits.pending} /> : null}
            <DepLine label={`Nhận cọc tháng ${month}`} value={d.deposits.received} />
            {d.deposits.forfeited ? (
              <DepLine
                label={`Doanh thu cọc khách bỏ hẹn (${d.deposits.forfeitedByOwner.map((o) => o.name).join(', ')})`}
                value={d.deposits.forfeited}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {d?.revenue && d.byStaff.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="overline m-0 text-ink-muted">Doanh thu thợ tháng {month}</h2>
          <div className="lo-card grid grid-cols-2 gap-x-4 gap-y-1">
            {d.byStaff.map((s) => (
              <div key={s.userId} className="flex items-baseline justify-between gap-2">
                <span className="body truncate">{s.name}</span>
                <Money value={s.amount} size="sm" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------- Chỉ số đầu trang

function Tile(props: { label: string; children: ReactNode; sub?: ReactNode; wide?: boolean; to?: string }) {
  const body = (
    <>
      <span className="overline text-ink-muted">{props.label}</span>
      {props.children}
      {props.sub ? <span className="caption text-ink-muted">{props.sub}</span> : null}
    </>
  )
  // @container: số tiền trong ô co chữ theo bề rộng ô (FitMoney)
  const cls = cx('lo-card @container flex min-w-0 flex-col gap-1 no-underline', props.wide && 'col-span-2')
  return props.to ? (
    <Link to={props.to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/**
 * Số tiền chữ to trong ô: tối đa `max` px, ô hẹp (máy Android rộng 360px) hay số dài thì co chữ cho vừa ô thay vì
 * tràn ra ngoài và đẩy cả trang rộng ra. Cỡ chữ tính theo bề rộng ô và số ký tự của số tiền.
 */
function FitMoney(props: { value: number; max: number; tone?: 'negative' }) {
  const style = {
    '--fit-max': `${props.max}px`,
    '--fit-chars': formatVND(props.value).length,
  } as CSSProperties
  return (
    <span className="lo-fit" style={style}>
      <Money value={props.value} size="xl" tone={props.tone} />
    </span>
  )
}

/** Số đếm chữ to, cùng cỡ với số tiền lớn */
function Count(props: { value: number; unit: string }) {
  return (
    <span className="display-money">
      {props.value}
      <span className="body text-ink-muted"> {props.unit}</span>
    </span>
  )
}

function Tiles(props: { h: HomeBlock; money: Data['money']; myPay: Data['myPay']; month: string }) {
  const { h, money, myPay, month } = props
  const openNote = h.today.open ? `+ ${h.today.open} đơn đang làm, chờ xác nhận` : 'Tính đơn đã xác nhận'
  if (h.scope === 'mine') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Doanh thu của bạn hôm nay" wide sub={openNote}>
          <FitMoney value={h.today.net} max={30} />
        </Tile>
        <Tile label="Khách bạn làm hôm nay">
          <Count value={h.today.guests} unit="khách" />
        </Tile>
        <Tile label={`Doanh thu tháng ${month}`} sub={`${h.month.guests} khách`}>
          <FitMoney value={h.month.net} max={24} />
        </Tile>
        {myPay ? (
          <Tile
            label={`Lương tạm tính tháng ${formatYearMonth(myPay.month)}`}
            wide
            to="/them/luong"
            sub={`Gồm hoa hồng ${formatVND(myPay.commission)}${myPay.advances ? ` · đã tạm ứng ${formatVND(myPay.advances)}` : ''} · xem phiếu lương`}
          >
            <FitMoney value={myPay.grossPay} max={30} />
          </Tile>
        ) : null}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile label="Doanh thu hôm nay" wide sub={openNote}>
        <FitMoney value={h.today.net} max={30} />
      </Tile>
      <Tile label="Số khách hôm nay" sub={h.today.open ? `+ ${h.today.open} chưa xác nhận` : undefined}>
        <Count value={h.today.guests} unit="khách" />
      </Tile>
      <Tile label={`Doanh thu tháng ${month}`} sub={`${h.month.guests} khách`}>
        <FitMoney value={h.month.net} max={24} />
      </Tile>
      <Tile label="Hôm nay đã thu" to="/don-hang">
        <FitMoney value={h.today.paid ?? 0} max={24} />
      </Tile>
      <Tile label="Khách còn nợ" to="/don-hang">
        <FitMoney value={h.today.due ?? 0} max={24} tone={(h.today.due ?? 0) > 0 ? 'negative' : undefined} />
      </Tile>
      {money ? (
        money.some((m) => m.balance == null) ? (
          <Tile label="Tiền trong quỹ" wide to="/them/so-tien">
            <span className="body text-ink-muted">Chưa mở sổ. Linh mở sổ ở Thêm → Sổ tiền.</span>
          </Tile>
        ) : (
          money.map((m) => (
            <Tile key={m.id} label={m.name} to="/them/so-tien">
              <FitMoney
                value={m.balance ?? 0}
                max={24}
                tone={(m.balance ?? 0) < 0 ? 'negative' : undefined}
              />
            </Tile>
          ))
        )
      ) : null}
    </div>
  )
}

function TilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      <div className="lo-card col-span-2 h-[92px] bg-surface-sunken" />
      <div className="lo-card h-[84px] bg-surface-sunken" />
      <div className="lo-card h-[84px] bg-surface-sunken" />
    </div>
  )
}

// ---------------------------------------------------------------- Biểu đồ doanh thu 30 ngày

/** Cột doanh thu từng ngày, một màu. Chạm (hoặc trỏ chuột) vào cột để xem số của ngày đó; mặc định là hôm nay. */
function RevenueChart(props: { series: HomeBlock['series']; mine: boolean }) {
  const { series } = props
  const [sel, setSel] = useState<number | null>(null)
  const idx = sel ?? series.length - 1
  const max = Math.max(1, ...series.map((s) => s.net))
  const total = series.reduce((a, s) => a + s.net, 0)
  const top = series.reduce((b, s) => (s.net > b.net ? s : b), series[0] ?? { date: '', net: 0 })
  const cur = series[idx]
  return (
    <section className="lo-card flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="overline m-0 text-ink-muted">
          {props.mine ? 'Doanh thu của bạn 30 ngày' : 'Doanh thu 30 ngày'}
        </h2>
        <span className="caption text-ink-muted">Tổng {formatVND(total)}</span>
      </div>
      <p className="body m-0" aria-live="polite">
        {cur ? (
          <>
            <span className="text-ink-muted">
              {idx === series.length - 1 ? 'Hôm nay' : formatIsoDate(cur.date)}:{' '}
            </span>
            <span className="amount">{formatVND(cur.net)}</span>
          </>
        ) : null}
      </p>
      <div className="relative h-[112px] border-b border-line-strong">
        {/* Đường mốc cao nhất, mờ */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="caption absolute top-0 right-0 -translate-y-full text-ink-muted">
          {formatVND(max)}
        </span>
        <fieldset className="absolute inset-0 m-0 flex min-w-0 items-end gap-[2px] border-0 p-0">
          <legend className="sr-only">Doanh thu từng ngày</legend>
          {series.map((s, i) => (
            <button
              key={s.date}
              type="button"
              className="flex h-full min-w-0 flex-1 items-end justify-center border-0 bg-transparent p-0"
              aria-label={`${formatIsoDate(s.date)}: ${formatVND(s.net)}`}
              aria-pressed={i === idx}
              onClick={() => setSel(i)}
              onMouseEnter={() => setSel(i)}
            >
              <span
                className={cx(
                  'block w-full max-w-[24px] rounded-t-[4px]',
                  i === idx ? 'bg-accent' : 'bg-accent/45',
                )}
                style={{ height: s.net > 0 ? `${Math.max(3, (s.net / max) * 100)}%` : 0 }}
              />
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex justify-between">
        <span className="caption text-ink-muted">
          {series[0] ? formatIsoDate(series[0].date).slice(0, 5) : ''}
        </span>
        {top.net > 0 ? (
          <span className="caption text-ink-muted">
            Cao nhất {formatIsoDate(top.date).slice(0, 5)}: {formatVND(top.net)}
          </span>
        ) : (
          <span className="caption text-ink-muted">Chưa có doanh thu</span>
        )}
        <span className="caption text-ink-muted">Hôm nay</span>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Cần xử lý: một thẻ đếm, bấm mới xem

function AttentionCard(props: { d: Data; canManageBooking: boolean }) {
  const { d } = props
  const a = d.attention
  const appt = useAttention()
  const [open, setOpen] = useState(false)
  const links: { key: string; to: string; search?: Record<string, unknown>; text: string }[] = [
    a.awaiting
      ? {
          key: 'aw',
          to: '/don-hang',
          search: { loc: 'awaiting_confirmation' },
          text: `${a.awaiting} đơn chờ xác nhận`,
        }
      : null,
    a.ownerApproval
      ? { key: 'oa', to: '/don-hang', text: `${a.ownerApproval} đơn giảm trên 20% chờ Linh duyệt` }
      : null,
    a.myInProgress
      ? {
          key: 'mi',
          to: '/don-hang',
          search: { loc: 'in_progress' },
          text: `${a.myInProgress} đơn của bạn đang làm, chưa bấm Làm xong`,
        }
      : null,
    a.reviewTotal
      ? { key: 'rv', to: '/them/can-xem-lai', text: `${a.reviewTotal} mục cần Linh xem lại` }
      : null,
    a.closeOverdue
      ? { key: 'co', to: '/them/chot-ngay', text: `Chưa chốt quỹ ngày ${formatIsoDate(a.closeOverdue)}` }
      : null,
    a.expensesToApprove
      ? { key: 'ea', to: '/them/thu-chi', text: `${a.expensesToApprove} đề nghị chi chờ duyệt` }
      : null,
    a.expensesToPay
      ? { key: 'ep', to: '/them/thu-chi', text: `${a.expensesToPay} phiếu đã duyệt chờ chi tiền` }
      : null,
    d.money && a.tipsPending
      ? { key: 'tp', to: '/them/chot-ngay', text: `Tip giữ hộ chưa trả thợ: ${formatVND(a.tipsPending)}` }
      : null,
    a.pendingDays
      ? {
          key: 'pd',
          to: '/lich/cham-cong',
          search: { tab: 'bang' },
          text: `${a.pendingDays} ngày công chưa duyệt`,
        }
      : null,
    a.leavesPending
      ? {
          key: 'lp',
          to: '/lich/cham-cong',
          search: { tab: 'duyet' },
          text: `${a.leavesPending} đơn nghỉ chờ duyệt`,
        }
      : null,
    a.payrollToLock
      ? {
          key: 'pl',
          to: '/them/luong',
          search: { m: a.payrollToLock },
          text: `Bảng lương tháng ${formatYearMonth(a.payrollToLock)} chờ khoá`,
        }
      : null,
    a.payrollUnpaid
      ? { key: 'pu', to: '/them/luong', text: `${a.payrollUnpaid} phiếu lương đã khoá chưa trả đủ` }
      : null,
    a.advancesToApprove
      ? { key: 'aa', to: '/them/tam-ung', text: `${a.advancesToApprove} đề nghị tạm ứng chờ duyệt` }
      : null,
    a.advancesToPay
      ? { key: 'ap', to: '/them/tam-ung', text: `${a.advancesToPay} tạm ứng đã duyệt chờ chi` }
      : null,
    // S39: có tài khoản nhưng chưa vào ca, đăng ký nghỉ, tính lương được
    a.staffMissing.length
      ? {
          key: 'sm',
          to: '/them/nhan-vien',
          search: a.staffMissing.length === 1 ? { u: a.staffMissing[0]!.userId } : undefined,
          text:
            a.staffMissing.length === 1
              ? `${a.staffMissing[0]!.name} ${a.staffMissing[0]!.gap === 'profile' ? 'chưa có hồ sơ nhân viên' : 'chưa có chính sách lương tháng này'}`
              : `${a.staffMissing.length} người thiếu hồ sơ hoặc chính sách lương: ${a.staffMissing.map((s) => s.name).join(', ')}`,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => !!x)
  const ad = props.canManageBooking ? appt.data : undefined
  const apptCount = ad
    ? ad.overdue.length +
      ad.customerCancel.length +
      (ad.depositsToConfirm?.length ?? 0) +
      (ad.depositsToResolve?.length ?? 0) +
      (ad.depositsToReview?.length ?? 0) +
      (ad.depositsMissing?.length ?? 0)
    : 0
  const total = links.length + apptCount
  if (total === 0) return null
  return (
    <section className="lo-card flex flex-col gap-2 p-0!">
      <button
        type="button"
        className="flex min-h-[56px] w-full items-center gap-3 border-0 bg-transparent px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
      >
        <span className="grid h-9 min-w-9 place-items-center rounded-[var(--radius-full)] bg-warning-soft px-2 text-warning">
          <span className="body-strong">{total}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="body-strong">Cần xử lý</span>
          <span className="caption text-ink-muted">
            {total} việc · bấm để {open ? 'thu gọn' : 'xem'}
          </span>
        </span>
        <Icon name="chevron-right" size={20} className={cx('transition-transform', open && 'rotate-90')} />
      </button>
      {open ? (
        <div className="border-t border-line">
          {links.map((l) => (
            <Link key={l.key} to={l.to} search={l.search as never} className="lo-row lo-row-action">
              <span className="body">{l.text}</span>
              <span className="label text-accent">Xem</span>
            </Link>
          ))}
          {apptCount ? (
            <div className="pt-2">
              <AttentionPanel />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function DepLine(props: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="body text-ink-muted">{props.label}</span>
      <Money value={props.value} />
    </div>
  )
}
