// Thêm → Tài khoản (chỉ Chủ): tạo tài khoản, đặt lại mật khẩu, đổi vai trò, khoá, thu quyền.
// Mật khẩu tạm hiện một lần để đưa cho nhân viên; người đó phải đổi khi đăng nhập lần đầu (K04).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { Button, ConfirmDialog, Note, Sheet, StatusChip, TextField, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { formatDateTimeShort } from '~/lib/time'
import type { AccountRow } from '~/server/admin/accounts'

export const Route = createFileRoute('/_app/them/tai-khoan')({
  head: () => ({ meta: [{ title: 'Tài khoản · LINDY OS' }] }),
  component: AccountsPage,
})

const ROLES = [
  { code: 'owner', label: 'Chủ' },
  { code: 'manager', label: 'Quản lý' },
  { code: 'staff_booking_plus', label: 'Thợ (quyền lịch mở rộng)' },
  { code: 'staff', label: 'Thợ' },
]

type Action = 'reset-password' | 'lock' | 'unlock' | 'revoke'
const ACTION_TEXT: Record<
  Action,
  { title: string; button: string; done: string; danger?: boolean; hint: string }
> = {
  'reset-password': {
    title: 'Đặt lại mật khẩu?',
    button: 'Đặt lại mật khẩu',
    done: 'Đã đặt lại mật khẩu.',
    hint: 'Người này bị đăng xuất khỏi mọi máy và phải đổi mật khẩu khi đăng nhập lại.',
  },
  lock: {
    title: 'Khoá tài khoản?',
    button: 'Khoá tài khoản',
    done: 'Đã khoá tài khoản.',
    danger: true,
    hint: 'Người này bị đăng xuất ngay, không đăng nhập được, ngừng nhận thông báo.',
  },
  unlock: {
    title: 'Mở khoá tài khoản?',
    button: 'Mở khoá',
    done: 'Đã mở khoá.',
    hint: 'Người này đăng nhập lại được.',
  },
  revoke: {
    title: 'Thu quyền ở cơ sở này?',
    button: 'Thu quyền',
    done: 'Đã thu quyền.',
    danger: true,
    hint: 'Người này không còn xem được lịch, dữ liệu của cơ sở. Lịch sử thao tác vẫn giữ.',
  },
}

function AccountsPage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<{ items: AccountRow[] }>('/api/accounts'),
    enabled: can('users.manage'),
  })
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<AccountRow | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null)

  if (!can('users.manage')) return <Note tone="warning">Chỉ chủ quán quản lý được tài khoản.</Note>

  const refresh = () => qc.invalidateQueries({ queryKey: ['accounts'] })

  async function run(a: Action) {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ tempPassword?: string }>(`/api/accounts/${selected.id}/${a}`, {
        method: 'POST',
      })
      toast(ACTION_TEXT[a].done)
      if (res.tempPassword) setTemp({ name: selected.displayName, password: res.tempPassword })
      setAction(null)
      setSelected(null)
      await refresh()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveRole() {
    if (!selected || !role) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/accounts/${selected.id}/role`, { body: { role } })
      toast('Đã đổi vai trò. Người này cần đăng nhập lại.')
      setSelected(null)
      await refresh()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 pt-2">
      <div className="flex items-center justify-between gap-2 px-4">
        <h1 className="screen-title m-0">Tài khoản</h1>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
          Thêm
        </Button>
      </div>
      {list.isError ? <p className="body px-4 text-danger">{errorText(list.error)}</p> : null}
      <div className="border-t border-line">
        {list.data?.items.map((u) => (
          <button
            key={u.id}
            type="button"
            className="lo-row lo-row-action"
            disabled={u.isMe}
            onClick={() => {
              setSelected(u)
              setRole(u.roleCode ?? '')
              setError(null)
            }}
          >
            <span className="lo-row-main">
              <span className="lo-row-title body-strong">
                {u.displayName}
                {u.isMe ? ' (bạn)' : ''}
              </span>
              <span className="lo-row-meta caption">
                {[
                  u.phone ?? u.email,
                  u.lastLoginAt ? `vào gần nhất ${formatDateTimeShort(u.lastLoginAt)}` : 'chưa đăng nhập',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="lo-row-side">
              {u.roleName ? (
                <StatusChip>{u.roleName}</StatusChip>
              ) : (
                <StatusChip tone="danger">Đã thu quyền</StatusChip>
              )}
              {!u.isActive ? <StatusChip tone="danger">Đã khoá</StatusChip> : null}
              {u.isActive && u.mustChangePassword ? (
                <StatusChip tone="warning">Chưa đổi mật khẩu</StatusChip>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <CreateSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name, password) => {
          setCreating(false)
          setTemp({ name, password })
          void refresh()
        }}
      />

      <Sheet
        open={!!selected && !action}
        title={selected?.displayName ?? ''}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="flex flex-col gap-3">
            <div className="lo-field">
              <label className="lo-field-label label" htmlFor="role">
                Vai trò ở cơ sở này
              </label>
              <select
                id="role"
                className="lo-input input-text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="" disabled>
                  Chọn vai trò
                </option>
                {ROLES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              block
              loading={busy}
              disabled={!role || role === selected.roleCode}
              onClick={() => void saveRole()}
            >
              Lưu vai trò
            </Button>
            <Button block onClick={() => setAction('reset-password')}>
              Đặt lại mật khẩu
            </Button>
            {selected.isActive ? (
              <Button block variant="danger" onClick={() => setAction('lock')}>
                Khoá tài khoản
              </Button>
            ) : (
              <Button block onClick={() => setAction('unlock')}>
                Mở khoá
              </Button>
            )}
            {selected.roleCode ? (
              <Button block variant="danger" onClick={() => setAction('revoke')}>
                Thu quyền ở cơ sở này
              </Button>
            ) : null}
            {error ? <Note tone="danger">{error}</Note> : null}
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={!!action}
        title={action ? ACTION_TEXT[action].title : ''}
        confirmLabel={action ? ACTION_TEXT[action].button : ''}
        danger={action ? ACTION_TEXT[action].danger : false}
        busy={busy}
        onConfirm={() => action && void run(action)}
        onCancel={() => setAction(null)}
      >
        <p className="body m-0">{selected?.displayName}</p>
        <p className="caption m-0 text-ink-muted">{action ? ACTION_TEXT[action].hint : ''}</p>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!temp}
        title={`Mật khẩu tạm của ${temp?.name ?? ''}`}
        confirmLabel="Đã ghi lại"
        onConfirm={() => setTemp(null)}
        onCancel={() => setTemp(null)}
      >
        <p className="amount m-0 select-all break-all rounded-[var(--radius-md)] bg-surface-sunken p-3 text-center">
          {temp?.password}
        </p>
        <p className="caption m-0 text-ink-muted">
          Chỉ hiện một lần. Đưa trực tiếp cho người dùng; họ phải đổi mật khẩu khi đăng nhập lần đầu.
        </p>
      </ConfirmDialog>
    </section>
  )
}

function CreateSheet(props: {
  open: boolean
  onClose: () => void
  onCreated: (name: string, password: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [error, setError] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: () =>
      api<{ tempPassword: string }>('/api/accounts', {
        body: { name, phone: phone || null, email: email || null, role },
      }),
    onSuccess: (res) => {
      props.onCreated(name.trim(), res.tempPassword)
      setName('')
      setPhone('')
      setEmail('')
      setRole('staff')
    },
    onError: (e) => setError(errorText(e)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    create.mutate()
  }

  return (
    <Sheet
      open={props.open}
      title="Thêm tài khoản"
      onClose={props.onClose}
      footer={
        <Button block variant="primary" loading={create.isPending} onClick={submit}>
          Tạo tài khoản
        </Button>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <TextField label="Tên" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="SĐT đăng nhập"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextField
          label="Email (không bắt buộc nếu có SĐT)"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="lo-field">
          <label className="lo-field-label label" htmlFor="new-role">
            Vai trò
          </label>
          <select
            id="new-role"
            className="lo-input input-text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {error ? <Note tone="danger">{error}</Note> : null}
      </form>
    </Sheet>
  )
}
