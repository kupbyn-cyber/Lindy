// Luật quyền đơn hàng (PRD §4; K09–K11). Dùng để ẩn/hiện nút và kiểm trước ở server;
// trigger orders_guard, payments_guard trong DB kiểm lại cùng luật (bước 2.7).
import { type Level, levelAtLeast, levelOf } from '~/lib/order-math'

export type OrderStatus = 'in_progress' | 'awaiting_confirmation' | 'confirmed' | 'cancelled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  in_progress: 'Đang làm',
  awaiting_confirmation: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
}

export type OrderCan = {
  edit: boolean
  done: boolean
  confirm: boolean
  /** Lý do chưa xác nhận được (giảm giá chờ người cấp cao hơn duyệt). */
  confirmBlocked: string | null
  approveDiscount: boolean
  cancel: boolean
  recordPayment: boolean
  voidPayment: boolean
  markReviewed: boolean
  /** Lập phiếu xử lý bảo hành từ đơn gốc (bước 2.18) */
  createTicket: boolean
  /** K15: Linh đánh dấu đã xem phiếu ưu đãi do người khác lập */
  reviewTicket: boolean
  /** K18: phiếu hoàn cho đơn đã xác nhận (Nhung, Linh); còn cần số đã thu − đã hoàn > 0 */
  refund: boolean
}

export function orderCan(
  perms: string[],
  userId: string,
  o: {
    status: OrderStatus
    createdBy: string
    requiredLevel: Level
    approvalValid: boolean
    needsOwnerReview: boolean
    reviewedAt: unknown
  },
): OrderCan {
  const has = (p: string) => perms.includes(p)
  const open = o.status === 'in_progress' || o.status === 'awaiting_confirmation'
  const needsApproval = levelAtLeast(o.requiredLevel, 'manager') && !o.approvalValid
  const mine = levelOf(perms)
  // S41: mọi tài khoản xác nhận được bill của đơn mình xem được (K09); giảm giá chờ duyệt vẫn chặn theo cấp
  const canConfirmRole = (has('order.confirm') || has('order.confirm_bill')) && open
  const confirmBlocked =
    canConfirmRole && needsApproval && !levelAtLeast(mine, o.requiredLevel)
      ? o.requiredLevel === 'owner'
        ? 'Giảm giá trên 20% cần Linh duyệt trước.'
        : 'Giảm giá cần Nhung duyệt trước.'
      : null
  return {
    // K14: đơn Đang làm chỉ người tạo và Nhung, Linh sửa [P39]; K10: sau Làm xong chỉ Nhung, Linh;
    // đơn đã xác nhận sửa có lý do (D04, bước 2.19)
    edit:
      (o.status === 'in_progress' && o.createdBy === userId && has('order.create_draft')) ||
      (o.status !== 'cancelled' && has('order.confirm')),
    done: o.status === 'in_progress' && has('order.create_draft'),
    confirm: canConfirmRole && !confirmBlocked,
    confirmBlocked,
    approveDiscount: open && needsApproval && levelAtLeast(mine, o.requiredLevel),
    // Đơn đã xác nhận: Nhung, Linh huỷ khi đã hoàn hết tiền thu (K18, DB kiểm)
    cancel:
      (open &&
        (has('order.confirm') ||
          (o.status === 'in_progress' && o.createdBy === userId && has('order.create_draft')))) ||
      (o.status === 'confirmed' && has('order.refund')),
    // S43: mọi tài khoản ghi tiền thu đơn mình xem được; huỷ khoản thu vẫn Nhung, Linh
    recordPayment:
      (o.status === 'awaiting_confirmation' || o.status === 'confirmed') &&
      (has('order.confirm') || has('order.record_payment')),
    voidPayment: has('order.confirm'),
    markReviewed: o.needsOwnerReview && !o.reviewedAt && has('review_queue.read'),
    createTicket: o.status === 'confirmed' && has('order.confirm'),
    reviewTicket: has('review_queue.read'),
    refund: o.status === 'confirmed' && has('order.refund'),
  }
}
