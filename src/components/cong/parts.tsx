// Phần dùng chung của màn Chấm công (Đợt 4A): chọn tháng, chọn ngày, đăng ký nghỉ, danh sách đơn nghỉ có nút theo quyền.
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  IconButton,
  Note,
  Sheet,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import { LEAVE_LABEL, LEAVE_TONE } from '~/lib/attendance'
import { addDays, addMonths, formatIsoDate, formatYearMonth, weekdayShort } from '~/lib/time'
import type { LeaveView } from '~/server/attendance/service'

export function MonthNav(props: { month: string; onChange: (m: string) => void; max?: string }) {
  const next = addMonths(props.month, 1)
  return (
    <div className="flex items-center justify-between gap-2">
      <IconButton label="Tháng trước" onClick={() => props.onChange(addMonths(props.month, -1))}>
        <ChevronLeft size={22} strokeWidth={1.7} />
      </IconButton>
      <span className="body-strong">Tháng {formatYearMonth(props.month)}</span>
      <IconButton
        label="Tháng sau"
        disabled={!!props.max && next > props.max}
        onClick={() => props.onChange(next)}
      >
        <ChevronRight size={22} strokeWidth={1.7} />
      </IconButton>
    </div>
  )
}

export function DateNav(props: { date: string; today: string; onChange: (d: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <IconButton label="Ngày trước" onClick={() => props.onChange(addDays(props.date, -1))}>
        <ChevronLeft size={22} strokeWidth={1.7} />
      </IconButton>
      <span className="body-strong">
        {props.date === props.today ? 'Hôm nay, ' : ''}
        {weekdayShort(props.date)} {formatIsoDate(props.date)}
      </span>
      <IconButton
        label="Ngày sau"
        disabled={props.date >= props.today}
        onClick={() => props.onChange(addDays(props.date, 1))}
      >
        <ChevronRight size={22} strokeWidth={1.7} />
      </IconButton>
    </div>
  )
}

export const dateSpan = (from: string, to: string) =>
  from === to ? `${weekdayShort(from)} ${formatIsoDate(from)}` : `${formatIsoDate(from)}–${formatIsoDate(to)}`

/** Đăng ký nghỉ: từ ngày, đến ngày, lý do. Nhung, Linh đăng ký cho mình thì duyệt luôn. */
export function LeaveSheet(props: { open: boolean; onClose: () => void; today: string; approver: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [from, setFrom] = useState(props.today)
  const [to, setTo] = useState(props.today)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef('')

  async function save() {
    setBusy(true)
    setError(null)
    if (!key.current) key.current = crypto.randomUUID()
    try {
      const l = await api<LeaveView>('/api/leave', {
        body: { createRequestId: key.current, fromDate: from, toDate: to < from ? from : to, reason },
      })
      key.current = ''
      setReason('')
      await qc.invalidateQueries({ queryKey: ['attendance'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(l.status === 'approved' ? 'Đã lưu ngày nghỉ (đã duyệt).' : 'Đã gửi đơn nghỉ, chờ Nhung duyệt.')
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={props.open}
      title="Đăng ký nghỉ"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          loading={busy}
          disabled={!from || !reason.trim()}
          onClick={() => void save()}
        >
          {props.approver ? 'Lưu ngày nghỉ' : 'Gửi đơn nghỉ'}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Từ ngày"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value)
            if (to < e.target.value) setTo(e.target.value)
          }}
        />
        <TextField
          label="Đến hết ngày"
          type="date"
          min={from}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <TextField
        label="Lý do"
        placeholder="Về quê, khám bệnh…"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      <p className="caption m-0 text-ink-muted">
        Nghỉ có phép hay không phép đều tính là ngày nghỉ; vượt số ngày được hưởng thì trừ 1 ngày lương mỗi
        ngày, không phạt thêm.
      </p>
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}

type Act = 'approve' | 'reject' | 'cancel'

/** Danh sách đơn nghỉ: Duyệt (một chạm), Từ chối và huỷ nghỉ đã duyệt cần lý do. */
export function LeaveList(props: { items: LeaveView[]; showName?: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [act, setAct] = useState<{ a: Act; l: LeaveView } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(a: Act, l: LeaveView) {
    setBusy(l.id)
    setError(null)
    try {
      await api(`/api/leave/${l.id}/${a}`, { body: { version: l.version, note: note.trim() || null } })
      await qc.invalidateQueries({ queryKey: ['attendance'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(a === 'approve' ? 'Đã duyệt ngày nghỉ.' : a === 'reject' ? 'Đã từ chối.' : 'Đã huỷ đơn nghỉ.')
      setAct(null)
      setNote('')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await qc.invalidateQueries({ queryKey: ['attendance'] })
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const needNote = act && (act.a === 'reject' || act.l.status === 'approved')
  return (
    <div className="flex flex-col">
      {props.items.map((l) => (
        <div key={l.id} className="flex flex-col gap-1 border-t border-line py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="body-strong">
              {props.showName ? `${l.name} · ` : ''}
              {dateSpan(l.fromDate, l.toDate)}
              {l.days > 1 ? ` (${l.days} ngày)` : ''}
            </span>
            <StatusChip tone={LEAVE_TONE[l.status]}>{LEAVE_LABEL[l.status]}</StatusChip>
          </div>
          <span className="caption text-ink-muted">
            {l.reason}
            {l.decidedByName && l.status !== 'requested' ? ` · ${l.decidedByName}` : ''}
            {l.decideNote ? `: ${l.decideNote}` : ''}
          </span>
          {l.can.approve || l.can.reject || l.can.cancel ? (
            <div className="flex flex-wrap gap-2">
              {l.can.approve ? (
                <Button
                  variant="primary"
                  loading={busy === l.id && !act}
                  onClick={() => void run('approve', l)}
                >
                  Duyệt
                </Button>
              ) : null}
              {l.can.reject ? (
                <Button variant="danger" onClick={() => setAct({ a: 'reject', l })}>
                  Từ chối
                </Button>
              ) : null}
              {l.can.cancel ? (
                <Button variant="quiet" onClick={() => setAct({ a: 'cancel', l })}>
                  Huỷ
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      {error && !act ? <Note tone="danger">{error}</Note> : null}
      <ConfirmDialog
        open={!!act}
        title={act?.a === 'reject' ? 'Từ chối đơn nghỉ?' : 'Huỷ đơn nghỉ?'}
        confirmLabel={act?.a === 'reject' ? 'Từ chối' : 'Huỷ đơn'}
        danger
        busy={!!busy}
        onConfirm={() => act && void run(act.a, act.l)}
        onCancel={() => {
          setAct(null)
          setError(null)
        }}
      >
        {act ? (
          <p className="body m-0 text-ink-muted">
            {act.l.name} · {dateSpan(act.l.fromDate, act.l.toDate)}
          </p>
        ) : null}
        <TextArea
          label={needNote ? 'Lý do (bắt buộc)' : 'Lý do (không bắt buộc)'}
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </div>
  )
}
