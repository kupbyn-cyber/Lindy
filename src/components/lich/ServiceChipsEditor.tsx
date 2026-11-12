// Chip dịch vụ trong Cài đặt lịch (S65): Linh thêm, xoá, đổi tên, đổi thứ tự chip chạm nhanh của form lịch.
// Tối đa 20 chip, mỗi chip 1–30 ký tự, không trùng, không dấu "+" (dấu nối chip trong ô Dịch vụ); server, DB kiểm lại.
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, IconButton, Note, TextField, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import type { Settings } from '~/lib/appointments'

const MAX_CHIPS = 20
const MAX_LEN = 30

/** Chip đang sửa có id riêng để ô đang gõ giữ focus khi đổi tên, đổi thứ tự */
type Row = { id: number; name: string }
let nextId = 0
const toRows = (names: string[]): Row[] => names.map((name) => ({ id: nextId++, name }))

/** Lỗi đầu tiên của bộ chip đang sửa, hoặc null */
function chipsError(chips: string[]) {
  if (chips.length > MAX_CHIPS) return `Tối đa ${MAX_CHIPS} chip.`
  const seen = new Set<string>()
  for (const raw of chips) {
    const c = raw.trim()
    if (!c) return 'Tên chip không được trống.'
    if (c.length > MAX_LEN) return `Tên chip tối đa ${MAX_LEN} ký tự.`
    if (c.includes('+')) return 'Tên chip không chứa dấu +.'
    const key = c.toLocaleLowerCase('vi')
    if (seen.has(key)) return `Chip "${c}" bị trùng.`
    seen.add(key)
  }
  return null
}

export function ServiceChipsEditor(props: { chips: string[] | undefined }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<Row[]>([])
  const chips = rows.map((r) => r.name)
  // Đang sửa dở: không nạp lại từ cache (lưu giờ mở cửa cũng làm cache đổi)
  const [dirty, setDirty] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (props.chips && !dirty) setRows(toRows(props.chips))
  }, [props.chips, dirty])

  const edit = (next: Row[]) => {
    setRows(next)
    setDirty(true)
    setError(null)
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    edit(next)
  }
  const add = () => {
    const c = draft.trim()
    if (!c) return
    const msg = chipsError([...chips, c])
    if (msg) {
      setError(msg)
      return
    }
    edit([...rows, ...toRows([c])])
    setDraft('')
  }

  async function save() {
    const msg = chipsError(chips)
    if (msg) {
      setError(msg)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await api<Settings>('/api/service-chips', {
        method: 'PUT',
        body: { chips: chips.map((c) => c.trim()) },
      })
      setDirty(false)
      qc.setQueryData(['booking-settings'], next)
      toast('Đã lưu chip dịch vụ.')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="caption m-0 text-ink-muted">Chạm chip trong form lịch là điền nhanh ô Dịch vụ.</p>
      <div className="flex flex-col">
        {rows.map(({ id, name: c }, i) => (
          <div key={id} className="flex items-center gap-1 border-t border-line py-1">
            <div className="flex-1">
              <TextField
                label={`Chip ${i + 1}`}
                value={c}
                maxLength={MAX_LEN}
                onChange={(e) => edit(rows.map((r) => (r.id === id ? { id, name: e.target.value } : r)))}
              />
            </div>
            <IconButton label={`Đưa ${c || 'chip'} lên`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ChevronUp size={20} strokeWidth={1.7} />
            </IconButton>
            <IconButton
              label={`Đưa ${c || 'chip'} xuống`}
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
            >
              <ChevronDown size={20} strokeWidth={1.7} />
            </IconButton>
            <IconButton label={`Xoá ${c || 'chip'}`} onClick={() => edit(rows.filter((r) => r.id !== id))}>
              <X size={20} strokeWidth={1.7} />
            </IconButton>
          </div>
        ))}
      </div>
      {chips.length < MAX_CHIPS ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="Chip mới"
              placeholder="Úp móng"
              value={draft}
              maxLength={MAX_LEN}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
          </div>
          <Button onClick={add} disabled={!draft.trim()}>
            Thêm
          </Button>
        </div>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      <Button variant="primary" block loading={busy} disabled={!dirty} onClick={save}>
        Lưu chip
      </Button>
    </div>
  )
}
