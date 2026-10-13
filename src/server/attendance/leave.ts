// Đăng ký nghỉ (Đợt 4A, bước 4.6; PRD §8, Q27, Q28). Mọi người đăng ký; Nhung, Linh duyệt / từ chối; Nhung, Linh
// đăng ký cho mình thì duyệt luôn, có audit. Người đăng ký huỷ khi chưa duyệt; nghỉ đã duyệt chỉ Nhung, Linh huỷ (lý do).
// Trigger leave_guard trong DB kiểm lại cùng luật, trùng ngày, tháng đã khoá.
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import { LEAVE_SELECT, type LeaveView, leaveView } from './service'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

type Row = Parameters<typeof leaveView>[1]

export async function createLeave(
  auth: Auth,
  input: { branchId?: string; createRequestId: string; fromDate: string; toDate: string; reason: string },
): Promise<LeaveView> {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'attendance.own')) throw forbidden('Không có quyền đăng ký nghỉ.')
  if (input.toDate < input.fromDate) throw invalid('Đến ngày phải từ ngày bắt đầu trở đi.')
  return withUser(auth.userId, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into leave_requests (branch_id, user_id, from_date, to_date, reason, create_request_id)
      values (${branch.id}, ${auth.userId}, ${input.fromDate}::date, ${input.toDate}::date, ${input.reason.trim()},
              ${input.createRequestId})
      on conflict (user_id, create_request_id) do nothing
      returning id`
    // Bấm hai lần cùng mã: trả đơn đã lưu
    const id =
      row?.id ??
      (
        await tx<{ id: string }[]>`
          select id from leave_requests where user_id = ${auth.userId} and create_request_id = ${input.createRequestId}`
      )[0]?.id
    if (!id) throw invalid('Không lưu được đơn nghỉ. Tải lại trang.')
    const [r] = await tx<Row[]>`${LEAVE_SELECT(tx)} where l.id = ${id}`
    return leaveView(auth, r!)
  })
}

export type LeaveAction = 'approve' | 'reject' | 'cancel'

const TARGET: Record<LeaveAction, Row['status']> = {
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
}

export async function actOnLeave(
  auth: Auth,
  id: string,
  action: LeaveAction,
  input: { version: number; note?: string | null },
): Promise<LeaveView> {
  if (!isUuid(id)) throw notFound('Không tìm thấy đơn nghỉ.')
  return withUser(auth.userId, async (tx) => {
    const [l] = await tx<Row[]>`${LEAVE_SELECT(tx)} where l.id = ${id} for update of l`
    if (!l) throw notFound('Không tìm thấy đơn nghỉ.')
    const v = leaveView(auth, l)
    const target = TARGET[action]
    // Bấm hai lần: đã ở trạng thái đích thì trả luôn
    if (l.status === target) return v
    if (!v.can[action]) {
      throw forbidden(
        action === 'cancel' && l.status === 'approved'
          ? 'Ngày nghỉ đã duyệt: chỉ Nhung, Linh huỷ được.'
          : action === 'cancel'
            ? 'Chỉ người đăng ký hoặc Nhung, Linh huỷ được đơn nghỉ.'
            : 'Chỉ Nhung, Linh duyệt ngày nghỉ.',
      )
    }
    if (l.version !== input.version)
      throw conflict('Đơn nghỉ vừa được người khác cập nhật. Xem bản mới nhất rồi thao tác lại.', v)
    const note = input.note?.trim() || null
    if (action === 'reject' && !note) throw invalid('Cần ghi lý do từ chối.')
    if (action === 'cancel' && l.status === 'approved' && !note)
      throw invalid('Cần ghi lý do huỷ ngày nghỉ đã duyệt.')
    await tx`
      update leave_requests set status = ${target}, decide_note = ${note ?? l.decideNote}
      where id = ${id} and version = ${input.version}`
    const [r] = await tx<Row[]>`${LEAVE_SELECT(tx)} where l.id = ${id}`
    return leaveView(auth, r!)
  })
}
