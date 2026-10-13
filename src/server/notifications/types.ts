// Loại thông báo và ai nhận (module lịch §9.1). Người nhận chọn theo quyền, không theo tên người.
export const NOTIFICATION_TYPES = {
  'appointment.created': { label: 'Lịch mới', audience: 'appointments.read_branch' },
  'appointment.rescheduled': { label: 'Đổi ngày giờ', audience: 'appointments.read_branch' },
  'appointment.cancelled': { label: 'Huỷ lịch', audience: 'appointments.read_branch' },
  'appointment.confirmed': { label: 'Chốt lịch', audience: 'appointments.manage_all' },
  'appointment.customer_cancel': { label: 'Khách báo huỷ', audience: 'appointments.manage_all' },
  'appointment.overdue': { label: 'Lịch đã qua giờ chưa đánh dấu', audience: 'appointments.manage_all' },
  // Cọc mùa Tết (module §13 test 31): Nhung, Linh nhận khi có cọc chờ xác nhận
  'deposit.recorded': { label: 'Cọc chờ xác nhận', audience: 'deposits.confirm' },
  'system.test': { label: 'Thông báo thử', audience: 'appointments.read_branch' },
} as const

export type NotificationType = keyof typeof NOTIFICATION_TYPES

/** Nhóm thông báo một người có thể nhận, để hiện trong cài đặt bật/tắt. */
export function typesFor(perms: string[]) {
  return (
    Object.entries(NOTIFICATION_TYPES) as [NotificationType, (typeof NOTIFICATION_TYPES)[NotificationType]][]
  )
    .filter(([type, t]) => type !== 'system.test' && perms.includes(t.audience))
    .map(([type, t]) => ({ type, label: t.label }))
}
