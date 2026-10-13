// UI09 (phần hồ sơ) — Nhân viên (Đợt 4A, bước 4.3; PRD §8, §9.2; Q31, Q36). Linh (payroll.edit) nhập ngày vào làm,
// ngày nghỉ việc, cách nhận lương; chính sách lương theo tháng (chỉ từ ngày 1, không lùi vào tháng đã khoá); mốc thưởng
// KPI quản lý; tháng bắt đầu tính lương trên app. Nhung (payroll.read_all_branch) chỉ xem. Server và DB kiểm lại.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Button,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  Sheet,
  StatusChip,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { formatVND } from '~/lib/money'
import { addMonths, formatIsoDate, formatYearMonth } from '~/lib/time'
import type { PeopleData, PolicyView } from '~/server/staff/service'

export const Route = createFileRoute('/_app/them/nhan-vien')({
  head: () => ({ meta: [{ title: 'Nhân viên · LINDY OS' }] }),
  component: Page,
})

type Person = PeopleData['people'][number]

const pct = (bps: number) => `${(bps / 100).toLocaleString('vi-VN')}%`
const toBps = (s: string) => {
  const v = Number(s.replace(',', '.'))
  return Number.isFinite(v) ? Math.round(v * 100) : Number.NaN
}

function policyLine(p: PolicyView) {
  return `Lương cứng ${formatVND(p.baseSalary)} · hoa hồng ${pct(p.commissionBps)} · nghỉ hưởng ${p.leaveDays} ngày${
    p.managerKpi ? ' · thưởng KPI quản lý' : ''
  }`
}

function Page() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['people'], queryFn: () => api<PeopleData>('/api/people') })
  const [openId, setOpenId] = useState<string | null>(null)
  const [kpiOpen, setKpiOpen] = useState(false)
  const d = q.data
  const open = d?.people.find((p) => p.userId === openId) ?? null
  const month = d ? `${d.today.slice(0, 7)}-01` : ''
  const kpiNow = d?.kpi.find((k) => k.effectiveMonth <= month) ?? null
  const set = (next: PeopleData) => qc.setQueryData(['people'], next)

  return (
    <section className="flex flex-col gap-3 px-4 pt-1 pb-4">
      <div className="flex flex-col gap-1">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Nhân viên</h1>
        <p className="caption m-0 text-ink-muted">
          Đổi lương cứng, % hoa hồng chỉ có hiệu lực từ ngày 1 của tháng; không đổi tháng đã khoá bảng lương.
        </p>
      </div>
      {q.isLoading ? <p className="body m-0 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? <Note tone="danger">{errorText(q.error)}</Note> : null}
      {d ? (
        <>
          <StartMonth d={d} onSaved={set} />
          <div className="-mx-4 border-t border-line">
            {d.people.map((p) => (
              <button
                key={p.userId}
                type="button"
                className="lo-row lo-row-action w-full border-0 bg-transparent text-left"
                onClick={() => setOpenId(p.userId)}
              >
                <span className="lo-row-main">
                  <span className="body lo-row-title">
                    {p.name}
                    {p.roleName ? ` · ${p.roleName}` : ''}
                  </span>
                  <span className="lo-row-meta caption">
                    {p.profile
                      ? `Vào làm ${formatIsoDate(p.profile.startDate)}${
                          p.profile.endDate ? ` · nghỉ việc ${formatIsoDate(p.profile.endDate)}` : ''
                        } · ${p.profile.payMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}`
                      : 'Chưa có hồ sơ'}
                  </span>
                </span>
                <span className="lo-row-side">
                  {p.current ? <Money value={p.current.baseSalary} size="sm" /> : null}
                  {!p.profile || !p.current ? (
                    <StatusChip tone="warning">{!p.profile ? 'Thiếu hồ sơ' : 'Thiếu chính sách'}</StatusChip>
                  ) : !p.active ? (
                    <StatusChip tone="neutral">Đã khoá</StatusChip>
                  ) : (
                    <span className="caption text-ink-muted">HH {pct(p.current.commissionBps)}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <section className="lo-card flex flex-col gap-1">
            <span className="overline text-ink-muted">Thưởng KPI quản lý</span>
            {kpiNow ? (
              <span className="body">
                Doanh thu quán từ {formatVND(kpiNow.tier1Min)}: {pct(kpiNow.tier1Bps)}; từ{' '}
                {formatVND(kpiNow.tier2Min)}: {pct(kpiNow.tier2Bps)} (nhảy bậc trên toàn doanh thu).
              </span>
            ) : (
              <span className="body text-ink-muted">Chưa có mốc KPI cho tháng này.</span>
            )}
            {d.kpi
              .filter((k) => k.effectiveMonth !== kpiNow?.effectiveMonth)
              .map((k) => (
                <span key={k.effectiveMonth} className="caption text-ink-muted">
                  {k.effectiveMonth > month ? 'Từ' : 'Trước:'} {formatYearMonth(k.effectiveMonth)}:{' '}
                  {formatVND(k.tier1Min)} → {pct(k.tier1Bps)}; {formatVND(k.tier2Min)} → {pct(k.tier2Bps)}
                </span>
              ))}
            {d.can.edit ? (
              <Button className="self-start" variant="quiet" onClick={() => setKpiOpen(true)}>
                Đổi mốc KPI
              </Button>
            ) : null}
          </section>
          {open ? <PersonSheet p={open} d={d} onSaved={set} onClose={() => setOpenId(null)} /> : null}
          {kpiOpen ? <KpiSheet d={d} onSaved={set} onClose={() => setKpiOpen(false)} /> : null}
        </>
      ) : null}
    </section>
  )
}

function StartMonth(props: { d: PeopleData; onSaved: (d: PeopleData) => void }) {
  const toast = useToast()
  const [value, setValue] = useState(props.d.startMonth?.slice(0, 7) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = !!props.d.lockedUntil

  async function save() {
    setBusy(true)
    setError(null)
    try {
      props.onSaved(await api<PeopleData>('/api/people/settings', { body: { startMonth: `${value}-01` } }))
      toast('Đã lưu tháng bắt đầu tính lương.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="lo-card flex flex-col gap-2">
      <span className="overline text-ink-muted">Tháng bắt đầu tính lương trên app</span>
      <span className="body">
        {props.d.startMonth ? `Tháng ${formatYearMonth(props.d.startMonth)}` : 'Chưa chọn'}
      </span>
      <span className="caption text-ink-muted">
        Tháng đầu tiên mà đơn và chấm công đều nhập đủ trên app. Tháng trước đó vẫn làm lương trên Sheets.
      </span>
      {props.d.can.edit && !locked ? (
        <div className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label="Chọn tháng"
            type="month"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            variant="primary"
            loading={busy}
            disabled={!value || `${value}-01` === props.d.startMonth}
            onClick={() => void save()}
          >
            Lưu
          </Button>
        </div>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
    </section>
  )
}

function PersonSheet(props: {
  p: Person
  d: PeopleData
  onSaved: (d: PeopleData) => void
  onClose: () => void
}) {
  const { p, d } = props
  const toast = useToast()
  const edit = d.can.edit
  const [start, setStart] = useState(p.profile?.startDate ?? '')
  const [end, setEnd] = useState(p.profile?.endDate ?? '')
  const [pay, setPay] = useState<'cash' | 'transfer'>(p.profile?.payMethod ?? 'transfer')
  const [busy, setBusy] = useState<'profile' | 'policy' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Chính sách mới: mặc định từ tháng sau (đã có chính sách) hoặc tháng này; điền sẵn số đang áp dụng
  const thisMonth = d.today.slice(0, 7)
  const [month, setMonth] = useState(p.current ? addMonths(thisMonth, 1) : thisMonth)
  const [base, setBase] = useState<number | null>(p.current?.baseSalary ?? null)
  const [rate, setRate] = useState(p.current ? String(p.current.commissionBps / 100) : '25')
  const [leave, setLeave] = useState(String(p.current?.leaveDays ?? 3))
  const [kpi, setKpi] = useState(p.current?.managerKpi ?? false)
  const [reason, setReason] = useState('')

  async function saveProfile() {
    setBusy('profile')
    setError(null)
    try {
      props.onSaved(
        await api<PeopleData>('/api/people/profile', {
          body: { userId: p.userId, startDate: start, endDate: end || null, payMethod: pay },
        }),
      )
      toast(`Đã lưu hồ sơ ${p.name}.`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function savePolicy() {
    setBusy('policy')
    setError(null)
    try {
      props.onSaved(
        await api<PeopleData>('/api/people/policy', {
          body: {
            userId: p.userId,
            effectiveMonth: `${month}-01`,
            baseSalary: base ?? 0,
            commissionBps: toBps(rate),
            leaveDays: Number(leave),
            managerKpi: kpi,
            reason: reason.trim() || null,
          },
        }),
      )
      toast(`Đã lưu chính sách lương ${p.name} từ tháng ${formatYearMonth(month)}.`)
      setAdding(false)
      setReason('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open title={p.name} onClose={props.onClose}>
      <section className="flex flex-col gap-2">
        <h3 className="overline m-0 text-ink-muted">Hồ sơ</h3>
        {edit ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Ngày vào làm"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <TextField
                label="Ngày nghỉ việc"
                type="date"
                min={start || undefined}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <SegmentedControl
              ariaLabel="Cách nhận lương"
              options={[
                { value: 'transfer', label: 'Chuyển khoản' },
                { value: 'cash', label: 'Tiền mặt' },
              ]}
              value={pay}
              onChange={(v) => setPay(v as 'cash' | 'transfer')}
            />
            <p className="caption m-0 text-ink-muted">
              Ngày trước khi vào làm và sau ngày nghỉ việc tính là ngày vắng. Để trống ngày nghỉ việc khi còn
              làm.
            </p>
            <Button
              variant="primary"
              loading={busy === 'profile'}
              disabled={!start}
              onClick={() => void saveProfile()}
            >
              Lưu hồ sơ
            </Button>
          </>
        ) : (
          <p className="body m-0">
            {p.profile
              ? `Vào làm ${formatIsoDate(p.profile.startDate)}${
                  p.profile.endDate ? `, nghỉ việc ${formatIsoDate(p.profile.endDate)}` : ''
                } · nhận lương ${p.profile.payMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'}`
              : 'Chưa có hồ sơ.'}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1 border-t border-line pt-3">
        <h3 className="overline m-0 text-ink-muted">Chính sách lương theo tháng</h3>
        {p.policies.length === 0 ? (
          <p className="body m-0 text-ink-muted">Chưa có chính sách lương.</p>
        ) : null}
        {p.policies.map((x) => (
          <div key={x.effectiveMonth} className="flex flex-col border-t border-line py-1 first:border-t-0">
            <span className="body-strong">
              Từ tháng {formatYearMonth(x.effectiveMonth)}
              {x.effectiveMonth === p.current?.effectiveMonth
                ? ' · đang áp dụng'
                : x.effectiveMonth > `${thisMonth}-01`
                  ? ' · sắp áp dụng'
                  : ''}
            </span>
            <span className="caption text-ink-muted">
              {policyLine(x)}
              {x.reason ? ` · ${x.reason}` : ''}
            </span>
          </div>
        ))}
        {edit && !adding ? (
          <Button className="self-start" variant="quiet" onClick={() => setAdding(true)}>
            + Chính sách từ tháng…
          </Button>
        ) : null}
        {edit && adding ? (
          <div className="flex flex-col gap-2 pt-1">
            <TextField
              label="Có hiệu lực từ tháng"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <MoneyInput label="Lương cứng" value={base} onValueChange={setBase} />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Hoa hồng (%)"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <TextField
                label="Ngày nghỉ được hưởng"
                type="number"
                inputMode="numeric"
                min={0}
                max={15}
                value={leave}
                onChange={(e) => setLeave(e.target.value)}
              />
            </div>
            <SegmentedControl
              ariaLabel="Thưởng KPI quản lý"
              options={[
                { value: 'no', label: 'Không KPI' },
                { value: 'yes', label: 'Có thưởng KPI quản lý' },
              ]}
              value={kpi ? 'yes' : 'no'}
              onChange={(v) => setKpi(v === 'yes')}
            />
            <TextField
              label="Ghi chú (không bắt buộc)"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="caption m-0 text-ink-muted">
              Tạm ứng tối đa bằng lương cứng. Cùng tháng đã có chính sách thì lưu đè.
            </p>
            <div className="flex gap-2">
              <Button block onClick={() => setAdding(false)}>
                Thôi
              </Button>
              <Button
                block
                variant="primary"
                loading={busy === 'policy'}
                disabled={!month || base == null || Number.isNaN(toBps(rate)) || leave === ''}
                onClick={() => void savePolicy()}
              >
                Lưu chính sách
              </Button>
            </div>
          </div>
        ) : null}
      </section>
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}

function KpiSheet(props: { d: PeopleData; onSaved: (d: PeopleData) => void; onClose: () => void }) {
  const toast = useToast()
  const cur = props.d.kpi[0]
  const [month, setMonth] = useState(addMonths(props.d.today.slice(0, 7), 1))
  const [t1, setT1] = useState<number | null>(cur?.tier1Min ?? null)
  const [b1, setB1] = useState(cur ? String(cur.tier1Bps / 100) : '')
  const [t2, setT2] = useState<number | null>(cur?.tier2Min ?? null)
  const [b2, setB2] = useState(cur ? String(cur.tier2Bps / 100) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      props.onSaved(
        await api<PeopleData>('/api/people/kpi', {
          body: {
            effectiveMonth: `${month}-01`,
            tier1Min: t1 ?? 0,
            tier1Bps: toBps(b1),
            tier2Min: t2 ?? 0,
            tier2Bps: toBps(b2),
          },
        }),
      )
      toast(`Đã lưu mốc KPI từ tháng ${formatYearMonth(month)}.`)
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      title="Mốc thưởng KPI quản lý"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          loading={busy}
          disabled={!month || !t1 || !t2 || Number.isNaN(toBps(b1)) || Number.isNaN(toBps(b2))}
          onClick={() => void save()}
        >
          Lưu mốc KPI
        </Button>
      }
    >
      <TextField
        label="Có hiệu lực từ tháng"
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <MoneyInput label="Bậc 1: doanh thu từ" value={t1} onValueChange={setT1} />
        <TextField
          label="Thưởng (%)"
          inputMode="decimal"
          value={b1}
          onChange={(e) => setB1(e.target.value)}
        />
        <MoneyInput label="Bậc 2: doanh thu từ" value={t2} onValueChange={setT2} />
        <TextField
          label="Thưởng (%)"
          inputMode="decimal"
          value={b2}
          onChange={(e) => setB2(e.target.value)}
        />
      </div>
      <p className="caption m-0 text-ink-muted">
        Dưới bậc 1: 0. Đạt bậc nào thì % đó nhân trên toàn doanh thu quán (sau giảm giá, hoàn tiền; không gồm
        tip, cọc khách bỏ hẹn).
      </p>
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}
