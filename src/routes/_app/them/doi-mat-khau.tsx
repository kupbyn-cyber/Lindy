import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChangePasswordForm } from '~/components/ChangePasswordForm'

export const Route = createFileRoute('/_app/them/doi-mat-khau')({
  head: () => ({ meta: [{ title: 'Đổi mật khẩu · LINDY OS' }] }),
  component: Page,
})

function Page() {
  const navigate = useNavigate()
  return (
    <section className="px-4 pt-2">
      <h1 className="screen-title mt-0 mb-4">Đổi mật khẩu</h1>
      <ChangePasswordForm onDone={() => void navigate({ to: '/them' })} />
    </section>
  )
}
