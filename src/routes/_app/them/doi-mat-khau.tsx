import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChangePasswordForm } from '~/components/ChangePasswordForm'
import { ScreenHeader } from '~/components/ui'

export const Route = createFileRoute('/_app/them/doi-mat-khau')({
  head: () => ({ meta: [{ title: 'Đổi mật khẩu · LINDY OS' }] }),
  component: Page,
})

function Page() {
  const navigate = useNavigate()
  return (
    <section className="px-4 pt-2">
      <ScreenHeader className="-mx-4 mb-3" title="Đổi mật khẩu" back={{ to: '/them', label: 'Về Thêm' }} />
      <ChangePasswordForm onDone={() => void navigate({ to: '/them' })} />
    </section>
  )
}
