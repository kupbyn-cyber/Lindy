// UI06 — Sổ tiền (Đợt 3, bước 3.3; PRD §7.1–7.2). Linh, Nhung (money_accounts.read_balance).
// Số dư từng tài khoản, mở sổ (Linh, một lần), bút toán theo ngày với đầu kỳ / vào / ra / cuối kỳ.
// Thu chi, chuyển nội bộ, điều chỉnh có ở Đợt 3B.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { LEDGER_LABEL } from '~/lib/money-book'
import { addDays, formatIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
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

type Range = 'today' | 'yesterday' | '7d' | 'month'

function rangeOf(r: Range, today: string) {
  if (r === 'today') return { from: today, to: today }
  if (r === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) }
  if (r === '7d') return { from: addDays(today, -6), to: today }
  return { from: `${today.slice(0, 8)}01`, to: today }
}

function EntryList(props: { b: Book }) {
  const today = props.b.today ?? toLocalDate(new Date())
  const [range, setRange] = useState<Range>('today')
  const [account, setAccount] = useState<string>('all')
  const { from, to } = rangeOf(range, today)
  const q = useQuery({
    queryKey: ['money', 'entries', from, to, account],
    queryFn: () =>
      api<Entries>(
        `/api/money/entries?from=${from}&to=${to}${account === 'all' ? '' : `&accountId=${account}`}`,
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
      </div>
      {q.isLoading ? <p className="body px-4 text-ink-muted">Đang tải…</p> : null}
      {q.isError ? (
        <div className="px-4">
          <Note tone="danger">{errorText(q.error)}</Note>
        </div>
      ) : null}
      {q.data?.book
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
              <EntryRow key={i.id} i={i} showAccount={account === 'all'} />
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

function EntryRow(props: { i: Entries['items'][number]; showAccount: boolean }) {
  const { i } = props
  const title = `${LEDGER_LABEL[i.type] ?? i.type}${i.order ? ` #${String(i.order.code).padStart(4, '0')}` : ''}`
  const meta = [
    toLocalTime(i.occurredAt),
    props.showAccount ? i.accountName : null,
    i.createdByName,
    i.note,
    i.beforeOpening ? 'trước ngày mở sổ' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const body = (
    <>
      <span className="lo-row-main">
        <span className="body lo-row-title">{title}</span>
        <span className="lo-row-meta caption">{meta}</span>
      </span>
      <span className="lo-row-side">
        <Money
          value={i.amount}
          sign
          tone={i.beforeOpening ? 'muted' : i.amount < 0 ? 'negative' : 'positive'}
        />
      </span>
    </>
  )
  return i.order ? (
    <Link to="/don-hang/$id" params={{ id: i.order.id }} className="lo-row lo-row-action">
      {body}
    </Link>
  ) : (
    <div className="lo-row">{body}</div>
  )
}
