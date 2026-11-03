// Luật quyền đề nghị chi (PRD §4, §7.3; Q19, Q20, invariant 14). Dùng để ẩn/hiện nút và kiểm trước ở server;
// trigger expenses_guard trong DB kiểm lại cùng luật.

export type ExpenseStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled'
export type ExpenseLevel = 'manager' | 'owner'

// S58: mọi khoản chi chỉ chủ quán duyệt.
export function canApproveLevel(perms: string[], _level: ExpenseLevel) {
  return perms.includes('expense.approve_above_limit')
}

export type ExpenseCan = { approve: boolean; reject: boolean; cancel: boolean; pay: boolean; review: boolean }

export function expenseCan(
  perms: string[],
  userId: string,
  e: { status: ExpenseStatus; requiredLevel: ExpenseLevel; requestedBy: string; needsReview: boolean },
): ExpenseCan {
  const approver = canApproveLevel(perms, e.requiredLevel)
  const manage = perms.includes('cashbook.manage')
  return {
    approve: e.status === 'requested' && approver,
    reject: e.status === 'requested' && approver,
    cancel:
      (e.status === 'requested' && (approver || manage || e.requestedBy === userId)) ||
      (e.status === 'approved' && (approver || manage)),
    pay: e.status === 'approved' && manage,
    review: perms.includes('review_queue.read') && e.needsReview,
  }
}
