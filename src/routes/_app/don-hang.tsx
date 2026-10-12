import { createFileRoute } from '@tanstack/react-router'
import { Later } from '~/components/Later'

export const Route = createFileRoute('/_app/don-hang')({
  head: () => ({ meta: [{ title: 'Đơn hàng · LINDY OS' }] }),
  component: () => <Later title="Đơn hàng" text="Có ở đợt sau (Đợt 2)." />,
})
