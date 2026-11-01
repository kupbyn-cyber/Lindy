// UI16 (phần chi) — Thu chi (Đợt 3B-1, bước 3.13; PRD §7.3, §13C; Q19, Q20).
// Mọi người đề nghị chi và xem phiếu của mình. Nhung duyệt đến 1.000.000đ/phiếu trừ 4 nhóm; trên mức hoặc 4 nhóm Linh
// duyệt. "Đã chi" (Nhung, Linh) mới ghi tiền ra khỏi tài khoản. Nút hiện theo quyền; server và DB vẫn kiểm lại.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Attachments } from '~/components/tien/Attachments'
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
import { useCan } from '~/lib/me'
import { formatVND } from '~/lib/money'
import { type ChipTone, LABEL_TONE, REQUEST_TONE } from '~/lib/status-tone'
import { formatDateTimeShort } from '~/lib/time'
import type { ExpenseView, listExpenses } from '~/server/expenses/service'

export const Route = createFileRoute('/_app/them/thu-chi')({
  head: () => ({ meta: [{ title: 'Thu chi · LINDY OS' }] }),
  component: Page,
})

type Data = Awaited<ReturnType<typeof listExpenses>>
type Filter = 'pending' | 'approved' | 'paid' | 'all'

const STATUS: Record<ExpenseView['status'], { label: string; tone: ChipTone }> = {
  requested: { label: 'Chờ duyệt', tone: REQUEST_TONE.requested },
  approved: { label: 'Đã duyệt, chờ chi', tone: REQUEST_TONE.approved },
  paid: { label: 'Đã chi', tone: REQUEST_TONE.paid },
  rejected: { label: 'Từ chối', tone: REQUEST_TONE.rejected },
  cancelled: { label: 'Đã huỷ', tone: REQUEST_TONE.cancelled },
}

const LIMIT = 1_000_000

function Page() {
  const can = useCan()
  const approver = can('expense.approve_within_limit') || can('expense.approve_above_limit')
  const [filter, setFilter] = useState<Filter>(approver ? 'pending' : 'all')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['money', 'expenses', filter],
    queryFn: () => api<Data>(`/api/expenses?filter=${filter}`),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  const open = d?.items.find((i) => i.id === openId) ?? null

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-1 px-4">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="screen-title m-0">Thu chi</h1>
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Đề nghị chi
          </Button>
        </div>
        <p className="caption m-0 text-ink-muted">
          Nhung duyệt đến {formatVND(LIMIT)}/phiếu. Trên mức đó, hoặc tiền nhà, lương thưởng, máy móc, sửa
          chữa: Linh duyệt. Tiền chỉ ra khỏi quỹ khi bấm “Đã chi”.
        </p>
      </div>
      <div className="px-4">
        <SegmentedControl
          ariaLabel="Lọc phiếu"
          options={[
            { value: 'pending', label: `Chờ duyệt${d?.counts.pending ? ` (${d.counts.pending})` : ''}` },
            { value: 'approved', label: `Chờ chi${d?.counts.approved ? ` (${d.counts.approved})` : ''}` },
            { value: 'paid', label: 'Đã chi' },
            { value: 'all', label: 'Tất cả' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
      </div>
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {d && d.items.length === 0 ? <p className="body m-0 px-4 text-ink-muted">Không có phiếu nào.</p> : null}
      <div className="border-t border-line">
        {d?.items.map((e) => (
          <button
            key={e.id}
            type="button"
            className="lo-row lo-row-action w-full border-0 bg-transparent text-left"
            onClick={() => setOpenId(e.id)}
          >
            <span className="lo-row-main">
              <span className="body lo-row-title">
                {e.categoryName} · {e.note}
              </span>
              <span className="lo-row-meta caption">
                {e.requestedByName} · {formatDateTimeShort(e.requestedAt)}
                {e.requiredLevel === 'owner' && e.status === 'requested' ? ' · Linh duyệt' : ''}
                {e.needsOwnerReview ? ' · cần Linh xem lại' : ''}
              </span>
            </span>
            <span className="lo-row-side">
              <Money value={e.amount} tone={e.status === 'paid' ? 'negative' : undefined} />
              <StatusChip tone={STATUS[e.status].tone}>{STATUS[e.status].label}</StatusChip>
            </span>
          </button>
        ))}
      </div>
      {d && d.filter === 'paid' ? (
        <p className="caption m-0 px-4 text-ink-muted">Phiếu đã chi 30 ngày gần nhất.</p>
      ) : null}

      {d ? (
        <CreateSheet open={creating} onClose={() => setCreating(false)} categories={d.categories} />
      ) : null}
      {open ? <DetailSheet e={open} onClose={() => setOpenId(null)} /> : null}
    </section>
  )
}

function CreateSheet(props: { open: boolean; onClose: () => void; categories: Data['categories'] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [category, setCategory] = useState('supplies')
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef('')
  const cat = props.categories.find((c) => c.code === category)
  const owner = !!cat?.ownerOnly || (amount ?? 0) > LIMIT

  async function save() {
    setBusy(true)
    setError(null)
    if (!key.current) key.current = crypto.randomUUID()
    try {
      const e = await api<ExpenseView>('/api/expenses', {
        body: { createRequestId: key.current, categoryCode: category, amount: amount ?? 0, note },
      })
      key.current = ''
      setAmount(null)
      setNote('')
      await qc.invalidateQueries({ queryKey: ['money'] })
      toast(e.status === 'approved' ? 'Đã lưu phiếu chi (đã duyệt).' : 'Đã gửi đề nghị chi.')
      props.onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={props.open}
      title="Đề nghị chi"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          loading={busy}
          disabled={!amount || !note.trim()}
          onClick={() => void save()}
        >
          Gửi đề nghị
        </Button>
      }
    >
      <div className="lo-field">
        <label className="lo-field-label label" htmlFor="expense-category">
          Nhóm chi
        </label>
        <select
          id="expense-category"
          className="lo-input input-text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {props.categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
              {c.ownerOnly ? ' (Linh duyệt)' : ''}
            </option>
          ))}
        </select>
      </div>
      <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
      <TextField
        label="Nội dung chi"
        placeholder="Mua gel, cọ; tiền điện tháng 10…"
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="caption m-0 text-ink-muted">
        {owner ? 'Phiếu này Linh duyệt.' : 'Nhung hoặc Linh duyệt.'}
      </p>
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}

type Act = 'approve' | 'reject' | 'cancel' | 'pay'
const ACT: Record<Act, { title: string; button: string; done: string; danger?: boolean }> = {
  approve: { title: 'Duyệt phiếu chi?', button: 'Duyệt', done: 'Đã duyệt.' },
  reject: { title: 'Từ chối phiếu chi?', button: 'Từ chối', done: 'Đã từ chối.', danger: true },
  cancel: { title: 'Huỷ phiếu chi?', button: 'Huỷ phiếu', done: 'Đã huỷ phiếu.', danger: true },
  pay: { title: 'Ghi đã chi tiền?', button: 'Đã chi', done: 'Đã ghi chi tiền.' },
}

function DetailSheet(props: { e: ExpenseView; onClose: () => void }) {
  const { e } = props
  const qc = useQueryClient()
  const toast = useToast()
  const [act, setAct] = useState<Act | null>(null)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(a: Act | 'review') {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/expenses/${e.id}/${a}`, {
        body: { version: e.version, reason: reason.trim() || null, method: a === 'pay' ? method : null },
      })
      await qc.invalidateQueries({ queryKey: ['money'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'overview'] })
      toast(a === 'review' ? 'Đã đánh dấu đã xem.' : ACT[a].done)
      setAct(null)
      props.onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await qc.invalidateQueries({ queryKey: ['money'] })
        setError('Phiếu vừa được người khác cập nhật. Đã tải bản mới, xem lại rồi thao tác.')
      } else setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const c = e.can
  return (
    <Sheet open title={`${e.categoryName} · ${formatVND(e.amount)}`} onClose={props.onClose}>
      <div className="flex flex-wrap gap-1">
        <StatusChip tone={STATUS[e.status].tone}>{STATUS[e.status].label}</StatusChip>
        {e.requiredLevel === 'owner' ? (
          <StatusChip tone={LABEL_TONE.ownerApproves}>Linh duyệt</StatusChip>
        ) : null}
        {e.needsOwnerReview ? <StatusChip tone={LABEL_TONE.needsReview}>Cần Linh xem lại</StatusChip> : null}
      </div>
      <p className="body m-0">{e.note}</p>
      <div className="caption flex flex-col gap-0.5 text-ink-muted">
        <span>
          Đề nghị: {e.requestedByName} · {formatDateTimeShort(e.requestedAt)}
        </span>
        {e.approvedByName && e.approvedAt ? (
          <span>
            Duyệt: {e.approvedByName} · {formatDateTimeShort(e.approvedAt)}
          </span>
        ) : null}
        {e.paidByName && e.paidAt ? (
          <span>
            Đã chi: {e.paidByName} · {formatDateTimeShort(e.paidAt)} · {e.paidAccountName}
          </span>
        ) : null}
        {e.rejectReason ? (
          <span>
            Từ chối ({e.rejectedByName}): {e.rejectReason}
          </span>
        ) : null}
        {e.status === 'cancelled' ? (
          <span>
            Huỷ ({e.cancelledByName}){e.cancelReason ? `: ${e.cancelReason}` : ''}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {c.approve ? (
          <Button variant="primary" onClick={() => setAct('approve')}>
            Duyệt
          </Button>
        ) : null}
        {c.pay ? (
          <Button variant="primary" onClick={() => setAct('pay')}>
            Đã chi
          </Button>
        ) : null}
        {c.reject ? (
          <Button variant="danger" onClick={() => setAct('reject')}>
            Từ chối
          </Button>
        ) : null}
        {c.cancel ? (
          <Button variant="quiet" onClick={() => setAct('cancel')}>
            Huỷ phiếu
          </Button>
        ) : null}
        {c.review ? (
          <Button variant="quiet" loading={busy} onClick={() => void run('review')}>
            Đã xem (Cần xem lại)
          </Button>
        ) : null}
      </div>
      {error && !act ? <Note tone="danger">{error}</Note> : null}
      <Attachments ownerType="expense" ownerId={e.id} />

      <ConfirmDialog
        open={!!act}
        title={act ? ACT[act].title : ''}
        confirmLabel={act ? ACT[act].button : ''}
        danger={act ? ACT[act].danger : false}
        busy={busy}
        onConfirm={() => act && void run(act)}
        onCancel={() => setAct(null)}
      >
        <p className="body m-0 text-ink-muted">
          {e.categoryName} · {formatVND(e.amount)} · {e.note}
        </p>
        {act === 'pay' ? (
          <SegmentedControl
            ariaLabel="Chi từ"
            options={[
              { value: 'cash', label: 'Tiền mặt' },
              { value: 'transfer', label: 'Chuyển khoản' },
            ]}
            value={method}
            onChange={(v) => setMethod(v as 'cash' | 'transfer')}
          />
        ) : null}
        {act === 'reject' || act === 'cancel' ? (
          <TextArea
            label={
              act === 'reject' || e.status === 'approved' ? 'Lý do (bắt buộc)' : 'Lý do (không bắt buộc)'
            }
            value={reason}
            maxLength={500}
            onChange={(ev) => setReason(ev.target.value)}
          />
        ) : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </Sheet>
  )
}
