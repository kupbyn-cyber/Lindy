// Chi tiết lịch (module §7.2, bước 1.13). Chỉ 3 nút: Sửa lịch · Tạo đơn · Huỷ lịch (S03). Huỷ chọn lý do
// Khách báo huỷ / Khách không đến / Lý do khác; người không huỷ được thì gửi yêu cầu (S04).
// Nút hiện theo quyền; server vẫn từ chối gọi trực tiếp.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Phone } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { AppointmentForm } from '~/components/lich/AppointmentForm'
import { DepositSection } from '~/components/lich/DepositSection'
import {
  Button,
  ConfirmDialog,
  Note,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import {
  DEPOSIT_STATE_CHIP,
  type Detail,
  STATUS_LABEL,
  STATUS_TONE,
  useAppointment,
  useBookingSettings,
} from '~/lib/appointments'
import { ORDER_STATUS_LABEL, type OrderStatus } from '~/lib/orders'
import { LABEL_TONE } from '~/lib/status-tone'
import { formatDateTimeShort, formatIsoDate, toLocalDate, weekdayLong } from '~/lib/time'

export const Route = createFileRoute('/_app/lich/$id')({
  head: () => ({ meta: [{ title: 'Chi tiết lịch · LINDY OS' }] }),
  component: DetailPage,
})

type CancelKind = 'customer' | 'no_show' | 'other'

const CANCEL_KIND_LABEL: Record<CancelKind, string> = {
  customer: 'Khách báo huỷ',
  no_show: 'Khách không đến',
  other: 'Lý do khác',
}

const AUDIT_LABEL: Record<string, string> = {
  created: 'Tạo lịch',
  created_confirmed: 'Tạo lịch',
  auto_confirmed: 'Tự chốt (bỏ bước chốt lịch)',
  updated: 'Sửa',
  rescheduled: 'Đổi giờ',
  confirmed: 'Chốt lịch',
  arrived: 'Khách đã đến',
  in_progress: 'Đang làm (đã tạo đơn)',
  customer_linked: 'Gắn hồ sơ khách',
  no_show: 'Khách không đến',
  completed: 'Hoàn thành',
  cancelled: 'Huỷ lịch',
  customer_cancel_reported: 'Yêu cầu huỷ',
  note: 'Ghi chú thêm',
  deposit_recorded: 'Ghi cọc',
  deposit_confirmed: 'Xác nhận cọc',
  deposit_voided: 'Huỷ khoản cọc',
  deposit_refunded: 'Hoàn cọc',
  deposit_forfeited: 'Giữ cọc',
  deposit_reviewed: 'Linh đã xem khoản cọc',
}

const FIELD_LABEL: Record<string, string> = {
  customer_display_name: 'Tên',
  phone: 'SĐT',
  start_at: 'Giờ bắt đầu',
  end_at: 'Giờ kết thúc',
  guest_count: 'Số khách',
  service_summary: 'Dịch vụ',
  notes: 'Ghi chú',
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line px-4 py-2">
      <span className="label w-24 flex-none pt-0.5 text-ink-muted">{props.label}</span>
      <span className="body min-w-0 flex-1 break-words">{props.children}</span>
    </div>
  )
}

/** Một đơn của lịch: Khách 2 · Lan — mã đơn, trạng thái (S06) */
function GuestOrder(props: { o: Detail['orders'][number] }) {
  const { o } = props
  return (
    <>
      <span className="lo-row-main">
        <span className="lo-row-title body-strong">
          {o.guestNo ? `Khách ${o.guestNo}` : 'Đơn'}
          {o.name ? ` · ${o.name}` : ''}
        </span>
        <span className="lo-row-meta caption">Đơn {o.codeLabel}</span>
      </span>
      <span className="label text-ink-muted">{ORDER_STATUS_LABEL[o.status as OrderStatus]}</span>
    </>
  )
}

function DetailPage() {
  const { id } = Route.useParams()
  const q = useAppointment(id)
  const settings = useBookingSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  // Mã yêu cầu tạo đơn: bấm hai lần không ra hai đơn (test 28)
  const orderRequest = useRef('')
  const [tab, setTab] = useState<'info' | 'history'>('info')
  const [editing, setEditing] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [kind, setKind] = useState<CancelKind>('customer')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Tên, SĐT khách đi cùng khi tạo đơn lịch nhiều khách (S06)
  const [askGuests, setAskGuests] = useState(false)
  const [guests, setGuests] = useState<{ guestNo: number; name: string; phone: string }[]>([])

  if (q.isLoading) return <p className="body px-4 text-ink-muted">Đang tải…</p>
  if (q.isError || !q.data) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-2">
        <Note tone="danger">
          {q.error instanceof ApiError && q.error.status === 404
            ? 'Không tìm thấy lịch.'
            : errorText(q.error)}
        </Note>
        <Link to="/lich" className="lo-btn lo-btn-secondary button-label">
          Về lịch hẹn
        </Link>
      </div>
    )
  }
  const d = q.data
  const c = d.can
  const activeOrders = d.orders.filter((o) => o.status !== 'cancelled')
  // Người có quyền huỷ thì huỷ luôn; người khác gửi yêu cầu cho Linh, Nhung, Chin (S04)
  const request = !c.cancel && c.reportCustomerCancel
  const showCancel = c.cancel || c.reportCustomerCancel
  const kinds: CancelKind[] = request || c.noShow ? ['customer', 'no_show', 'other'] : ['customer', 'other']
  const noteRequired = kind === 'other'

  function openCancel() {
    setKind('customer')
    setText('')
    setActionError(null)
    setCancelOpen(true)
  }

  async function runCancel() {
    if (noteRequired && !text.trim()) {
      setActionError('Ghi lý do huỷ.')
      return
    }
    setBusy(true)
    setActionError(null)
    const note = text.trim()
    const label = CANCEL_KIND_LABEL[kind]
    const withNote = kind === 'other' ? note : note ? `${label}: ${note}` : label
    const [path, body, done] = request
      ? ([
          'report-customer-cancel',
          { version: d.version, note: withNote },
          'Đã gửi yêu cầu huỷ cho Linh, Nhung, Chin.',
        ] as const)
      : kind === 'no_show'
        ? (['no-show', { version: d.version }, 'Đã ghi khách không đến.'] as const)
        : (['cancel', { version: d.version, reason: withNote }, 'Đã huỷ lịch.'] as const)
    try {
      const next = await api<Detail>(`/api/appointments/${d.id}/${path}`, { body })
      qc.setQueryData(['appointments', 'detail', d.id], next)
      await qc.invalidateQueries({ queryKey: ['appointments'] })
      toast(done)
      setCancelOpen(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data) {
        qc.setQueryData(['appointments', 'detail', d.id], e.data as Detail)
        setActionError('Lịch vừa được người khác sửa. Đã tải bản mới nhất, xem lại rồi thao tác.')
      } else {
        setActionError(errorText(e))
      }
    } finally {
      setBusy(false)
    }
  }

  // Khách chưa có đơn (S08: số đơn luôn bằng số khách)
  const taken = new Set(activeOrders.map((o) => o.guestNo))
  const missing = Array.from({ length: d.guestCount }, (_, i) => i + 1).filter((n) => !taken.has(n))
  const companionLabel = `Khách đi cùng ${d.name}`

  // Tạo đơn từ lịch (module §10, S06): tạo đủ đơn cho mọi khách chưa có đơn; lịch tự sang Đang làm.
  // Một đơn → mở đơn để chọn dịch vụ; nhiều đơn → ở lại lịch, mở từng đơn ở danh sách bên dưới.
  async function createOrders(list: { guestNo: number; name: string; phone: string }[]) {
    setOrderBusy(true)
    setOrderError(null)
    if (!orderRequest.current) orderRequest.current = crypto.randomUUID()
    try {
      const res = await api<{ orders: { id: string }[] }>(`/api/appointments/${d.id}/create-order`, {
        body: {
          createRequestId: orderRequest.current,
          guests: list.map((g) => ({
            guestNo: g.guestNo,
            name: g.name.trim() || null,
            phone: g.phone.trim() || null,
          })),
        },
      })
      orderRequest.current = ''
      setAskGuests(false)
      await qc.invalidateQueries({ queryKey: ['appointments'] })
      if (res.orders.length === 1) {
        await navigate({ to: '/don-hang/$id', params: { id: res.orders[0]!.id } })
      } else {
        toast(`Đã tạo ${res.orders.length} đơn. Mở từng đơn để chọn dịch vụ.`)
      }
    } catch (e) {
      setOrderError(errorText(e))
    } finally {
      setOrderBusy(false)
    }
  }

  function onCreateOrder() {
    setOrderError(null)
    const others = missing.filter((n) => n > 1)
    if (others.length === 0) {
      void createOrders([])
      return
    }
    setGuests(others.map((n) => ({ guestNo: n, name: '', phone: '' })))
    setAskGuests(true)
  }

  const canOrder = c.createOrder && missing.length > 0
  // Lịch ngày sau hoặc có yêu cầu huỷ: Tạo đơn không phải việc kế tiếp, không để dính đáy dễ chạm nhầm
  const orderInBar = canOrder && d.date <= toLocalDate(new Date()) && !d.customerCancelReported
  const createOrderButton = (
    <Button variant="primary" block loading={orderBusy && !askGuests} onClick={onCreateOrder}>
      Tạo đơn
    </Button>
  )

  return (
    <section className="flex flex-col gap-3">
      <ScreenHeader
        title={d.name}
        back={{ to: '/lich', search: { d: d.date }, label: `Về lịch ${formatIsoDate(d.date)}` }}
      />
      <div className="px-4">
        <div className="flex flex-wrap gap-1">
          {/* Lịch nào cũng đã chốt (S02): chỉ hiện trạng thái khác */}
          {d.status !== 'confirmed' ? (
            <StatusChip tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</StatusChip>
          ) : null}
          {d.customerCancelReported ? (
            <StatusChip tone={LABEL_TONE.cancelRequested}>Yêu cầu huỷ</StatusChip>
          ) : null}
          {d.depositState && DEPOSIT_STATE_CHIP[d.depositState] ? (
            <StatusChip tone={DEPOSIT_STATE_CHIP[d.depositState]!.tone}>
              {DEPOSIT_STATE_CHIP[d.depositState]!.label}
            </StatusChip>
          ) : null}
          {d.outsideHours ? <StatusChip tone={LABEL_TONE.outsideHours}>Ngoài giờ mở cửa</StatusChip> : null}
        </div>
      </div>

      {c.viewAudit ? (
        <div className="px-4">
          <SegmentedControl
            className="w-full"
            options={[
              { value: 'info', label: 'Thông tin' },
              { value: 'history', label: 'Lịch sử' },
            ]}
            value={tab}
            onChange={(v) => setTab(v as 'info' | 'history')}
          />
        </div>
      ) : null}

      {tab === 'history' ? (
        <History id={d.id} />
      ) : (
        <>
          <div className="border-t border-line bg-surface-raised">
            <Row label="Thời gian">
              {weekdayLong(d.date)} {formatIsoDate(d.date)}, {d.startTime}–{d.endTime}
            </Row>
            <Row label="Số khách">{d.guestCount}</Row>
            {d.phone ? (
              <Row label="SĐT">
                <span className="flex items-center justify-between gap-2">
                  <span>{d.phone}</span>
                  <a href={`tel:${d.phone}`} className="lo-btn lo-btn-secondary button-label">
                    <Phone size={16} strokeWidth={1.7} aria-hidden="true" /> Gọi
                  </a>
                </span>
              </Row>
            ) : null}
            {d.serviceSummary ? <Row label="Dịch vụ">{d.serviceSummary}</Row> : null}
            {d.notes ? (
              <Row label="Ghi chú">
                <span className="whitespace-pre-wrap">{d.notes}</span>
              </Row>
            ) : null}
            {d.customerCancelReported ? (
              <Row label="Yêu cầu huỷ">
                {d.customerCancelReportedByName ?? ''}
                {d.customerCancelNote ? ` — ${d.customerCancelNote}` : ''}
              </Row>
            ) : null}
            {d.status === 'cancelled' ? (
              <Row label="Lý do huỷ">
                {d.cancelReason}{' '}
                {d.cancelledByName ? <span className="text-ink-muted">({d.cancelledByName})</span> : null}
              </Row>
            ) : null}
            <Row label="Người tạo">
              {d.createdByName} <span className="text-ink-muted">· {formatDateTimeShort(d.createdAt)}</span>
            </Row>
            <Row label="Sửa gần nhất">
              {d.updatedByName} <span className="text-ink-muted">· {formatDateTimeShort(d.updatedAt)}</span>
            </Row>
          </div>

          <div className="flex flex-col gap-2 px-4">
            {d.warnings.overlapCount > 0 ? (
              <Note>Cùng giờ có {d.warnings.overlapCount} lịch khác.</Note>
            ) : null}
            {d.warnings.duplicates.map((x) => (
              <Note key={x.id} tone="warning">
                Có thể trùng khách với lịch lúc {x.startTime}.{' '}
                <Link to="/lich/$id" params={{ id: x.id }} className="lo-link">
                  Mở lịch kia
                </Link>
              </Note>
            ))}
          </div>

          <DepositSection d={d} />

          {d.orders.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h2 className="overline m-0 px-4 text-ink-muted">Đơn từ lịch này</h2>
              <div className="border-t border-line">
                {d.orders.map((o) =>
                  o.visible ? (
                    <Link
                      key={o.id}
                      to="/don-hang/$id"
                      params={{ id: o.id }}
                      className="lo-row lo-row-action"
                    >
                      <GuestOrder o={o} />
                    </Link>
                  ) : (
                    <div key={o.id} className="lo-row">
                      <GuestOrder o={o} />
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {/* S45: Tạo đơn là nút chính; Sửa lịch nút nhỏ; Huỷ lịch chữ nhỏ ở cuối, tách xa nút chính */}
          <div className="flex flex-col gap-2 px-4 pb-6">
            {canOrder && !orderInBar ? createOrderButton : null}
            {c.edit ? (
              <Button block onClick={() => setEditing(true)}>
                Sửa lịch
              </Button>
            ) : null}
            {orderError ? <Note tone="danger">{orderError}</Note> : null}
            {d.customerCancelReported && !c.cancel && ['pending', 'confirmed'].includes(d.status) ? (
              <p className="caption m-0 text-ink-muted">Đã gửi yêu cầu huỷ, chờ Linh, Nhung, Chin xử lý.</p>
            ) : null}
            {showCancel ? (
              <button type="button" className="label lo-tap-text self-end text-danger" onClick={openCancel}>
                Huỷ lịch
              </button>
            ) : null}
          </div>
          {orderInBar ? <div className="lo-actionbar">{createOrderButton}</div> : null}
        </>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title={request ? 'Gửi yêu cầu huỷ lịch?' : 'Huỷ lịch này?'}
        confirmLabel={request ? 'Gửi yêu cầu huỷ' : kind === 'no_show' ? 'Ghi khách không đến' : 'Huỷ lịch'}
        danger={!request}
        busy={busy}
        onConfirm={() => void runCancel()}
        onCancel={() => setCancelOpen(false)}
      >
        <p className="body m-0 text-ink-muted">
          {d.startTime} {formatIsoDate(d.date)} · {d.name}
        </p>
        <SegmentedControl
          className="w-full"
          ariaLabel="Lý do huỷ"
          options={kinds.map((k) => ({ value: k, label: CANCEL_KIND_LABEL[k] }))}
          value={kind}
          onChange={(v) => {
            setKind(v as CancelKind)
            setActionError(null)
          }}
        />
        {kind === 'no_show' && !request && d.deposit ? (
          <p className="caption m-0 text-ink-muted">Cọc chuyển sang chờ Nhung giữ cọc.</p>
        ) : null}
        {request ? (
          <p className="caption m-0 text-ink-muted">
            Lịch giữ nguyên đến khi Linh, Nhung hoặc Chin huỷ chính thức.
          </p>
        ) : null}
        {!request && activeOrders.length > 0 ? (
          <Note tone="warning">
            Lịch có {activeOrders.length} đơn liên kết. Huỷ lịch không huỷ đơn; xử lý đơn riêng.
          </Note>
        ) : null}
        {kind !== 'no_show' || request ? (
          <TextArea
            label={noteRequired ? 'Lý do (bắt buộc)' : 'Ghi chú'}
            value={text}
            maxLength={450}
            onChange={(e) => setText(e.target.value)}
          />
        ) : null}
        {actionError ? <Note tone="danger">{actionError}</Note> : null}
      </ConfirmDialog>

      <Sheet
        open={askGuests}
        title={`Tạo ${missing.length} đơn cho ${d.guestCount} khách`}
        onClose={() => setAskGuests(false)}
        footer={
          <Button block variant="primary" loading={orderBusy} onClick={() => void createOrders(guests)}>
            Tạo {missing.length} đơn
          </Button>
        }
      >
        {missing.includes(1) ? (
          <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-line p-3">
            <span className="label text-ink-muted">Khách 1 · người đặt</span>
            <span className="body-strong">
              {d.name}
              {d.phone ? <span className="body text-ink-muted"> · {d.phone}</span> : null}
            </span>
          </div>
        ) : null}
        {guests.map((g, i) => (
          <div
            key={g.guestNo}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line p-3"
          >
            <span className="label text-ink-muted">Khách {g.guestNo}</span>
            <TextField
              label="Tên"
              placeholder={companionLabel}
              value={g.name}
              maxLength={100}
              onChange={(e) =>
                setGuests((old) => old.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <TextField
              label="SĐT"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={g.phone}
              maxLength={30}
              onChange={(e) =>
                setGuests((old) => old.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))
              }
            />
          </div>
        ))}
        {orderError ? <Note tone="danger">{orderError}</Note> : null}
      </Sheet>

      <AppointmentForm
        open={editing}
        editing={d}
        defaultDurationMin={settings.data?.defaultDurationMin ?? 120}
        onClose={() => setEditing(false)}
      />
    </section>
  )
}

type AuditItem = {
  id: string
  action: string
  actorName: string | null
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
  reason: string | null
  occurredAt: string
}

function show(field: string, v: unknown) {
  if (v == null || v === '') return '—'
  if (field === 'start_at' || field === 'end_at') return formatDateTimeShort(String(v))
  return String(v)
}

function History(props: { id: string }) {
  const q = useQuery({
    queryKey: ['appointments', 'audit', props.id],
    queryFn: () => api<{ items: AuditItem[] }>(`/api/appointments/${props.id}/audit`),
  })
  if (q.isLoading) return <p className="body px-4 text-ink-muted">Đang tải…</p>
  if (q.isError) return <p className="body px-4 text-danger">{errorText(q.error)}</p>
  return (
    <div className="border-t border-line">
      {q.data?.items.map((a) => {
        const changes =
          a.beforeJson && a.afterJson
            ? Object.keys(FIELD_LABEL).filter(
                (k) => JSON.stringify(a.beforeJson?.[k]) !== JSON.stringify(a.afterJson?.[k]),
              )
            : []
        return (
          <div key={a.id} className="border-b border-line bg-surface-raised px-4 py-2">
            <div className="flex justify-between gap-2">
              <span className="body-strong">{AUDIT_LABEL[a.action] ?? a.action}</span>
              <span className="caption text-ink-muted">{formatDateTimeShort(a.occurredAt)}</span>
            </div>
            <div className="caption text-ink-muted">{a.actorName ?? 'Hệ thống'}</div>
            {changes.map((k) => (
              <div key={k} className="caption">
                {FIELD_LABEL[k]}: {show(k, a.beforeJson?.[k])} → {show(k, a.afterJson?.[k])}
              </div>
            ))}
            {a.reason ? <div className="caption">“{a.reason}”</div> : null}
          </div>
        )
      })}
    </div>
  )
}
