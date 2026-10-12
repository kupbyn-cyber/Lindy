// UI01 — Đăng nhập. Chỉ có chữ, không ảnh (design README).
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { Button, Note, TextField } from '~/components/ui'
import { ApiError, api } from '~/lib/api'
import { getMeFn } from '~/server/me'

export const Route = createFileRoute('/dang-nhap')({
  beforeLoad: async () => {
    const me = await getMeFn()
    if (me) throw redirect({ to: me.mustChangePassword ? '/doi-mat-khau' : '/' })
  },
  head: () => ({ meta: [{ title: 'Đăng nhập · LINDY OS' }] }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ mustChangePassword: boolean }>('/api/auth/login', {
        body: { identifier, password },
      })
      await navigate({ to: res.mustChangePassword ? '/doi-mat-khau' : '/', replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra. Thử lại sau.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 pt-[env(safe-area-inset-top)]">
      <div>
        <p className="wordmark m-0">LINDY OS</p>
        <h1 className="screen-title mt-2 mb-0">Đăng nhập</h1>
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <TextField
          label="SĐT hoặc email"
          name="username"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <TextField
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <Note tone="danger">{error}</Note> : null}
        <Button type="submit" variant="primary" block loading={busy} loadingText="Đang đăng nhập…">
          Đăng nhập
        </Button>
      </form>
      <p className="caption text-ink-muted">
        App đã ghim ra màn hình chính có phiên đăng nhập riêng, cần đăng nhập lại một lần trong app.
      </p>
    </main>
  )
}
