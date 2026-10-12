import { createFileRoute } from '@tanstack/react-router'
import { Later } from '~/components/Later'

export const Route = createFileRoute('/_app/khach')({
  head: () => ({ meta: [{ title: 'Khách · LINDY OS' }] }),
  component: () => <Later title="Khách" text="Có ở đợt sau (Đợt 2)." />,
})
