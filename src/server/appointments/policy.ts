// Luật quyền lịch hẹn: module §4, sửa theo S02 (bỏ bước chốt), S04 (yêu cầu huỷ), S15 (luật sửa). Dùng để
// ẩn/hiện nút và kiểm trước ở server; trigger appointments_guard trong DB kiểm lại cùng luật (migration 0021).

export type ApptStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: 'Mới đặt',
  confirmed: 'Đã chốt lịch',
  arrived: 'Khách đã đến',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
  no_show: 'Khách không đến',
}

export const FINAL_STATUSES: ApptStatus[] = ['cancelled', 'no_show', 'completed']

export type ApptCan = {
  edit: boolean
  cancel: boolean
  /** Gửi yêu cầu huỷ cho Linh, Nhung, Chin (người không huỷ được, S04) */
  reportCustomerCancel: boolean
  markArrived: boolean
  /** Ghi khách không đến (lý do huỷ "Khách không đến", S03): chỉ khi đã đến giờ hẹn */
  noShow: boolean
  complete: boolean
  createOrder: boolean
  viewAudit: boolean
}

export function appointmentCan(
  perms: string[],
  userId: string,
  a: {
    createdBy: string
    status: ApptStatus
    startAt: Date | string
    customerCancelReportedAt?: unknown
  },
  /** Số đơn liên kết chưa huỷ: lịch có đơn thì tự Hoàn thành khi đơn được xác nhận (§5.4). */
  activeOrders = 0,
  now = Date.now(),
): ApptCan {
  const has = (p: string) => perms.includes(`appointments.${p}`)
  const open = a.status === 'pending' || a.status === 'confirmed'
  const final = FINAL_STATUSES.includes(a.status)
  const started = now >= new Date(a.startAt).getTime()
  // S15: lịch do mình tạo, chưa tạo đơn, chưa đến giờ hẹn
  const ownEditable = a.createdBy === userId && open && activeOrders === 0 && !started
  return {
    edit: !final && (has('manage_all') || (ownEditable && has('update_own_pending'))),
    cancel: has('cancel_all') && ['pending', 'confirmed', 'arrived'].includes(a.status),
    reportCustomerCancel: has('report_customer_cancel') && open && !a.customerCancelReportedAt,
    markArrived: has('mark_arrived') && open,
    noShow: has('manage_all') && open && started,
    complete:
      has('manage_all') && activeOrders === 0 && (a.status === 'arrived' || a.status === 'in_progress'),
    createOrder:
      has('create_order') &&
      perms.includes('order.create_draft') &&
      ['pending', 'confirmed', 'arrived', 'in_progress'].includes(a.status),
    viewAudit: has('audit_read') || a.createdBy === userId,
  }
}
