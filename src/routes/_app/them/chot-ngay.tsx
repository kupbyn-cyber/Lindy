// UI07 — Chốt quỹ cuối ngày (Đợt 3B-1, bước 3.18; PRD §7.4, §13D; Q23, K17).
// Nhung chốt, ngày Nhung nghỉ Linh chốt; hôm nay chốt từ giờ đóng cửa, hôm trước quên thì chốt bù. Nhập tiền mặt đếm
// được; lệch thì ghi lý do, app ghi bút toán chênh lệch để số dư bằng tiền thật trong két, Linh xem lại.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { formatVND } from '~/lib/money'
import { addDays, formatDateTimeShort, formatIsoDate } from '~/lib/time'
import type { dayClosePreview } from '~/server/money/service'
import type { tipSummary } from '~/server/orders/tips'

export const Route = createFileRoute('/_app/them/chot-ngay')({
  head: () => ({ meta: [{ title: 'Chốt quỹ · LINDY OS' }] }),
  component: Page,
})

type Data = Awaited<ReturnType<typeof dayClosePreview>>
type Tips = Awaited<ReturnType<typeof tipSummary>>

function Page() {
  const can = useCan()
  const allowed = can('money_accounts.read_balance')
  const [date, setDate] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['money', 'day-close', date],
    queryFn: () => api<Data>(`/api/money/day-close${date ? `?date=${date}` : ''}`),
    enabled: allowed,
    placeholderData: (prev) => prev,
  })

  if (!allowed) {
    return (
      <div className="px-4 pt-2">
        <Note tone="danger">Chỉ Linh, Nhung xem được chốt quỹ.</Note>
      </div>
    )
  }
  const d = q.data

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-1 px-4">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Chốt quỹ tiền mặt</h1>
      </div>
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {d && !d.book ? (
        <div className="px-4">
          <Note>Chưa mở sổ. Linh mở sổ ở Thêm → Sổ tiền rồi mới chốt quỹ.</Note>
        </div>
      ) : null}
      {d?.book ? (
        <>
          <div className="px-4">
            <TextField
              label="Ngày chốt"
              type="date"
              min={d.lastClosed ? addDays(d.lastClosed, 1) : d.book.openingDate}
              max={d.today}
              value={d.date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              hint={
                d.lastClosed
                  ? `Đã chốt đến hết ${formatIsoDate(d.lastClosed)}.`
                  : `Chưa chốt lần nào (mở sổ ${formatIsoDate(d.book.openingDate)}).`
              }
            />
          </div>
          <TipsCard />
          {d.closable && d.figures ? (
            <CloseForm d={d} key={`${d.date}-${d.figures.expected}`} onDone={() => setDate(null)} />
          ) : (
            <div className="px-4">
              <Note>Ngày {formatIsoDate(d.date)} đã chốt hoặc không chốt được.</Note>
            </div>
          )}
          <History d={d} />
        </>
      ) : null}
    </section>
  )
}

function Line(props: { label: string; value: number; strong?: boolean; sign?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={props.strong ? 'body-strong' : 'body text-ink-muted'}>{props.label}</span>
      <Money
        value={props.value}
        sign={props.sign}
        tone={props.value < 0 ? 'negative' : undefined}
        className={props.strong ? 'body-strong' : undefined}
      />
    </div>
  )
}

function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="overline m-0 px-4 text-ink-muted">{props.title}</h2>
      <div className="mx-4 lo-card flex flex-col gap-2">{props.children}</div>
    </section>
  )
}

function CloseForm(props: { d: Data; onDone: () => void }) {
  const { d } = props
  const f = d.figures!
  const qc = useQueryClient()
  const toast = useToast()
  const [counted, setCounted] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const diff = counted == null ? null : counted - f.expected
  const multiDay = f.periodStart !== d.date

  async function close() {
    setBusy(true)
    setError(null)
    try {
      await api<Data>('/api/money/close-day', {
        body: { date: d.date, counted: counted ?? 0, reason: reason.trim() || null },
      })
      await qc.invalidateQueries({ queryKey: ['money'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(`Đã chốt quỹ ngày ${formatIsoDate(d.date)}.`)
      setConfirm(false)
      props.onDone()
    } catch (e) {
      setError(errorText(e))
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card
        title={
          multiDay
            ? `Tiền mặt ${formatIsoDate(f.periodStart)} – ${formatIsoDate(d.date)}`
            : `Tiền mặt ngày ${formatIsoDate(d.date)}`
        }
      >
        <Line label={multiDay ? 'Đầu kỳ' : 'Đầu ngày'} value={f.opening} />
        <Line label="Tiền vào" value={f.cashIn} sign />
        <Line label="Tiền ra" value={-f.cashOut} />
        <Line label="Tiền mặt lý thuyết" value={f.expected} strong />
        {multiDay ? (
          <p className="caption m-0 text-ink-muted">Các ngày chưa chốt trước đó gộp vào lần chốt này.</p>
        ) : null}
      </Card>

      {d.warnings.length ? (
        <Card title="Việc còn treo">
          {d.warnings.map((w) => (
            <span key={w.key} className="body">
              {w.count} {w.text}
            </span>
          ))}
          <p className="caption m-0 text-ink-muted">Vẫn chốt được; xử lý tiếp vào hôm sau.</p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 px-4">
        {d.tooEarly ? <Note tone="warning">Hôm nay chốt quỹ từ {d.closeTime} (giờ đóng cửa).</Note> : null}
        {d.can.close ? (
          <>
            <MoneyInput label="Tiền mặt đếm được" value={counted} onValueChange={setCounted} />
            {diff != null ? (
              diff === 0 ? (
                <Note>Khớp số lý thuyết.</Note>
              ) : (
                <Note tone="warning">
                  {diff > 0 ? 'Thừa' : 'Thiếu'} {formatVND(Math.abs(diff))}. Ghi lý do; app ghi khoản chênh
                  lệch để số dư bằng tiền thật trong két, Linh xem lại.
                </Note>
              )
            ) : null}
            {diff ? (
              <TextArea
                label="Lý do chênh lệch (bắt buộc)"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            ) : null}
            {error ? <Note tone="danger">{error}</Note> : null}
            <Button
              variant="primary"
              block
              disabled={counted == null || d.tooEarly || (!!diff && !reason.trim())}
              onClick={() => setConfirm(true)}
            >
              Chốt quỹ ngày {formatIsoDate(d.date)}
            </Button>
          </>
        ) : (
          <Note>Chỉ Nhung, Linh chốt quỹ.</Note>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title={`Chốt quỹ ngày ${formatIsoDate(d.date)}?`}
        confirmLabel="Chốt quỹ"
        busy={busy}
        onConfirm={() => void close()}
        onCancel={() => setConfirm(false)}
      >
        <div className="flex flex-col gap-1">
          <Line label="Lý thuyết" value={f.expected} />
          <Line label="Đếm được" value={counted ?? 0} />
          {diff ? <Line label="Chênh lệch" value={diff} sign /> : null}
          <p className="caption m-0 text-ink-muted">
            Chốt xong không sửa được. Khoản ghi sau khi chốt tính vào ngày hôm sau.
          </p>
        </div>
      </ConfirmDialog>
    </>
  )
}

/**
 * Tip giữ hộ chưa trả (Q15): Nhung trả tiền mặt cho từng thợ, app ghi tiền ra khỏi quỹ tiền mặt. Từ S27 app không ghi
 * tip mới; thẻ chỉ hiện khi còn tip ghi từ trước chưa trả, trả hết thì tự ẩn.
 */
function TipsCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const [pay, setPay] = useState<{ staffUserId: string; name: string; amount: number; key: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['money', 'tips'], queryFn: () => api<Tips>('/api/tips') })
  if (!q.data || q.data.holding.length === 0) return null

  async function run() {
    if (!pay) return
    setBusy(true)
    try {
      await api('/api/tips', { body: { staffUserId: pay.staffUserId, idempotencyKey: pay.key } })
      await qc.invalidateQueries({ queryKey: ['money'] })
      toast(`Đã ghi trả tip ${formatVND(pay.amount)} cho ${pay.name}.`)
      setPay(null)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Tip giữ hộ chờ trả thợ">
      {q.data.holding.map((h) => (
        <div key={h.staffUserId} className="flex items-center justify-between gap-2">
          <span className="body">
            {h.name} <span className="caption text-ink-muted">· {h.count} khoản</span>
          </span>
          <span className="flex items-center gap-2">
            <Money value={h.amount} />
            {q.data.can.pay ? (
              <Button
                variant="quiet"
                onClick={() =>
                  setPay({
                    staffUserId: h.staffUserId,
                    name: h.name,
                    amount: h.amount,
                    key: crypto.randomUUID(),
                  })
                }
              >
                Trả tiền mặt
              </Button>
            ) : null}
          </span>
        </div>
      ))}
      <p className="caption m-0 text-ink-muted">Trả xong, tiền ra khỏi quỹ tiền mặt trước khi đếm két.</p>
      <ConfirmDialog
        open={!!pay}
        title={pay ? `Trả ${formatVND(pay.amount)} tip cho ${pay.name}?` : ''}
        confirmLabel="Đã trả tiền mặt"
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setPay(null)}
      >
        <p className="body m-0 text-ink-muted">App ghi khoản chi tip từ tiền mặt.</p>
      </ConfirmDialog>
    </Card>
  )
}

function History(props: { d: Data }) {
  const qc = useQueryClient()
  const toast = useToast()
  if (props.d.history.length === 0) return null
  async function review(id: string) {
    try {
      await api('/api/money/review-close', { body: { id } })
      await qc.invalidateQueries({ queryKey: ['money'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast('Đã đánh dấu đã xem.')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  return (
    <section className="flex flex-col gap-1">
      <h2 className="overline m-0 px-4 text-ink-muted">Các lần chốt gần đây</h2>
      <div className="border-t border-line">
        {props.d.history.map((h) => (
          <div key={h.id} className="lo-row">
            <span className="lo-row-main">
              <span className="body lo-row-title">
                {formatIsoDate(h.businessDate)}
                {h.difference
                  ? ` · ${h.difference > 0 ? 'thừa' : 'thiếu'} ${formatVND(Math.abs(h.difference))}`
                  : ''}
              </span>
              <span className="lo-row-meta caption">
                {h.closedByName} · {formatDateTimeShort(h.closedAt)}
                {h.reason ? ` · ${h.reason}` : ''}
              </span>
            </span>
            <span className="lo-row-side">
              <Money value={h.counted} />
              {h.needsOwnerReview ? (
                props.d.can.review ? (
                  <Button variant="quiet" onClick={() => void review(h.id)}>
                    Đã xem
                  </Button>
                ) : (
                  <StatusChip tone="warning">Chờ Linh xem</StatusChip>
                )
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
