// Bắt đổi mật khẩu lần đầu (K04, P16). Server cũng chặn mọi API khác khi cờ còn bật.
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChangePasswordForm } from '~/components/ChangePasswordForm'
import { retryNetworkRead } from '~/lib/network'
import { getMeFn } from '~/server/me'

export const Route = createFileRoute('/doi-mat-khau')({
  beforeLoad: async () => {
    const me = await retryNetworkRead(() => getMeFn())
    if (!me) throw redirect({ to: '/dang-nhap' })
    if (!me.mustChangePassword) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Đổi mật khẩu · LINDY OS' }] }),
  component: () => (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="wordmark m-0">LINDY OS</p>
        <h1 className="screen-title mt-2 mb-1">Đổi mật khẩu</h1>
        <p className="body text-ink-muted m-0">Đây là lần đăng nhập đầu. Đặt mật khẩu riêng để tiếp tục.</p>
      </div>
      <ChangePasswordForm onDone={() => window.location.assign('/')} />
    </main>
  ),
})
