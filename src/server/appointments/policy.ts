// Luật quyền lịch hẹn đúng khối "Quy tắc thực thi" module §4. Dùng để ẩn/hiện nút và kiểm trước ở server;
// trigger appointments_guard trong DB kiểm lại cùng luật (bước 1.3).

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
  confirm: boolean
  cancel: boolean
  reportCustomerCancel: boolean
  markArrived: boolean
  noShow: boolean
  complete: boolean
  createOrder: boolean
  viewAudit: boolean
}

export function appointmentCan(
  perms: string[],
  userId: string,
  a: { createdBy: string; status: ApptStatus; customerCancelReportedAt?: unknown },
  /** Số đơn liên kết chưa huỷ: lịch có đơn thì tự Hoàn thành khi đơn được xác nhận (§5.4). */
  activeOrders = 0,
): ApptCan {
  const has = (p: string) => perms.includes(`appointments.${p}`)
  const ownPending = a.createdBy === userId && a.status === 'pending'
  const open = a.status === 'pending' || a.status === 'confirmed'
  const final = FINAL_STATUSES.includes(a.status)
  return {
    edit: !final && (has('manage_all') || (ownPending && has('update_own_pending'))),
    confirm: has('confirm_all') && a.status === 'pending',
    cancel:
      (has('cancel_all') && ['pending', 'confirmed', 'arrived'].includes(a.status)) ||
      (ownPending && has('cancel_own_pending')),
    reportCustomerCancel: has('report_customer_cancel') && open && !a.customerCancelReportedAt,
    markArrived: has('mark_arrived') && open,
    noShow: has('manage_all') && open,
    complete:
      has('manage_all') && activeOrders === 0 && (a.status === 'arrived' || a.status === 'in_progress'),
    createOrder:
      has('create_order') &&
      perms.includes('order.create_draft') &&
      ['pending', 'confirmed', 'arrived', 'in_progress'].includes(a.status),
    viewAudit: has('audit_read') || a.createdBy === userId,
  }
}
