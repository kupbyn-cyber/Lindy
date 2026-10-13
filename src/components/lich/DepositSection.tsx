// Khối Cọc trên chi tiết lịch (module §6; Đợt 3 bước 3.9). Nút hiện theo quyền; server và DB vẫn kiểm lại.
// Ghi cọc (mọi người) → Nhung, Linh xác nhận → app tự trừ vào bill khi tạo đơn từ lịch; lịch huỷ / không đến →
// Linh, Nhung, Chin hoàn hoặc giữ theo gợi ý 12 tiếng (C03).
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  Sheet,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import { DEPOSIT_STATUS, type Detail } from '~/lib/appointments'
import { formatVND } from '~/lib/money'
import { formatDateTimeShort } from '~/lib/time'

type Block = NonNullable<Detail['deposit']>
type Item = Block['items'][number]

type Act = { kind: 'confirm' | 'void' | 'refund' | 'forfeit'; item: Item }

const ACT_TEXT: Record<Act['kind'], { title: string; button: string; done: string; danger?: boolean }> = {
  confirm: { title: 'Xác nhận tiền cọc đã vào?', button: 'Xác nhận', done: 'Đã xác nhận cọc.' },
  void: { title: 'Huỷ khoản cọc này?', button: 'Huỷ khoản cọc', done: 'Đã huỷ khoản cọc.', danger: true },
  refund: { title: 'Hoàn cọc cho khách?', button: 'Hoàn cọc', done: 'Đã ghi hoàn cọc.' },
  forfeit: { title: 'Quán giữ cọc?', button: 'Giữ cọc', done: 'Đã ghi giữ cọc.' },
}

export function DepositSection(props: { d: Detail }) {
  const { d } = props
  const b = d.deposit
  const qc = useQueryClient()
  const toast = useToast()
  const [recording, setRecording] = useState(false)
  const [method, setMethod] = useState<'transfer' | 'cash'>('transfer')
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const key = useRef('')
  const [act, setAct] = useState<Act | null>(null)
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<'same' | 'cash' | 'transfer'>('same')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!b) return null

  const covered = b.items.filter((i) => i.status !== 'voided').reduce((s, i) => s + i.amount, 0)
  const prefill = Math.max(b.suggested - covered, 0) || b.suggested

  async function done(next: Detail, text: string) {
    qc.setQueryData(['appointments', 'detail', d.id], next)
    await qc.invalidateQueries({ queryKey: ['appointments'] })
    void qc.invalidateQueries({ queryKey: ['money'] })
    toast(text)
  }

  async function record() {
    setBusy(true)
    setError(null)
    if (!key.current) key.current = crypto.randomUUID()
    try {
      const next = await api<Detail>(`/api/appointments/${d.id}/deposits`, {
        body: { idempotencyKey: key.current, amount: amount ?? prefill, method, note: note.trim() || null },
      })
      key.current = ''
      setRecording(false)
      await done(next, 'Đã ghi cọc. Chờ Nhung, Linh xác nhận.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!act) return
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = { version: act.item.version }
    if (act.kind !== 'confirm') body.reason = reason
    if (act.kind === 'refund' && refundMethod !== 'same') body.method = refundMethod
    try {
      const next = await api<Detail>(`/api/deposits/${act.item.id}/${act.kind}`, { body })
      setAct(null)
      await done(next, ACT_TEXT[act.kind].done)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await qc.invalidateQueries({ queryKey: ['appointments', 'detail', d.id] })
        setError('Khoản cọc vừa được người khác cập nhật. Đã tải bản mới, xem lại rồi thao tác.')
      } else setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function review(item: Item) {
    try {
      const next = await api<Detail>(`/api/deposits/${item.id}/review`, { body: {} })
      await done(next, 'Đã đánh dấu đã xem.')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const open = (kind: Act['kind'], item: Item) => {
    setReason('')
    setRefundMethod('same')
    setError(null)
    setAct({ kind, item })
  }

  const suggestionText =
    b.heldAmount > 0 && b.suggestion
      ? b.suggestion === 'refund'
        ? d.status === 'completed'
          ? `Gợi ý: hoàn phần cọc còn dư ${formatVND(b.heldAmount)}.`
          : `Gợi ý: hoàn cọc ${formatVND(b.heldAmount)} — khách báo huỷ trước giờ hẹn từ ${b.refundNoticeHours} tiếng trở lên.`
        : `Gợi ý: giữ cọc ${formatVND(b.heldAmount)} — khách báo huỷ muộn hơn ${b.refundNoticeHours} tiếng hoặc không đến.`
      : null

  return (
    <section className="flex flex-col gap-1">
      <h2 className="overline m-0 px-4 text-ink-muted">Cọc</h2>
      <div className="mx-4 lo-card flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="body text-ink-muted">
            Cần cọc ({d.guestCount} khách × {formatVND(b.perGuest)})
          </span>
          <Money value={b.suggested} />
        </div>
        {b.state === 'missing' ? <Note tone="warning">Chưa có cọc.</Note> : null}
        {suggestionText ? <Note tone="warning">{suggestionText}</Note> : null}
        {b.items.map((i) => (
          <div key={i.id} className="flex flex-col gap-1 border-t border-line pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className={i.status === 'voided' ? 'body text-ink-muted line-through' : 'body-strong'}>
                {formatVND(i.amount)} · {i.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
              </span>
              <StatusChip tone={DEPOSIT_STATUS[i.status].tone}>{DEPOSIT_STATUS[i.status].label}</StatusChip>
            </div>
            <span className="caption text-ink-muted">
              Ghi: {i.recordedByName} · {formatDateTimeShort(i.recordedAt)}
              {i.confirmedByName && i.confirmedAt
                ? ` · Xác nhận: ${i.confirmedByName} · ${formatDateTimeShort(i.confirmedAt)}`
                : ''}
              {i.note ? ` · ${i.note}` : ''}
            </span>
            {i.applied > 0 ? (
              <span className="caption text-ink-muted">Đã trừ vào bill {formatVND(i.applied)}</span>
            ) : null}
            {i.status === 'confirmed' && i.remaining > 0 && i.applied > 0 ? (
              <span className="caption text-ink-muted">Còn giữ {formatVND(i.remaining)}</span>
            ) : null}
            {i.status === 'refunded' || i.status === 'forfeited' ? (
              <span className="caption text-ink-muted">
                {i.status === 'refunded' ? 'Hoàn' : 'Giữ'} {formatVND(i.resolvedAmount ?? 0)} ·{' '}
                {i.resolvedByName}
                {i.resolvedAt ? ` · ${formatDateTimeShort(i.resolvedAt)}` : ''} · “{i.resolveReason}”
                {i.suggestedAction && (i.suggestedAction === 'refund') !== (i.status === 'refunded')
                  ? ' · làm khác gợi ý'
                  : ''}
              </span>
            ) : null}
            {i.status === 'voided' ? (
              <span className="caption text-ink-muted">Đã huỷ: {i.voidReason}</span>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {i.can.confirm ? (
                <Button variant="primary" onClick={() => open('confirm', i)}>
                  Xác nhận tiền đã vào
                </Button>
              ) : null}
              {i.can.resolve ? (
                <>
                  <Button
                    variant={b.suggestion === 'refund' ? 'primary' : 'secondary'}
                    onClick={() => open('refund', i)}
                  >
                    Hoàn cọc
                  </Button>
                  <Button
                    variant={b.suggestion === 'forfeit' ? 'primary' : 'secondary'}
                    onClick={() => open('forfeit', i)}
                  >
                    Giữ cọc
                  </Button>
                </>
              ) : null}
              {i.can.void ? (
                <Button variant="quiet" onClick={() => open('void', i)}>
                  Huỷ khoản này
                </Button>
              ) : null}
              {i.can.review ? (
                <Button variant="quiet" onClick={() => void review(i)}>
                  Đã xem (Cần xem lại)
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {b.can.record ? (
          <Button
            block
            variant={b.state === 'missing' ? 'primary' : 'secondary'}
            onClick={() => {
              setError(null)
              setAmount(null)
              setNote('')
              setRecording(true)
            }}
          >
            Ghi cọc
          </Button>
        ) : null}
      </div>

      <Sheet
        open={recording}
        title="Ghi cọc"
        onClose={() => setRecording(false)}
        footer={
          <Button block variant="primary" loading={busy} onClick={() => void record()}>
            Lưu cọc
          </Button>
        }
      >
        <SegmentedControl
          ariaLabel="Hình thức"
          options={[
            { value: 'transfer', label: 'Chuyển khoản' },
            { value: 'cash', label: 'Tiền mặt' },
          ]}
          value={method}
          onChange={(x) => setMethod(x as 'transfer' | 'cash')}
        />
        <MoneyInput
          label="Số tiền cọc"
          value={amount ?? prefill}
          onValueChange={setAmount}
          hint={`Gợi ý ${formatVND(b.suggested)}. Tiền vào ${method === 'cash' ? 'Tiền mặt' : 'Tài khoản'} cs khi Nhung, Linh xác nhận.`}
        />
        <TextField
          label="Ghi chú (không bắt buộc)"
          value={note}
          maxLength={300}
          placeholder="Nội dung chuyển khoản, 4 số cuối…"
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? <Note tone="danger">{error}</Note> : null}
      </Sheet>

      <ConfirmDialog
        open={!!act}
        title={act ? ACT_TEXT[act.kind].title : ''}
        confirmLabel={act ? ACT_TEXT[act.kind].button : ''}
        danger={act ? ACT_TEXT[act.kind].danger : false}
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setAct(null)}
      >
        {act ? (
          <p className="body m-0 text-ink-muted">
            {act.kind === 'refund' || act.kind === 'forfeit'
              ? `${formatVND(act.item.remaining)} · ${d.name}`
              : `${formatVND(act.item.amount)} ${act.item.method === 'cash' ? 'tiền mặt' : 'chuyển khoản'} · ${d.name}`}
          </p>
        ) : null}
        {act?.kind === 'forfeit' ? (
          <p className="caption m-0 text-ink-muted">
            Ghi là doanh thu “cọc khách bỏ hẹn”, phần của chủ quán; không tính hoa hồng, KPI.
          </p>
        ) : null}
        {act &&
        b.suggestion &&
        (act.kind === 'refund' || act.kind === 'forfeit') &&
        (act.kind === 'refund') !== (b.suggestion === 'refund') ? (
          <Note tone="warning">Khác gợi ý của app. Ghi rõ lý do; Linh sẽ xem lại.</Note>
        ) : null}
        {act?.kind === 'refund' ? (
          <SegmentedControl
            ariaLabel="Chi từ"
            options={[
              { value: 'same', label: 'Như lúc nhận' },
              { value: 'transfer', label: 'Chuyển khoản' },
              { value: 'cash', label: 'Tiền mặt' },
            ]}
            value={refundMethod}
            onChange={(x) => setRefundMethod(x as 'same' | 'cash' | 'transfer')}
          />
        ) : null}
        {act && act.kind !== 'confirm' ? (
          <TextArea
            label="Lý do (bắt buộc)"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </section>
  )
}
