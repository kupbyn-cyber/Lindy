// UI04 — Tạo đơn mới từ nút "+ Tạo đơn" (G18). Đơn chỉ có trên máy đến khi bấm Lưu hoặc Làm xong (K11).
import { createFileRoute, Link } from '@tanstack/react-router'
import { OrderEditor } from '~/components/don-hang/OrderEditor'
import { Note } from '~/components/ui'
import { useCan } from '~/lib/me'

export const Route = createFileRoute('/_app/don-hang/tao')({
  head: () => ({ meta: [{ title: 'Tạo đơn · LINDY OS' }] }),
  component: CreateOrderPage,
})

function CreateOrderPage() {
  const can = useCan()
  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="px-4">
        <Link to="/don-hang" className="label text-accent">
          ← Đơn hàng
        </Link>
        <h1 className="screen-title mt-1 mb-0">Đơn mới</h1>
      </div>
      {can('order.create_draft') ? (
        <OrderEditor />
      ) : (
        <div className="px-4">
          <Note tone="danger">Không có quyền tạo đơn.</Note>
        </div>
      )}
    </section>
  )
}
