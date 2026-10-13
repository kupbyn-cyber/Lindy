// Thành phần giao diện viết lại từ design/design-system/components (bundle.js) cho React 19 + SSR.
import {
  type ButtonHTMLAttributes,
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { formatVND } from '~/lib/money'
import { Icon, type IconName } from './Icon'

export { Icon, type IconName }

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ---------------------------------------------------------------- AppBar

export function AppBar(props: { name?: string; branch?: string; right?: ReactNode; className?: string }) {
  return (
    <header className={cx('lo-appbar', props.className)}>
      <span className="lo-appbar-brand wordmark">{props.name ?? 'LINDY OS'}</span>
      {props.branch ? <span className="lo-appbar-branch caption">{props.branch}</span> : null}
      {props.right ? (
        <span className={cx('lo-appbar-right', !props.branch && 'ml-auto')}>{props.right}</span>
      ) : null}
    </header>
  )
}

// ---------------------------------------------------------------- Button

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  block?: boolean
  loading?: boolean
  loadingText?: string
  icon?: IconName
}

export function Button({
  variant = 'secondary',
  block,
  loading,
  loadingText,
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('lo-btn', 'button-label', `lo-btn-${variant}`, block && 'lo-btn-block', className)}
      disabled={rest.disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {icon ? <Icon name={icon} size={20} /> : null}
      <span>{loading ? (loadingText ?? 'Đang lưu…') : children}</span>
    </button>
  )
}

export function IconButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number; children: ReactNode },
) {
  const { label, badge, children, className, ...rest } = props
  return (
    <button
      type="button"
      aria-label={badge ? `${label}, ${badge} chưa đọc` : label}
      {...rest}
      className={cx('lo-icon-btn', className)}
    >
      {children}
      {badge ? (
        <span className="lo-nav-badge caption" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  )
}

// ---------------------------------------------------------------- SegmentedControl

export type SegmentOption = { value: string; label: string }

export function SegmentedControl(props: {
  options: (string | SegmentOption)[]
  value: string
  onChange?: (v: string) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cx('lo-seg', props.className)} role="tablist" aria-label={props.ariaLabel}>
      {props.options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        const on = v === props.value
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={on}
            className={cx('lo-seg-item', 'label', on && 'is-active')}
            onClick={() => props.onChange?.(v)}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Money

export function Money(props: {
  value: number
  size?: 'xl' | 'md' | 'sm'
  tone?: 'muted' | 'negative' | 'positive'
  sign?: boolean
  className?: string
}) {
  const size = props.size ?? 'md'
  const style = { xl: 'display-money', md: 'amount', sm: 'label' }[size]
  return (
    <span
      className={cx(
        'lo-money',
        style,
        `lo-money-${size}`,
        props.tone && `lo-tone-${props.tone}`,
        props.className,
      )}
    >
      {formatVND(props.value, { sign: props.sign })}
    </span>
  )
}

// ---------------------------------------------------------------- SummaryCard

/** Thẻ số liệu chính (design SummaryCard): một nhãn, một số tiền lớn, vài dòng giải thích. Mỗi màn một thẻ. */
export function SummaryCard(props: {
  label: string
  value: number
  rows?: { label: string; value: number; tone?: 'muted' | 'negative' | 'positive' }[]
  footnote?: ReactNode
  className?: string
}) {
  return (
    <section className={cx('lo-card', 'flex flex-col gap-1', props.className)}>
      <span className="overline text-ink-muted">{props.label}</span>
      <Money value={props.value} size="xl" />
      {props.rows?.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-2">
          <span className="body text-ink-muted">{r.label}</span>
          <Money value={r.value} tone={r.tone} />
        </div>
      ))}
      {props.footnote ? (
        <p className="caption m-0 border-t border-line pt-1 text-ink-muted">{props.footnote}</p>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------- StatusChip

export type ChipTone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

export function StatusChip(props: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('lo-chip', 'caption', `lo-chip-${props.tone ?? 'neutral'}`, props.className)}>
      {props.children}
    </span>
  )
}

// ---------------------------------------------------------------- TextField

type FieldBase = { label: string; hint?: string; error?: string; className?: string }

export function TextField(props: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const { label, hint, error, className, id, ...rest } = props
  const autoId = useId()
  const inputId = id ?? autoId
  const msgId = `${inputId}-msg`
  return (
    <div className={cx('lo-field', error && 'has-error', className)}>
      <label className="lo-field-label label" htmlFor={inputId}>
        {label}
      </label>
      <div className="lo-field-box">
        <input
          id={inputId}
          className="lo-input input-text"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          {...rest}
        />
      </div>
      {error || hint ? (
        <p id={msgId} className={cx('lo-field-msg', 'caption', error && 'is-error')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}

export function TextArea(props: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { label, hint, error, className, id, ...rest } = props
  const autoId = useId()
  const inputId = id ?? autoId
  const msgId = `${inputId}-msg`
  return (
    <div className={cx('lo-field', error && 'has-error', className)}>
      <label className="lo-field-label label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        id={inputId}
        className="lo-input input-text"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        {...rest}
      />
      {error || hint ? (
        <p id={msgId} className={cx('lo-field-msg', 'caption', error && 'is-error')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}

/** Ô nhập tiền: bàn phím số, hiện nhóm nghìn "70.000", hậu tố "đ"; giá trị là số nguyên VND. */
export function MoneyInput(
  props: FieldBase & {
    value: number | null
    onValueChange: (v: number | null) => void
    disabled?: boolean
    placeholder?: string
  },
) {
  const { label, hint, error, className } = props
  const inputId = useId()
  const msgId = `${inputId}-msg`
  const text = props.value == null ? '' : String(props.value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (
    <div className={cx('lo-field', 'lo-field-money', error && 'has-error', className)}>
      <label className="lo-field-label label" htmlFor={inputId}>
        {label}
      </label>
      <div className="lo-field-box">
        <input
          id={inputId}
          className="lo-input input-text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={props.disabled}
          placeholder={props.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          onChange={(e) => {
            const d = e.target.value.replace(/[^\d]/g, '').slice(0, 9)
            props.onValueChange(d ? Number.parseInt(d, 10) : null)
          }}
        />
        <span className="lo-field-suffix body">đ</span>
      </div>
      {error || hint ? (
        <p id={msgId} className={cx('lo-field-msg', 'caption', error && 'is-error')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- Fab

/** Nút tròn nổi "+ Tạo đơn" (G18). Mỗi màn hình một Fab; ẩn ở màn tạo/sửa đơn. */
export function Fab(props: { label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="lo-fab lo-fab-fixed"
      aria-label={props.label ?? 'Tạo đơn'}
      onClick={props.onClick}
    >
      <Icon name="plus" size={28} />
    </button>
  )
}

// ---------------------------------------------------------------- Note (dòng thông tin/cảnh báo không chặn)

export function Note(props: {
  tone?: 'info' | 'warning' | 'danger'
  children: ReactNode
  className?: string
}) {
  const tone = props.tone ?? 'info'
  return (
    <div
      className={cx('lo-note', 'caption', tone !== 'info' && `lo-note-${tone}`, props.className)}
      role="status"
    >
      {tone !== 'info' ? <Icon name="alert" size={16} /> : null}
      <span>{props.children}</span>
    </div>
  )
}

// ---------------------------------------------------------------- Sheet, ConfirmDialog

export function Sheet(props: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [props.open, props.onClose])
  if (!props.open) return null
  return (
    <>
      <div className="lo-backdrop" onClick={props.onClose} aria-hidden="true" />
      <div className="lo-sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="lo-sheet-head">
          <h2 className="body-strong m-0 flex-1">{props.title}</h2>
          <Button variant="quiet" onClick={props.onClose}>
            Đóng
          </Button>
        </div>
        <div className="lo-sheet-body">{props.children}</div>
        {props.footer ? <div className="lo-sheet-foot">{props.footer}</div> : null}
      </div>
    </>
  )
}

export function ConfirmDialog(props: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!props.open) return null
  return (
    <>
      <div className="lo-backdrop" onClick={props.onCancel} aria-hidden="true" />
      <div className="lo-dialog" role="alertdialog" aria-modal="true" aria-label={props.title}>
        <h2 className="body-strong m-0">{props.title}</h2>
        {props.children}
        <div className="flex gap-2">
          <Button block onClick={props.onCancel}>
            Thôi
          </Button>
          <Button
            block
            variant={props.danger ? 'danger' : 'primary'}
            loading={props.busy}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Toast

type ToastItem = { id: number; tone: 'success' | 'error'; text: string }
const ToastCtx = createContext<(text: string, tone?: 'success' | 'error') => void>(() => {})

export function ToastProvider(props: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null)
  const seq = useRef(0)
  const show = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    seq.current += 1
    setItem({ id: seq.current, tone, text })
  }, [])
  useEffect(() => {
    if (!item) return
    const t = setTimeout(() => setItem(null), item.tone === 'error' ? 5000 : 2500)
    return () => clearTimeout(t)
  }, [item])
  return (
    <ToastCtx.Provider value={show}>
      {props.children}
      {item ? (
        <div className="lo-toast-wrap">
          <div
            key={item.id}
            className={cx('lo-toast', 'body', `lo-toast-${item.tone}`)}
            role={item.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon name={item.tone === 'error' ? 'alert' : 'check'} size={20} />
            <span>{item.text}</span>
          </div>
        </div>
      ) : null}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
