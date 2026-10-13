// UI12 — Hồ sơ khách: tên, SĐT, lịch sử đơn (D10-B). Không tự gộp khách trùng tên (test 16).
// Nhung, Linh sửa tên/SĐT, có lịch sử. Thợ chỉ thấy đơn trong phạm vi K09.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Phone } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button, Money, Note, Sheet, StatusChip, TextField, useToast } from '~/components/ui'
import { ApiError, api, errorText } from '~/lib/api'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from '~/lib/orders'
import { normalizePhone } from '~/lib/phone'
import { formatDateTimeShort, formatIsoDate } from '~/lib/time'
import type { getCustomer } from '~/server/customers/service'

export const Route = createFileRoute('/_app/khach/$id')({
  head: () => ({ meta: [{ title: 'Khách · LINDY OS' }] }),
  component: CustomerPage,
})

type Customer = Awaited<ReturnType<typeof getCustomer>>

function CustomerPage() {
  const { id } = Route.useParams()
  const q = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => api<Customer>(`/api/customers/${id}`),
  })
  const [editing, setEditing] = useState(false)
  // Ưu đãi bù khiếu nại còn dùng được (bước 2.18): thợ thấy để áp ở bill sau
  const comp = useQuery({
    queryKey: ['customers', 'compensations', id, null],
    queryFn: () =>
      api<{ items: { ticketId: string; percent: number; orderCodeLabel: string }[] }>(
        `/api/customers/${id}/compensations`,
      ),
  })

  if (q.isLoading) return <p className="body px-4 text-ink-muted">Đang tải…</p>
  if (q.isError || !q.data) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-2">
        <Note tone="danger">
          {q.error instanceof ApiError && q.error.status === 404
            ? 'Không tìm thấy khách.'
            : errorText(q.error)}
        </Note>
        <Link to="/khach" className="lo-btn lo-btn-secondary button-label">
          Về danh sách khách
        </Link>
      </div>
    )
  }
  const c = q.data

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="px-4">
        <Link to="/khach" className="label text-accent">
          ← Khách
        </Link>
        <h1 className="screen-title mt-1 mb-1 break-words">{c.name}</h1>
        <div className="flex items-center justify-between gap-2">
          {c.phone ? (
            <a href={`tel:${c.phone}`} className="lo-btn lo-btn-secondary button-label min-h-[36px]!">
              <Phone size={16} strokeWidth={1.7} aria-hidden="true" /> {c.phone}
            </a>
          ) : (
            <span className="body text-ink-muted">Không có SĐT</span>
          )}
          {c.canEdit ? (
            <Button variant="quiet" onClick={() => setEditing(true)}>
              Sửa
            </Button>
          ) : null}
        </div>
      </div>

      {(comp.data?.items ?? []).map((x) => (
        <div key={x.ticketId} className="px-4">
          <Note tone="warning">
            Có ưu đãi bù khiếu nại {x.percent}% cho bill sau (phiếu từ đơn {x.orderCodeLabel}). Áp khi tạo đơn
            cho khách này.
          </Note>
        </div>
      ))}

      {c.stats ? (
        <div className="mx-4 lo-card grid grid-cols-3 gap-2">
          <Stat label="Lần làm" value={String(c.stats.visits)} />
          <Stat label="Tổng chi" value={<Money value={c.stats.spent} size="sm" />} />
          <Stat
            label="Gần nhất"
            value={c.stats.lastDate ? formatIsoDate(c.stats.lastDate).slice(0, 5) : '—'}
          />
        </div>
      ) : null}

      <section>
        <h2 className="overline m-0 px-4 pb-1 text-ink-muted">Lịch sử đơn</h2>
        <div className="border-t border-line">
          {c.orders.length === 0 ? (
            <p className="body m-0 px-4 py-3 text-ink-muted">Chưa có đơn nào.</p>
          ) : null}
          {c.orders.map((o) => (
            <Link key={o.id} to="/don-hang/$id" params={{ id: o.id }} className="lo-row lo-row-action">
              <span className="lo-row-main">
                <span className="body lo-row-title">
                  <span className="label text-ink-muted">{o.codeLabel}</span> {formatIsoDate(o.serviceDate)}
                  {o.branchName ? <span className="caption text-ink-muted"> · {o.branchName}</span> : null}
                </span>
                <span className="lo-row-meta caption">
                  {o.items.join(', ') || 'Chưa có dịch vụ'}
                  {o.staff.length ? ` · ${o.staff.join(', ')}` : ''}
                </span>
              </span>
              <span className="lo-row-side">
                <Money value={o.netAmount} tone={o.status === 'cancelled' ? 'muted' : undefined} />
                <StatusChip tone={ORDER_STATUS_TONE[o.status as OrderStatus]}>
                  {ORDER_STATUS_LABEL[o.status as OrderStatus]}
                </StatusChip>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {c.changes.length > 0 ? (
        <section>
          <h2 className="overline m-0 px-4 pb-1 text-ink-muted">Thay đổi hồ sơ</h2>
          <div className="border-t border-line">
            {c.changes.map((x, i) => {
              const before = (x.beforeJson ?? {}) as { name?: string; phone?: string | null }
              const after = (x.afterJson ?? {}) as { name?: string; phone?: string | null }
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: lịch sử chỉ đọc, không đổi thứ tự
                <div key={i} className="border-b border-line bg-surface-raised px-4 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="body-strong">{x.action === 'created' ? 'Tạo hồ sơ' : 'Sửa hồ sơ'}</span>
                    <span className="caption text-ink-muted">{formatDateTimeShort(x.occurredAt)}</span>
                  </div>
                  <div className="caption text-ink-muted">{x.actorName ?? 'Hệ thống'}</div>
                  {x.action !== 'created' && before.name !== after.name ? (
                    <div className="caption">
                      Tên: {before.name} → {after.name}
                    </div>
                  ) : null}
                  {x.action !== 'created' && before.phone !== after.phone ? (
                    <div className="caption">
                      SĐT: {before.phone ?? '—'} → {after.phone ?? '—'}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {c.canEdit ? (
        <EditSheet key={c.version} open={editing} customer={c} onClose={() => setEditing(false)} />
      ) : null}
    </section>
  )
}

function Stat(props: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="caption text-ink-muted">{props.label}</span>
      <span className="body-strong">{props.value}</span>
    </div>
  )
}

function EditSheet(props: { open: boolean; customer: Customer; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(props.customer.name)
  const [phone, setPhone] = useState(props.customer.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const check = normalizePhone(phone)

  async function save() {
    if (!name.trim()) return setError('Nhập tên khách.')
    if (!check.ok) return setError(check.error)
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ samePhone: { name: string }[] }>(`/api/customers/${props.customer.id}`, {
        method: 'PUT',
        body: { version: props.customer.version, name: name.trim(), phone: phone.trim() || null },
      })
      await qc.invalidateQueries({ queryKey: ['customers'] })
      toast(
        res.samePhone.length
          ? `Đã lưu. SĐT này cũng dùng cho: ${res.samePhone.map((s) => s.name).join(', ')}.`
          : 'Đã lưu thông tin khách.',
      )
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
      title="Sửa thông tin khách"
      onClose={props.onClose}
      footer={
        <Button block variant="primary" loading={busy} onClick={() => void save()}>
          Lưu
        </Button>
      }
    >
      <TextField label="Tên khách" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="SĐT (không bắt buộc)"
        type="tel"
        inputMode="tel"
        value={phone}
        maxLength={30}
        error={phone && !check.ok ? check.error : undefined}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Note>CRM chỉ lưu tên, SĐT và lịch sử đơn. Hai khách dùng chung SĐT vẫn lưu được.</Note>
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}
