// Tạm ứng (Đợt 4B, bước 4.13; PRD §9.3, UI16; Q37, Q38, A05, K21; test 42, 53). Mọi người đề nghị; tổng trong tháng
// ≤ lương cứng (DB kiểm, khoá theo người); chỉ Linh duyệt; Nhung, Linh bấm "Đã chi" → bút toán tạm ứng (không phải chi
// phí), trừ vào lương tháng xin ứng (tháng đó đã khoá thì tháng đang mở).
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import type { AdvanceFilter } from './schema'

const n = (v: unknown) => Number(v ?? 0)
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

export type AdvanceStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled'

type Row = {
  id: string
  branchId: string
  userId: string
  userName: string | null
  amount: string
  reason: string
  status: AdvanceStatus
  requestMonth: string
  payrollMonth: string | null
  requestedAt: Date
  decidedByName: string | null
  decidedAt: Date | null
  decideNote: string | null
  paidByName: string | null
  paidAt: Date | null
  paidAccountName: string | null
  cancelledByName: string | null
  version: number
}

const SELECT = (tx: Tx) => tx`
  select a.id, a.branch_id, a.user_id, u.display_name as user_name, a.amount, a.reason, a.status,
         to_char(a.request_month, 'YYYY-MM') as request_month, to_char(a.payroll_month, 'YYYY-MM') as payroll_month,
         a.requested_at, ud.display_name as decided_by_name, a.decided_at, a.decide_note,
         up.display_name as paid_by_name, a.paid_at, m.name as paid_account_name, uc.display_name as cancelled_by_name,
         a.version
  from employee_advances a
  left join users u on u.id = a.user_id
  left join users ud on ud.id = a.decided_by
  left join users up on up.id = a.paid_by
  left join users uc on uc.id = a.cancelled_by
  left join money_accounts m on m.id = a.paid_account_id`

function toView(auth: Auth, r: Row) {
  const perms = auth.branches.find((b) => b.id === r.branchId)?.perms ?? []
  const approver = perms.includes('advance.approve')
  const manage = perms.includes('cashbook.manage')
  const mine = r.userId === auth.userId
  return {
    id: r.id,
    userId: r.userId,
    name: r.userName,
    mine,
    amount: n(r.amount),
    reason: r.reason,
    status: r.status,
    requestMonth: r.requestMonth,
    payrollMonth: r.payrollMonth,
    requestedAt: new Date(r.requestedAt).toISOString(),
    decidedByName: r.decidedByName,
    decidedAt: iso(r.decidedAt),
    decideNote: r.decideNote,
    paidByName: r.paidByName,
    paidAt: iso(r.paidAt),
    paidAccountName: r.paidAccountName,
    cancelledByName: r.cancelledByName,
    version: r.version,
    can: {
      approve: r.status === 'requested' && approver,
      reject: r.status === 'requested' && approver,
      cancel:
        (r.status === 'requested' && (mine || approver || manage)) ||
        (r.status === 'approved' && (approver || manage)),
      pay: r.status === 'approved' && manage,
    },
  }
}

export type AdvanceView = ReturnType<typeof toView>

async function loadView(tx: Tx, auth: Auth, id: string) {
  const [r] = await tx<Row[]>`${SELECT(tx)} where a.id = ${id}`
  if (!r) throw notFound('Không tìm thấy đề nghị tạm ứng.')
  return toView(auth, r)
}

/** Hạn mức tháng này của chính mình (A05, K21): lương cứng, đã ứng, còn ứng được; kèm lương tạm tính để tham khảo (Q38). */
async function myLimit(tx: Tx, branchId: string, userId: string) {
  const [r] = await tx<{ month: string; base: string | null; used: string; gross: string | null }[]>`
    with t as (select date_trunc('month', app.branch_today(${branchId}))::date as m)
    select to_char(t.m, 'YYYY-MM') as month, app._base_salary(${branchId}, ${userId}, t.m) as base,
           (select coalesce(sum(amount), 0) from employee_advances where branch_id = ${branchId} and user_id = ${userId}
              and request_month = t.m and status in ('requested', 'approved', 'paid')) as used,
           (select gross_pay from app.payroll_view(${branchId}, t.m) v where v.user_id = ${userId}) as gross
    from t`
  const base = r?.base == null ? null : n(r.base)
  return {
    month: r!.month,
    baseSalary: base,
    used: n(r?.used),
    available: base == null ? 0 : Math.max(base - n(r?.used), 0),
    provisionalPay: r?.gross == null ? null : n(r.gross),
  }
}

export async function listAdvances(auth: Auth, input: { branchId?: string; filter?: AdvanceFilter }) {
  const branch = requireBranch(auth, input.branchId)
  const reader =
    hasPerm(auth, branch.id, 'advance.approve') ||
    hasPerm(auth, branch.id, 'cashbook.manage') ||
    hasPerm(auth, branch.id, 'payroll.read_all_branch')
  if (!reader && !hasPerm(auth, branch.id, 'advance.request')) throw forbidden()
  const filter = input.filter ?? 'all'
  return withUser(auth.userId, async (tx) => {
    // RLS: người không phải Nhung, Linh chỉ thấy đề nghị của mình
    const rows = await tx<Row[]>`
      ${SELECT(tx)}
      where a.branch_id = ${branch.id}
        and case ${filter}
              when 'pending' then a.status = 'requested'
              when 'approved' then a.status = 'approved'
              when 'paid' then a.status = 'paid'
              else a.status in ('requested', 'approved') or a.requested_at > now() - interval '62 days'
            end
      order by a.requested_at desc
      limit 200`
    const [c] = await tx<{ pending: string; approved: string }[]>`
      select count(*) filter (where status = 'requested') as pending,
             count(*) filter (where status = 'approved') as approved
      from employee_advances where branch_id = ${branch.id}`
    const canRequest = hasPerm(auth, branch.id, 'advance.request')
    return {
      filter,
      items: rows.map((r) => toView(auth, r)),
      counts: { pending: n(c?.pending), approved: n(c?.approved) },
      limit: canRequest ? await myLimit(tx, branch.id, auth.userId) : null,
      can: {
        request: canRequest,
        approve: hasPerm(auth, branch.id, 'advance.approve'),
        pay: hasPerm(auth, branch.id, 'cashbook.manage'),
      },
    }
  })
}

export type AdvancesData = Awaited<ReturnType<typeof listAdvances>>

export async function createAdvance(
  auth: Auth,
  input: { branchId?: string; createRequestId: string; amount: number; reason: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'advance.request')) throw forbidden('Không có quyền đề nghị tạm ứng.')
  return withUser(auth.userId, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into employee_advances (branch_id, user_id, amount, reason, request_month, create_request_id)
      values (${branch.id}, ${auth.userId}, ${input.amount}, ${input.reason.trim()},
              date_trunc('month', app.branch_today(${branch.id}))::date, ${input.createRequestId})
      on conflict (user_id, create_request_id) do nothing
      returning id`
    if (row) return loadView(tx, auth, row.id)
    // Bấm hai lần cùng mã: trả đề nghị đã lưu nếu cùng số tiền
    const [ex] = await tx<{ id: string; amount: string }[]>`
      select id, amount from employee_advances
      where user_id = ${auth.userId} and create_request_id = ${input.createRequestId}`
    if (!ex || n(ex.amount) !== input.amount)
      throw invalid('Đề nghị này đã lưu với số tiền khác. Tải lại trang.')
    return loadView(tx, auth, ex.id)
  })
}

export type AdvanceAction = 'approve' | 'reject' | 'cancel' | 'pay'

const TARGET: Record<AdvanceAction, AdvanceStatus> = {
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
  pay: 'paid',
}

export async function actOnAdvance(
  auth: Auth,
  id: string,
  action: AdvanceAction,
  input: { version: number; note?: string | null; method?: 'cash' | 'transfer' | null },
) {
  if (!isUuid(id)) throw notFound('Không tìm thấy đề nghị tạm ứng.')
  return withUser(auth.userId, async (tx) => {
    const [r] = await tx<Row[]>`${SELECT(tx)} where a.id = ${id} for update of a`
    if (!r) throw notFound('Không tìm thấy đề nghị tạm ứng.')
    const v = toView(auth, r)
    const target = TARGET[action]
    if (r.status === target) return v
    if (!v.can[action]) {
      throw forbidden(
        action === 'approve' || action === 'reject'
          ? 'Chỉ Linh duyệt tạm ứng.'
          : action === 'pay'
            ? 'Chỉ Nhung, Linh ghi "Đã chi" tạm ứng đã duyệt.'
            : 'Không có quyền huỷ đề nghị này.',
      )
    }
    if (r.version !== input.version)
      throw conflict('Đề nghị vừa được người khác cập nhật. Xem bản mới nhất rồi thao tác lại.', v)
    const note = input.note?.trim() || null
    if (action === 'reject' && !note) throw invalid('Cần ghi lý do từ chối.')
    if (action === 'cancel' && r.status === 'approved' && !note)
      throw invalid('Tạm ứng đã duyệt: cần ghi lý do huỷ.')
    let account: string | null = null
    if (action === 'pay') {
      const [acc] = await tx<{ id: string }[]>`
        select id from money_accounts
        where branch_id = ${r.branchId} and is_active and type = ${input.method === 'transfer' ? 'bank' : 'cash'}
        order by code limit 1`
      if (!acc) throw invalid('Chưa có tài khoản cho hình thức này.')
      account = acc.id
    }
    await tx`
      update employee_advances set status = ${target}, decide_note = ${note ?? r.decideNote},
        paid_account_id = ${account}
      where id = ${id} and version = ${input.version}`
    return loadView(tx, auth, id)
  })
}
