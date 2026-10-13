// Cài đặt lịch (bước 1.15): chỉ người có booking_settings.manage (Linh). Mùa cọc Tết (Đợt 3, bước 3.4). Ngày quán
// đóng cửa (Đợt 4, bước 4.4).
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { ClosedDays } from '~/components/lich/ClosedDays'
import { DepositSeasons } from '~/components/lich/DepositSeasons'
import { Button, Note, TextField, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { type Settings, useBookingSettings } from '~/lib/appointments'
import { useCan } from '~/lib/me'

export const Route = createFileRoute('/_app/them/cai-dat-lich')({
  head: () => ({ meta: [{ title: 'Cài đặt lịch · LINDY OS' }] }),
  component: Page,
})

function Page() {
  const can = useCan()
  const toast = useToast()
  const qc = useQueryClient()
  const s = useBookingSettings()
  const [open, setOpen] = useState('09:00')
  const [close, setClose] = useState('21:00')
  const [dur, setDur] = useState('120')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!s.data) return
    setOpen(s.data.openTime)
    setClose(s.data.closeTime)
    setDur(String(s.data.defaultDurationMin))
  }, [s.data])

  if (!can('booking_settings.manage')) {
    return <Note tone="warning">Chỉ chủ quán đổi được cài đặt lịch.</Note>
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = await api<Settings>('/api/booking-settings', {
        method: 'PUT',
        body: { openTime: open, closeTime: close, defaultDurationMin: Number(dur) },
      })
      qc.setQueryData(['booking-settings'], next)
      toast('Đã lưu cài đặt lịch.')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 px-4 pt-2">
      <div className="flex flex-col gap-1">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Cài đặt lịch</h1>
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Giờ mở cửa"
            type="time"
            step={900}
            value={open}
            onChange={(e) => setOpen(e.target.value)}
          />
          <TextField
            label="Giờ đóng cửa"
            type="time"
            step={900}
            value={close}
            onChange={(e) => setClose(e.target.value)}
          />
        </div>
        <TextField
          label="Thời lượng mặc định (phút)"
          type="number"
          inputMode="numeric"
          min={15}
          max={720}
          step={15}
          value={dur}
          onChange={(e) => setDur(e.target.value)}
        />
        <p className="caption m-0 text-ink-muted">
          Lịch đặt ngoài giờ mở cửa vẫn lưu được, kèm cảnh báo. Đổi giờ ở đây áp dụng cho các lần lưu sau.
        </p>
        {error ? <Note tone="danger">{error}</Note> : null}
        <Button type="submit" variant="primary" block loading={busy}>
          Lưu cài đặt
        </Button>
      </form>
      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h2 className="overline m-0 text-ink-muted">Mùa cọc Tết</h2>
        <DepositSeasons />
      </section>
      <section className="flex flex-col gap-2 border-t border-line pt-3 pb-4">
        <h2 className="overline m-0 text-ink-muted">Ngày quán đóng cửa</h2>
        <ClosedDays />
      </section>
    </section>
  )
}
