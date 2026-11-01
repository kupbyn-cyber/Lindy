// Một nguồn cho màu trạng thái (S49, S51): mỗi màu một nghĩa, mọi StatusChip lấy tone từ đây, không viết tay ở màn.
//   progress: đang làm · waiting: đang chờ ai đó · warning: chưa đủ, cần chú ý · danger: tiền chưa về, hỏng
//   success: xong và đúng · neutral: còn lại (đã kết thúc, chỉ để biết)
// Màu luôn đi kèm chữ (G10). Trang này chỉ trình bày, không chứa luật nghiệp vụ.

export type ChipTone = 'success' | 'warning' | 'danger' | 'progress' | 'waiting' | 'neutral'

export const ORDER_STATUS_TONE = {
  in_progress: 'progress',
  awaiting_confirmation: 'waiting',
  confirmed: 'success',
  cancelled: 'neutral',
} as const satisfies Record<string, ChipTone>

export const PAYMENT_TONE = {
  unpaid: 'danger',
  partial: 'warning',
  paid: 'success',
  refund_partial: 'neutral',
  refund_full: 'neutral',
} as const satisfies Record<string, ChipTone>

export const APPOINTMENT_TONE = {
  pending: 'waiting',
  confirmed: 'neutral',
  arrived: 'progress',
  in_progress: 'progress',
  completed: 'neutral',
  cancelled: 'neutral',
  no_show: 'danger',
} as const satisfies Record<string, ChipTone>

/** Từng khoản cọc */
export const DEPOSIT_TONE = {
  recorded: 'waiting',
  confirmed: 'success',
  refunded: 'neutral',
  forfeited: 'neutral',
  voided: 'neutral',
} as const satisfies Record<string, ChipTone>

/** Cọc của cả lịch */
export const DEPOSIT_STATE_TONE = {
  missing: 'warning',
  pending: 'waiting',
  held: 'success',
} as const satisfies Record<string, ChipTone>

export const DAY_TONE = {
  out: 'neutral',
  closed: 'neutral',
  worked: 'success',
  leave: 'neutral',
  unexcused: 'danger',
  pending: 'waiting',
  future: 'neutral',
} as const satisfies Record<string, ChipTone>

export const LEAVE_TONE = {
  requested: 'waiting',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
} as const satisfies Record<string, ChipTone>

/** Phiếu chi và tạm ứng cùng các bước */
export const REQUEST_TONE = {
  requested: 'waiting',
  approved: 'waiting',
  paid: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
} as const satisfies Record<string, ChipTone>

export const PAYROLL_TONE = {
  before_start: 'neutral',
  provisional: 'progress',
  closing: 'neutral',
  draft: 'waiting',
  locked: 'success',
} as const satisfies Record<string, ChipTone>

/** Nhãn lẻ không thuộc một chuỗi trạng thái */
export const LABEL_TONE = {
  outOfRange: 'warning',
  customLine: 'warning',
  discountPending: 'waiting',
  needsReview: 'waiting',
  cancelRequested: 'waiting',
  outsideHours: 'warning',
  renameCustomer: 'warning',
  payRemaining: 'warning',
  payDone: 'success',
  voided: 'neutral',
  ownerApproves: 'neutral',
  pendingCount: 'waiting',
  leaveApproved: 'neutral',
  thisDevice: 'neutral',
  seasonOff: 'neutral',
  staffLocked: 'neutral',
  accessRevoked: 'neutral',
  accountLocked: 'neutral',
  mustChangePassword: 'warning',
  staffGap: 'warning',
  reviewKind: 'neutral',
  stationOnline: 'success',
  stationOffline: 'warning',
} as const satisfies Record<string, ChipTone>
