// UI06 — Sổ tiền (Đợt 3, bước 3.3, 3.14, 3.17; PRD §7.1–7.3). Linh, Nhung (money_accounts.read_balance).
// Số dư từng tài khoản, mở sổ (Linh, một lần), bút toán theo ngày với đầu kỳ / vào / ra / cuối kỳ.
// Nhung, Linh: chuyển nội bộ, đối soát khoản ngân hàng với sao kê. Linh: thu khác, góp/rút vốn, điều chỉnh,
// tài khoản nhận chuyển khoản để hộp ghi tiền thu của đơn hiện QR (S26).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  Sheet,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { LEDGER_LABEL } from '~/lib/money-book'
import { addDays, formatIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
import { ACCOUNT_NO_RE, BANKS, bankName, normalizeAccountNo } from '~/lib/vietqr'
import type { getBook, listEntries } from '~/server/money/service'

export const Route = createFileRoute('/_app/them/so-tien')({
  head: () => ({ meta: [{ title: 'Sổ tiền · LINDY OS' }] }),
  component: Page,
})

type Book = Awaited<ReturnType<typeof getBook>>
type Entries = Awaited<ReturnType<typeof listEntries>>

function Page() {
  const can = useCan()
  const allowed = can('money_accounts.read_balance')
  const book = useQuery({
    queryKey: ['money', 'book'],
    queryFn: () => api<Book>('/api/money'),
    enabled: allowed,
  })

  if (!allowed) {
    return (
      <div className="px-4 pt-2">
        <Note tone="danger">Chỉ Linh, Nhung xem được sổ tiền.</Note>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-1 px-4">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Sổ tiền</h1>
      </div>
      {book.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {book.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(book.error)}</Note>
        </div>
      ) : null}
      {book.data ? (
        <>
          {book.data.book ? <Balances b={book.data} /> : <NotOpened b={book.data} />}
          {book.data.book ? <MoneyActions b={book.data} /> : null}
          <BankCard b={book.data} />
          <EntryList b={book.data} />
        </>
      ) : null}
    </section>
  )
}

function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="overline m-0 px-4 text-ink-muted">{props.title}</h2>
      <div className="mx-4 lo-card flex flex-col gap-1">{props.children}</div>
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

function Balances(props: { b: Book }) {
  const { b } = props
  const total = b.accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  return (
    <Card title="Tiền trong quỹ">
      {b.accounts.map((a) => (
        <Line key={a.id} label={a.name} value={a.balance ?? 0} strong />
      ))}
      <Line label="Cộng" value={total} />
      <p className="caption m-0 border-t border-line pt-1 text-ink-muted">
        Mở sổ ngày {formatIsoDate(b.book!.openingDate)}
        {b.book!.openedByName ? ` · ${b.book!.openedByName}` : ''}. Số dư = số mở sổ + tiền vào − tiền ra từ
        ngày mở sổ.
      </p>
    </Card>
  )
}

function NotOpened(props: { b: Book }) {
  const { b } = props
  const toast = useToast()
  const qc = useQueryClient()
  const thisMonth = b.today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = b.accounts.some((a) => amounts[a.id] == null)

  async function open() {
    setBusy(true)
    setError(null)
    try {
      const next = await api<Book>('/api/money/open', {
        body: {
          openingDate: `${month}-01`,
          amounts: b.accounts.map((a) => ({ accountId: a.id, amount: amounts[a.id] ?? 0 })),
        },
      })
      qc.setQueryData(['money', 'book'], next)
      void qc.invalidateQueries({ queryKey: ['money'] })
      toast('Đã mở sổ.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  if (!b.can.open) {
    return (
      <div className="px-4">
        <Note>
          Chưa mở sổ, chưa có số dư. Linh mở sổ ở màn này: chọn tháng mở sổ và nhập số dư từng tài khoản.
        </Note>
      </div>
    )
  }

  return (
    <Card title="Mở sổ">
      <p className="body m-0 text-ink-muted">
        Chọn tháng mở sổ (tính từ ngày 1) và số tiền thật đang có ở từng tài khoản vào sáng ngày đó. Mở một
        lần; nhập sai thì ghi điều chỉnh có lý do.
      </p>
      <TextField
        label="Tháng mở sổ"
        type="month"
        max={thisMonth}
        value={month}
        onChange={(e) => e.target.value && setMonth(e.target.value)}
        hint={`Mở sổ từ ngày ${formatIsoDate(`${month}-01`)}`}
      />
      {b.accounts.map((a) => (
        <MoneyInput
          key={a.id}
          label={`Số dư ${a.name}`}
          value={amounts[a.id] ?? null}
          onValueChange={(v) => setAmounts((s) => ({ ...s, [a.id]: v }))}
          placeholder="0"
        />
      ))}
      {error ? <Note tone="danger">{error}</Note> : null}
      <Button variant="primary" block disabled={missing} onClick={() => setConfirm(true)}>
        Mở sổ
      </Button>
      <ConfirmDialog
        open={confirm}
        title={`Mở sổ từ ${formatIsoDate(`${month}-01`)}?`}
        confirmLabel="Mở sổ"
        busy={busy}
        onConfirm={() => void open()}
        onCancel={() => setConfirm(false)}
      >
        <div className="flex flex-col gap-1">
          {b.accounts.map((a) => (
            <Line key={a.id} label={a.name} value={amounts[a.id] ?? 0} />
          ))}
          <p className="caption m-0 text-ink-muted">Sau khi mở không sửa được số này.</p>
        </div>
      </ConfirmDialog>
    </Card>
  )
}

// ---------------------------------------------------------------- Tài khoản nhận chuyển khoản, QR (S23–S26)

function BankCard(props: { b: Book }) {
  const acc = props.b.bankAccount
  const [editing, setEditing] = useState(false)
  if (!acc) return null
  return (
    <Card title="Tài khoản nhận chuyển khoản">
      {acc.bankBin ? (
        <>
          <span className="body-strong">
            {bankName(acc.bankBin)} · {acc.bankAccountNo}
          </span>
          <span className="body text-ink-muted">{acc.bankAccountName}</span>
          <p className="caption m-0 text-ink-muted">
            Hộp ghi tiền thu của đơn hiện QR có sẵn số tiền, nội dung LINDY + mã đơn, tiền vào tài khoản này.
          </p>
        </>
      ) : (
        <p className="body m-0 text-ink-muted">
          Chưa nhập. Nhập ngân hàng, số tài khoản của {acc.name} để hộp ghi tiền thu của đơn hiện QR chuyển
          khoản có sẵn số tiền.
        </p>
      )}
      {props.b.can.editBank ? (
        <Button onClick={() => setEditing(true)}>{acc.bankBin ? 'Sửa tài khoản' : 'Nhập tài khoản'}</Button>
      ) : null}
      {editing ? <BankSheet b={props.b} onClose={() => setEditing(false)} /> : null}
    </Card>
  )
}

function BankSheet(props: { b: Book; onClose: () => void }) {
  const acc = props.b.bankAccount!
  const qc = useQueryClient()
  const toast = useToast()
  const [bin, setBin] = useState(acc.bankBin ?? '')
  const [accountNo, setAccountNo] = useState(acc.bankAccountNo ?? '')
  const [accountName, setAccountName] = useState(acc.bankAccountName ?? '')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const no = normalizeAccountNo(accountNo)
  const noError =
    no && !ACCOUNT_NO_RE.test(no) ? 'Số tài khoản gồm 4–19 chữ số hoặc chữ cái, không dấu.' : undefined
  const ready = !!bin && ACCOUNT_NO_RE.test(no) && !!accountName.trim()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const next = await api<Book>('/api/money/bank-account', {
        body: { bankBin: bin, accountNo: no, accountName },
      })
      qc.setQueryData(['money', 'book'], next)
      // Đơn đang mở lấy lại thông tin tài khoản để QR đúng tài khoản mới
      void qc.invalidateQueries({ queryKey: ['orders'] })
      toast('Đã lưu tài khoản nhận chuyển khoản.')
      props.onClose()
    } catch (e) {
      setError(errorText(e))
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      title="Tài khoản nhận chuyển khoản"
      onClose={props.onClose}
      footer={
        <Button block variant="primary" disabled={!ready} onClick={() => setConfirm(true)}>
          Lưu tài khoản
        </Button>
      }
    >
      <Note tone="warning">
        Khách quét QR sẽ chuyển tiền vào tài khoản này. Kiểm kỹ số tài khoản; lưu xong nên chuyển thử 1.000đ.
      </Note>
      <div className="lo-field">
        <label className="lo-field-label label" htmlFor="bank-bin">
          Ngân hàng
        </label>
        <select
          id="bank-bin"
          className="lo-input input-text"
          value={bin}
          onChange={(e) => setBin(e.target.value)}
        >
          <option value="" disabled>
            Chọn ngân hàng
          </option>
          {BANKS.map((b) => (
            <option key={b.bin} value={b.bin}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label="Số tài khoản"
        value={accountNo}
        maxLength={30}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        error={noError}
        onChange={(e) => setAccountNo(e.target.value)}
      />
      <TextField
        label="Tên chủ tài khoản"
        value={accountName}
        maxLength={60}
        autoComplete="off"
        autoCapitalize="characters"
        hint="Như trên app ngân hàng, ví dụ NGUYEN THI LINH"
        onChange={(e) => setAccountName(e.target.value)}
      />
      {error ? <Note tone="danger">{error}</Note> : null}
      <ConfirmDialog
        open={confirm}
        title="Lưu tài khoản nhận tiền?"
        confirmLabel="Lưu"
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setConfirm(false)}
      >
        <div className="flex flex-col gap-1">
          <span className="body-strong">
            {bankName(bin)} · {no}
          </span>
          <span className="body text-ink-muted">{accountName.trim()}</span>
          <p className="caption m-0 text-ink-muted">
            Từ giờ QR ở hộp ghi tiền thu chuyển tiền vào tài khoản này.
          </p>
        </div>
      </ConfirmDialog>
    </Sheet>
  )
}

type Range = 'today' | 'yesterday' | '7d' | 'month'

function rangeOf(r: Range, today: string) {
  if (r === 'today') return { from: today, to: today }
  if (r === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) }
  if (r === '7d') return { from: addDays(today, -6), to: today }
  return { from: `${today.slice(0, 8)}01`, to: today }
}

function EntryList(props: { b: Book }) {
  const today = props.b.today ?? toLocalDate(new Date())
  const can = useCan()
  const [range, setRange] = useState<Range>('today')
  const [account, setAccount] = useState<string>('all')
  const [unrec, setUnrec] = useState(false)
  const { from, to } = rangeOf(range, today)
  const q = useQuery({
    queryKey: ['money', 'entries', from, to, account, unrec],
    queryFn: () =>
      api<Entries>(
        `/api/money/entries?from=${from}&to=${to}${account === 'all' ? '' : `&accountId=${account}`}${
          unrec ? '&unreconciled=1' : ''
        }`,
      ),
  })
  useEffect(() => {
    if (account !== 'all' && !props.b.accounts.some((a) => a.id === account)) setAccount('all')
  }, [account, props.b.accounts])

  const days = new Map<string, Entries['items']>()
  for (const i of q.data?.items ?? []) days.set(i.businessDate, [...(days.get(i.businessDate) ?? []), i])

  return (
    <section className="flex flex-col gap-2">
      <h2 className="overline m-0 px-4 text-ink-muted">Tiền vào, tiền ra</h2>
      <div className="flex flex-col gap-2 px-4">
        <SegmentedControl
          ariaLabel="Khoảng ngày"
          options={[
            { value: 'today', label: 'Hôm nay' },
            { value: 'yesterday', label: 'Hôm qua' },
            { value: '7d', label: '7 ngày' },
            { value: 'month', label: 'Tháng này' },
          ]}
          value={range}
          onChange={(v) => setRange(v as Range)}
        />
        <SegmentedControl
          ariaLabel="Tài khoản"
          options={[
            { value: 'all', label: 'Tất cả' },
            ...props.b.accounts.map((a) => ({
              value: a.id,
              label: a.type === 'cash' ? 'Tiền mặt' : 'Tài khoản',
            })),
          ]}
          value={account}
          onChange={setAccount}
        />
        {can('cashbook.manage') ? (
          <Button variant={unrec ? 'primary' : 'secondary'} onClick={() => setUnrec((x) => !x)}>
            {unrec ? 'Đang xem: chuyển khoản chưa đối soát' : 'Chuyển khoản chưa đối soát'}
          </Button>
        ) : null}
        {unrec ? (
          <p className="caption m-0 text-ink-muted">
            Khoản của tài khoản ngân hàng đến hết {formatIsoDate(to)} chưa đánh dấu khớp sao kê. Đã đối soát
            thì khoản gốc không huỷ được.
          </p>
        ) : null}
      </div>
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {q.data?.book && !unrec
        ? q.data.accounts.map((a) => (
            <div key={a.accountId} className="mx-4 lo-card flex flex-col gap-1">
              <span className="body-strong">{a.name}</span>
              <Line
                label={from === to ? 'Đầu ngày' : `Đầu ngày ${formatIsoDate(from).slice(0, 5)}`}
                value={a.opening!}
              />
              <Line label="Tiền vào" value={a.inflow!} sign />
              <Line label="Tiền ra" value={-a.outflow!} />
              <Line label={from === to ? 'Cuối ngày' : 'Cuối kỳ'} value={a.closing!} strong />
            </div>
          ))
        : null}
      {q.data && q.data.items.length === 0 ? (
        <p className="body m-0 px-4 text-ink-muted">Không có khoản nào trong khoảng này.</p>
      ) : null}
      {[...days.entries()].map(([date, items]) => (
        <div key={date} className="flex flex-col">
          <h3 className="label m-0 px-4 pb-1 text-ink-muted">{formatIsoDate(date)}</h3>
          <div className="border-t border-line">
            {items.map((i) => (
              <EntryRow
                key={i.id}
                i={i}
                showAccount={account === 'all'}
                canReconcile={!!q.data?.can.reconcile}
              />
            ))}
          </div>
        </div>
      ))}
      {q.data?.truncated ? (
        <div className="px-4">
          <Note>Chỉ hiện 500 khoản mới nhất. Chọn khoảng ngày ngắn hơn để xem hết.</Note>
        </div>
      ) : null}
    </section>
  )
}

function EntryRow(props: { i: Entries['items'][number]; showAccount: boolean; canReconcile: boolean }) {
  const { i } = props
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const label = LEDGER_LABEL[i.type] ?? i.type
  const meta = [
    toLocalTime(i.occurredAt),
    props.showAccount ? i.accountName : null,
    i.createdByName,
    i.note,
    i.beforeOpening ? 'trước ngày mở sổ' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const bankItem = i.accountType === 'bank' && i.type !== 'opening'

  async function reconcile() {
    setBusy(true)
    try {
      await api('/api/money/reconcile', { body: { entryIds: [i.id] } })
      await qc.invalidateQueries({ queryKey: ['money'] })
      toast('Đã đánh dấu khớp sao kê.')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lo-row">
      <span className="lo-row-main">
        <span className="body lo-row-title">
          {i.order ? (
            <Link to="/don-hang/$id" params={{ id: i.order.id }} className="text-accent">
              {label} #{String(i.order.code).padStart(4, '0')}
            </Link>
          ) : i.appointment ? (
            <Link to="/lich/$id" params={{ id: i.appointment.id }} className="text-accent">
              {label} · {i.appointment.name}
            </Link>
          ) : (
            label
          )}
        </span>
        <span className="lo-row-meta caption">{meta}</span>
      </span>
      <span className="lo-row-side">
        <Money
          value={i.amount}
          sign
          tone={i.beforeOpening ? 'muted' : i.amount < 0 ? 'negative' : 'positive'}
        />
        {bankItem && i.reconciled ? <span className="caption text-success">Đã đối soát</span> : null}
        {bankItem && !i.reconciled && props.canReconcile ? (
          <Button variant="quiet" loading={busy} onClick={() => void reconcile()}>
            Khớp sao kê
          </Button>
        ) : null}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- Chuyển nội bộ, phiếu Linh lập (3.14)

const VOUCHER_KIND = [
  { value: 'other_income', label: 'Thu khác' },
  { value: 'capital_in', label: 'Góp vốn' },
  { value: 'capital_out', label: 'Rút vốn' },
  { value: 'adjustment', label: 'Điều chỉnh' },
] as const
type VoucherKind = (typeof VOUCHER_KIND)[number]['value']

function MoneyActions(props: { b: Book }) {
  const can = useCan()
  const [sheet, setSheet] = useState<'transfer' | 'voucher' | null>(null)
  const manage = can('cashbook.manage')
  const owner = can('cashbook.owner')
  if (!manage && !owner) return null
  return (
    <div className="flex flex-wrap gap-2 px-4">
      {manage ? <Button onClick={() => setSheet('transfer')}>Chuyển nội bộ</Button> : null}
      {owner ? <Button onClick={() => setSheet('voucher')}>Thu khác, vốn, điều chỉnh</Button> : null}
      {manage ? (
        <Link to="/them/chot-ngay" className="lo-btn lo-btn-secondary button-label">
          Chốt quỹ
        </Link>
      ) : null}
      {sheet === 'transfer' ? <TransferSheet b={props.b} onClose={() => setSheet(null)} /> : null}
      {sheet === 'voucher' ? <VoucherSheet b={props.b} onClose={() => setSheet(null)} /> : null}
    </div>
  )
}

function useMoneySave(onClose: () => void) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef('')
  async function save(path: string, body: Record<string, unknown>, done: string) {
    setBusy(true)
    setError(null)
    if (!key.current) key.current = crypto.randomUUID()
    try {
      await api(path, { body: { ...body, idempotencyKey: key.current } })
      key.current = ''
      await qc.invalidateQueries({ queryKey: ['money'] })
      toast(done)
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, save }
}

function TransferSheet(props: { b: Book; onClose: () => void }) {
  const cash = props.b.accounts.find((a) => a.type === 'cash')
  const bank = props.b.accounts.find((a) => a.type === 'bank')
  const [dir, setDir] = useState<'cash_to_bank' | 'bank_to_cash'>('cash_to_bank')
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const s = useMoneySave(props.onClose)
  const from = dir === 'cash_to_bank' ? cash : bank
  const to = dir === 'cash_to_bank' ? bank : cash
  return (
    <Sheet
      open
      title="Chuyển nội bộ"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          loading={s.busy}
          disabled={!amount || !from || !to}
          onClick={() =>
            void s.save(
              '/api/money/transfer',
              {
                fromAccountId: from!.id,
                toAccountId: to!.id,
                amount: amount ?? 0,
                note: note.trim() || null,
              },
              'Đã ghi chuyển nội bộ.',
            )
          }
        >
          Ghi chuyển tiền
        </Button>
      }
    >
      <SegmentedControl
        ariaLabel="Chiều chuyển"
        options={[
          { value: 'cash_to_bank', label: 'Tiền mặt → Tài khoản' },
          { value: 'bank_to_cash', label: 'Tài khoản → Tiền mặt' },
        ]}
        value={dir}
        onChange={(v) => setDir(v as typeof dir)}
      />
      <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
      <TextField
        label="Ghi chú (không bắt buộc)"
        value={note}
        maxLength={300}
        placeholder="Nộp tiền mặt vào tài khoản…"
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="caption m-0 text-ink-muted">
        {from?.name} giảm, {to?.name} tăng cùng số tiền; tổng không đổi, không phải thu chi.
      </p>
      {s.error ? <Note tone="danger">{s.error}</Note> : null}
    </Sheet>
  )
}

function VoucherSheet(props: { b: Book; onClose: () => void }) {
  const [kind, setKind] = useState<VoucherKind>('other_income')
  const [incomeType, setIncomeType] = useState<'loan' | 'supplier_refund' | 'other'>('other')
  const [accountId, setAccountId] = useState(props.b.accounts[0]?.id ?? '')
  const [sign, setSign] = useState<'plus' | 'minus'>('plus')
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const s = useMoneySave(props.onClose)
  const signed = kind === 'adjustment' && sign === 'minus' ? -(amount ?? 0) : (amount ?? 0)
  return (
    <Sheet
      open
      title="Thu khác, vốn, điều chỉnh"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          loading={s.busy}
          disabled={!amount || !reason.trim()}
          onClick={() =>
            void s.save(
              '/api/money/voucher',
              {
                kind,
                incomeType: kind === 'other_income' ? incomeType : null,
                accountId,
                amount: signed,
                reason,
              },
              'Đã ghi phiếu.',
            )
          }
        >
          Ghi phiếu
        </Button>
      }
    >
      <SegmentedControl
        ariaLabel="Loại phiếu"
        options={[...VOUCHER_KIND]}
        value={kind}
        onChange={(v) => setKind(v as VoucherKind)}
      />
      {kind === 'other_income' ? (
        <SegmentedControl
          ariaLabel="Loại thu khác"
          options={[
            { value: 'other', label: 'Thu khác' },
            { value: 'loan', label: 'Vay' },
            { value: 'supplier_refund', label: 'NCC hoàn tiền' },
          ]}
          value={incomeType}
          onChange={(v) => setIncomeType(v as typeof incomeType)}
        />
      ) : null}
      {kind === 'adjustment' ? (
        <SegmentedControl
          ariaLabel="Tăng hay giảm"
          options={[
            { value: 'plus', label: 'Tăng số dư' },
            { value: 'minus', label: 'Giảm số dư' },
          ]}
          value={sign}
          onChange={(v) => setSign(v as 'plus' | 'minus')}
        />
      ) : null}
      <SegmentedControl
        ariaLabel="Tài khoản"
        options={props.b.accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={setAccountId}
      />
      <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
      <TextArea
        label="Lý do (bắt buộc)"
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      <p className="caption m-0 text-ink-muted">
        {kind === 'capital_out' || (kind === 'adjustment' && sign === 'minus') ? 'Tiền ra khỏi' : 'Tiền vào'}{' '}
        {props.b.accounts.find((a) => a.id === accountId)?.name}. Không tính vào doanh thu. Phiếu không sửa
        được; sai thì lập phiếu điều chỉnh.
      </p>
      {s.error ? <Note tone="danger">{s.error}</Note> : null}
    </Sheet>
  )
}
