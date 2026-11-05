// UI14 — Cài đặt danh mục (Linh, bước 2.22; PRD §6.8, C09). Thêm, sửa, ngừng bán, xoá dịch vụ và combo; đổi giá có lịch sử.
// Đổi giá không đổi đơn cũ (dòng đơn lưu tên, giá lúc bán). Xoá (S42): món biến mất khỏi menu và màn này, đơn cũ giữ nguyên.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  cx,
  Icon,
  MoneyInput,
  Note,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  StatusChip,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { formatVND } from '~/lib/money'
import type { CatalogService } from '~/lib/order-math'
import { type Catalog, useCatalog } from '~/lib/orders'
import { formatDateTimeShort } from '~/lib/time'

export const Route = createFileRoute('/_app/them/danh-muc')({
  head: () => ({ meta: [{ title: 'Danh mục dịch vụ · LINDY OS' }] }),
  component: CatalogPage,
})

type Combo = Catalog['combos'][number]

const priceText = (s: CatalogService) =>
  `${s.priceMin === s.priceMax ? formatVND(s.priceMin) : `${formatVND(s.priceMin)}–${formatVND(s.priceMax)}`}${s.unit === 'lần' ? '' : `/${s.unit}`}`

function CatalogPage() {
  const can = useCan()
  const catalog = useCatalog()
  const [editService, setEditService] = useState<CatalogService | 'new' | null>(null)
  const [editCombo, setEditCombo] = useState<Combo | 'new' | null>(null)
  const services = useMemo(() => (catalog.data?.services ?? []).filter((s) => !s.isDeleted), [catalog.data])
  const combos = (catalog.data?.combos ?? []).filter((c) => !c.isDeleted)
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services])

  if (!can('catalog.manage')) {
    return (
      <div className="px-4 pt-2">
        <Note tone="danger">Chỉ chủ quán sửa được danh mục.</Note>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-2 px-4">
        <ScreenHeader className="-mx-4" title="Danh mục dịch vụ" back={{ to: '/them', label: 'Về Thêm' }} />
        <div className="grid grid-cols-2 gap-2">
          <Button icon="plus" onClick={() => setEditService('new')}>
            Dịch vụ
          </Button>
          <Button icon="plus" onClick={() => setEditCombo('new')}>
            Combo
          </Button>
        </div>
        <Note>Đổi giá, xoá món chỉ áp cho đơn mới; đơn cũ giữ tên, giá lúc bán.</Note>
      </div>
      {catalog.isError ? <Note tone="danger">{errorText(catalog.error)}</Note> : null}
      {categories.map((cat) => (
        <div key={cat}>
          <h2 className="overline m-0 px-4 pb-1 text-ink-muted">{cat}</h2>
          <div className="border-t border-line">
            {services
              .filter((s) => s.category === cat)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="lo-row lo-row-action"
                  onClick={() => setEditService(s)}
                >
                  <span className="lo-row-main">
                    <span className={cx('body lo-row-title', !s.isActive && 'text-ink-muted line-through')}>
                      {s.name}
                    </span>
                    <span className="lo-row-meta caption">
                      {s.code}
                      {s.hasHardening ? ' · cứng móng (BH 7 ngày)' : ''}
                      {s.isRetail ? ' · hàng bán: không giảm giá, không chia %' : ''}
                    </span>
                  </span>
                  <span className="lo-row-side">
                    <span className="label">{priceText(s)}</span>
                    {!s.isActive ? <StatusChip>Ngừng bán</StatusChip> : null}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
      <div>
        <h2 className="overline m-0 px-4 pb-1 text-ink-muted">Combo</h2>
        <div className="border-t border-line">
          {combos.map((c) => (
            <button key={c.id} type="button" className="lo-row lo-row-action" onClick={() => setEditCombo(c)}>
              <span className="lo-row-main">
                <span className={cx('body lo-row-title', !c.isActive && 'text-ink-muted line-through')}>
                  {c.name}
                </span>
                <span className="lo-row-meta caption">{c.itemNames.join(' + ')}</span>
              </span>
              <span className="lo-row-side">
                <span className="label">{formatVND(c.price)}</span>
                {!c.isActive ? <StatusChip>Ngừng bán</StatusChip> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      <ServiceSheet
        key={`service-${editService === 'new' ? 'new' : (editService?.id ?? 'none')}`}
        value={editService}
        categories={categories}
        onClose={() => setEditService(null)}
      />
      <ComboSheet
        key={`combo-${editCombo === 'new' ? 'new' : (editCombo?.id ?? 'none')}`}
        value={editCombo}
        services={services}
        onClose={() => setEditCombo(null)}
      />
    </section>
  )
}

function History(props: { id: string }) {
  const q = useQuery({
    queryKey: ['catalog', 'history', props.id],
    queryFn: () =>
      api<{
        items: {
          oldMin: number | null
          oldMax: number | null
          newMin: number
          newMax: number
          changedAt: string
          changedByName: string | null
        }[]
      }>(`/api/catalog/history?id=${props.id}`),
  })
  const items = q.data?.items ?? []
  if (items.length === 0) return null
  const p = (a: number | null, b: number | null) =>
    a == null ? '—' : a === b ? formatVND(a) : `${formatVND(a)}–${formatVND(b ?? a)}`
  return (
    <div className="flex flex-col gap-1">
      <span className="label">Lịch sử giá</span>
      {items.map((h) => (
        <span key={h.changedAt} className="caption text-ink-muted">
          {formatDateTimeShort(h.changedAt)} · {h.changedByName ?? ''}: {p(h.oldMin, h.oldMax)} →{' '}
          {p(h.newMin, h.newMax)}
        </span>
      ))}
    </div>
  )
}

function ServiceSheet(props: {
  value: CatalogService | 'new' | null
  categories: string[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const cur = props.value === 'new' ? null : props.value
  const [category, setCategory] = useState(cur?.category ?? props.categories[0] ?? '')
  const [name, setName] = useState(cur?.name ?? '')
  const [mode, setMode] = useState<'list' | 'custom'>(cur?.priceMode ?? 'list')
  const [unit, setUnit] = useState(cur?.unit ?? 'lần')
  const [min, setMin] = useState<number | null>(cur?.priceMin ?? null)
  const [max, setMax] = useState<number | null>(cur?.priceMax ?? null)
  const [hard, setHard] = useState(cur?.hasHardening ?? false)
  const [active, setActive] = useState(cur?.isActive ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    if (!category.trim() || !name.trim()) return setError('Nhập nhóm và tên dịch vụ.')
    if (!min) return setError('Nhập giá.')
    if (mode === 'custom' && (!max || max < min))
      return setError('Giá cao nhất phải lớn hơn hoặc bằng giá thấp nhất.')
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ catalog: Catalog }>('/api/catalog/services', {
        body: {
          id: cur?.id ?? null,
          category: category.trim(),
          name: name.trim(),
          priceMode: mode,
          unit,
          priceMin: min,
          priceMax: mode === 'custom' ? max : min,
          hasHardening: hard,
          isActive: active,
        },
      })
      qc.setQueryData(['catalog'], res.catalog)
      await qc.invalidateQueries({ queryKey: ['catalog', 'history'] })
      toast(cur ? 'Đã lưu dịch vụ.' : 'Đã thêm dịch vụ.')
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={!!props.value && !deleting}
        title={cur ? `Sửa ${cur.name}` : 'Dịch vụ mới'}
        onClose={props.onClose}
        footer={
          <Button block variant="primary" loading={busy} onClick={() => void save()}>
            Lưu
          </Button>
        }
      >
        <TextField
          label="Nhóm"
          list="catalog-categories"
          value={category}
          maxLength={40}
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id="catalog-categories">
          {props.categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <TextField
          label="Tên dịch vụ"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="lo-field">
          <span className="lo-field-label label">Kiểu giá</span>
          <SegmentedControl
            ariaLabel="Kiểu giá"
            className="w-full"
            options={[
              { value: 'list', label: 'Giá cố định' },
              { value: 'custom', label: 'Giá khoảng' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'list' | 'custom')}
          />
        </div>
        <div className="lo-field">
          <span className="lo-field-label label">Tính theo</span>
          <SegmentedControl
            ariaLabel="Đơn vị"
            className="w-full"
            options={['lần', 'ngón', 'hình', 'cái']}
            value={unit}
            onChange={setUnit}
          />
        </div>
        <div className={cx('grid gap-2', mode === 'custom' ? 'grid-cols-2' : 'grid-cols-1')}>
          <MoneyInput
            label={mode === 'custom' ? 'Giá thấp nhất' : 'Giá'}
            value={min}
            onValueChange={setMin}
          />
          {mode === 'custom' ? <MoneyInput label="Giá cao nhất" value={max} onValueChange={setMax} /> : null}
        </div>
        <Toggle on={hard} onChange={setHard} label="Có cứng móng (bảo hành 7 ngày)" />
        <Toggle on={active} onChange={setActive} label="Đang bán" />
        {cur ? <History id={cur.id} /> : null}
        {error ? <Note tone="danger">{error}</Note> : null}
        {cur ? (
          <Button block variant="danger" onClick={() => setDeleting(true)}>
            Xoá dịch vụ
          </Button>
        ) : null}
      </Sheet>
      <DeleteDialog
        kind="service"
        item={deleting ? cur : null}
        onCancel={() => setDeleting(false)}
        onDeleted={props.onClose}
      />
    </>
  )
}

function ComboSheet(props: { value: Combo | 'new' | null; services: CatalogService[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const cur = props.value === 'new' ? null : props.value
  const [name, setName] = useState(cur?.name ?? '')
  const [group, setGroup] = useState(cur?.groupName ?? 'Móng thật')
  const [price, setPrice] = useState<number | null>(cur?.price ?? null)
  const [active, setActive] = useState(cur?.isActive ?? true)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    if (!name.trim() || !group.trim()) return setError('Nhập tên và nhóm combo.')
    if (!price) return setError('Nhập giá combo.')
    if (!cur && picked.length < 2) return setError('Chọn ít nhất 2 dịch vụ trong combo.')
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ catalog: Catalog }>('/api/catalog/combos', {
        body: {
          id: cur?.id ?? null,
          name: name.trim(),
          groupName: group.trim(),
          price,
          isActive: active,
          ...(cur ? {} : { serviceIds: picked }),
        },
      })
      qc.setQueryData(['catalog'], res.catalog)
      await qc.invalidateQueries({ queryKey: ['catalog', 'history'] })
      toast(cur ? 'Đã lưu combo.' : 'Đã thêm combo.')
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={!!props.value && !deleting}
        title={cur ? `Sửa ${cur.name}` : 'Combo mới'}
        onClose={props.onClose}
        footer={
          <Button block variant="primary" loading={busy} onClick={() => void save()}>
            Lưu
          </Button>
        }
      >
        <TextField label="Tên combo" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <TextField label="Nhóm" value={group} maxLength={40} onChange={(e) => setGroup(e.target.value)} />
        <MoneyInput label="Giá combo (bán đúng giá niêm yết)" value={price} onValueChange={setPrice} />
        <Toggle on={active} onChange={setActive} label="Đang bán" />
        {cur ? (
          <p className="caption m-0 text-ink-muted">
            Gồm: {cur.itemNames.join(' + ')} (không đổi được thành phần).
          </p>
        ) : (
          <div className="-mx-4">
            <span className="label px-4">Dịch vụ trong combo</span>
            {props.services
              .filter((s) => s.isActive)
              .map((s) => {
                const on = picked.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="lo-row lo-row-action"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  >
                    <span className={cx('lo-check', on && 'is-on')} aria-hidden="true">
                      {on ? <Icon name="check" size={16} /> : null}
                    </span>
                    <span className="body flex-1">{s.name}</span>
                    <span className="label text-ink-muted">{priceText(s)}</span>
                  </button>
                )
              })}
          </div>
        )}
        {cur ? <History id={cur.id} /> : null}
        {error ? <Note tone="danger">{error}</Note> : null}
        {cur ? (
          <Button block variant="danger" onClick={() => setDeleting(true)}>
            Xoá combo
          </Button>
        ) : null}
      </Sheet>
      <DeleteDialog
        kind="combo"
        item={deleting ? cur : null}
        onCancel={() => setDeleting(false)}
        onDeleted={props.onClose}
      />
    </>
  )
}

// S42: hỏi lại trước khi xoá; lỗi (ví dụ dịch vụ còn trong combo) hiện ngay trong hộp.
function DeleteDialog(props: {
  kind: 'service' | 'combo'
  item: { id: string; name: string } | null
  onCancel: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!props.item) return
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ catalog: Catalog }>('/api/catalog/delete', {
        body: { kind: props.kind, id: props.item.id },
      })
      qc.setQueryData(['catalog'], res.catalog)
      toast(`Đã xoá ${props.item.name}.`)
      props.onDeleted()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={!!props.item}
      title={`Xoá ${props.kind === 'service' ? 'dịch vụ' : 'combo'} ${props.item?.name ?? ''}?`}
      confirmLabel="Xoá"
      danger
      busy={busy}
      onConfirm={() => void run()}
      onCancel={() => {
        setError(null)
        props.onCancel()
      }}
    >
      <p className="caption m-0 text-ink-muted">
        Món biến mất khỏi menu tạo đơn và danh mục, không lấy lại được. Đơn cũ vẫn giữ tên, giá lúc bán.
      </p>
      {error ? <Note tone="danger">{error}</Note> : null}
    </ConfirmDialog>
  )
}

function Toggle(props: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      className="lo-row lo-row-action -mx-4 w-auto"
      onClick={() => props.onChange(!props.on)}
    >
      <span className="body">{props.label}</span>
      <span className={cx('lo-check', props.on && 'is-on')} aria-hidden="true">
        {props.on ? <Icon name="check" size={16} /> : null}
      </span>
    </button>
  )
}
