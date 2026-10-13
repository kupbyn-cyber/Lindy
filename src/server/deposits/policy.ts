// Luật quyền tiền cọc (module §4, §6; PRD §4). Dùng để ẩn/hiện nút và kiểm trước ở server; trigger deposits_guard
// trong DB kiểm lại cùng luật.

export type DepositStatus = 'recorded' | 'confirmed' | 'refunded' | 'forfeited' | 'voided'

/** Lịch đã kết thúc thì mới hoàn hoặc giữ cọc (huỷ, không đến; đã làm xong mà cọc còn dư). */
export const RESOLVABLE_APPT = ['cancelled', 'no_show', 'completed']

export type DepositCan = { confirm: boolean; void: boolean; resolve: boolean; review: boolean }

export function depositCan(
  perms: string[],
  userId: string,
  d: { status: DepositStatus; recordedBy: string; remaining: number; applied: number; needsReview: boolean },
  apptStatus: string,
): DepositCan {
  const has = (p: string) => perms.includes(p)
  return {
    confirm: has('deposits.confirm') && d.status === 'recorded',
    void:
      (d.status === 'recorded' &&
        (has('deposits.confirm') || (d.recordedBy === userId && has('deposits.record')))) ||
      (d.status === 'confirmed' && d.applied === 0 && has('deposits.confirm')),
    resolve:
      has('deposits.resolve') &&
      d.status === 'confirmed' &&
      d.remaining > 0 &&
      RESOLVABLE_APPT.includes(apptStatus),
    review: has('review_queue.read') && d.needsReview,
  }
}
