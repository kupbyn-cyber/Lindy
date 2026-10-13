// Mùa cọc trong Cài đặt lịch (Đợt 3 bước 3.4; module §6.1, B01, A02, C01–C04). Linh nhập khoảng ngày dương lịch
// mỗi năm (app không tự đổi lịch âm). Lịch được TẠO trong mùa thì cần cọc; sửa mùa không đổi lịch đã tạo.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Button,
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
import { formatIsoDate } from '~/lib/time'
import type { listSeasons, Season } from '~/server/deposits/service'

type Data = Awaited<ReturnType<typeof listSeasons>>
type Form = {
  id: string | null
  name: string
  startDate: string
  endDate: string
  amountPerGuest: number | null
  refundNoticeHours: string
  forfeitOwnerUserId: string
  isActive: boolean
}

export function DepositSeasons() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['deposit-seasons'], queryFn: () => api<Data>('/api/deposit-seasons') })
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (q.isLoading) return <p className="body m-0 text-ink-muted">Đang tải mùa cọc…</p>
  if (q.isError || !q.data) return <Note tone="danger">{errorText(q.error)}</Note>
  const d = q.data

  const edit = (s: Season | null) => {
    setError(null)
    setForm(
      s
        ? { ...s, refundNoticeHours: String(s.refundNoticeHours) }
        : {
            id: null,
            name: `Tết ${Number(d.today.slice(0, 4)) + (d.today.slice(5, 7) >= '03' ? 1 : 0)}`,
            // Không điền sẵn ngày: Linh tự nhập ngày dương lịch của 19–28 tháng Chạp (không tự đoán)
            startDate: '',
            endDate: '',
            amountPerGuest: 100_000, // A02
            refundNoticeHours: '12', // C03
            forfeitOwnerUserId: d.me, // A03: phần của Linh
            isActive: true,
          },
    )
  }

  async function save() {
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      const next = await api<Data>('/api/deposit-seasons', {
        body: {
          id: form.id,
          name: form.name,
          startDate: form.startDate,
          endDate: form.endDate,
          amountPerGuest: form.amountPerGuest ?? 0,
          refundNoticeHours: Number(form.refundNoticeHours),
          forfeitOwnerUserId: form.forfeitOwnerUserId,
          isActive: form.isActive,
        },
      })
      qc.setQueryData(['deposit-seasons'], next)
      void qc.invalidateQueries({ queryKey: ['booking-settings'] })
      toast('Đã lưu mùa cọc.')
      setForm(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  return (
    <div className="flex flex-col gap-2">
      <p className="caption m-0 text-ink-muted">
        Nhập ngày dương lịch của 19–28 tháng Chạp mỗi năm. Lịch được tạo trong khoảng này cần cọc (tính theo
        ngày đặt lịch, không theo ngày hẹn).
      </p>
      {d.current ? (
        <Note tone="warning">
          Đang trong mùa cọc {d.current.name}: đến hết {formatIsoDate(d.current.endDate)}.
        </Note>
      ) : null}
      {d.seasons.length === 0 ? <p className="body m-0 text-ink-muted">Chưa có mùa cọc.</p> : null}
      <div className="flex flex-col">
        {d.seasons.map((s) => (
          <div key={s.id} className="flex items-center gap-2 border-t border-line py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="body-strong">
                {s.name} {s.isActive ? null : <StatusChip tone="neutral">Đã tắt</StatusChip>}
              </span>
              <span className="caption text-ink-muted">
                {formatIsoDate(s.startDate)}–{formatIsoDate(s.endDate)} · {formatVND(s.amountPerGuest)}/khách
                · hoàn khi báo trước {s.refundNoticeHours} tiếng · giữ cọc ghi cho {s.forfeitOwnerName}
              </span>
            </span>
            {d.can.manage ? (
              <Button variant="quiet" onClick={() => edit(s)}>
                Sửa
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {d.can.manage ? (
        <Button block onClick={() => edit(null)}>
          Thêm mùa cọc
        </Button>
      ) : null}

      <Sheet
        open={!!form}
        title={form?.id ? 'Sửa mùa cọc' : 'Mùa cọc mới'}
        onClose={() => setForm(null)}
        footer={
          <Button
            block
            variant="primary"
            loading={busy}
            disabled={!form?.startDate || !form?.endDate || !form?.amountPerGuest}
            onClick={() => void save()}
          >
            Lưu mùa cọc
          </Button>
        }
      >
        {form ? (
          <>
            <TextField
              label="Tên"
              value={form.name}
              maxLength={60}
              onChange={(e) => set('name', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Từ ngày"
                type="date"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
              <TextField
                label="Đến hết ngày"
                type="date"
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </div>
            {form.startDate && form.endDate ? (
              <p className="caption m-0 text-ink-muted">
                Lịch tạo từ {formatIsoDate(form.startDate)} đến hết {formatIsoDate(form.endDate)} cần cọc.
              </p>
            ) : (
              <p className="caption m-0 text-ink-muted">Nhập ngày dương lịch của 19 và 28 tháng Chạp.</p>
            )}
            <MoneyInput
              label="Cọc mỗi khách"
              value={form.amountPerGuest}
              onValueChange={(v) => set('amountPerGuest', v)}
            />
            <TextField
              label="Hoàn cọc khi khách báo huỷ trước (giờ)"
              type="number"
              inputMode="numeric"
              min={1}
              max={168}
              value={form.refundNoticeHours}
              onChange={(e) => set('refundNoticeHours', e.target.value)}
            />
            <div className="lo-field">
              <label className="lo-field-label label" htmlFor="forfeit-owner">
                Cọc bị giữ ghi là phần của
              </label>
              <select
                id="forfeit-owner"
                className="lo-input input-text"
                value={form.forfeitOwnerUserId}
                onChange={(e) => set('forfeitOwnerUserId', e.target.value)}
              >
                {d.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <SegmentedControl
              ariaLabel="Trạng thái mùa cọc"
              options={[
                { value: 'on', label: 'Bật' },
                { value: 'off', label: 'Tắt' },
              ]}
              value={form.isActive ? 'on' : 'off'}
              onChange={(v) => set('isActive', v === 'on')}
            />
            {error ? <Note tone="danger">{error}</Note> : null}
          </>
        ) : null}
      </Sheet>
    </div>
  )
}
