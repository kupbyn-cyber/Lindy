// Ngày quán đóng cửa trong Cài đặt lịch (Đợt 4A, bước 4.4; PRD §8, Q29): không tính là ngày nghỉ của nhân viên, trả
// lương như đi làm. Linh thêm một ngày hoặc một khoảng; gỡ khi nhập nhầm. Tháng đã khoá lương thì không đổi được.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, ConfirmDialog, Note, Sheet, TextField, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { addDays, formatIsoDate } from '~/lib/time'
import type { ClosedDaysData } from '~/server/attendance/closed-days'

type Group = { from: string; to: string; reason: string; ids: string[] }

/** Gộp các ngày liền nhau cùng lý do thành một dòng */
function groups(days: ClosedDaysData['days']): Group[] {
  const out: Group[] = []
  for (const d of days) {
    const last = out[out.length - 1]
    if (last && last.reason === d.reason && addDays(last.to, 1) === d.closedDate) {
      last.to = d.closedDate
      last.ids.push(d.id)
    } else out.push({ from: d.closedDate, to: d.closedDate, reason: d.reason, ids: [d.id] })
  }
  return out
}

export function ClosedDays() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['closed-days'], queryFn: () => api<ClosedDaysData>('/api/closed-days') })
  const [adding, setAdding] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [removing, setRemoving] = useState<Group | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (q.isLoading) return <p className="body m-0 text-ink-muted">Đang tải ngày đóng cửa…</p>
  if (q.isError || !q.data) return <Note tone="danger">{errorText(q.error)}</Note>
  const d = q.data

  const done = (next: ClosedDaysData, msg: string) => {
    qc.setQueryData(['closed-days'], next)
    void qc.invalidateQueries({ queryKey: ['attendance'] })
    toast(msg)
  }

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const next = await api<ClosedDaysData>('/api/closed-days', {
        body: { fromDate: from, toDate: to && to >= from ? to : from, reason },
      })
      done(next, 'Đã lưu ngày đóng cửa.')
      setAdding(false)
      setFrom('')
      setTo('')
      setReason('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(g: Group) {
    setBusy(true)
    setError(null)
    try {
      let next = d
      for (const id of g.ids) next = await api<ClosedDaysData>(`/api/closed-days/${id}/remove`, { body: {} })
      done(next, 'Đã gỡ ngày đóng cửa.')
      setRemoving(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const list = groups(d.days)
  return (
    <div className="flex flex-col gap-2">
      <p className="caption m-0 text-ink-muted">
        Ngày quán đóng cửa (Tết, sửa chữa…) không tính là ngày nghỉ của nhân viên, trả lương như đi làm.
      </p>
      {list.length === 0 ? <p className="body m-0 text-ink-muted">Chưa có ngày đóng cửa.</p> : null}
      <div className="flex flex-col">
        {list.map((g) => (
          <div key={g.ids[0]} className="flex items-center gap-2 border-t border-line py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="body-strong">
                {g.from === g.to ? formatIsoDate(g.from) : `${formatIsoDate(g.from)}–${formatIsoDate(g.to)}`}
                {g.ids.length > 1 ? ` (${g.ids.length} ngày)` : ''}
              </span>
              <span className="caption text-ink-muted">{g.reason}</span>
            </span>
            {d.can.manage ? (
              <Button variant="quiet" onClick={() => setRemoving(g)}>
                Gỡ
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {d.can.manage ? (
        <Button block onClick={() => setAdding(true)}>
          Thêm ngày đóng cửa
        </Button>
      ) : null}
      {error && !adding && !removing ? <Note tone="danger">{error}</Note> : null}

      <Sheet
        open={adding}
        title="Ngày quán đóng cửa"
        onClose={() => setAdding(false)}
        footer={
          <Button
            block
            variant="primary"
            loading={busy}
            disabled={!from || !reason.trim()}
            onClick={() => void add()}
          >
            Lưu
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField
            label="Đến hết ngày"
            type="date"
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <TextField
          label="Lý do"
          placeholder="Tết, sửa chữa…"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="caption m-0 text-ink-muted">
          Đóng một ngày thì để trống "Đến hết ngày". Tối đa 62 ngày mỗi lần.
        </p>
        {error ? <Note tone="danger">{error}</Note> : null}
      </Sheet>
      <ConfirmDialog
        open={!!removing}
        title="Gỡ ngày đóng cửa?"
        confirmLabel="Gỡ"
        danger
        busy={busy}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      >
        {removing ? (
          <p className="body m-0 text-ink-muted">
            {removing.from === removing.to
              ? formatIsoDate(removing.from)
              : `${formatIsoDate(removing.from)}–${formatIsoDate(removing.to)}`}{' '}
            · {removing.reason}. Những ngày này sẽ tính công như ngày thường.
          </p>
        ) : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </div>
  )
}
