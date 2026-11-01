// Các sheet chọn trên màn tạo/sửa đơn: dịch vụ (danh sách tích chọn có tìm kiếm thông minh, C09), khách, giảm giá.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button, cx, Icon, MoneyInput, Note, SegmentedControl, Sheet, TextField } from '~/components/ui'
import { ApiError, api } from '~/lib/api'
import { searchCatalog } from '~/lib/catalog-search'
import { formatVND } from '~/lib/money'
import type { DiscountInput, DiscountKind } from '~/lib/order-math'
import type { Catalog } from '~/lib/orders'
import { movePhoneOutOfName, nameLooksMessy, normalizePhone } from '~/lib/phone'

// ---------------------------------------------------------------- Dịch vụ

export type Picked = { kind: 'service' | 'combo'; id: string }

export type Entry = {
  key: string
  kind: 'service' | 'combo'
  id: string
  name: string
  category: string
  price: string
  sub?: string
}

function priceText(min: number, max: number, unit: string) {
  const p = min === max ? formatVND(min) : `${formatVND(min)}–${formatVND(max)}`
  return unit === 'lần' ? p : `${p}/${unit}`
}

/** Dịch vụ, combo còn bán, gom một danh sách để tích chọn. */
export function catalogEntries(cat: Catalog | undefined): Entry[] {
  if (!cat) return []
  return [
    ...cat.services
      .filter((s) => s.isActive)
      .map((s) => ({
        key: `s:${s.id}`,
        kind: 'service' as const,
        id: s.id,
        name: s.name,
        category: s.category,
        price: priceText(s.priceMin, s.priceMax, s.unit),
      })),
    ...cat.combos
      .filter((c) => c.isActive)
      .map((c) => ({
        key: `c:${c.id}`,
        kind: 'combo' as const,
        id: c.id,
        name: c.name,
        category: 'Combo',
        price: formatVND(c.price),
        sub: c.itemNames.join(' + '),
      })),
  ]
}

/** Chọn dịch vụ ngay trong màn đơn (S52): chạm là thêm, nhóm đầu mở sẵn, tìm được không dấu (C09). */
export function ServiceChecklist(props: {
  catalog: Catalog | undefined
  /** Số dòng đang có trên đơn của mỗi mục */
  counts: Map<string, number>
  disabled?: boolean
  onToggle: (e: Entry) => void
  onAddAgain: (e: Entry) => void
}) {
  const [q, setQ] = useState('')
  const entries = useMemo(() => catalogEntries(props.catalog), [props.catalog])
  const names = [...new Set(entries.map((e) => e.category))]
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const firstGroup = names[0]
  const isOpen = (name: string) => (openGroups.size === 0 ? name === firstGroup : openGroups.has(name))
  const shown = q.trim() ? searchCatalog(entries, q) : entries
  const groups = q.trim()
    ? [{ name: 'Kết quả', items: shown }]
    : names.map((name) => ({ name, items: entries.filter((e) => e.category === name) }))

  function toggleGroup(name: string) {
    setOpenGroups((old) => {
      const next = new Set(old.size === 0 && firstGroup ? [firstGroup] : old)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      // Rỗng nghĩa là mặc định, nên giữ một giá trị không trùng tên nhóm khi người dùng đóng hết
      return next.size === 0 ? new Set(['']) : next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-4">
        <div className="relative">
          <Icon
            name="search"
            size={20}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            className="lo-input input-text"
            style={{ paddingLeft: 40 }}
            placeholder="son gel, tdc, mat meo…"
            aria-label="Tìm dịch vụ"
            value={q}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {!props.catalog ? <p className="body m-0 px-4 text-ink-muted">Đang tải danh mục…</p> : null}
      {props.catalog && shown.length === 0 ? (
        <p className="body m-0 px-4 text-ink-muted">Không thấy dịch vụ nào. Dùng nút Khác để nhập tay.</p>
      ) : null}
      <div className="border-t border-line">
        {groups.map((g) => {
          if (g.items.length === 0) return null
          const open = !!q.trim() || isOpen(g.name)
          const picked = g.items.reduce((n, e) => n + (props.counts.get(e.key) ? 1 : 0), 0)
          return (
            <section key={g.name}>
              {q.trim() ? null : (
                <button
                  type="button"
                  className="lo-row lo-row-action"
                  aria-expanded={open}
                  onClick={() => toggleGroup(g.name)}
                >
                  <span className="body-strong">
                    {g.name}
                    {picked ? <span className="body text-ink-muted"> · {picked}</span> : null}
                  </span>
                  <Icon
                    name="chevron-right"
                    size={20}
                    className={cx('text-ink-muted', open && 'rotate-90')}
                  />
                </button>
              )}
              {open
                ? g.items.map((e) => {
                    const n = props.counts.get(e.key) ?? 0
                    return (
                      <div key={e.key} className="lo-row">
                        <button
                          type="button"
                          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left text-ink"
                          aria-pressed={n > 0}
                          disabled={props.disabled}
                          onClick={() => props.onToggle(e)}
                        >
                          <span className={cx('lo-check', n > 0 && 'is-on')} aria-hidden="true">
                            {n > 0 ? <Icon name="check" size={16} /> : null}
                          </span>
                          <span className="lo-row-main flex-1">
                            <span className="body lo-row-title">
                              {e.name}
                              {n > 1 ? ` × ${n} dòng` : ''}
                            </span>
                            {e.sub ? <span className="lo-row-meta caption">{e.sub}</span> : null}
                          </span>
                          <span className="label text-ink-muted">{e.price}</span>
                        </button>
                        {n > 0 ? (
                          <button
                            type="button"
                            className="lo-icon-btn"
                            aria-label={`Thêm một dòng ${e.name}`}
                            onClick={() => props.onAddAgain(e)}
                          >
                            <Icon name="plus" size={20} />
                          </button>
                        ) : null}
                      </div>
                    )
                  })
                : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function ServicePicker(props: {
  open: boolean
  catalog: Catalog | undefined
  onClose: () => void
  onAdd: (picked: Picked[]) => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => {
    if (props.open) {
      setQ('')
      setPicked([])
    }
  }, [props.open])

  const entries = useMemo(() => catalogEntries(props.catalog), [props.catalog])

  const shown = q.trim() ? searchCatalog(entries, q) : entries
  const groups = q.trim()
    ? [{ name: 'Kết quả', items: shown }]
    : [...new Set(entries.map((e) => e.category))].map((name) => ({
        name,
        items: entries.filter((e) => e.category === name),
      }))
  const toggle = (key: string) =>
    setPicked((old) => (old.includes(key) ? old.filter((k) => k !== key) : [...old, key]))

  return (
    <Sheet
      open={props.open}
      title="Chọn dịch vụ"
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          disabled={picked.length === 0}
          onClick={() => {
            props.onAdd(
              picked.map((k) => {
                const e = entries.find((x) => x.key === k)!
                return { kind: e.kind, id: e.id }
              }),
            )
            props.onClose()
          }}
        >
          {picked.length > 0 ? `Thêm ${picked.length} mục` : 'Chọn dịch vụ'}
        </Button>
      }
    >
      <TextField
        label="Tìm dịch vụ"
        placeholder="son gel, tdc, mat meo…"
        value={q}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
      />
      {!props.catalog ? <p className="body m-0 text-ink-muted">Đang tải danh mục…</p> : null}
      {props.catalog && shown.length === 0 ? (
        <p className="body m-0 text-ink-muted">Không thấy dịch vụ nào. Dùng nút Khác để nhập tay.</p>
      ) : null}
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <div key={g.name} className="-mx-4">
            <h3 className="overline m-0 px-4 pb-1 text-ink-muted">{g.name}</h3>
            {g.items.map((e) => {
              const on = picked.includes(e.key)
              return (
                <button
                  key={e.key}
                  type="button"
                  className="lo-row lo-row-action"
                  aria-pressed={on}
                  onClick={() => toggle(e.key)}
                >
                  <span className={cx('lo-check', on && 'is-on')} aria-hidden="true">
                    {on ? <Icon name="check" size={16} /> : null}
                  </span>
                  <span className="lo-row-main flex-1">
                    <span className="body lo-row-title">{e.name}</span>
                    {e.sub ? <span className="lo-row-meta caption">{e.sub}</span> : null}
                  </span>
                  <span className="label text-ink-muted">{e.price}</span>
                </button>
              )
            })}
          </div>
        ),
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------- Khách

export type PickedCustomer = { id: string; name: string; phoneMasked: string | null } | null
type Hit = { id: string; name: string; phoneMasked: string | null }

function useCustomerSearch(q: string) {
  const [debounced, setDebounced] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  return useQuery({
    queryKey: ['customers', 'search', debounced],
    queryFn: () => api<{ items: Hit[] }>(`/api/customers?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    placeholderData: (prev) => prev,
  })
}

export function CustomerPicker(props: {
  open: boolean
  onClose: () => void
  onPick: (c: PickedCustomer) => void
  /** Nhãn nút "không chọn hồ sơ" (đơn: Khách lẻ; lịch: Bỏ liên kết) */
  noneLabel?: string
}) {
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [moved, setMoved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (props.open) {
      setQ('')
      setAdding(false)
      setName('')
      setPhone('')
      setMoved(null)
      setError(null)
    }
  }, [props.open])

  const search = useCustomerSearch(q)
  const phoneCheck = normalizePhone(phone)
  // Q06: nhắc SĐT đã có trước khi tạo khách mới
  const same = useCustomerSearch(adding && phoneCheck.ok && phoneCheck.value ? phoneCheck.value : '')
  const pick = (c: PickedCustomer) => {
    props.onPick(c)
    props.onClose()
  }

  async function create() {
    if (!name.trim()) return setError('Nhập tên khách.')
    if (!phoneCheck.ok) return setError(phoneCheck.error)
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ customer: Hit }>('/api/customers', {
        body: { name: name.trim(), phone: phone.trim() || null },
      })
      pick(res.customer)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Có lỗi xảy ra. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={props.open}
      title={adding ? 'Khách mới' : 'Chọn khách'}
      onClose={props.onClose}
      footer={
        adding ? (
          <>
            <Button block onClick={() => setAdding(false)}>
              Quay lại
            </Button>
            <Button block variant="primary" loading={busy} onClick={() => void create()}>
              Lưu khách
            </Button>
          </>
        ) : (
          <Button block onClick={() => pick(null)}>
            {props.noneLabel ?? 'Khách lẻ'}
          </Button>
        )
      }
    >
      {adding ? (
        <>
          <TextField
            label="Tên khách"
            value={name}
            maxLength={100}
            autoFocus
            hint={
              moved
                ? `Đã chuyển ${moved} sang ô SĐT.`
                : nameLooksMessy(name)
                  ? 'Ô tên chỉ ghi tên khách; giờ, dịch vụ có ô riêng.'
                  : undefined
            }
            onChange={(e) => {
              setName(e.target.value)
              setMoved(null)
            }}
            onBlur={() => {
              // S40: SĐT gõ lẫn vào ô tên → chuyển sang ô SĐT
              const r = movePhoneOutOfName(name, phone)
              if (!r.moved) return
              setName(r.name)
              setPhone(r.phone)
              setMoved(r.moved)
            }}
          />
          <TextField
            label="SĐT"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            maxLength={30}
            error={phone && !phoneCheck.ok ? phoneCheck.error : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          {same.data && same.data.items.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Note tone="warning">SĐT đã có hồ sơ. Chọn khách có sẵn hoặc vẫn lưu khách mới.</Note>
              <div className="-mx-4">
                {same.data.items.map((c) => (
                  <button key={c.id} type="button" className="lo-row lo-row-action" onClick={() => pick(c)}>
                    <span className="lo-row-main">
                      <span className="body">{c.name}</span>
                      <span className="lo-row-meta caption">{c.phoneMasked}</span>
                    </span>
                    <span className="label lo-link">Chọn</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <Note tone="danger">{error}</Note> : null}
        </>
      ) : (
        <>
          <TextField
            label="Tìm tên hoặc SĐT"
            value={q}
            autoFocus
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="-mx-4">
            {(q.trim().length >= 2 ? (search.data?.items ?? []) : []).map((c) => (
              <button key={c.id} type="button" className="lo-row lo-row-action" onClick={() => pick(c)}>
                <span className="lo-row-main">
                  <span className="body">{c.name}</span>
                  <span className="lo-row-meta caption">{c.phoneMasked ?? 'Không có SĐT'}</span>
                </span>
                <Icon name="chevron-right" size={20} className="text-ink-muted" />
              </button>
            ))}
          </div>
          {q.trim().length >= 2 && search.data && search.data.items.length === 0 ? (
            <p className="body m-0 text-ink-muted">Không thấy khách nào.</p>
          ) : null}
          <Button
            icon="plus"
            onClick={() => {
              setAdding(true)
              const digits = normalizePhone(q)
              if (digits.ok && digits.value) setPhone(q.trim())
              else setName(q.trim())
            }}
          >
            Thêm khách mới
          </Button>
        </>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------- Giảm giá (C15, A04)

const KINDS: { value: Exclude<DiscountKind, 'complaint_compensation'>; label: string }[] = [
  { value: 'preset_5', label: '5%' },
  { value: 'preset_10', label: '10%' },
  { value: 'birthday', label: 'Sinh nhật 10%' },
  { value: 'manual', label: 'Khác' },
]

export function DiscountSheet(props: {
  open: boolean
  lines: string[]
  onClose: () => void
  onApply: (d: DiscountInput) => void
}) {
  const [scope, setScope] = useState<string>('order')
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('preset_10')
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [value, setValue] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (props.open) {
      setScope('order')
      setKind('preset_10')
      setMode('percent')
      setValue(null)
      setReason('')
      setError(null)
    }
  }, [props.open])

  function apply() {
    const s: DiscountInput['scope'] = scope === 'order' ? 'order' : Number(scope)
    if (kind !== 'manual') {
      props.onApply({ scope: s, kind })
      props.onClose()
      return
    }
    if (!value || value < 1) return setError(mode === 'percent' ? 'Nhập % giảm.' : 'Nhập số tiền giảm.')
    if (mode === 'percent' && value > 100) return setError('% giảm từ 1 đến 100.')
    if (!reason.trim()) return setError('Cần ghi lý do giảm.')
    props.onApply(
      mode === 'percent'
        ? { scope: s, kind, percent: value, reason: reason.trim() }
        : { scope: s, kind, amount: value, reason: reason.trim() },
    )
    props.onClose()
  }

  return (
    <Sheet
      open={props.open}
      title="Giảm giá"
      onClose={props.onClose}
      footer={
        <Button block variant="primary" onClick={apply}>
          Áp dụng
        </Button>
      }
    >
      <div className="lo-field">
        <label className="lo-field-label label" htmlFor="discount-scope">
          Áp cho
        </label>
        <select
          id="discount-scope"
          className="lo-input input-text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="order">Cả bill</option>
          {props.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: dòng đơn xác định theo vị trí (giảm giá áp theo vị trí dòng)
            <option key={`${i}-${l}`} value={String(i)}>
              Dòng {i + 1}: {l}
            </option>
          ))}
        </select>
      </div>
      <div className="lo-field">
        <span className="lo-field-label label">Mức giảm</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mức giảm">
          {KINDS.map((k) => (
            <Button
              key={k.value}
              role="radio"
              aria-checked={kind === k.value}
              variant={kind === k.value ? 'primary' : 'secondary'}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </Button>
          ))}
        </div>
      </div>
      {kind === 'manual' ? (
        <>
          <SegmentedControl
            ariaLabel="Giảm theo"
            options={[
              { value: 'percent', label: 'Theo %' },
              { value: 'amount', label: 'Số tiền' },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v as 'percent' | 'amount')
              setValue(null)
            }}
          />
          {mode === 'percent' ? (
            <TextField
              label="% giảm"
              inputMode="numeric"
              value={value ?? ''}
              onChange={(e) => {
                const d = e.target.value.replace(/[^\d]/g, '').slice(0, 3)
                setValue(d ? Number(d) : null)
              }}
            />
          ) : (
            <MoneyInput label="Số tiền giảm" value={value} onValueChange={setValue} />
          )}
          <TextField
            label="Lý do (bắt buộc)"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
        </>
      ) : null}
      <Note>Đến 10%: thợ tự áp. Đến 20%: Nhung duyệt. Trên 20%: Linh duyệt. Sinh nhật: tự kiểm tra.</Note>
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}

// ---------------------------------------------------------------- Phụ thu, dịch vụ khác

export function ExtraLineSheet(props: {
  open: boolean
  type: 'surcharge' | 'custom'
  onClose: () => void
  onAdd: (line: { name: string; amount: number }) => void
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (props.open) {
      setName(props.type === 'surcharge' ? 'Phụ thu' : '')
      setAmount(null)
      setError(null)
    }
  }, [props.open, props.type])
  return (
    <Sheet
      open={props.open}
      title={props.type === 'surcharge' ? 'Phụ thu' : 'Dịch vụ khác (nhập tay)'}
      onClose={props.onClose}
      footer={
        <Button
          block
          variant="primary"
          onClick={() => {
            if (!name.trim()) return setError('Nhập tên.')
            if (!amount || amount < 1) return setError('Nhập số tiền.')
            props.onAdd({ name: name.trim(), amount })
            props.onClose()
          }}
        >
          Thêm
        </Button>
      }
    >
      <TextField label="Tên" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      <MoneyInput label="Số tiền" value={amount} onValueChange={setAmount} />
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}
