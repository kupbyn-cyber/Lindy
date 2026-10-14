// UI04/UI05 — Chi tiết đơn. Đơn Đang làm mở thẳng màn sửa cho người được sửa (thợ làm tiếp, K11);
// đơn Chờ xác nhận: Nhung, Linh xem, sửa (K10), xác nhận, ghi tiền thu.
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { OrderEditor } from '~/components/don-hang/OrderEditor'
import { OrderView } from '~/components/don-hang/OrderView'
import { Note } from '~/components/ui'
import { ApiError, errorText } from '~/lib/api'
import { useOrder } from '~/lib/orders'

export const Route = createFileRoute('/_app/don-hang/$id')({
  head: () => ({ meta: [{ title: 'Đơn hàng · LINDY OS' }] }),
  component: OrderPage,
})

function OrderPage() {
  const { id } = Route.useParams()
  const q = useOrder(id)
  // auto: đơn Đang làm mở màn sửa; view/edit: người dùng chọn
  const [mode, setMode] = useState<'auto' | 'view' | 'edit'>('auto')
  // Vừa bấm Làm xong ở màn sửa → mở Chụp ảnh thành phẩm (S18)
  const [justDone, setJustDone] = useState(false)

  if (q.isLoading) return <p className="body px-4 text-ink-muted">Đang tải…</p>
  if (q.isError || !q.data) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-2">
        <Note tone="danger">
          {q.error instanceof ApiError && q.error.status === 404 ? 'Không tìm thấy đơn.' : errorText(q.error)}
        </Note>
        <Link to="/don-hang" className="lo-btn lo-btn-secondary button-label">
          Về danh sách đơn
        </Link>
      </div>
    )
  }
  const d = q.data
  const showEditor = d.can.edit && (mode === 'edit' || (mode === 'auto' && d.status === 'in_progress'))

  return (
    <section className="flex flex-col gap-3 pt-1">
      <div className="px-4">
        <Link to="/don-hang" search={{ d: d.serviceDate }} className="label text-accent">
          ← Đơn hàng
        </Link>
        <h1 className="screen-title mt-1 mb-0">
          Đơn {d.codeLabel}
          {d.customer ? ` · ${d.customer.name}` : ''}
        </h1>
      </div>
      {showEditor ? (
        <OrderEditor
          key={`${d.id}-${mode}`}
          order={d}
          onSaved={(next) => {
            if (d.status === 'in_progress' && next.status === 'awaiting_confirmation') setJustDone(true)
            setMode(next.status === 'in_progress' ? 'auto' : 'view')
          }}
          onCancel={() => setMode('view')}
        />
      ) : (
        <OrderView
          key={justDone ? 'done' : 'view'}
          order={d}
          openPhoto={justDone}
          onEdit={() => {
            setJustDone(false)
            setMode('edit')
          }}
        />
      )}
    </section>
  )
}
