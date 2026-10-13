// Chi tiết lịch (module §7.2, bước 1.13). Nút hiện theo quyền; server vẫn từ chối gọi trực tiếp.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Phone } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { AppointmentForm } from '~/components/lich/AppointmentForm'
import {
  Button,
  ConfirmDialog,
  Note,
  SegmentedControl,
  StatusChip,
  TextArea,
  useToast,
} from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import {
  type Detail,
  STATUS_LABEL,
  STATUS_TONE,
  useAppointment,
  useBookingSettings,
} from '~/lib/appointments'
import { formatDateTimeShort, formatIsoDate, weekdayLong } from '~/lib/time'

export const Route = createFileRoute('/_app/lich/$id')({
  head: () => ({ meta: [{ title: 'Chi tiết lịch · LINDY OS' }] }),
  component: DetailPage,
})

type Action = 'confirm' | 'arrived' | 'cancel' | 'report-customer-cancel' | 'no-show' | 'complete'

const ACTION_TEXT: Record<Action, { title: string; button: string; done: string; danger?: boolean }> = {
  confirm: { title: 'Chốt lịch này?', button: 'Chốt lịch', done: 'Đã chốt lịch.' },
  arrived: { title: 'Khách đã đến?', button: 'Khách đã đến', done: 'Đã ghi khách đến.' },
  cancel: { title: 'Huỷ lịch này?', button: 'Huỷ lịch', done: 'Đã huỷ lịch.', danger: true },
  'report-customer-cancel': {
    title: 'Báo khách huỷ?',
    button: 'Báo khách huỷ',
    done: 'Đã báo Linh, Nhung, Chin.',
  },
  'no-show': {
    title: 'Ghi khách không đến?',
    button: 'Khách không đến',
    done: 'Đã ghi khách không đến.',
    danger: true,
  },
  complete: { title: 'Đánh dấu hoàn thành?', button: 'Hoàn thành', done: 'Đã đánh dấu hoàn thành.' },
}

const AUDIT_LABEL: Record<string, string> = {
  created: 'Tạo lịch',
  created_confirmed: 'Tạo và chốt',
  updated: 'Sửa',
  rescheduled: 'Đổi giờ',
  confirmed: 'Chốt lịch',
  arrived: 'Khách đã đến',
  in_progress: 'Đang làm (đã tạo đơn)',
  customer_linked: 'Gắn hồ sơ khách',
  no_show: 'Khách không đến',
  completed: 'Hoàn thành',
  cancelled: 'Huỷ lịch',
  customer_cancel_reported: 'Khách báo huỷ',
  note: 'Ghi chú thêm',
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

function DetailPage() {
  const { id } = Route.useParams()
  const q = useAppointment(id)
  const settings = useBookingSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState<'info' | 'history'>('info')
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  async function run() {
    if (!action) return
    setBusy(true)
    setActionError(null)
    const body: Record<string, unknown> = { version: d.version }
    if (action === 'cancel') body.reason = text
    if (action === 'report-customer-cancel' && text.trim()) body.note = text
    try {
      const next = await api<Detail>(`/api/appointments/${d.id}/${action}`, { body })
      qc.setQueryData(['appointments', 'detail', d.id], next)
      await qc.invalidateQueries({ queryKey: ['appointments'] })
      toast(ACTION_TEXT[action].done)
      setAction(null)
      setText('')
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

  const open = (a: Action) => {
    setText('')
    setActionError(null)
    setAction(a)
  }
  const c = d.can
  const cannotCancelHint = !c.cancel && c.reportCustomerCancel

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="px-4">
        <Link to="/lich" search={{ d: d.date }} className="label text-accent">
          ← Lịch {formatIsoDate(d.date)}
        </Link>
        <h1 className="screen-title mt-1 mb-1 break-words">{d.name}</h1>
        <div className="flex flex-wrap gap-1">
          <StatusChip tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</StatusChip>
          {d.customerCancelReported ? <StatusChip tone="warning">Khách báo huỷ</StatusChip> : null}
          {d.outsideHours ? <StatusChip tone="warning">Ngoài giờ mở cửa</StatusChip> : null}
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
            <Row label="SĐT">
              {d.phone ? (
                <span className="flex items-center justify-between gap-2">
                  <span>{d.phone}</span>
                  <a href={`tel:${d.phone}`} className="lo-btn lo-btn-secondary button-label min-h-[36px]!">
                    <Phone size={16} strokeWidth={1.7} aria-hidden="true" /> Gọi
                  </a>
                </span>
              ) : (
                <span className="text-ink-muted">Không có</span>
              )}
            </Row>
            <Row label="Dịch vụ">{d.serviceSummary ?? <span className="text-ink-muted">Chưa ghi</span>}</Row>
            <Row label="Ghi chú">
              {d.notes ? (
                <span className="whitespace-pre-wrap">{d.notes}</span>
              ) : (
                <span className="text-ink-muted">Không có</span>
              )}
            </Row>
            {d.customerCancelReported ? (
              <Row label="Khách báo huỷ">
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
            {d.confirmedByName ? <Row label="Người chốt">{d.confirmedByName}</Row> : null}
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
                <Link to="/lich/$id" params={{ id: x.id }} className="underline">
                  Mở lịch kia
                </Link>
              </Note>
            ))}
          </div>

          <div className="flex flex-col gap-2 px-4 pb-2">
            {c.confirm ? (
              <Button variant="primary" block onClick={() => open('confirm')}>
                Chốt lịch
              </Button>
            ) : null}
            {c.markArrived ? (
              <Button variant={c.confirm ? 'secondary' : 'primary'} block onClick={() => open('arrived')}>
                Khách đã đến
              </Button>
            ) : null}
            {c.complete ? (
              <Button variant="primary" block onClick={() => open('complete')}>
                Hoàn thành
              </Button>
            ) : null}
            {c.edit ? (
              <Button block onClick={() => setEditing(true)}>
                Sửa
              </Button>
            ) : null}
            {c.reportCustomerCancel ? (
              <Button block onClick={() => open('report-customer-cancel')}>
                Khách báo huỷ
              </Button>
            ) : null}
            {c.noShow ? (
              <Button block variant="danger" onClick={() => open('no-show')}>
                Khách không đến
              </Button>
            ) : null}
            {c.cancel ? (
              <Button block variant="danger" onClick={() => open('cancel')}>
                Huỷ lịch
              </Button>
            ) : null}
            {cannotCancelHint ? (
              <p className="caption m-0 text-ink-muted">
                Không huỷ được lịch này. Khách báo huỷ thì bấm “Khách báo huỷ” để Linh, Nhung, Chin xử lý.
              </p>
            ) : null}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!action}
        title={action ? ACTION_TEXT[action].title : ''}
        confirmLabel={action ? ACTION_TEXT[action].button : ''}
        danger={action ? ACTION_TEXT[action].danger : false}
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setAction(null)}
      >
        <p className="body m-0 text-ink-muted">
          {d.startTime} {formatIsoDate(d.date)} · {d.name}
        </p>
        {action === 'cancel' ? (
          <TextArea
            label="Lý do huỷ (bắt buộc)"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
          />
        ) : null}
        {action === 'report-customer-cancel' ? (
          <TextArea
            label="Ghi chú (không bắt buộc)"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
          />
        ) : null}
        {actionError ? <Note tone="danger">{actionError}</Note> : null}
      </ConfirmDialog>

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
