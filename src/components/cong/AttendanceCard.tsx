// Thẻ Vào ca / Ra ca trên Tổng quan (Đợt 4A, bước 4.5): ≤ 2 lần chạm. Chưa có hồ sơ nhân viên thì thẻ báo rõ thay vì
// ẩn (S39). Giờ do server ghi; bấm lại giữ giờ đầu tiên. Ra ca hỏi lại vì không sửa được giờ đã ghi.
// Vào ca mở màn chụp ảnh có giờ (S59): có ảnh thì tự duyệt Đi làm.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, ConfirmDialog, Note, StatusChip, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { DAY_LABEL, DAY_TONE } from '~/lib/attendance'
import { useCan } from '~/lib/me'
import { LABEL_TONE } from '~/lib/status-tone'
import { toLocalTime } from '~/lib/time'
import type { MyToday } from '~/server/attendance/service'
import { CheckInCamera } from './CheckInCamera'

export function AttendanceCard() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const allowed = can('attendance.own')
  const q = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api<MyToday>('/api/attendance?view=today'),
    enabled: allowed,
  })
  const [confirmOut, setConfirmOut] = useState(false)
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!allowed || !q.data) return null
  if (!q.data.hasProfile) {
    return (
      <section className="lo-card flex flex-col gap-2">
        <span className="overline text-ink-muted">Chấm công hôm nay</span>
        <Note tone="warning">
          Chưa có hồ sơ nhân viên, chưa vào ca được. Báo Linh nhập ở Thêm → Nhân viên.
        </Note>
      </section>
    )
  }
  if (!q.data.day) return null
  const d = q.data.day

  function checkedIn(next: MyToday) {
    qc.setQueryData(['attendance', 'today'], next)
    void qc.invalidateQueries({ queryKey: ['attendance'] })
    const t = next.day?.checkIn
    toast(
      `Đã vào ca${t ? ` lúc ${toLocalTime(t)}` : ''}${next.day?.autoApproved ? ' · đã duyệt Đi làm' : ''}.`,
    )
    setCamera(false)
  }

  async function checkOut() {
    setBusy(true)
    setError(null)
    try {
      const next = await api<MyToday>('/api/attendance/check-out', { body: {} })
      qc.setQueryData(['attendance', 'today'], next)
      void qc.invalidateQueries({ queryKey: ['attendance'] })
      const t = next.day?.checkOut
      toast(`Đã ra ca${t ? ` lúc ${toLocalTime(t)}` : ''}.`)
      setConfirmOut(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="lo-card flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="overline text-ink-muted">Chấm công hôm nay</span>
        <Link to="/lich/cham-cong" className="label lo-link">
          Chấm công
        </Link>
      </div>
      {d.status === 'closed' ? (
        <span className="body">Hôm nay quán đóng cửa{d.closedReason ? ` (${d.closedReason})` : ''}.</span>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="body-strong">
              {d.checkIn
                ? `Vào ca ${toLocalTime(d.checkIn)}${d.checkOut ? ` · Ra ca ${toLocalTime(d.checkOut)}` : ''}`
                : 'Chưa vào ca'}
            </span>
            {d.decided ? <StatusChip tone={DAY_TONE[d.decided]}>{DAY_LABEL[d.decided]}</StatusChip> : null}
            {d.hasLeave && !d.checkIn ? (
              <StatusChip tone={LABEL_TONE.leaveApproved}>Nghỉ đã duyệt</StatusChip>
            ) : null}
          </div>
          {!d.checkIn && q.data.canCheckIn ? (
            <Button block variant={d.hasLeave ? undefined : 'primary'} onClick={() => setCamera(true)}>
              Vào ca
            </Button>
          ) : null}
          {d.checkIn && !d.checkOut ? (
            <Button block loading={busy} onClick={() => setConfirmOut(true)}>
              Ra ca
            </Button>
          ) : null}
        </>
      )}
      {error && !confirmOut ? <Note tone="danger">{error}</Note> : null}
      {camera ? <CheckInCamera onDone={checkedIn} onClose={() => setCamera(false)} /> : null}
      <ConfirmDialog
        open={confirmOut}
        title="Ra ca bây giờ?"
        confirmLabel="Ra ca"
        busy={busy}
        onConfirm={() => void checkOut()}
        onCancel={() => setConfirmOut(false)}
      >
        <p className="body m-0 text-ink-muted">Giờ ra ca ghi một lần, không sửa lại được.</p>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </section>
  )
}
