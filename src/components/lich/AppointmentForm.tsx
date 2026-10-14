// Form tạo/sửa lịch (bước 1.12) trong bottom sheet. Không có ô chọn thợ (D17).
// Tạo nhanh: chạm khung giờ → nhập tên → Lưu. Cảnh báo không chặn lưu (§8).
// Mùa cọc (Đợt 3, module §5.1, §6): form tạo lịch hiện phần cọc và số gợi ý; chưa nhận cọc vẫn lưu được (K16).
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  MoneyInput,
  Note,
  SegmentedControl,
  Sheet,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { ApiError, api } from '~/lib/api'
import { addMinutes, type Detail, type ListItem, type Settings, type Warnings } from '~/lib/appointments'
import { formatVND } from '~/lib/money'
import { normalizePhone } from '~/lib/phone'
import { CustomerPicker } from '../don-hang/pickers'

type Values = {
  customerId: string | null
  customerDisplayName: string
  phone: string
  date: string
  startTime: string
  endTime: string
  guestCount: number
  serviceSummary: string
  notes: string
}

const LIMITS = { name: 100, phone: 20, service: 200, notes: 1000 }

function fromDetail(d: Detail): Values {
  return {
    customerId: d.customerId,
    customerDisplayName: d.name,
    phone: d.phone ?? '',
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime,
    guestCount: d.guestCount,
    serviceSummary: d.serviceSummary ?? '',
    notes: d.notes ?? '',
  }
}

export function AppointmentForm(props: {
  open: boolean
  onClose: () => void
  /** Tạo mới tại ngày/giờ này */
  initial?: { date: string; startTime: string }
  /** Sửa lịch này */
  editing?: Detail
  defaultDurationMin: number
  /** Mùa cọc đang bật hôm nay: lịch tạo mới cần cọc (C01) */
  depositSeason?: Settings['depositSeason']
  onSaved?: (id: string) => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const isEdit = !!props.editing
  const [v, setV] = useState<Values | null>(null)
  const [version, setVersion] = useState(1)
  const [endTouched, setEndTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Detail | null>(null)
  const [warnings, setWarnings] = useState<Warnings | null>(null)
  const [picking, setPicking] = useState(false)
  const requestId = useRef<string>('')
  // Cọc ghi kèm khi tạo lịch (khách đã chuyển); mã riêng để bấm lại không ghi hai khoản
  const [depositOn, setDepositOn] = useState(false)
  const [depMethod, setDepMethod] = useState<'transfer' | 'cash'>('transfer')
  const [depAmount, setDepAmount] = useState<number | null>(null)
  const depositKey = useRef<string>('')
  const season = !props.editing ? (props.depositSeason ?? null) : null

  // Mở form: điền sẵn; mỗi lần mở form tạo mới thì sinh mã yêu cầu mới [P3]
  useEffect(() => {
    if (!props.open) return
    setError(null)
    setConflict(null)
    setWarnings(null)
    setEndTouched(false)
    if (props.editing) {
      setV(fromDetail(props.editing))
      setVersion(props.editing.version)
    } else if (props.initial) {
      requestId.current = crypto.randomUUID()
      depositKey.current = crypto.randomUUID()
      setDepositOn(false)
      setDepMethod('transfer')
      setDepAmount(null)
      setV({
        customerId: null,
        customerDisplayName: '',
        phone: '',
        date: props.initial.date,
        startTime: props.initial.startTime,
        endTime: addMinutes(props.initial.startTime, props.defaultDurationMin),
        guestCount: 1,
        serviceSummary: '',
        notes: '',
      })
    }
  }, [props.open, props.editing, props.initial, props.defaultDurationMin])

  const set = <K extends keyof Values>(k: K, value: Values[K]) =>
    setV((old) => (old ? { ...old, [k]: value } : old))

  // Cảnh báo tính ở server, chỉ để hướng dẫn; server tính lại khi lưu.
  const phoneCheck = useMemo(() => normalizePhone(v?.phone), [v?.phone])
  const editingId = props.editing?.id
  const checkKey =
    v && props.open && v.endTime > v.startTime
      ? JSON.stringify({
          date: v.date,
          startTime: v.startTime,
          endTime: v.endTime,
          phone: phoneCheck.ok ? phoneCheck.value : null,
          excludeId: editingId,
        })
      : null
  useEffect(() => {
    if (!checkKey) return
    const t = setTimeout(() => {
      api<Warnings>('/api/appointments/check', { body: JSON.parse(checkKey) })
        .then(setWarnings)
        .catch(() => setWarnings(null))
    }, 300)
    return () => clearTimeout(t)
  }, [checkKey])

  if (!v) return null

  const suggested = season ? season.amountPerGuest * v.guestCount : 0
  const localError =
    v.customerDisplayName.trim() === ''
      ? 'Nhập tên khách.'
      : v.endTime <= v.startTime
        ? 'Giờ kết thúc phải sau giờ bắt đầu.'
        : !phoneCheck.ok
          ? phoneCheck.error
          : null

  async function save() {
    if (!v) return
    if (localError) {
      setError(localError)
      return
    }
    setBusy(true)
    setError(null)
    const fields = {
      customerId: v.customerId,
      customerDisplayName: v.customerDisplayName.trim(),
      phone: v.phone.trim() || null,
      date: v.date,
      startTime: v.startTime,
      endTime: v.endTime,
      guestCount: v.guestCount,
      serviceSummary: v.serviceSummary.trim() || null,
      notes: v.notes.trim() || null,
    }
    try {
      if (isEdit && props.editing) {
        const d = await api<Detail>(`/api/appointments/${props.editing.id}`, {
          method: 'PATCH',
          body: { version, ...fields },
        })
        toast('Đã lưu lịch.')
        qc.setQueryData(['appointments', 'detail', d.id], d)
        props.onSaved?.(d.id)
      } else {
        const res = await api<{ appointment: ListItem }>('/api/appointments', {
          body: { ...fields, createRequestId: requestId.current },
        })
        let depositNote = ''
        if (season && depositOn && res.appointment.depositState) {
          try {
            await api(`/api/appointments/${res.appointment.id}/deposits`, {
              body: {
                idempotencyKey: depositKey.current,
                amount: depAmount ?? suggested,
                method: depMethod,
              },
            })
            depositNote = ' Cọc chờ Nhung, Linh xác nhận.'
          } catch (e) {
            toast(
              `Đã lưu lịch nhưng chưa ghi được cọc: ${e instanceof Error ? e.message : ''} Ghi lại ở chi tiết lịch.`,
              'error',
            )
          }
        }
        toast(`Đã lưu lịch ${res.appointment.startTime}.${depositNote}`)
        props.onSaved?.(res.appointment.id)
      }
      await qc.invalidateQueries({ queryKey: ['appointments'] })
      props.onClose()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data) {
        setConflict(e.data as Detail)
      } else {
        // Mất mạng: giữ nội dung và mã yêu cầu, bấm lại không tạo trùng (test 17)
        setError(e instanceof Error ? e.message : 'Có lỗi xảy ra. Thử lại sau.')
      }
    } finally {
      setBusy(false)
    }
  }

  // Chọn hồ sơ khách có sẵn (module §10): điền tên, SĐT đầy đủ từ hồ sơ
  async function pickCustomer(id: string | null) {
    if (!id) {
      set('customerId', null)
      return
    }
    try {
      const c = await api<{ id: string; name: string; phone: string | null }>(`/api/customers/${id}`)
      setV((old) =>
        old ? { ...old, customerId: c.id, customerDisplayName: c.name, phone: c.phone ?? old.phone } : old,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được hồ sơ khách.')
    }
  }

  return (
    <>
      <Sheet
        open={props.open}
        title={isEdit ? 'Sửa lịch' : 'Lịch mới'}
        onClose={props.onClose}
        footer={
          <Button block variant="primary" loading={busy} onClick={() => void save()}>
            Lưu lịch
          </Button>
        }
      >
        {conflict ? (
          <div className="flex flex-col gap-2">
            <Note tone="warning">
              Lịch vừa được {conflict.updatedByName ?? 'người khác'} sửa ({conflict.startTime}–
              {conflict.endTime}, {conflict.name}). Chọn tải bản mới hoặc giữ nội dung đang sửa.
            </Note>
            <div className="flex gap-2">
              <Button
                block
                onClick={() => {
                  setV(fromDetail(conflict))
                  setVersion(conflict.version)
                  setConflict(null)
                }}
              >
                Tải bản mới
              </Button>
              <Button
                block
                onClick={() => {
                  setVersion(conflict.version)
                  setConflict(null)
                }}
              >
                Sửa tiếp
              </Button>
            </div>
          </div>
        ) : null}
        <TextField
          label="Tên khách"
          placeholder="Mai Anh, Nhóm 3 khách…"
          value={v.customerDisplayName}
          maxLength={LIMITS.name}
          autoFocus={!isEdit}
          enterKeyHint="done"
          onChange={(e) => set('customerDisplayName', e.target.value)}
        />
        <div className="-mt-2 flex items-center justify-between gap-2">
          <span className="caption text-ink-muted">
            {v.customerId ? 'Đã gắn hồ sơ khách.' : 'Khách quen: chọn hồ sơ để giữ lịch sử.'}
          </span>
          <Button variant="quiet" onClick={() => setPicking(true)}>
            {v.customerId ? 'Đổi khách' : 'Chọn khách có sẵn'}
          </Button>
        </div>
        <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
          <TextField
            label="Ngày"
            type="date"
            value={v.date}
            onChange={(e) => e.target.value && set('date', e.target.value)}
          />
          <TextField
            label="Bắt đầu"
            type="time"
            step={900}
            value={v.startTime}
            onChange={(e) => {
              const s = e.target.value
              if (!s) return
              setV((old) =>
                old
                  ? {
                      ...old,
                      startTime: s,
                      endTime: endTouched ? old.endTime : addMinutes(s, props.defaultDurationMin),
                    }
                  : old,
              )
            }}
          />
          <TextField
            label="Kết thúc"
            type="time"
            step={900}
            value={v.endTime}
            onChange={(e) => {
              if (!e.target.value) return
              setEndTouched(true)
              set('endTime', e.target.value)
            }}
          />
        </div>
        <div className="lo-field">
          <span className="lo-field-label label">Số khách</span>
          <SegmentedControl
            ariaLabel="Số khách"
            options={['1', '2', '3', '4']}
            value={String(v.guestCount)}
            onChange={(x) => set('guestCount', Number(x))}
          />
        </div>
        <TextField
          label="SĐT (không bắt buộc)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={v.phone}
          maxLength={30}
          error={v.phone && !phoneCheck.ok ? phoneCheck.error : undefined}
          onChange={(e) => set('phone', e.target.value)}
        />
        <TextField
          label="Dịch vụ dự kiến (không bắt buộc)"
          placeholder="sơn gel tay + chân"
          value={v.serviceSummary}
          maxLength={LIMITS.service}
          onChange={(e) => set('serviceSummary', e.target.value)}
        />
        <TextArea
          label="Ghi chú nội bộ"
          hint="Không hiện trên thông báo màn hình khoá."
          value={v.notes}
          maxLength={LIMITS.notes}
          onChange={(e) => set('notes', e.target.value)}
        />

        {season ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line p-3">
            <span className="label">Cọc · {season.name}</span>
            <p className="caption m-0 text-ink-muted">
              Lịch này cần cọc {formatVND(suggested)} ({v.guestCount} khách ×{' '}
              {formatVND(season.amountPerGuest)}). Chưa nhận cọc vẫn lưu được; lịch hiện “Chưa cọc”.
            </p>
            <SegmentedControl
              ariaLabel="Cọc"
              options={[
                { value: 'no', label: 'Chưa nhận cọc' },
                { value: 'yes', label: 'Khách đã cọc' },
              ]}
              value={depositOn ? 'yes' : 'no'}
              onChange={(x) => setDepositOn(x === 'yes')}
            />
            {depositOn ? (
              <>
                <SegmentedControl
                  ariaLabel="Hình thức cọc"
                  options={[
                    { value: 'transfer', label: 'Chuyển khoản' },
                    { value: 'cash', label: 'Tiền mặt' },
                  ]}
                  value={depMethod}
                  onChange={(x) => setDepMethod(x as 'transfer' | 'cash')}
                />
                <MoneyInput
                  label="Số tiền cọc"
                  value={depAmount ?? suggested}
                  onValueChange={setDepAmount}
                  hint={
                    depAmount != null && depAmount !== suggested
                      ? `Khác số gợi ý ${formatVND(suggested)}.`
                      : 'Nhung, Linh xác nhận khi tiền đã vào.'
                  }
                />
              </>
            ) : null}
          </div>
        ) : null}

        {warnings && warnings.overlapCount > 0 ? (
          <Note>Cùng giờ có {warnings.overlapCount} lịch khác.</Note>
        ) : null}
        {warnings?.duplicates.map((d) => (
          <Note key={d.id} tone="warning">
            Có thể trùng khách với lịch lúc {d.startTime}.{' '}
            <a href={`/lich/${d.id}`} className="underline">
              Mở lịch kia
            </a>
          </Note>
        ))}
        {warnings?.outsideHours ? <Note tone="warning">Ngoài giờ mở cửa.</Note> : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </Sheet>
      <CustomerPicker
        open={picking}
        noneLabel="Không gắn hồ sơ"
        onClose={() => setPicking(false)}
        onPick={(c) => void pickCustomer(c?.id ?? null)}
      />
    </>
  )
}
