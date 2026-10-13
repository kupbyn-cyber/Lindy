// Trạng thái ngày công (Đợt 4A; PRD §8, Q28, Q29, Q35). Ngày vắng = nghỉ có phép + nghỉ không phép + ngoài thời gian
// làm việc. Ngày quán đóng cửa không phải ngày vắng. Ngày chưa duyệt chưa phải ngày vắng (test 23, K20).
import type { ChipTone } from '~/components/ui'

export type DayStatus = 'out' | 'closed' | 'worked' | 'leave' | 'unexcused' | 'pending' | 'future'

export const DAY_LABEL: Record<DayStatus, string> = {
  out: 'Ngoài thời gian làm',
  closed: 'Quán đóng cửa',
  worked: 'Đi làm',
  leave: 'Nghỉ có phép',
  unexcused: 'Nghỉ không phép',
  pending: 'Chưa duyệt',
  future: 'Chưa tới',
}

/** Một ký tự cho lưới bảng công */
export const DAY_SHORT: Record<DayStatus, string> = {
  out: '–',
  closed: 'Đ',
  worked: '✓',
  leave: 'P',
  unexcused: 'K',
  pending: '?',
  future: '·',
}

export const DAY_TONE: Record<DayStatus, ChipTone> = {
  out: 'neutral',
  closed: 'neutral',
  worked: 'success',
  leave: 'accent',
  unexcused: 'danger',
  pending: 'warning',
  future: 'neutral',
}

export type DayCounts = Record<DayStatus, number> & { absent: number }

export function countDays(days: { status: DayStatus }[]): DayCounts {
  const c = { out: 0, closed: 0, worked: 0, leave: 0, unexcused: 0, pending: 0, future: 0 }
  for (const d of days) c[d.status]++
  return { ...c, absent: c.leave + c.unexcused + c.out }
}

export type LeaveStatus = 'requested' | 'approved' | 'rejected' | 'cancelled'

export const LEAVE_LABEL: Record<LeaveStatus, string> = {
  requested: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
  cancelled: 'Đã huỷ',
}

export const LEAVE_TONE: Record<LeaveStatus, ChipTone> = {
  requested: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}
