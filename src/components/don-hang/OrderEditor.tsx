// Màn tạo/sửa đơn (UI04, bước 2.13). Tích chọn dịch vụ, app tự điền tiền (C09); số lượng theo ngón/hình/cái;
// giá khoảng tự điền giá thấp nhất (C14); chọn thợ từng dòng, nhiều thợ nhập tay số tiền (C10); giảm giá theo
// bậc (C15, K12). Tổng tính ngay trên máy bằng cùng hàm với server; server tính lại khi lưu [P26].
// "Nháp" là đơn đang soạn trên máy, chưa lưu (K11).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  cx,
  Money,
  MoneyInput,
  Note,
  SegmentedControl,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { ApiError, api } from '~/lib/api'
import { TICKETS_ENABLED } from '~/lib/features'
import { useBranch, useCan, useMe } from '~/lib/me'
import { formatVND } from '~/lib/money'
import {
  type ComputedItem,
  computeOrder,
  DISCOUNT_LABEL,
  type DiscountInput,
  type ItemInput,
  levelAtLeast,
  levelOf,
  MAX_QUANTITY,
  splitProportional,
} from '~/lib/order-math'
import { LEVEL_NOTE, lookupOf, type OrderDetail, useCatalog, useStaff } from '~/lib/orders'
import { addDays, formatIsoDate, toLocalDate } from '~/lib/time'
import {
  CustomerPicker,
  DiscountSheet,
  ExtraLineSheet,
  type Picked,
  type PickedCustomer,
  ServicePicker,
} from './pickers'

type Line = ItemInput & { key: string }
type Draft = { customer: PickedCustomer; serviceDate: string; items: Line[]; discounts: DiscountInput[] }

let seq = 0
const newKey = () => `l${++seq}`

function fromDetail(d: OrderDetail): Draft {
  return {
    customer: d.customer ? { id: d.customer.id, name: d.customer.name, phoneMasked: d.customer.phone } : null,
    serviceDate: d.serviceDate,
    items: d.input.items.map((it) => ({ ...it, key: newKey() })),
    discounts: d.input.discounts,
  }
}

function payload(d: Draft) {
  return {
    customerId: d.customer?.id ?? null,
    serviceDate: d.serviceDate,
    items: d.items.map(({ key: _key, ...it }) => ({
      ...it,
      staff: it.staff.map((s) => (it.staff.length > 1 ? s : { userId: s.userId })),
    })),
    discounts: d.discounts,
  }
}

export function OrderEditor(props: {
  /** Không có: tạo đơn mới. */
  order?: OrderDetail
  onSaved?: (d: OrderDetail) => void
  onCancel?: () => void
}) {
  const me = useMe()
  const branch = useBranch()
  const can = useCan()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const catalog = useCatalog()
  const staff = useStaff()
  const today = toLocalDate(new Date())
  const isEdit = !!props.order

  const [draft, setDraft] = useState<Draft>(() =>
    props.order ? fromDetail(props.order) : { customer: null, serviceDate: today, items: [], discounts: [] },
  )
  const [version, setVersion] = useState(props.order?.version ?? 1)
  const [busy, setBusy] = useState<null | 'save' | 'done'>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<OrderDetail | null>(null)
  const [sheet, setSheet] = useState<null | 'services' | 'customer' | 'discount' | 'surcharge' | 'custom'>(
    null,
  )
  const [priceEdit, setPriceEdit] = useState<Set<string>>(new Set())
  const [adjustReason, setAdjustReason] = useState('')
  const confirmedEdit = props.order?.status === 'confirmed'
  // Ưu đãi bù khiếu nại còn dùng được của khách đang chọn (bước 2.18); tạm ẩn cùng phiếu xử lý (S28)
  const customerId = draft.customer?.id ?? null
  const compensations = useQuery({
    queryKey: ['customers', 'compensations', customerId, props.order?.id ?? null],
    queryFn: () =>
      api<{ items: { ticketId: string; percent: number; orderCodeLabel: string }[] }>(
        `/api/customers/${customerId}/compensations${props.order ? `?excludeOrder=${props.order.id}` : ''}`,
      ),
    enabled: TICKETS_ENABLED && !!customerId,
  })
  // Mã yêu cầu sinh khi mở màn tạo đơn; mất mạng thì gửi lại cùng mã, không tạo trùng [P3]
  const requestId = useRef('')
  useEffect(() => {
    if (!isEdit) requestId.current = crypto.randomUUID()
  }, [isEdit])

  const lookup = useMemo(() => lookupOf(catalog.data), [catalog.data])
  const computed = useMemo(
    () => computeOrder({ items: draft.items, discounts: draft.discounts }, lookup),
    [draft.items, draft.discounts, lookup],
  )
  const staffList = staff.data?.items ?? []
  const nameOf = (id: string) => staffList.find((s) => s.id === id)?.displayName ?? '—'
  const defaultStaff = staffList.some((s) => s.id === me.userId) ? [{ userId: me.userId }] : []
  const myLevel = levelOf(branch?.perms ?? [])
  const canPickAnyDate = can('order.confirm')

  const setItems = (fn: (items: Line[]) => Line[]) => setDraft((d) => ({ ...d, items: fn(d.items) }))
  const patchLine = (key: string, patch: Partial<ItemInput>) =>
    setItems((items) => items.map((x) => (x.key === key ? ({ ...x, ...patch } as Line) : x)))

  function addPicked(picked: Picked[]) {
    setItems((items) => [
      ...items,
      ...picked.map(
        (p): Line =>
          p.kind === 'service'
            ? {
                key: newKey(),
                type: 'service',
                serviceId: p.id,
                quantity: 1,
                unitPrice: null,
                staff: defaultStaff,
              }
            : { key: newKey(), type: 'combo', comboId: p.id, staff: defaultStaff },
      ),
    ])
  }

  function removeLine(index: number) {
    setDraft((d) => ({
      ...d,
      items: d.items.filter((_, i) => i !== index),
      // Giảm của dòng bị bỏ thì bỏ theo; dòng sau dồn lên một vị trí
      discounts: d.discounts
        .filter((x) => x.scope !== index)
        .map((x) => (typeof x.scope === 'number' && x.scope > index ? { ...x, scope: x.scope - 1 } : x)),
    }))
  }

  function toggleStaff(line: Line, userId: string) {
    const on = line.staff.some((s) => s.userId === userId)
    const next = on
      ? line.staff.filter((s) => s.userId !== userId)
      : [...line.staff, { userId, amount: null }]
    patchLine(line.key, { staff: next.length > 1 ? next : next.map((s) => ({ userId: s.userId })) })
  }

  function splitEven(line: Line, net: number) {
    const parts = splitProportional(
      net,
      line.staff.map(() => 1),
    )
    patchLine(line.key, { staff: line.staff.map((s, i) => ({ userId: s.userId, amount: parts[i] })) })
  }

  async function save(markDone: boolean) {
    if (computed.errors.length > 0) return setError(computed.errors[0]!)
    if (confirmedEdit && !adjustReason.trim()) return setError('Cần ghi lý do sửa đơn đã xác nhận.')
    if (markDone && computed.doneProblems.length > 0) return setError(computed.doneProblems[0]!)
    setBusy(markDone ? 'done' : 'save')
    setError(null)
    try {
      let d: OrderDetail
      if (isEdit && props.order) {
        d = await api<OrderDetail>(`/api/orders/${props.order.id}`, {
          method: 'PUT',
          body: {
            version,
            ...payload(draft),
            ...(confirmedEdit ? { adjustReason: adjustReason.trim() } : {}),
          },
        })
      } else {
        const res = await api<{ order: OrderDetail }>('/api/orders', {
          body: { createRequestId: requestId.current, ...payload(draft) },
        })
        d = res.order
      }
      if (markDone && d.status === 'in_progress') {
        d = await api<OrderDetail>(`/api/orders/${d.id}/done`, { body: { version: d.version } })
      }
      qc.setQueryData(['orders', 'detail', d.id], d)
      await qc.invalidateQueries({ queryKey: ['orders', 'list'] })
      if (markDone && d.appointment) await qc.invalidateQueries({ queryKey: ['appointments'] })
      // S41: Làm xong là xác nhận luôn; còn giảm giá chờ duyệt thì báo chờ ai
      toast(
        !markDone
          ? `Đã lưu đơn ${d.codeLabel}.`
          : d.status === 'confirmed'
            ? `Đã xong, đã xác nhận bill ${d.codeLabel}.`
            : `Đã bấm Làm xong đơn ${d.codeLabel}.${d.can.confirmBlocked ? ` ${d.can.confirmBlocked}` : ''}`,
      )
      if (isEdit) {
        setVersion(d.version)
        props.onSaved?.(d)
      } else {
        await navigate({ to: '/don-hang/$id', params: { id: d.id }, replace: true })
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data) setConflict(e.data as OrderDetail)
      else setError(e instanceof Error ? e.message : 'Có lỗi xảy ra. Thử lại sau.')
    } finally {
      setBusy(null)
    }
  }

  const lineNames = draft.items.map((_, i) => computed.items[i]?.name || `Dòng ${i + 1}`)
  const awaiting = props.order?.status === 'awaiting_confirmation'
  const levelNote = LEVEL_NOTE[computed.requiredLevel]
  const selfApproves = levelNote && levelAtLeast(myLevel, computed.requiredLevel)

  return (
    <div className="flex flex-col gap-4">
      {conflict ? (
        <div className="flex flex-col gap-2 px-4">
          <Note tone="warning">
            Đơn {conflict.codeLabel} vừa được sửa ở nơi khác. Chọn tải bản mới hoặc giữ nội dung đang sửa.
          </Note>
          <div className="flex gap-2">
            <Button
              block
              onClick={() => {
                setDraft(fromDetail(conflict))
                setVersion(conflict.version)
                setConflict(null)
              }}
            >
              Tải bản mới
            </Button>
            <Button
              block
              onClick={() => {
                setVersion(conflict.version)
                setConflict(null)
              }}
            >
              Sửa tiếp
            </Button>
          </div>
        </div>
      ) : null}

      {/* Khách và ngày */}
      <div className="flex flex-col gap-3 px-4">
        <div className="lo-card flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="caption text-ink-muted">Khách</span>
            <span className="body-strong truncate">
              {draft.customer ? draft.customer.name : (props.order?.guestLabel ?? 'Khách lẻ')}
            </span>
            {draft.customer?.phoneMasked ? (
              <span className="caption text-ink-muted">{draft.customer.phoneMasked}</span>
            ) : null}
          </span>
          <Button variant="quiet" onClick={() => setSheet('customer')}>
            {draft.customer ? 'Đổi' : 'Chọn khách'}
          </Button>
        </div>
        {canPickAnyDate ? (
          <TextField
            label="Ngày làm dịch vụ"
            type="date"
            max={today}
            value={draft.serviceDate}
            onChange={(e) => e.target.value && setDraft((d) => ({ ...d, serviceDate: e.target.value }))}
          />
        ) : (
          <div className="lo-field">
            <span className="lo-field-label label">Ngày làm dịch vụ</span>
            <SegmentedControl
              ariaLabel="Ngày làm dịch vụ"
              options={[
                { value: today, label: 'Hôm nay' },
                { value: addDays(today, -1), label: 'Hôm qua' },
              ]}
              value={draft.serviceDate}
              onChange={(v) => setDraft((d) => ({ ...d, serviceDate: v }))}
            />
          </div>
        )}
      </div>

      {/* Dòng đơn */}
      <section className="flex flex-col gap-2">
        <h2 className="overline m-0 px-4 text-ink-muted">Dịch vụ</h2>
        {!catalog.data ? <p className="body m-0 px-4 text-ink-muted">Đang tải danh mục…</p> : null}
        {draft.items.length === 0 && catalog.data ? (
          <p className="body m-0 px-4 text-ink-muted">Chưa có dịch vụ. Bấm “Thêm dịch vụ”.</p>
        ) : null}
        {draft.items.map((line, i) => (
          <LineCard
            key={line.key}
            index={i}
            line={line}
            c={computed.items[i]}
            staff={staffList}
            nameOf={nameOf}
            priceEditing={priceEdit.has(line.key)}
            onPriceEdit={() => setPriceEdit((s) => new Set(s).add(line.key))}
            onPatch={(patch) => patchLine(line.key, patch)}
            onToggleStaff={(uid) => toggleStaff(line, uid)}
            onSplitEven={(net) => splitEven(line, net)}
            onRemove={() => removeLine(i)}
          />
        ))}
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 px-4">
          <Button variant="primary" icon="plus" onClick={() => setSheet('services')}>
            Thêm dịch vụ
          </Button>
          <Button onClick={() => setSheet('surcharge')}>Phụ thu</Button>
          <Button onClick={() => setSheet('custom')}>Khác</Button>
        </div>
      </section>

      {/* Giảm giá */}
      <section className="flex flex-col gap-2 px-4">
        <h2 className="overline m-0 text-ink-muted">Giảm giá</h2>
        {draft.discounts.map((d, k) => {
          const amount = computed.errors.length === 0 ? computed.discounts[k]?.amount : undefined
          const label =
            d.kind === 'manual'
              ? `${d.percent ? `${d.percent}%` : formatVND(d.amount ?? 0)} · ${d.reason ?? ''}`
              : d.kind === 'complaint_compensation'
                ? `Ưu đãi bù khiếu nại ${d.percent}%`
                : DISCOUNT_LABEL[d.kind]
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: khoản giảm không có mã riêng; vị trí là định danh (server lưu theo vị trí)
              key={`${k}-${d.kind}-${String(d.scope)}`}
              className="lo-card flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="body truncate">{label}</span>
                <span className="caption text-ink-muted">
                  {d.scope === 'order' ? 'Cả bill' : `Dòng ${d.scope + 1}: ${lineNames[d.scope] ?? ''}`}
                </span>
              </span>
              <span className="flex items-center gap-1">
                {amount != null ? <Money value={-amount} size="sm" tone="negative" /> : null}
                <button
                  type="button"
                  className="lo-icon-btn"
                  aria-label="Bỏ khoản giảm"
                  onClick={() =>
                    setDraft((x) => ({ ...x, discounts: x.discounts.filter((_, j) => j !== k) }))
                  }
                >
                  <X size={18} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </span>
            </div>
          )
        })}
        {(compensations.data?.items ?? [])
          .filter((c) => !draft.discounts.some((d) => d.ticketId === c.ticketId))
          .map((c) => (
            <Note key={c.ticketId} tone="warning">
              Khách có ưu đãi bù khiếu nại {c.percent}% (phiếu từ đơn {c.orderCodeLabel}), quán chịu, dùng một
              lần.{' '}
              <button
                type="button"
                className="border-0 bg-transparent p-0 font-semibold text-accent underline"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    discounts: [
                      ...d.discounts,
                      {
                        scope: 'order',
                        kind: 'complaint_compensation',
                        percent: c.percent,
                        ticketId: c.ticketId,
                      },
                    ],
                  }))
                }
              >
                Áp ưu đãi
              </button>
            </Note>
          ))}
        <Button icon="plus" disabled={draft.items.length === 0} onClick={() => setSheet('discount')}>
          Thêm giảm giá
        </Button>
      </section>

      {/* Tổng */}
      <section className="mx-4 lo-card flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="body text-ink-muted">Tổng giá gốc</span>
          <Money value={computed.grossAmount} />
        </div>
        {computed.discountAmount > 0 ? (
          <div className="flex justify-between">
            <span className="body text-ink-muted">Giảm giá</span>
            <Money value={-computed.discountAmount} tone="negative" />
          </div>
        ) : null}
        <div className="flex items-baseline justify-between border-t border-line pt-1">
          <span className="body-strong">Thành tiền</span>
          <Money value={computed.netAmount} className="body-strong" />
        </div>
        {levelNote ? (
          <Note tone={selfApproves ? 'info' : 'warning'}>
            {selfApproves ? `${levelNote} Bạn lưu là đã duyệt mức này.` : levelNote}
          </Note>
        ) : null}
      </section>

      {confirmedEdit ? (
        <div className="flex flex-col gap-2 px-4">
          <TextArea
            label="Lý do sửa đơn đã xác nhận (bắt buộc)"
            value={adjustReason}
            maxLength={500}
            onChange={(e) => setAdjustReason(e.target.value)}
          />
          <Note>
            Doanh thu ngày {props.order ? formatIsoDate(props.order.serviceDate) : ''} đổi theo. Thành tiền
            mới không được nhỏ hơn số đã thu (hoàn tiền có ở Đợt 3).
          </Note>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 px-4">
        {computed.errors.slice(0, 3).map((e) => (
          <Note key={e} tone="danger">
            {e}
          </Note>
        ))}
        {error ? <Note tone="danger">{error}</Note> : null}
      </div>

      <div className="lo-actionbar">
        {isEdit && props.onCancel ? (
          <Button block disabled={!!busy} onClick={props.onCancel}>
            Không lưu
          </Button>
        ) : null}
        <Button
          block
          variant={awaiting || confirmedEdit ? 'primary' : 'secondary'}
          loading={busy === 'save'}
          disabled={!!busy || computed.errors.length > 0 || !catalog.data}
          onClick={() => void save(false)}
        >
          Lưu
        </Button>
        {!isEdit || props.order?.status === 'in_progress' ? (
          <Button
            block
            variant="primary"
            loading={busy === 'done'}
            disabled={
              !!busy || computed.errors.length > 0 || computed.doneProblems.length > 0 || !catalog.data
            }
            onClick={() => void save(true)}
          >
            Làm xong
          </Button>
        ) : null}
      </div>

      <ServicePicker
        open={sheet === 'services'}
        catalog={catalog.data}
        onClose={() => setSheet(null)}
        onAdd={addPicked}
      />
      <CustomerPicker
        open={sheet === 'customer'}
        onClose={() => setSheet(null)}
        onPick={(c) =>
          // Đổi khách thì bỏ ưu đãi bù khiếu nại của khách cũ
          setDraft((d) => ({
            ...d,
            customer: c,
            discounts: d.discounts.filter(
              (x) => x.kind !== 'complaint_compensation' || c?.id === d.customer?.id,
            ),
          }))
        }
      />
      <DiscountSheet
        open={sheet === 'discount'}
        lines={lineNames}
        onClose={() => setSheet(null)}
        onApply={(x) => setDraft((d) => ({ ...d, discounts: [...d.discounts, x] }))}
      />
      <ExtraLineSheet
        open={sheet === 'surcharge' || sheet === 'custom'}
        type={sheet === 'custom' ? 'custom' : 'surcharge'}
        onClose={() => setSheet(null)}
        onAdd={(x) =>
          setItems((items) => [
            ...items,
            { key: newKey(), type: sheet === 'custom' ? 'custom' : 'surcharge', ...x, staff: defaultStaff },
          ])
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------- Một dòng đơn

function LineCard(props: {
  index: number
  line: Line
  c: ComputedItem | undefined
  staff: { id: string; displayName: string }[]
  nameOf: (id: string) => string
  priceEditing: boolean
  onPriceEdit: () => void
  onPatch: (patch: Partial<ItemInput>) => void
  onToggleStaff: (userId: string) => void
  onSplitEven: (net: number) => void
  onRemove: () => void
}) {
  const { line, c } = props
  if (!c) return null
  const isService = line.type === 'service'
  const perUnit = isService && c.unit !== 'lần'
  const priceShown = isService ? (line.unitPrice ?? c.listMin) : c.unitPrice
  const multi = line.staff.length > 1
  const allocated = multi ? line.staff.reduce((a, s) => a + (s.amount ?? 0), 0) : 0

  return (
    <div className="mx-4 lo-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="body-strong break-words">
            {props.index + 1}. {c.name || '—'}
          </span>
          <span className="caption text-ink-muted">
            {line.type === 'combo'
              ? 'Combo · giá niêm yết'
              : line.type === 'surcharge'
                ? 'Phụ thu'
                : line.type === 'custom'
                  ? 'Dịch vụ nhập tay'
                  : c.priceMode === 'custom'
                    ? `Khoảng ${formatVND(c.listMin)}–${formatVND(c.listMax)}${perUnit ? `/${c.unit}` : ''}`
                    : `Niêm yết ${formatVND(c.listMin)}${perUnit ? `/${c.unit}` : ''}`}
          </span>
        </span>
        <button
          type="button"
          className="lo-icon-btn -mt-2 -mr-2"
          aria-label="Bỏ dòng"
          onClick={props.onRemove}
        >
          <X size={20} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>

      {isService ? (
        <div className={cx('grid items-end gap-2', perUnit ? 'grid-cols-[auto_1fr]' : 'grid-cols-1')}>
          {perUnit ? (
            <div className="lo-field">
              <span className="lo-field-label label">Số {c.unit}</span>
              <div className="lo-stepper">
                <button
                  type="button"
                  aria-label="Bớt"
                  onClick={() => props.onPatch({ quantity: Math.max(1, line.quantity - 1) })}
                >
                  <Minus size={18} strokeWidth={1.7} className="mx-auto" aria-hidden="true" />
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`Số ${c.unit}`}
                  value={line.quantity}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, '').slice(0, 2))
                    props.onPatch({ quantity: Math.min(MAX_QUANTITY, Math.max(1, n || 1)) })
                  }}
                />
                <button
                  type="button"
                  aria-label="Thêm"
                  onClick={() => props.onPatch({ quantity: Math.min(MAX_QUANTITY, line.quantity + 1) })}
                >
                  <Plus size={18} strokeWidth={1.7} className="mx-auto" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
          {c.priceMode === 'custom' || props.priceEditing ? (
            <MoneyInput
              label={perUnit ? `Giá mỗi ${c.unit}` : 'Giá'}
              value={priceShown}
              onValueChange={(v) => props.onPatch({ unitPrice: v })}
            />
          ) : (
            <div className="flex items-center justify-between">
              <span className="body">{formatVND(priceShown)}</span>
              <Button variant="quiet" onClick={props.onPriceEdit}>
                Sửa giá
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {(line.type === 'surcharge' || line.type === 'custom') && (
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <TextField
            label="Tên"
            value={line.name}
            maxLength={100}
            onChange={(e) => props.onPatch({ name: e.target.value })}
          />
          <MoneyInput
            label="Số tiền"
            value={line.amount}
            onValueChange={(v) => props.onPatch({ amount: v ?? 0 })}
          />
        </div>
      )}

      {c.belowAmount > 0 && isService ? (
        <TextField
          label="Lý do giá thấp hơn (cần Nhung duyệt)"
          value={line.belowReason ?? ''}
          maxLength={200}
          error={!line.belowReason?.trim() ? 'Cần ghi lý do.' : undefined}
          onChange={(e) => props.onPatch({ belowReason: e.target.value })}
        />
      ) : null}
      {c.outOfRange ? (
        <span>
          <StatusChip tone="warning">Vượt khoảng giá</StatusChip>
        </span>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="label">Thợ làm</span>
        <div className="flex flex-wrap gap-2">
          {props.staff.map((s) => {
            const on = line.staff.some((x) => x.userId === s.id)
            return (
              <button
                key={s.id}
                type="button"
                className={cx('lo-toggle', 'label', on && 'is-on')}
                aria-pressed={on}
                onClick={() => props.onToggleStaff(s.id)}
              >
                {s.displayName}
              </button>
            )
          })}
        </div>
        {line.staff.length === 0 ? <span className="caption text-danger">Chưa chọn thợ.</span> : null}
        {multi ? (
          <div className="flex flex-col gap-2">
            {line.staff.map((s) => (
              <MoneyInput
                key={s.userId}
                label={`Phần của ${props.nameOf(s.userId)}`}
                value={s.amount ?? null}
                onValueChange={(v) =>
                  props.onPatch({
                    staff: line.staff.map((x) => (x.userId === s.userId ? { ...x, amount: v } : x)),
                  })
                }
              />
            ))}
            <div className="flex items-center justify-between gap-2">
              <span className={cx('caption', allocated === c.netAmount ? 'text-ink-muted' : 'text-danger')}>
                Đã chia {formatVND(allocated)} / {formatVND(c.netAmount)}
              </span>
              <Button variant="quiet" onClick={() => props.onSplitEven(c.netAmount)}>
                Chia đều
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <span className="caption text-ink-muted">
          {c.discountAmount > 0
            ? `Gốc ${formatVND(c.grossAmount)} · giảm ${formatVND(c.discountAmount)}`
            : 'Thành tiền'}
        </span>
        <Money value={c.netAmount} />
      </div>
    </div>
  )
}
