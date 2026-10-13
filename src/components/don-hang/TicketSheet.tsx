// Lập phiếu xử lý dịch vụ từ đơn gốc (PRD §6.7, §13F; bước 2.18). Kết quả theo hạn bảo hành và nguyên nhân:
// lỗi kỹ thuật trong hạn → sửa miễn phí; khách đổi ý hoặc hết hạn → tính phí; khách không đồng ý sửa → ưu đãi bill sau.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button, cx, Note, SegmentedControl, Sheet, TextArea, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { type OrderDetail, useStaff } from '~/lib/orders'
import { formatIsoDate } from '~/lib/time'

type Cause = 'technical' | 'customer_change'
type Outcome = 'free_fix' | 'charged' | 'compensation'

export const OUTCOME_LABEL: Record<Outcome, string> = {
  free_fix: 'Sửa miễn phí',
  charged: 'Sửa tính phí',
  compensation: 'Ưu đãi bill sau',
}
export const CAUSE_LABEL: Record<Cause, string> = {
  technical: 'Lỗi kỹ thuật',
  customer_change: 'Khách đổi ý',
}

export function TicketSheet(props: { open: boolean; order: OrderDetail; onClose: () => void }) {
  const o = props.order
  const qc = useQueryClient()
  const toast = useToast()
  const staff = useStaff()
  const [issue, setIssue] = useState('')
  const [cause, setCause] = useState<Cause>('technical')
  const [outcome, setOutcome] = useState<Outcome>(o.warrantyActive ? 'free_fix' : 'charged')
  const [repairedBy, setRepairedBy] = useState<string | null>(null)
  const [percent, setPercent] = useState(10)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (props.open) {
      setIssue('')
      setCause('technical')
      setOutcome(o.warrantyActive ? 'free_fix' : 'charged')
      setRepairedBy(null)
      setPercent(10)
      setNote('')
      setError(null)
    }
  }, [props.open, o.warrantyActive])

  const freeAllowed = cause === 'technical' && o.warrantyActive
  const compAllowed = cause === 'technical' && !!o.customer
  const options: Outcome[] = ['free_fix', 'charged', 'compensation']
  const allowed = (x: Outcome) => (x === 'free_fix' ? freeAllowed : x === 'compensation' ? compAllowed : true)

  async function save() {
    if (!issue.trim()) return setError('Ghi vấn đề khách gặp.')
    if (!allowed(outcome))
      return setError('Kết quả này không áp được với nguyên nhân và hạn bảo hành hiện tại.')
    setBusy(true)
    setError(null)
    try {
      const next = await api<OrderDetail>(`/api/orders/${o.id}/tickets`, {
        body: {
          issue: issue.trim(),
          cause,
          outcome,
          repairedBy: outcome === 'free_fix' ? repairedBy : null,
          compensationPercent: outcome === 'compensation' ? percent : null,
          note: note.trim() || null,
        },
      })
      qc.setQueryData(['orders', 'detail', o.id], next)
      await qc.invalidateQueries({ queryKey: ['customers'] })
      toast('Đã lập phiếu xử lý.')
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
      title={`Phiếu xử lý · đơn ${o.codeLabel}`}
      onClose={props.onClose}
      footer={
        <Button block variant="primary" loading={busy} onClick={() => void save()}>
          Lập phiếu
        </Button>
      }
    >
      <Note tone={o.warrantyActive ? 'info' : 'warning'}>
        {o.warrantyUntil
          ? `${o.warrantyActive ? 'Còn' : 'Hết'} bảo hành (đến ${formatIsoDate(o.warrantyUntil)}).`
          : 'Đơn chưa có hạn bảo hành.'}
      </Note>
      <TextArea
        label="Vấn đề khách gặp"
        value={issue}
        maxLength={500}
        onChange={(e) => setIssue(e.target.value)}
      />
      <div className="lo-field">
        <span className="lo-field-label label">Nguyên nhân</span>
        <SegmentedControl
          ariaLabel="Nguyên nhân"
          className="w-full"
          options={[
            { value: 'technical', label: CAUSE_LABEL.technical },
            { value: 'customer_change', label: CAUSE_LABEL.customer_change },
          ]}
          value={cause}
          onChange={(v) => {
            setCause(v as Cause)
            if (v === 'customer_change') setOutcome('charged')
          }}
        />
      </div>
      <div className="lo-field">
        <span className="lo-field-label label">Kết quả</span>
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Kết quả">
          {options.map((x) => (
            <Button
              key={x}
              role="radio"
              aria-checked={outcome === x}
              disabled={!allowed(x)}
              variant={outcome === x ? 'primary' : 'secondary'}
              onClick={() => setOutcome(x)}
            >
              {OUTCOME_LABEL[x]}
            </Button>
          ))}
        </div>
        <p className="lo-field-msg caption">
          {!o.warrantyActive
            ? 'Hết hạn bảo hành: sửa thì tính phí (tạo đơn mới cho khách).'
            : cause === 'customer_change'
              ? 'Khách đổi ý: tính phí.'
              : !o.customer
                ? 'Đơn khách lẻ không áp được ưu đãi bill sau.'
                : 'Lỗi kỹ thuật trong hạn: sửa miễn phí, không tăng doanh thu.'}
        </p>
      </div>
      {outcome === 'free_fix' ? (
        <div className="lo-field">
          <span className="lo-field-label label">Thợ sửa</span>
          <div className="flex flex-wrap gap-2">
            {(staff.data?.items ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                className={cx('lo-toggle', 'label', repairedBy === s.id && 'is-on')}
                aria-pressed={repairedBy === s.id}
                onClick={() => setRepairedBy(repairedBy === s.id ? null : s.id)}
              >
                {s.displayName}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {outcome === 'compensation' ? (
        <div className="lo-field">
          <span className="lo-field-label label">Mức ưu đãi bill sau (quán chịu)</span>
          <SegmentedControl
            ariaLabel="Mức ưu đãi"
            className="w-full"
            options={['10', '15', '20'].map((v) => ({ value: v, label: `${v}%` }))}
            value={String(percent)}
            onChange={(v) => setPercent(Number(v))}
          />
          <p className="lo-field-msg caption">
            Áp một lần ở đơn sau của {o.customer?.name}; duyệt theo bậc giảm giá (trên 10% cần Nhung).
          </p>
        </div>
      ) : null}
      <TextArea
        label="Ghi chú (không bắt buộc)"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}
