// Đề nghị chi và duyệt chi (Đợt 3B-1, bước 3.12; PRD §7.3, §13C; Q19, Q20; invariant 9, 14).
// Mọi người đề nghị chi. Nhung duyệt đến 1.000.000đ/phiếu trừ 4 nhóm (tiền nhà; lương, thưởng; máy móc thiết bị;
// sửa chữa); trên mức hoặc 4 nhóm thì Linh. Người lập đủ quyền duyệt thì phiếu duyệt luôn; Nhung tự duyệt phiếu của
// mình → Cần xem lại của Linh. Tiền chỉ ra khỏi tài khoản khi Nhung, Linh bấm "Đã chi" (bút toán do DB ghi).
import { addDays, isIsoDate, toLocalDate } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import { type ExpenseLevel, type ExpenseStatus, expenseCan } from './policy'
import type { ExpenseFilter } from './schema'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)
const n = (v: unknown) => Number(v ?? 0)
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)

type Row = {
  id: string
  branchId: string
  categoryCode: string
  categoryName: string
  ownerOnly: boolean
  amount: string
  note: string
  status: ExpenseStatus
  requiredLevel: ExpenseLevel
  requestedBy: string
  requestedByName: string | null
  requestedAt: Date
  approvedByName: string | null
  approvedAt: Date | null
  rejectedByName: string | null
  rejectReason: string | null
  cancelledByName: string | null
  cancelReason: string | null
  paidByName: string | null
  paidAt: Date | null
  paidAccountName: string | null
  needsOwnerReview: boolean
  reviewedAt: Date | null
  version: number
}

export type ExpenseView = ReturnType<typeof toView>

function toView(auth: Auth, r: Row) {
  const perms = auth.branches.find((b) => b.id === r.branchId)?.perms ?? []
  const needsReview = r.needsOwnerReview && !r.reviewedAt
  return {
    id: r.id,
    categoryCode: r.categoryCode,
    categoryName: r.categoryName,
    ownerOnly: r.ownerOnly,
    amount: n(r.amount),
    note: r.note,
    status: r.status,
    requiredLevel: r.requiredLevel,
    mine: r.requestedBy === auth.userId,
    requestedByName: r.requestedByName,
    requestedAt: new Date(r.requestedAt).toISOString(),
    approvedByName: r.approvedByName,
    approvedAt: iso(r.approvedAt),
    rejectedByName: r.rejectedByName,
    rejectReason: r.rejectReason,
    cancelledByName: r.cancelledByName,
    cancelReason: r.cancelReason,
    paidByName: r.paidByName,
    paidAt: iso(r.paidAt),
    paidAccountName: r.paidAccountName,
    needsOwnerReview: needsReview,
    version: r.version,
    can: expenseCan(perms, auth.userId, {
      status: r.status,
      requiredLevel: r.requiredLevel,
      requestedBy: r.requestedBy,
      needsReview,
    }),
  }
}

const SELECT = (tx: Tx) => tx`
  select e.id, e.branch_id, e.category_code, c.name as category_name, c.owner_only, e.amount, e.note, e.status,
         e.required_level, e.requested_by, ur.display_name as requested_by_name, e.requested_at,
         ua.display_name as approved_by_name, e.approved_at, uj.display_name as rejected_by_name, e.reject_reason,
         uc.display_name as cancelled_by_name, e.cancel_reason, up.display_name as paid_by_name, e.paid_at,
         m.name as paid_account_name, e.needs_owner_review, e.reviewed_at, e.version
  from expense_requests e
  join expense_categories c on c.code = e.category_code
  left join users ur on ur.id = e.requested_by
  left join users ua on ua.id = e.approved_by
  left join users uj on uj.id = e.rejected_by
  left join users uc on uc.id = e.cancelled_by
  left join users up on up.id = e.paid_by
  left join money_accounts m on m.id = e.paid_account_id`

async function loadView(tx: Tx, auth: Auth, id: string) {
  const [r] = await tx<Row[]>`${SELECT(tx)} where e.id = ${id}`
  if (!r) throw notFound('Không tìm thấy phiếu chi.')
  return toView(auth, r)
}

/** Danh sách phiếu: Nhung, Linh thấy mọi phiếu; người khác chỉ phiếu của mình (RLS). Phiếu đã xong xem theo khoảng ngày. */
export async function listExpenses(
  auth: Auth,
  input: { branchId?: string; filter?: ExpenseFilter; from?: string; to?: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'expense.request')) throw forbidden()
  const filter = input.filter ?? 'pending'
  return withUser(auth.userId, async (tx) => {
    const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branch.id}`
    const tz = b?.timezone ?? 'Asia/Ho_Chi_Minh'
    const today = toLocalDate(new Date(), tz)
    const to = input.to && isIsoDate(input.to) ? input.to : today
    const from = input.from && isIsoDate(input.from) ? input.from : addDays(to, -30)
    if (from > to || addDays(from, 62) < to) throw invalid('Khoảng ngày không hợp lệ (tối đa 62 ngày).')
    const rows = await tx<Row[]>`
      ${SELECT(tx)}
      where e.branch_id = ${branch.id}
        and case ${filter}
              when 'pending' then e.status = 'requested'
              when 'approved' then e.status = 'approved'
              when 'paid' then e.status = 'paid' and (e.paid_at at time zone ${tz})::date between ${from}::date and ${to}::date
              when 'closed' then e.status in ('rejected', 'cancelled')
                                 and (e.requested_at at time zone ${tz})::date between ${from}::date and ${to}::date
              else (e.status in ('requested', 'approved')
                    or (e.requested_at at time zone ${tz})::date between ${from}::date and ${to}::date)
            end
      order by e.requested_at desc
      limit 300`
    const [counts] = await tx<{ pending: string; approved: string }[]>`
      select count(*) filter (where status = 'requested') as pending,
             count(*) filter (where status = 'approved') as approved
      from expense_requests where branch_id = ${branch.id}`
    const categories = await tx<{ code: string; name: string; kind: string; ownerOnly: boolean }[]>`
      select code, name, kind, owner_only from expense_categories order by sort_order`
    return {
      filter,
      from,
      to,
      categories,
      items: rows.map((r) => toView(auth, r)),
      counts: { pending: n(counts?.pending), approved: n(counts?.approved) },
      can: {
        approveAny: hasPerm(auth, branch.id, 'expense.approve_above_limit'),
        approveWithin: hasPerm(auth, branch.id, 'expense.approve_within_limit'),
        pay: hasPerm(auth, branch.id, 'cashbook.manage'),
      },
    }
  })
}

export async function createExpense(
  auth: Auth,
  input: { branchId?: string; createRequestId: string; categoryCode: string; amount: number; note: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'expense.request')) throw forbidden('Không có quyền đề nghị chi.')
  return withUser(auth.userId, async (tx) => {
    const [cat] = await tx`select 1 from expense_categories where code = ${input.categoryCode}`
    if (!cat) throw invalid('Chọn nhóm chi.')
    const [row] = await tx<{ id: string }[]>`
      insert into expense_requests (branch_id, category_code, amount, note, requested_by, create_request_id)
      values (${branch.id}, ${input.categoryCode}, ${input.amount}, ${input.note.trim()}, ${auth.userId},
              ${input.createRequestId})
      on conflict (requested_by, create_request_id) do nothing
      returning id`
    if (row) return loadView(tx, auth, row.id)
    // Bấm hai lần cùng mã: trả phiếu đã lưu nếu cùng nội dung
    const [ex] = await tx<{ id: string; amount: string; categoryCode: string }[]>`
      select id, amount, category_code from expense_requests
      where requested_by = ${auth.userId} and create_request_id = ${input.createRequestId}`
    if (!ex || n(ex.amount) !== input.amount || ex.categoryCode !== input.categoryCode)
      throw invalid('Phiếu này đã lưu với nội dung khác. Tải lại trang.')
    return loadView(tx, auth, ex.id)
  })
}

export type ExpenseAction = 'approve' | 'reject' | 'cancel' | 'pay' | 'review'

const TARGET: Record<Exclude<ExpenseAction, 'review'>, ExpenseStatus> = {
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
  pay: 'paid',
}

export async function actOnExpense(
  auth: Auth,
  id: string,
  action: ExpenseAction,
  input: { version: number; reason?: string | null; method?: 'cash' | 'transfer' | null },
) {
  if (!isUuid(id)) throw notFound('Không tìm thấy phiếu chi.')
  return withUser(auth.userId, async (tx) => {
    const [e] = await tx<Row[]>`${SELECT(tx)} where e.id = ${id} for update of e`
    if (!e) throw notFound('Không tìm thấy phiếu chi.')
    const v = toView(auth, e)
    if (action === 'review') {
      if (!v.can.review) throw forbidden('Chỉ chủ quán đánh dấu đã xem lại.')
      await tx`update expense_requests set reviewed_by = ${auth.userId}, reviewed_at = now() where id = ${id}`
      return loadView(tx, auth, id)
    }
    const target = TARGET[action]
    // Bấm hai lần (mạng chập chờn): đã ở trạng thái đích thì trả luôn [S41]
    if (e.status === target) return v
    if (!v.can[action]) {
      throw forbidden(
        action === 'approve' && e.requiredLevel === 'owner'
          ? 'Phiếu trên 1.000.000đ hoặc thuộc nhóm tiền nhà, lương thưởng, máy móc, sửa chữa: chỉ Linh duyệt.'
          : action === 'pay'
            ? 'Chỉ Nhung, Linh ghi "Đã chi".'
            : 'Không có quyền làm việc này với phiếu ở trạng thái hiện tại.',
      )
    }
    if (e.version !== input.version)
      throw conflict('Phiếu vừa được người khác cập nhật. Xem bản mới nhất rồi thao tác lại.', v)
    const reason = input.reason?.trim() || null
    if (action === 'reject' && !reason) throw invalid('Cần ghi lý do từ chối.')
    if (action === 'cancel' && e.status === 'approved' && !reason)
      throw invalid('Phiếu đã duyệt: cần ghi lý do huỷ.')
    let account: string | null = null
    if (action === 'pay') {
      const [acc] = await tx<{ id: string }[]>`
        select id from money_accounts
        where branch_id = ${e.branchId} and is_active and type = ${input.method === 'transfer' ? 'bank' : 'cash'}
        order by code limit 1`
      if (!acc) throw invalid('Chưa có tài khoản cho hình thức này.')
      account = acc.id
    }
    await tx`
      update expense_requests set status = ${target},
        reject_reason = ${action === 'reject' ? reason : e.rejectReason},
        cancel_reason = ${action === 'cancel' ? reason : e.cancelReason},
        paid_account_id = ${account}
      where id = ${id} and version = ${input.version}`
    return loadView(tx, auth, id)
  })
}
