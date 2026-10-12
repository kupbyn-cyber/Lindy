import { type FormEvent, useState } from 'react'
import { Button, Note, TextField, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'

export function ChangePasswordForm(props: { onDone: () => void }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (next !== again) {
      setError('Hai lần nhập mật khẩu mới không khớp.')
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/password', { body: { currentPassword: current, newPassword: next } })
      toast('Đã đổi mật khẩu.')
      props.onDone()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
      <TextField
        label="Mật khẩu hiện tại"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <TextField
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        hint="Ít nhất 8 ký tự, không dùng mật khẩu dễ đoán."
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <TextField
        label="Nhập lại mật khẩu mới"
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
      />
      {error ? <Note tone="danger">{error}</Note> : null}
      <Button type="submit" variant="primary" block loading={busy}>
        Đổi mật khẩu
      </Button>
      <p className="caption text-ink-muted m-0">
        Đổi xong, các máy khác đang đăng nhập tài khoản này sẽ bị đăng xuất.
      </p>
    </form>
  )
}
