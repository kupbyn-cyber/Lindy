// Nghiệp vụ đơn hàng (Đợt 2, bước 2.8–2.12). Danh tính lấy từ phiên; mọi thao tác chạy dưới withUser nên RLS (K09)
// và trigger orders_guard kiểm lại quyền ở DB; constraint trigger kiểm tổng tiền khi commit.
// Máy chỉ gửi lựa chọn; server tính lại toàn bộ tiền từ danh mục và bỏ mọi số tiền máy gửi lên [P26].
import { createHash } from 'node:crypto'
import { formatVND } from '~/lib/money'
import {
  type CatalogCombo,
  type CatalogLookup,
  type CatalogService,
  type ComputedOrder,
  computeOrder,
  type DiscountInput,
  type ItemInput,
  type Level,
  levelAtLeast,
  levelOf,
  type PaymentStatus,
  paymentStatus,
  pendingDepositShare,
} from '~/lib/order-math'
import { normalizePhone } from '~/lib/phone'
import { escapeLike, foldVietnamese } from '~/lib/text'
import { addDays, isIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { insertCustomer, maskPhone } from '../customers/service'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import { type OrderCan, type OrderStatus, orderCan } from './policy'
import type { CreateOrderInput, OrderContentInput, OrderFilter, UpdateOrderInput } from './schema'

export const MAX_RANGE_DAYS = 62
export const MAX_ROWS = 500

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)
export const codeLabel = (n: number) => `#${String(n).padStart(4, '0')}`
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

// ---------------------------------------------------------------- Đọc dữ liệu thô

export type OrderRow = {
  id: string
  branchId: string
  code: number
  customerId: string | null
  appointmentId: string | null
  serviceDate: string
  status: OrderStatus
  grossAmount: number
  discountAmount: number
  netAmount: number
  hasHardening: boolean
  requiredLevel: Level
  contentRev: number
  pricingHash: string
  discountApprovedBy: string | null
  discountApprovedAt: Date | null
  discountApprovedLevel: Level | null
  discountApprovalHash: string | null
  doneBy: string | null
  doneAt: Date | null
  confirmedBy: string | null
  confirmedAt: Date | null
  cancelledBy: string | null
  cancelledAt: Date | null
  cancelReason: string | null
  needsOwnerReview: boolean
  reviewedBy: string | null
  reviewedAt: Date | null
  warrantyUntil: string | null
  adjustedBy: string | null
  adjustedAt: Date | null
  adjustReason: string | null
  createdBy: string
  createdAt: Date
  updatedBy: string
  updatedAt: Date
  version: number
  createRequestHash: string
  /** Khách thứ mấy của lịch (S06); null với đơn cũ */
  guestNo: number | null
  /** Tên hiển thị khi khách đi cùng không có hồ sơ */
  guestLabel: string | null
}

const orderCols = (tx: Tx) => tx`
  o.id, o.branch_id, o.code, o.customer_id, o.appointment_id, o.service_date::text as service_date, o.status,
  o.gross_amount::int as gross_amount, o.discount_amount::int as discount_amount, o.net_amount::int as net_amount,
  o.has_hardening, o.required_level, o.content_rev, o.pricing_hash, o.discount_approved_by, o.discount_approved_at,
  o.discount_approved_level, o.discount_approval_hash, o.done_by, o.done_at, o.confirmed_by, o.confirmed_at,
  o.cancelled_by, o.cancelled_at, o.cancel_reason, o.needs_owner_review, o.reviewed_by, o.reviewed_at,
  o.warranty_until::text as warranty_until, o.adjusted_by, o.adjusted_at, o.adjust_reason, o.created_by, o.created_at,
  o.updated_by, o.updated_at, o.version, o.create_request_hash, o.guest_no, o.guest_label`

export async function loadRow(tx: Tx, id: string, lock = false) {
  if (!isUuid(id)) throw notFound('Không tìm thấy đơn.')
  // RLS (K09): ngoài phạm vi thì không thấy → 404
  const [row] = lock
    ? await tx<OrderRow[]>`select ${orderCols(tx)} from orders o where o.id = ${id} for update`
    : await tx<OrderRow[]>`select ${orderCols(tx)} from orders o where o.id = ${id}`
  if (!row) throw notFound('Không tìm thấy đơn.')
  return row
}

type ItemRow = {
  position: number
  lineType: ItemInput['type']
  serviceId: string | null
  comboId: string | null
  name: string
  unit: string
  priceMode: 'list' | 'custom' | 'fixed'
  listMin: number
  listMax: number
  unitPrice: number
  quantity: number
  grossAmount: number
  belowAmount: number
  belowReason: string | null
  discountAmount: number
  netAmount: number
  shopBorneAmount: number
  outOfRange: boolean
  hasHardening: boolean
  unallocatedReason: string | null
}
type DiscountRow = {
  position: number
  scopePosition: number | null
  kind: DiscountInput['kind'] | 'below_list' | 'complaint_compensation'
  percent: number | null
  amount: number
  reason: string
  appliedBy: string
  ticketId: string | null
}
type AllocRow = {
  itemPosition: number
  staffUserId: string
  allocatedNetAmount: number
  commissionBaseAmount: number
}
type Content = { items: ItemRow[]; discounts: DiscountRow[]; allocs: AllocRow[] }

async function loadContent(tx: Tx, o: { id: string; contentRev: number }): Promise<Content> {
  const items = await tx<ItemRow[]>`
    select position, line_type, service_id, combo_id, name, unit, price_mode, list_min::int as list_min,
           list_max::int as list_max, unit_price::int as unit_price, quantity, gross_amount::int as gross_amount,
           below_amount::int as below_amount, below_reason, discount_amount::int as discount_amount,
           net_amount::int as net_amount, shop_borne_amount::int as shop_borne_amount, out_of_range, has_hardening,
           unallocated_reason
    from order_items where order_id = ${o.id} and rev = ${o.contentRev} order by position`
  const discounts = await tx<DiscountRow[]>`
    select position, scope_position, kind, percent, amount::int as amount, reason, applied_by, ticket_id
    from order_discounts where order_id = ${o.id} and rev = ${o.contentRev} order by position`
  const allocs = await tx<AllocRow[]>`
    select item_position, staff_user_id, allocated_net_amount::int as allocated_net_amount,
           commission_base_amount::int as commission_base_amount
    from order_staff_allocations where order_id = ${o.id} and rev = ${o.contentRev}
    order by item_position, allocated_net_amount desc, staff_user_id`
  return { items, discounts, allocs }
}

/** Đưa nội dung đã lưu về dạng máy gửi lên (để sửa tiếp, và so sánh khi gửi lại sau mất mạng). */
export function toInput(c: Content): { items: ItemInput[]; discounts: DiscountInput[] } {
  const items: ItemInput[] = c.items.map((it) => {
    const allocs = c.allocs.filter((a) => a.itemPosition === it.position)
    const staff = allocs.map((a) => ({
      userId: a.staffUserId,
      amount: allocs.length > 1 ? a.allocatedNetAmount : null,
    }))
    const common = { staff, unallocatedReason: it.unallocatedReason }
    if (it.lineType === 'service')
      return {
        type: 'service',
        serviceId: it.serviceId!,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        belowReason: it.belowReason,
        ...common,
      }
    if (it.lineType === 'combo') return { type: 'combo', comboId: it.comboId!, ...common }
    return { type: it.lineType, name: it.name, amount: it.unitPrice, ...common }
  })
  const discounts = c.discounts
    .filter((d) => d.kind !== 'below_list')
    .map((d) => ({
      scope: d.scopePosition ?? ('order' as const),
      kind: d.kind as DiscountInput['kind'],
      percent: d.kind === 'manual' || d.kind === 'complaint_compensation' ? d.percent : null,
      amount: d.kind === 'manual' && d.percent == null ? d.amount : null,
      reason: d.kind === 'manual' ? d.reason : null,
      ticketId: d.ticketId,
    }))
  return { items, discounts }
}

// ---------------------------------------------------------------- Danh mục, thợ

// Món đã xoá (S42) vẫn trả về, có cờ isDeleted, để đơn cũ còn tra được; menu tạo đơn và màn Danh mục ẩn đi.
export type Catalog = {
  services: (CatalogService & { isDeleted: boolean })[]
  combos: (CatalogCombo & { itemNames: string[]; isDeleted: boolean })[]
}

export async function loadCatalog(tx: Tx): Promise<Catalog> {
  const services = await tx<Catalog['services']>`
    select id, code, name, category, price_mode, unit, price_min::int as price_min, price_max::int as price_max,
           has_hardening, is_active, deleted_at is not null as is_deleted
    from services order by sort_order, code`
  const combos = await tx<Catalog['combos']>`
    select c.id, c.code, c.name, c.group_name, c.price::int as price, h.has_hardening, c.is_active,
           c.deleted_at is not null as is_deleted,
           coalesce((select array_agg(s.name order by ci.position) from combo_items ci
                     join services s on s.id = ci.service_id where ci.combo_id = c.id), '{}') as item_names
    from combos c join combo_hardening h on h.combo_id = c.id
    order by c.sort_order, c.code`
  return { services, combos }
}

export function lookupOf(cat: Catalog): CatalogLookup {
  const s = new Map(cat.services.map((x) => [x.id, x]))
  const c = new Map(cat.combos.map((x) => [x.id, x]))
  return { service: (id) => s.get(id), combo: (id) => c.get(id) }
}

export async function branchStaff(tx: Tx, branchId: string) {
  return tx<{ id: string; displayName: string }[]>`select id, display_name from app.branch_staff(${branchId})`
}

export async function getCatalog(auth: Auth) {
  if (!auth.branches.some((b) => b.perms.includes('order.create_draft'))) throw forbidden()
  return withUser(auth.userId, loadCatalog)
}

export async function getStaff(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'order.create_draft')) throw forbidden()
  return withUser(auth.userId, (tx) => branchStaff(tx, branch.id))
}

// ---------------------------------------------------------------- Băm nội dung

/** Phần ảnh hưởng giảm giá: đổi phần này thì duyệt giảm giá cũ hết hiệu lực [P29]. Không gồm chia thợ. */
export function pricingHash(c: ComputedOrder) {
  return sha({
    i: c.items.map((x) => [
      x.type,
      x.serviceId,
      x.comboId,
      x.name,
      x.unitPrice,
      x.quantity,
      x.grossAmount,
      x.belowAmount,
    ]),
    d: c.discounts.map((d) => [d.scope, d.kind, d.percent, d.amount, d.ticketId]),
  })
}

/** Toàn bộ nội dung đơn, để nhận ra lần gửi lại sau mất mạng [P24]. */
function docHash(customerId: string | null, serviceDate: string, c: ComputedOrder) {
  return sha({
    c: customerId,
    s: serviceDate,
    p: pricingHash(c),
    a: c.items.map((x) => [
      x.allocations.map((a) => [a.userId, a.allocatedNetAmount]),
      x.unallocatedReason,
      x.belowReason,
    ]),
    r: c.discounts.map((d) => d.reason),
  })
}

// ---------------------------------------------------------------- Chi tiết

export type OrderItemView = {
  position: number
  type: ItemInput['type']
  serviceId: string | null
  comboId: string | null
  name: string
  unit: string
  priceMode: 'list' | 'custom' | 'fixed'
  listMin: number
  listMax: number
  unitPrice: number
  quantity: number
  grossAmount: number
  discountAmount: number
  netAmount: number
  belowAmount: number
  belowReason: string | null
  outOfRange: boolean
  hasHardening: boolean
  unallocatedReason: string | null
  staff: { userId: string; name: string; allocatedNetAmount: number; commissionBaseAmount: number }[]
}

export type PaymentView = {
  id: string
  amount: number
  /** deposit: cọc của lịch trừ vào bill (Đợt 3), không có tài khoản nhận */
  method: 'cash' | 'transfer' | 'deposit'
  accountName: string
  receivedAt: string
  recordedByName: string | null
  voided: boolean
  voidReason: string | null
  voidedByName: string | null
}

export type RefundView = {
  id: string
  amount: number
  method: 'cash' | 'transfer'
  accountName: string
  reason: string
  refundedByName: string | null
  refundedAt: string
  /** Ngày ghi giảm doanh thu: ngày làm dịch vụ; tháng đó đã khoá lương thì ngày hoàn (Q34) */
  revenueDate: string
  needsOwnerReview: boolean
  /** Phần trừ vào doanh thu từng thợ */
  allocations: { name: string; amount: number }[]
}

export type TipView = {
  id: string
  staffUserId: string
  staffName: string
  amount: number
  recordedByName: string | null
  recordedAt: string
  paid: boolean
  voided: boolean
  voidReason: string | null
}

export type TicketView = {
  id: string
  issue: string
  cause: 'technical' | 'customer_change'
  withinWarranty: boolean
  outcome: 'free_fix' | 'charged' | 'compensation'
  repairedByName: string | null
  compensationPercent: number | null
  note: string | null
  createdByName: string | null
  createdAt: string
  voided: boolean
  voidReason: string | null
  /** K15: phiếu ưu đãi do người không phải chủ lập, chờ Linh xem */
  needsOwnerReview: boolean
  reviewedByName: string | null
  /** Đơn đã dùng ưu đãi của phiếu (nếu xem được) */
  usedBy: { id: string; codeLabel: string } | null
}

export type OrderDetail = {
  id: string
  code: number
  codeLabel: string
  branchId: string
  status: OrderStatus
  serviceDate: string
  customer: { id: string; name: string; phone: string | null } | null
  /** Khách đi cùng không có hồ sơ: "Khách đi cùng Mai Anh" (S06) */
  guestLabel: string | null
  appointment: {
    id: string
    date: string
    startTime: string
    /** Đơn của khách thứ mấy / tổng số khách của lịch (S06) */
    guestNo: number | null
    guestCount: number
  } | null
  items: OrderItemView[]
  discounts: {
    scope: 'order' | number
    kind: DiscountRow['kind']
    percent: number | null
    amount: number
    reason: string
    appliedByName: string | null
    ticketId: string | null
  }[]
  input: { items: ItemInput[]; discounts: DiscountInput[] }
  /** Còn trong hạn bảo hành tính đến hôm nay */
  warrantyActive: boolean
  tickets: TicketView[]
  adjustedByName: string | null
  adjustedAt: string | null
  adjustReason: string | null
  grossAmount: number
  discountAmount: number
  netAmount: number
  paidAmount: number
  dueAmount: number
  /** Cọc đã xác nhận của lịch chưa trừ vào bill nào (module §10) */
  depositAvailable: number
  /** Phần cọc đang chờ xác nhận sẽ trừ vào đơn này (S53); chưa trừ vào dueAmount */
  depositPending: number
  /** Đã hoàn (phiếu hoàn, Đợt 3) */
  refundedAmount: number
  /** Đã thu − đã hoàn: số còn hoàn được tối đa; bằng 0 thì huỷ được đơn đã xác nhận */
  refundable: number
  refunds: RefundView[]
  tips: TipView[]
  paymentStatus: PaymentStatus
  requiredLevel: Level
  approval: { byName: string | null; level: Level | null; at: string | null; valid: boolean } | null
  payments: PaymentView[]
  hasHardening: boolean
  warrantyUntil: string | null
  hasCustomLines: boolean
  hasOutOfRange: boolean
  createdByName: string | null
  createdAt: string
  doneByName: string | null
  doneAt: string | null
  confirmedByName: string | null
  confirmedAt: string | null
  cancelledByName: string | null
  cancelledAt: string | null
  cancelReason: string | null
  needsOwnerReview: boolean
  reviewedByName: string | null
  version: number
  doneProblems: string[]
  can: OrderCan
  /** Tài khoản nhận chuyển khoản để vẽ QR (S23–S26): chỉ gửi cho người ghi được tiền thu; chưa nhập → null */
  transferQr: { bankBin: string; accountNo: string; accountName: string } | null
  /** Lần in bill gần nhất đã in xong (Đợt 7); chưa in → null */
  billPrintedAt: string | null
}

async function names(tx: Tx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))]
  if (list.length === 0) return new Map<string, string>()
  const rows = await tx<{ id: string; displayName: string }[]>`
    select id, display_name from users where id = any(${list}::uuid[])`
  return new Map(rows.map((r) => [r.id, r.displayName]))
}

async function branchTz(tx: Tx, branchId: string) {
  const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
  return b?.timezone ?? 'Asia/Ho_Chi_Minh'
}

function approvalValid(o: OrderRow) {
  return (
    !!o.discountApprovalHash &&
    o.discountApprovalHash === o.pricingHash &&
    levelAtLeast(o.discountApprovedLevel ?? 'none', o.requiredLevel)
  )
}

function permsOf(auth: Auth, branchId: string) {
  return auth.branches.find((b) => b.id === branchId)?.perms ?? []
}

function canFor(auth: Auth, o: OrderRow) {
  return orderCan(permsOf(auth, o.branchId), auth.userId, {
    status: o.status,
    createdBy: o.createdBy,
    requiredLevel: o.requiredLevel,
    approvalValid: approvalValid(o),
    needsOwnerReview: o.needsOwnerReview,
    reviewedAt: o.reviewedAt,
  })
}

function problemsOf(c: Content) {
  const out: string[] = []
  if (c.items.length === 0) out.push('Đơn chưa có dịch vụ nào.')
  for (const it of c.items) {
    if (!it.unallocatedReason && !c.allocs.some((a) => a.itemPosition === it.position))
      out.push(`Dòng ${it.position + 1} (${it.name}) chưa chọn thợ.`)
  }
  return out
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)

export async function detailOf(tx: Tx, auth: Auth, o: OrderRow): Promise<OrderDetail> {
  const content = await loadContent(tx, o)
  const payments = await tx<
    {
      id: string
      amount: number
      method: PaymentView['method']
      accountName: string
      receivedAt: Date
      recordedBy: string
      voidedAt: Date | null
      voidReason: string | null
      voidedBy: string | null
    }[]
  >`
    select p.id, p.amount::int as amount, p.method, coalesce(m.name, 'Trừ cọc của lịch') as account_name,
           p.received_at, p.recorded_by, p.voided_at, p.void_reason, p.voided_by
    from payments p left join money_accounts m on m.id = p.money_account_id
    where p.order_id = ${o.id} order by p.received_at`
  const refundRows = await tx<
    {
      id: string
      amount: string
      method: 'cash' | 'transfer'
      accountName: string
      reason: string
      refundedByName: string | null
      refundedAt: Date
      revenueDate: string
      needsOwnerReview: boolean
      reviewedAt: Date | null
    }[]
  >`
    select r.id, r.amount, r.method, m.name as account_name, r.reason, u.display_name as refunded_by_name,
           r.refunded_at, r.revenue_date::text, r.needs_owner_review, r.reviewed_at
    from order_refunds r join money_accounts m on m.id = r.money_account_id left join users u on u.id = r.refunded_by
    where r.order_id = ${o.id} order by r.refunded_at`
  const refundAllocs = refundRows.length
    ? await tx<{ refundId: string; name: string; amount: string }[]>`
        select a.refund_id, u.display_name as name, a.amount
        from order_refund_allocations a join users u on u.id = a.staff_user_id
        where a.order_id = ${o.id} order by a.amount desc`
    : []
  const tipRows = await tx<
    {
      id: string
      staffUserId: string
      staffName: string
      amount: string
      recordedByName: string | null
      recordedAt: Date
      payoutId: string | null
      voidedAt: Date | null
      voidReason: string | null
    }[]
  >`
    select t.id, t.staff_user_id, us.display_name as staff_name, t.amount, ur.display_name as recorded_by_name,
           t.recorded_at, t.payout_id, t.voided_at, t.void_reason
    from tip_holdings t join users us on us.id = t.staff_user_id left join users ur on ur.id = t.recorded_by
    where t.order_id = ${o.id} order by t.recorded_at`
  // Cọc đã xác nhận của lịch còn chưa trừ (app tự trừ khi bấm Làm xong hoặc xác nhận),
  // và cọc đã ghi nhưng chờ xác nhận (xác nhận xong app tự trừ, S41, S53)
  const [dep] = o.appointmentId
    ? await tx<{ available: string; pending: string }[]>`
        select coalesce(sum(d.amount - coalesce(d.resolved_amount, 0) - app.deposit_applied(d.id))
                          filter (where d.status = 'confirmed'), 0) as available,
               coalesce(sum(d.amount) filter (where d.status = 'recorded'), 0) as pending
        from appointment_deposits d where d.appointment_id = ${o.appointmentId}`
    : []
  const [customer] = o.customerId
    ? await tx<{ id: string; name: string; phone: string | null }[]>`
        select id, name, phone from customers where id = ${o.customerId}`
    : []
  let appointment: OrderDetail['appointment'] = null
  if (o.appointmentId) {
    const [a] = await tx<
      { id: string; startAt: Date; guestCount: number }[]
    >`select id, start_at, guest_count from appointments where id = ${o.appointmentId}`
    if (a) {
      const tz = await branchTz(tx, o.branchId)
      appointment = {
        id: a.id,
        date: toLocalDate(a.startAt, tz),
        startTime: toLocalTime(a.startAt, tz),
        guestNo: o.guestNo,
        guestCount: a.guestCount,
      }
    }
  }
  const tickets = await tx<
    {
      id: string
      issue: string
      cause: TicketView['cause']
      withinWarranty: boolean
      outcome: TicketView['outcome']
      repairedBy: string | null
      compensationPercent: number | null
      note: string | null
      createdBy: string
      createdAt: Date
      voidedAt: Date | null
      voidReason: string | null
      needsOwnerReview: boolean
      reviewedBy: string | null
      usedById: string | null
      usedByCode: number | null
    }[]
  >`
    select t.id, t.issue, t.cause, t.within_warranty, t.outcome, t.repaired_by, t.compensation_percent, t.note,
           t.created_by, t.created_at, t.voided_at, t.void_reason, t.needs_owner_review, t.reviewed_by,
           u.id as used_by_id, u.code as used_by_code
    from order_service_tickets t
    left join lateral (
      select o2.id, o2.code from orders o2
      join order_discounts d2 on d2.order_id = o2.id and d2.rev = o2.content_rev
      where d2.ticket_id = t.id and o2.status <> 'cancelled' limit 1
    ) u on true
    where t.order_id = ${o.id} order by t.created_at`
  const tz = await branchTz(tx, o.branchId)
  const today = toLocalDate(new Date(), tz)
  const n = await names(tx, [
    o.createdBy,
    o.doneBy,
    o.confirmedBy,
    o.cancelledBy,
    o.reviewedBy,
    o.discountApprovedBy,
    o.adjustedBy,
    ...tickets.flatMap((t) => [t.createdBy, t.repairedBy, t.reviewedBy]),
    ...content.allocs.map((a) => a.staffUserId),
    ...content.discounts.map((d) => d.appliedBy),
    ...payments.flatMap((p) => [p.recordedBy, p.voidedBy]),
  ])
  const get = (id: string | null) => (id ? (n.get(id) ?? null) : null)
  const paid = payments.filter((p) => !p.voidedAt).reduce((a, p) => a + p.amount, 0)
  const refunded = refundRows.reduce((a, r) => a + Number(r.amount), 0)
  const can = canFor(auth, o)
  // Tài khoản ngân hàng nhận tiền thu chuyển khoản của cơ sở (cùng tài khoản app.bank_account_save sửa)
  const [bank] = can.recordPayment
    ? await tx<{ bankBin: string | null; bankAccountNo: string | null; bankAccountName: string | null }[]>`
        select bank_bin, bank_account_no, bank_account_name from money_accounts
        where branch_id = ${o.branchId} and type = 'bank' and is_active order by code limit 1`
    : []
  const [bill] = await tx<{ at: Date | null }[]>`
    select max(finished_at) as at from print_jobs where order_id = ${o.id} and status = 'printed'`

  return {
    id: o.id,
    code: o.code,
    codeLabel: codeLabel(o.code),
    branchId: o.branchId,
    status: o.status,
    serviceDate: o.serviceDate,
    customer: customer ?? null,
    guestLabel: o.guestLabel,
    appointment,
    items: content.items.map((it) => ({
      position: it.position,
      type: it.lineType,
      serviceId: it.serviceId,
      comboId: it.comboId,
      name: it.name,
      unit: it.unit,
      priceMode: it.priceMode,
      listMin: it.listMin,
      listMax: it.listMax,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      grossAmount: it.grossAmount,
      discountAmount: it.discountAmount,
      netAmount: it.netAmount,
      belowAmount: it.belowAmount,
      belowReason: it.belowReason,
      outOfRange: it.outOfRange,
      hasHardening: it.hasHardening,
      unallocatedReason: it.unallocatedReason,
      staff: content.allocs
        .filter((a) => a.itemPosition === it.position)
        .map((a) => ({
          userId: a.staffUserId,
          name: get(a.staffUserId) ?? '—',
          allocatedNetAmount: a.allocatedNetAmount,
          commissionBaseAmount: a.commissionBaseAmount,
        })),
    })),
    discounts: content.discounts.map((d) => ({
      scope: d.scopePosition ?? 'order',
      kind: d.kind,
      percent: d.percent,
      amount: d.amount,
      reason: d.reason,
      appliedByName: get(d.appliedBy),
      ticketId: d.ticketId,
    })),
    input: toInput(content),
    warrantyActive: !!o.warrantyUntil && today <= o.warrantyUntil,
    tickets: tickets.map((t) => ({
      id: t.id,
      issue: t.issue,
      cause: t.cause,
      withinWarranty: t.withinWarranty,
      outcome: t.outcome,
      repairedByName: get(t.repairedBy),
      compensationPercent: t.compensationPercent,
      note: t.note,
      createdByName: get(t.createdBy),
      createdAt: new Date(t.createdAt).toISOString(),
      voided: !!t.voidedAt,
      voidReason: t.voidReason,
      needsOwnerReview: t.needsOwnerReview && !t.reviewedBy && !t.voidedAt,
      reviewedByName: get(t.reviewedBy),
      usedBy: t.usedById ? { id: t.usedById, codeLabel: codeLabel(t.usedByCode!) } : null,
    })),
    adjustedByName: get(o.adjustedBy),
    adjustedAt: iso(o.adjustedAt),
    adjustReason: o.adjustReason,
    grossAmount: o.grossAmount,
    discountAmount: o.discountAmount,
    netAmount: o.netAmount,
    paidAmount: paid,
    dueAmount: Math.max(0, o.netAmount - paid),
    depositAvailable: Number(dep?.available ?? 0),
    depositPending: pendingDepositShare(Number(dep?.pending ?? 0), o.guestNo, appointment?.guestCount ?? 1),
    refundedAmount: refunded,
    refundable: Math.max(0, paid - refunded),
    refunds: refundRows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      method: r.method,
      accountName: r.accountName,
      reason: r.reason,
      refundedByName: r.refundedByName,
      refundedAt: new Date(r.refundedAt).toISOString(),
      revenueDate: r.revenueDate,
      needsOwnerReview: r.needsOwnerReview && !r.reviewedAt,
      allocations: refundAllocs
        .filter((a) => a.refundId === r.id)
        .map((a) => ({ name: a.name, amount: Number(a.amount) })),
    })),
    tips: tipRows.map((t) => ({
      id: t.id,
      staffUserId: t.staffUserId,
      staffName: t.staffName,
      amount: Number(t.amount),
      recordedByName: t.recordedByName,
      recordedAt: new Date(t.recordedAt).toISOString(),
      paid: !!t.payoutId,
      voided: !!t.voidedAt,
      voidReason: t.voidReason,
    })),
    paymentStatus: paymentStatus(o.netAmount, paid, refunded),
    requiredLevel: o.requiredLevel,
    approval: o.discountApprovedBy
      ? {
          byName: get(o.discountApprovedBy),
          level: o.discountApprovedLevel,
          at: iso(o.discountApprovedAt),
          valid: approvalValid(o),
        }
      : null,
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      accountName: p.accountName,
      receivedAt: new Date(p.receivedAt).toISOString(),
      recordedByName: get(p.recordedBy),
      voided: !!p.voidedAt,
      voidReason: p.voidReason,
      voidedByName: get(p.voidedBy),
    })),
    hasHardening: o.hasHardening,
    warrantyUntil: o.warrantyUntil,
    hasCustomLines: content.items.some((it) => it.lineType === 'custom'),
    hasOutOfRange: content.items.some((it) => it.outOfRange),
    createdByName: get(o.createdBy),
    createdAt: new Date(o.createdAt).toISOString(),
    doneByName: get(o.doneBy),
    doneAt: iso(o.doneAt),
    confirmedByName: get(o.confirmedBy),
    confirmedAt: iso(o.confirmedAt),
    cancelledByName: get(o.cancelledBy),
    cancelledAt: iso(o.cancelledAt),
    cancelReason: o.cancelReason,
    needsOwnerReview: o.needsOwnerReview,
    reviewedByName: get(o.reviewedBy),
    version: o.version,
    doneProblems: problemsOf(content),
    can,
    transferQr:
      bank?.bankBin && bank.bankAccountNo && bank.bankAccountName
        ? { bankBin: bank.bankBin, accountNo: bank.bankAccountNo, accountName: bank.bankAccountName }
        : null,
    billPrintedAt: iso(bill?.at ?? null),
  }
}

export async function getOrder(auth: Auth, id: string) {
  return withUser(auth.userId, async (tx) => detailOf(tx, auth, await loadRow(tx, id)))
}

/** Lịch sử thao tác trên đơn (người xem được đơn thì xem được lịch sử). */
export async function orderAudit(auth: Auth, id: string) {
  return withUser(auth.userId, async (tx) => {
    await loadRow(tx, id)
    const rows = await tx<
      {
        id: string
        action: string
        actorName: string | null
        beforeJson: unknown
        afterJson: unknown
        reason: string | null
        occurredAt: Date
      }[]
    >`select e.id::text as id, e.action, u.display_name as actor_name, e.before_json, e.after_json, e.reason,
             e.occurred_at
      from order_audit_events e left join users u on u.id = e.actor_user_id
      where e.order_id = ${id} order by e.id`
    return rows.map((r) => ({ ...r, occurredAt: new Date(r.occurredAt).toISOString() }))
  })
}

// ---------------------------------------------------------------- Ghi nội dung

async function writeContent(tx: Tx, userId: string, orderId: string, rev: number, c: ComputedOrder) {
  const it = c.items
  if (it.length > 0) {
    await tx`
      insert into order_items (order_id, rev, position, line_type, service_id, combo_id, name, unit, price_mode,
        list_min, list_max, unit_price, quantity, gross_amount, below_amount, below_reason, line_discount_amount,
        order_discount_amount, discount_amount, net_amount, shop_borne_amount, out_of_range, has_hardening,
        unallocated_reason)
      select ${orderId}::uuid, ${rev}::int, * from unnest(
        ${it.map((_, i) => i)}::int[], ${it.map((x) => x.type)}::text[], ${it.map((x) => x.serviceId)}::uuid[],
        ${it.map((x) => x.comboId)}::uuid[], ${it.map((x) => x.name)}::text[], ${it.map((x) => x.unit)}::text[],
        ${it.map((x) => x.priceMode)}::text[], ${it.map((x) => x.listMin)}::bigint[],
        ${it.map((x) => x.listMax)}::bigint[], ${it.map((x) => x.unitPrice)}::bigint[],
        ${it.map((x) => x.quantity)}::int[], ${it.map((x) => x.grossAmount)}::bigint[],
        ${it.map((x) => x.belowAmount)}::bigint[], ${it.map((x) => x.belowReason)}::text[],
        ${it.map((x) => x.lineDiscountAmount)}::bigint[], ${it.map((x) => x.orderDiscountAmount)}::bigint[],
        ${it.map((x) => x.discountAmount)}::bigint[], ${it.map((x) => x.netAmount)}::bigint[],
        ${it.map((x) => x.shopBorneAmount)}::bigint[], ${it.map((x) => String(x.outOfRange))}::text[]::boolean[],
        ${it.map((x) => String(x.hasHardening))}::text[]::boolean[], ${it.map((x) => x.unallocatedReason)}::text[])`
  }
  const d = c.discounts
  if (d.length > 0) {
    await tx`
      insert into order_discounts (order_id, rev, position, scope_position, kind, percent, amount, shop_borne, reason,
        applied_by, ticket_id)
      select ${orderId}::uuid, ${rev}::int, u.p, u.s, u.k, u.pc, u.a, u.sb, u.r, ${userId}::uuid, u.t from unnest(
        ${d.map((_, i) => i)}::int[], ${d.map((x) => (x.scope === 'order' ? null : x.scope))}::int[],
        ${d.map((x) => x.kind)}::text[], ${d.map((x) => x.percent)}::int[], ${d.map((x) => x.amount)}::bigint[],
        ${d.map((x) => String(x.shopBorne))}::text[]::boolean[], ${d.map((x) => x.reason)}::text[],
        ${d.map((x) => x.ticketId)}::uuid[]) as u(p, s, k, pc, a, sb, r, t)`
  }
  const a = it.flatMap((x, i) => x.allocations.map((al) => ({ ...al, position: i })))
  if (a.length > 0) {
    await tx`
      insert into order_staff_allocations (order_id, rev, item_position, staff_user_id, allocated_net_amount,
        commission_base_amount)
      select ${orderId}::uuid, ${rev}::int, * from unnest(
        ${a.map((x) => x.position)}::int[], ${a.map((x) => x.userId)}::uuid[],
        ${a.map((x) => x.allocatedNetAmount)}::bigint[], ${a.map((x) => x.commissionBaseAmount)}::bigint[])`
  }
}

type Summary = { status: OrderStatus; net: number; lines: string[]; staff: string[] }
function summaryOf(status: OrderStatus, c: ComputedOrder): Summary {
  return {
    status,
    net: c.netAmount,
    lines: c.items.map((x) => `${x.name}${x.quantity > 1 ? ` ×${x.quantity}` : ''}: ${x.netAmount}`),
    staff: [...new Set(c.items.flatMap((x) => x.allocations.map((a) => a.userId)))],
  }
}

async function audit(
  tx: Tx,
  auth: Auth,
  o: { id: string; branchId: string },
  action: string,
  extra: { rev?: number; before?: unknown; after?: unknown; reason?: string | null } = {},
) {
  await tx`
    insert into order_audit_events (order_id, branch_id, actor_user_id, action, rev, before_json, after_json, reason)
    values (${o.id}, ${o.branchId}, ${auth.userId}, ${action}, ${extra.rev ?? null},
            ${extra.before == null ? null : tx.json(extra.before as never)},
            ${extra.after == null ? null : tx.json(extra.after as never)}, ${extra.reason ?? null})`
}

/** Kiểm và tính lại nội dung đơn ở server. */
async function prepare(
  tx: Tx,
  auth: Auth,
  branchId: string,
  input: OrderContentInput,
  current: { serviceDate: string; orderId: string } | null,
) {
  const currentServiceDate = current?.serviceDate ?? null
  const catalog = await loadCatalog(tx)
  const computed = computeOrder({ items: input.items, discounts: input.discounts }, lookupOf(catalog))
  if (computed.errors.length > 0) throw invalid(computed.errors[0]!, { errors: computed.errors })

  // Ưu đãi bù khiếu nại: phiếu còn dùng được của đúng khách, đúng %, đúng cơ sở (bước 2.18)
  const compensations = computed.discounts.filter((d) => d.kind === 'complaint_compensation')
  if (compensations.length > 0) {
    if (!input.customerId) throw invalid('Ưu đãi bù khiếu nại cần chọn đúng khách của phiếu.')
    const avail = await tx<{ ticketId: string; percent: number; branchId: string }[]>`
      select ticket_id, percent, branch_id from app.customer_compensations(${input.customerId}, ${current?.orderId ?? null})`
    for (const d of compensations) {
      const t = avail.find((a) => a.ticketId === d.ticketId)
      if (!t || t.percent !== d.percent || t.branchId !== branchId)
        throw invalid('Ưu đãi bù khiếu nại không còn dùng được cho khách này.')
    }
  }

  const staff = new Set((await branchStaff(tx, branchId)).map((s) => s.id))
  for (const it of computed.items)
    for (const a of it.allocations)
      if (!staff.has(a.userId)) throw invalid('Thợ được chọn không thuộc cơ sở này.')

  if (input.customerId) {
    const [c] = await tx`select id from customers where id = ${input.customerId}`
    if (!c) throw invalid('Không tìm thấy khách.')
  }

  if (!isIsoDate(input.serviceDate)) throw invalid('Ngày làm dịch vụ không hợp lệ.')
  if (input.serviceDate !== currentServiceDate) {
    const today = toLocalDate(new Date(), await branchTz(tx, branchId))
    if (input.serviceDate > today) throw invalid('Ngày làm dịch vụ không được sau hôm nay.')
    if (!hasPerm(auth, branchId, 'order.confirm') && input.serviceDate < addDays(today, -1))
      throw invalid('Chỉ chọn được ngày làm dịch vụ hôm nay hoặc hôm qua.')
  }
  return computed
}

/** Người lưu đủ mức duyệt thì lưu luôn là đã duyệt (C15). */
function selfApproves(auth: Auth, branchId: string, required: Level) {
  return levelAtLeast(required, 'manager') && levelAtLeast(levelOf(permsOf(auth, branchId)), required)
}

// ---------------------------------------------------------------- Tạo đơn (2.8)

export async function createOrder(auth: Auth, input: CreateOrderInput) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'order.create_draft')) throw forbidden('Không có quyền tạo đơn.')

  return withUser(auth.userId, async (tx) => {
    const computed = await prepare(tx, auth, branch.id, input, null)
    const hash = sha({ b: branch.id, d: docHash(input.customerId, input.serviceDate, computed) })

    // Chống tạo trùng (P3): cùng mã + cùng nội dung → trả đơn đã tạo; khác nội dung → 422.
    const replay = async () => {
      const [ex] = await tx<OrderRow[]>`
        select ${orderCols(tx)} from orders o
        where o.created_by = ${auth.userId} and o.create_request_id = ${input.createRequestId}`
      if (!ex) return null
      if (ex.createRequestHash !== hash) throw invalid('Đơn này đã lưu với nội dung khác. Mở đơn để sửa.')
      return ex
    }
    const existing = await replay()
    if (existing) return { order: await detailOf(tx, auth, existing), replayed: true }

    const approve = selfApproves(auth, branch.id, computed.requiredLevel)
    const [row] = await tx<{ id: string }[]>`
      insert into orders (branch_id, customer_id, service_date, gross_amount, discount_amount, net_amount,
                          has_hardening, required_level, pricing_hash, discount_approved_by, created_by, updated_by,
                          create_request_id, create_request_hash)
      values (${branch.id}, ${input.customerId}, ${input.serviceDate}, ${computed.grossAmount},
              ${computed.discountAmount}, ${computed.netAmount}, ${computed.hasHardening}, ${computed.requiredLevel},
              ${pricingHash(computed)}, ${approve ? auth.userId : null}, ${auth.userId}, ${auth.userId},
              ${input.createRequestId}, ${hash})
      on conflict (created_by, create_request_id) do nothing
      returning id`
    if (!row) {
      const again = await replay()
      if (!again) throw conflict('Không lưu được đơn. Thử lại.')
      return { order: await detailOf(tx, auth, again), replayed: true }
    }
    await writeContent(tx, auth.userId, row.id, 1, computed)
    await audit(tx, auth, { id: row.id, branchId: branch.id }, 'created', {
      rev: 1,
      after: summaryOf('in_progress', computed),
    })
    return { order: await detailOf(tx, auth, await loadRow(tx, row.id)), replayed: false }
  })
}

// ---------------------------------------------------------------- Sửa đơn (2.8, K10)

export async function updateOrder(auth: Auth, id: string, input: UpdateOrderInput) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id, true)
    const can = canFor(auth, row)
    if (!can.edit) {
      throw forbidden(
        row.status === 'awaiting_confirmation'
          ? 'Đơn đã bấm Làm xong, chỉ Nhung, Linh sửa được.'
          : row.status === 'in_progress'
            ? 'Chỉ người tạo đơn hoặc Nhung, Linh sửa được đơn. Báo người tạo nếu cần đổi.'
            : 'Đơn đã xác nhận hoặc đã huỷ, không sửa được.',
      )
    }
    const computed = await prepare(tx, auth, row.branchId, input, {
      serviceDate: row.serviceDate,
      orderId: row.id,
    })
    const current = await loadContent(tx, row)
    const catalog = await loadCatalog(tx)
    const currentComputed = computeOrder(toInput(current), lookupOf(catalog))
    const same =
      docHash(input.customerId, input.serviceDate, computed) ===
      docHash(row.customerId, row.serviceDate, currentComputed)

    if (row.version !== input.version) {
      // Gửi lại sau mất mạng mà server đã đúng nội dung gửi lên → coi là thành công [P24]
      if (same) return detailOf(tx, auth, row)
      throw conflict(
        'Đơn vừa được người khác sửa. Xem bản mới nhất rồi sửa lại.',
        await detailOf(tx, auth, row),
      )
    }
    if (same) return detailOf(tx, auth, row)

    const approve = selfApproves(auth, row.branchId, computed.requiredLevel)
    // Sửa đơn đã xác nhận (D04, bước 2.19): lý do bắt buộc; không nhỏ hơn số đã thu (hoàn tiền ở Đợt 3);
    // mức giảm phải còn được duyệt; người sửa có phần trong đơn → vào lại Cần xem lại [P31]
    const adjusting = row.status === 'confirmed'
    const reason = input.adjustReason?.trim() ?? ''
    let flagReview = false
    if (adjusting) {
      if (!reason) throw invalid('Cần ghi lý do sửa đơn đã xác nhận.')
      const [p] = await tx<{ paid: number }[]>`
        select coalesce(sum(amount), 0)::int as paid from payments where order_id = ${id} and voided_at is null`
      if (computed.netAmount < (p?.paid ?? 0))
        throw invalid(
          `Thành tiền mới ${formatVND(computed.netAmount)} nhỏ hơn số đã thu ${formatVND(p!.paid)}. Giữ thành tiền cũ và dùng Hoàn tiền cho phần trả lại khách.`,
        )
      const stillApproved =
        row.discountApprovalHash === pricingHash(computed) &&
        levelAtLeast(row.discountApprovedLevel ?? 'none', computed.requiredLevel)
      if (levelAtLeast(computed.requiredLevel, 'manager') && !stillApproved && !approve)
        throw forbidden(
          computed.requiredLevel === 'owner'
            ? 'Mức giảm trên 20% cần Linh sửa hoặc duyệt.'
            : 'Mức giảm cần Nhung hoặc Linh duyệt.',
        )
      flagReview =
        computed.items.some((it) => it.allocations.some((a) => a.userId === auth.userId)) &&
        !hasPerm(auth, row.branchId, 'review_queue.read')
    }
    const [updated] = await tx<{ contentRev: number }[]>`
      update orders set
        customer_id = ${input.customerId}, service_date = ${input.serviceDate},
        gross_amount = ${computed.grossAmount}, discount_amount = ${computed.discountAmount},
        net_amount = ${computed.netAmount}, has_hardening = ${computed.hasHardening},
        required_level = ${computed.requiredLevel}, pricing_hash = ${pricingHash(computed)},
        content_rev = content_rev + 1,
        discount_approved_by = ${approve ? auth.userId : row.discountApprovedBy},
        discount_approval_hash = ${approve ? null : row.discountApprovalHash},
        adjust_reason = ${adjusting ? reason : null},
        needs_owner_review = case when ${flagReview} then true else needs_owner_review end,
        reviewed_by = case when ${flagReview} then null else reviewed_by end,
        reviewed_at = case when ${flagReview} then null else reviewed_at end
      where id = ${id} and version = ${input.version}
      returning content_rev`
    if (!updated) {
      throw conflict(
        'Đơn vừa được người khác sửa. Xem bản mới nhất rồi sửa lại.',
        await detailOf(tx, auth, await loadRow(tx, id)),
      )
    }
    await writeContent(tx, auth.userId, id, updated.contentRev, computed)
    await audit(tx, auth, row, adjusting ? 'adjusted' : 'updated', {
      rev: updated.contentRev,
      before: summaryOf(row.status, currentComputed),
      after: summaryOf(row.status, computed),
      reason: adjusting ? reason : null,
    })
    return detailOf(tx, auth, await loadRow(tx, id))
  })
}

// ---------------------------------------------------------------- Chuyển trạng thái (2.8–2.10)

async function checkVersion(tx: Tx, auth: Auth, row: OrderRow, version: number) {
  if (row.version !== version)
    throw conflict(
      'Đơn vừa được người khác sửa. Xem bản mới nhất rồi thao tác lại.',
      await detailOf(tx, auth, row),
    )
}

async function afterUpdate(tx: Tx, auth: Auth, id: string, updated: unknown) {
  if (!updated)
    throw conflict(
      'Đơn vừa được người khác sửa. Xem bản mới nhất rồi thao tác lại.',
      await detailOf(tx, auth, await loadRow(tx, id)),
    )
}

export async function markDone(auth: Auth, id: string, version: number) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id, true)
    const can = canFor(auth, row)
    if (!can.done) {
      throw forbidden(
        row.status === 'in_progress'
          ? 'Không có quyền bấm Làm xong.'
          : 'Đơn không còn ở trạng thái Đang làm.',
      )
    }
    await checkVersion(tx, auth, row, version)
    const problems = problemsOf(await loadContent(tx, row))
    if (problems.length > 0) throw invalid(problems[0]!, { problems })
    // S41: Làm xong là xác nhận luôn khi người bấm xác nhận được và không còn giảm giá chờ duyệt;
    // giảm giá cần Nhung, Linh duyệt thì sang Chờ xác nhận (C15, K12), không tự duyệt khi chỉ bấm Làm xong.
    const confirmNow = can.confirm && !(levelAtLeast(row.requiredLevel, 'manager') && !approvalValid(row))
    const [u] = await tx`
      update orders set status = ${confirmNow ? 'confirmed' : 'awaiting_confirmation'}
      where id = ${id} and version = ${version} returning id`
    await afterUpdate(tx, auth, id, u)
    await audit(tx, auth, row, 'done')
    if (confirmNow) await audit(tx, auth, row, 'confirmed')
    if (row.appointmentId) {
      if (confirmNow) await tx`select app.sync_appointment(${row.appointmentId})`
      // Cọc của lịch trừ vào bill (test 35, 54)
      await tx`select app.apply_deposits(${id})`
    }
    return detailOf(tx, auth, await loadRow(tx, id))
  })
}

export async function confirmOrder(auth: Auth, id: string, version: number) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id, true)
    const can = canFor(auth, row)
    if (!can.confirm) {
      throw forbidden(
        can.confirmBlocked ??
          (['confirmed', 'cancelled'].includes(row.status)
            ? 'Đơn đã xác nhận hoặc đã huỷ.'
            : 'Không có quyền xác nhận bill.'),
      )
    }
    await checkVersion(tx, auth, row, version)
    const problems = problemsOf(await loadContent(tx, row))
    if (problems.length > 0) throw invalid(problems[0]!, { problems })
    // Xác nhận là đồng ý mức giảm trong phạm vi của mình (C15)
    const approve = levelAtLeast(row.requiredLevel, 'manager') && !approvalValid(row)
    const [u] = await tx`
      update orders set status = 'confirmed',
        discount_approved_by = ${approve ? auth.userId : row.discountApprovedBy},
        discount_approval_hash = ${approve ? null : row.discountApprovalHash}
      where id = ${id} and version = ${version} returning id`
    await afterUpdate(tx, auth, id, u)
    if (row.appointmentId) {
      await tx`select app.sync_appointment(${row.appointmentId})`
      // Cọc xác nhận sau khi bấm Làm xong, hoặc xác nhận thẳng từ Đang làm: trừ nốt (test 35, 54)
      await tx`select app.apply_deposits(${id})`
    }
    await audit(tx, auth, row, 'confirmed')
    return detailOf(tx, auth, await loadRow(tx, id))
  })
}

export async function cancelOrder(auth: Auth, id: string, version: number, reason: string) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id, true)
    if (!canFor(auth, row).cancel) {
      throw forbidden(
        row.status === 'confirmed'
          ? 'Chỉ Nhung, Linh huỷ được đơn đã xác nhận.'
          : 'Không huỷ được đơn này. Báo Nhung hoặc Linh.',
      )
    }
    await checkVersion(tx, auth, row, version)
    if (row.status === 'confirmed') {
      // K18: huỷ đơn đã xác nhận khi tiền đã thu (kể cả trừ cọc) đã hoàn hết
      const [c] = await tx<{ n: string }[]>`select app.order_net_collected(${id}) as n`
      if (Number(c?.n ?? 0) !== 0)
        throw invalid(
          'Đơn còn tiền đã thu chưa hoàn. Hoàn tiền (hoặc huỷ khoản trừ cọc để cọc về lịch) trước khi huỷ đơn.',
        )
    } else {
      const [paid] = await tx`select 1 from payments where order_id = ${id} and voided_at is null limit 1`
      if (paid) throw invalid('Đơn đã có khoản thu. Huỷ khoản thu trước khi huỷ đơn.')
    }
    const [u] = await tx`
      update orders set status = 'cancelled', cancel_reason = ${reason.trim()}
      where id = ${id} and version = ${version} returning id`
    await afterUpdate(tx, auth, id, u)
    if (row.appointmentId) await tx`select app.sync_appointment(${row.appointmentId})`
    await audit(tx, auth, row, 'cancelled', { reason: reason.trim() })
    return detailOf(tx, auth, await loadRow(tx, id))
  })
}

export async function approveDiscounts(auth: Auth, id: string, version: number) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id, true)
    if (!canFor(auth, row).approveDiscount) {
      throw forbidden(
        row.requiredLevel === 'owner'
          ? 'Giảm giá trên 20% chỉ Linh duyệt được.'
          : 'Không có quyền duyệt giảm giá.',
      )
    }
    await checkVersion(tx, auth, row, version)
    const [u] = await tx`
      update orders set discount_approved_by = ${auth.userId}, discount_approval_hash = null
      where id = ${id} and version = ${version} returning id`
    await afterUpdate(tx, auth, id, u)
    await audit(tx, auth, row, 'discount_approved')
    return detailOf(tx, auth, await loadRow(tx, id))
  })
}

export async function markReviewed(auth: Auth, id: string) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id, true)
    if (!canFor(auth, row).markReviewed) throw forbidden()
    await tx`update orders set reviewed_by = ${auth.userId}, reviewed_at = now() where id = ${id}`
    await audit(tx, auth, row, 'reviewed')
    return detailOf(tx, auth, await loadRow(tx, id))
  })
}

// ---------------------------------------------------------------- Tạo đơn từ lịch (2.12; module §5.4, §10)

/** Mã yêu cầu riêng cho đơn của từng khách, suy ra từ mã của lần bấm (bấm lại không tạo thêm). Khách 1 dùng mã gốc. */
function guestRequestId(base: string, guestNo: number) {
  if (guestNo === 1) return base
  const h = createHash('sha256').update(`${base}:${guestNo}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export type GuestInput = { guestNo: number; name?: string | null; phone?: string | null }

/**
 * Tạo đơn từ lịch (S06, S08): tạo luôn đơn cho mọi khách của lịch chưa có đơn, mỗi khách một đơn ngang nhau.
 * Khách 1 là người đặt (gắn hồ sơ như cũ). Khách khác: có tên → tạo/gắn hồ sơ; để trống → đơn ghi
 * "Khách đi cùng <tên người đặt>", không tạo hồ sơ. Bấm lại (cùng mã) không ra thêm đơn (test 28).
 */
export async function createOrderFromAppointment(
  auth: Auth,
  appointmentId: string,
  input: { createRequestId: string; guests?: GuestInput[] },
) {
  if (!isUuid(appointmentId)) throw notFound('Không tìm thấy lịch.')
  return withUser(auth.userId, async (tx) => {
    const [a] = await tx<
      {
        id: string
        branchId: string
        status: string
        customerId: string | null
        customerDisplayName: string
        phone: string | null
        guestCount: number
      }[]
    >`select id, branch_id, status, customer_id, customer_display_name, phone, guest_count
      from appointments where id = ${appointmentId} for update`
    if (!a) throw notFound('Không tìm thấy lịch.')
    if (
      !hasPerm(auth, a.branchId, 'appointments.create_order') ||
      !hasPerm(auth, a.branchId, 'order.create_draft')
    )
      throw forbidden('Không có quyền tạo đơn từ lịch.')

    const details = async (ids: string[]) => {
      const out: OrderDetail[] = []
      for (const id of ids) out.push(await detailOf(tx, auth, await loadRow(tx, id)))
      return out
    }

    // Gửi lại cùng mã: trả các đơn đã tạo lần trước
    const reqIds = [1, 2, 3, 4].map((n) => guestRequestId(input.createRequestId, n))
    const mine = await tx<OrderRow[]>`
      select ${orderCols(tx)} from orders o
      where o.created_by = ${auth.userId} and o.create_request_id = any(${reqIds}::uuid[])
      order by o.guest_no nulls first`
    if (mine.length) {
      if (mine.some((m) => m.appointmentId !== appointmentId))
        throw invalid('Mã yêu cầu đã dùng cho đơn khác. Tải lại trang.')
      const orders = await details(mine.map((m) => m.id))
      return { orders, order: orders[0]!, replayed: true }
    }

    if (!['pending', 'confirmed', 'arrived', 'in_progress'].includes(a.status))
      throw invalid('Lịch đã huỷ, không đến hoặc đã hoàn thành. Tạo lịch mới cho khách rồi bấm Tạo đơn.')

    const linked = (
      await tx<{ id: string; code: number; status: OrderStatus; visible: boolean; guestNo: number | null }[]>`
        select id, code, status, visible, guest_no from app.appointment_orders(${appointmentId})`
    ).filter((o) => o.status !== 'cancelled')
    const taken = new Set(linked.map((o) => o.guestNo))
    const missing = Array.from({ length: a.guestCount }, (_, i) => i + 1).filter((n) => !taken.has(n))
    if (missing.length === 0) {
      // Đủ đơn rồi: mở đơn đầu tiên người bấm xem được (bấm hai lần không ra hai đơn)
      const v = linked.find((o) => o.visible)
      if (v) {
        const orders = await details([v.id])
        return { orders, order: orders[0]!, replayed: true }
      }
      throw conflict(`Lịch đã có đủ đơn cho ${a.guestCount} khách.`)
    }

    const today = toLocalDate(new Date(), await branchTz(tx, a.branchId))
    const empty = computeOrder(
      { items: [], discounts: [] },
      { service: () => undefined, combo: () => undefined },
    )
    const created: string[] = []
    for (const n of missing) {
      let customerId: string | null = null
      let label: string | null = null
      if (n === 1) {
        // Người đặt: lịch đã có khách → dùng; có SĐT trùng tên → dùng hồ sơ đó; không thì tạo mới.
        customerId = a.customerId
        if (!customerId) {
          if (a.phone) {
            const same = await tx<{ id: string; name: string }[]>`
              select id, name from customers where phone = ${a.phone} order by created_at`
            customerId =
              same.find((c) => foldVietnamese(c.name) === foldVietnamese(a.customerDisplayName))?.id ?? null
          }
          customerId ??= (await insertCustomer(tx, auth, a.customerDisplayName, a.phone)).id
          await tx`select app.appointment_link_customer(${appointmentId}, ${customerId})`
        }
      } else {
        const g = input.guests?.find((x) => x.guestNo === n)
        const name = g?.name?.trim() || null
        const p = normalizePhone(g?.phone)
        if (!p.ok) throw invalid(`Khách ${n}: ${p.error}`)
        if (name) {
          if (p.value) {
            const same = await tx<{ id: string; name: string }[]>`
              select id, name from customers where phone = ${p.value} order by created_at`
            customerId = same.find((c) => foldVietnamese(c.name) === foldVietnamese(name))?.id ?? null
          }
          customerId ??= (await insertCustomer(tx, auth, name, p.value)).id
        } else {
          label = `Khách đi cùng ${a.customerDisplayName}`.slice(0, 120)
        }
      }
      const [row] = await tx<{ id: string }[]>`
        insert into orders (branch_id, customer_id, appointment_id, service_date, pricing_hash, created_by, updated_by,
                            create_request_id, create_request_hash, guest_no, guest_label)
        values (${a.branchId}, ${customerId}, ${appointmentId}, ${today}, ${pricingHash(empty)}, ${auth.userId},
                ${auth.userId}, ${guestRequestId(input.createRequestId, n)},
                ${sha({ appointment: appointmentId, guest: n })}, ${n}, ${label})
        on conflict (created_by, create_request_id) do nothing
        returning id`
      if (!row) throw conflict('Không tạo được đơn. Thử lại.')
      await audit(tx, auth, { id: row.id, branchId: a.branchId }, 'created_from_appointment', {
        rev: 1,
        after: { appointmentId, guestNo: n },
      })
      created.push(row.id)
    }
    await tx`select app.sync_appointment(${appointmentId})`
    const orders = await details(created)
    return { orders, order: orders[0]!, replayed: false }
  })
}

// ---------------------------------------------------------------- Danh sách (UI03)

/** Đơn cần Linh xem lại: Nhung sửa đơn đã xác nhận có phần mình (P31), huỷ đơn đã xác nhận (K18), đơn tự xác nhận
 *  từ trước S43 (Q04, đã bỏ), hoặc có phiếu ưu đãi bù khiếu nại do người không phải chủ lập (K15).
 *  Dùng chung cho danh sách và Tổng quan. */
export const reviewPending = (tx: Tx) => tx`(
  (o.needs_owner_review and o.reviewed_at is null)
  or exists (select 1 from order_service_tickets t where t.order_id = o.id and t.needs_owner_review
             and t.reviewed_at is null and t.voided_at is null)
  or exists (select 1 from order_refunds r where r.order_id = o.id and r.needs_owner_review
             and r.reviewed_at is null))`

export type OrderListItem = {
  id: string
  codeLabel: string
  customerName: string | null
  phoneMasked: string | null
  serviceDate: string
  createdTime: string
  staffNames: string[]
  netAmount: number
  paidAmount: number
  status: OrderStatus
  paymentStatus: PaymentStatus
  needsApproval: boolean
  flagged: boolean
  needsOwnerReview: boolean
  mine: boolean
}

export async function listOrders(
  auth: Auth,
  input: {
    branchId?: string
    from?: string
    to?: string
    filter?: OrderFilter
    q?: string
    staffId?: string
    method?: 'cash' | 'transfer'
    review?: boolean
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'order.create_draft') && !hasPerm(auth, branch.id, 'order.read_all'))
    throw forbidden()
  const readAll = hasPerm(auth, branch.id, 'order.read_all')
  const revenueAll = hasPerm(auth, branch.id, 'revenue.read_branch')
  const filter = input.filter ?? 'all'

  return withUser(auth.userId, async (tx) => {
    const tz = await branchTz(tx, branch.id)
    const today = toLocalDate(new Date(), tz)
    const from = input.from ?? today
    const to = input.to ?? from
    if (!isIsoDate(from) || !isIsoDate(to)) throw invalid('Khoảng ngày không hợp lệ.')
    if (to < from) throw invalid('Ngày kết thúc phải sau ngày bắt đầu.')
    if (addDays(from, MAX_RANGE_DAYS) < to) throw invalid(`Mỗi lần xem tối đa ${MAX_RANGE_DAYS} ngày.`)

    const q = foldVietnamese(input.q ?? '').slice(0, 100)
    const codeQ = /^#?\d{1,6}$/.test(q) ? Number(q.replace('#', '')) : null
    const like = q && codeQ === null ? `%${escapeLike(q)}%` : null
    const staffId = input.staffId && isUuid(input.staffId) ? (readAll ? input.staffId : auth.userId) : null
    // P41: đơn Đang làm, Chờ xác nhận, Cần xem lại xem mọi ngày, để đơn ngày cũ không bị quên (chưa vào doanh thu)
    const allDates = filter === 'awaiting_confirmation' || filter === 'in_progress' || !!input.review

    const rows = await tx<
      (OrderRow & { customerName: string | null; customerPhone: string | null; reviewPending: boolean })[]
    >`
      select ${orderCols(tx)}, c.name as customer_name, c.phone as customer_phone, ${reviewPending(tx)} as review_pending
      from orders o left join customers c on c.id = o.customer_id
      where o.branch_id = ${branch.id}
        and (${allDates} or o.service_date between ${from}::date and ${to}::date)
        and case ${filter}
              when 'in_progress' then o.status = 'in_progress'
              when 'awaiting_confirmation' then o.status = 'awaiting_confirmation'
              when 'confirmed' then o.status = 'confirmed'
              when 'cancelled' then o.status = 'cancelled'
              when 'unpaid' then o.status in ('awaiting_confirmation', 'confirmed')
                and o.net_amount > coalesce((select sum(p.amount) from payments p
                                             where p.order_id = o.id and p.voided_at is null), 0)
              else true end
        and (${codeQ}::int is null or o.code = ${codeQ}::int)
        and (${like}::text is null or c.search_norm like ${like} escape '\\')
        and (${staffId}::uuid is null or exists (
              select 1 from order_staff_allocations a
              where a.order_id = o.id and a.rev = o.content_rev and a.staff_user_id = ${staffId}::uuid))
        and (${input.method ?? null}::text is null or exists (
              select 1 from payments p where p.order_id = o.id and p.voided_at is null and p.method = ${input.method ?? null}))
        and (${!!input.review} = false or ${reviewPending(tx)})
      order by o.service_date desc, o.created_at desc
      limit ${MAX_ROWS}`

    const ids = rows.map((r) => r.id)
    const allocs = ids.length
      ? await tx<{ orderId: string; staffUserId: string; amount: number }[]>`
          select a.order_id, a.staff_user_id, sum(a.allocated_net_amount)::int as amount
          from order_staff_allocations a join orders o on o.id = a.order_id and a.rev = o.content_rev
          where a.order_id = any(${ids}::uuid[])
          group by a.order_id, a.staff_user_id`
      : []
    const paidRows = ids.length
      ? await tx<{ orderId: string; paid: number }[]>`
          select order_id, sum(amount)::int as paid from payments
          where order_id = any(${ids}::uuid[]) and voided_at is null group by order_id`
      : []
    // Phiếu hoàn (Đợt 3): trừ vào doanh thu đơn và phần từng thợ
    const refundRows = ids.length
      ? await tx<{ orderId: string; refunded: number }[]>`
          select order_id, sum(amount)::int as refunded from order_refunds
          where order_id = any(${ids}::uuid[]) group by order_id`
      : []
    const refundAllocs = ids.length
      ? await tx<{ orderId: string; staffUserId: string; amount: number }[]>`
          select order_id, staff_user_id, sum(amount)::int as amount from order_refund_allocations
          where order_id = any(${ids}::uuid[]) group by order_id, staff_user_id`
      : []
    const flags = ids.length
      ? await tx<{ orderId: string; flagged: boolean }[]>`
          select i.order_id, bool_or(i.out_of_range or i.line_type = 'custom' or i.below_amount > 0) as flagged
          from order_items i join orders o on o.id = i.order_id and i.rev = o.content_rev
          where i.order_id = any(${ids}::uuid[]) group by i.order_id`
      : []
    const n = await names(
      tx,
      allocs.map((a) => a.staffUserId),
    )
    const paid = new Map(paidRows.map((p) => [p.orderId, p.paid]))
    const refunded = new Map(refundRows.map((p) => [p.orderId, p.refunded]))
    const flagged = new Map(flags.map((f) => [f.orderId, f.flagged]))

    const items: OrderListItem[] = rows.map((r) => {
      const p = paid.get(r.id) ?? 0
      const rf = refunded.get(r.id) ?? 0
      return {
        id: r.id,
        codeLabel: codeLabel(r.code),
        customerName: r.customerName ?? r.guestLabel,
        phoneMasked: maskPhone(r.customerPhone),
        serviceDate: r.serviceDate,
        createdTime: toLocalTime(r.createdAt, tz),
        staffNames: [
          ...new Set(allocs.filter((a) => a.orderId === r.id).map((a) => n.get(a.staffUserId) ?? '—')),
        ],
        netAmount: r.netAmount,
        paidAmount: p,
        status: r.status,
        paymentStatus: paymentStatus(r.netAmount, p, rf),
        needsApproval: levelAtLeast(r.requiredLevel, 'manager') && !approvalValid(r),
        flagged: flagged.get(r.id) ?? false,
        needsOwnerReview: r.reviewPending,
        mine: r.createdBy === auth.userId,
      }
    })

    // Tổng: chỉ đơn Đã xác nhận vào doanh thu (Q01). Thợ chỉ thấy phần của mình (K09).
    const confirmed = rows.filter((r) => r.status === 'confirmed')
    const confirmedIds = new Set(confirmed.map((r) => r.id))
    const byStaff = new Map<string, number>()
    for (const a of allocs) {
      if (!confirmedIds.has(a.orderId)) continue
      if (!revenueAll && a.staffUserId !== auth.userId) continue
      byStaff.set(a.staffUserId, (byStaff.get(a.staffUserId) ?? 0) + a.amount)
    }
    for (const a of refundAllocs) {
      if (!confirmedIds.has(a.orderId)) continue
      if (!revenueAll && a.staffUserId !== auth.userId) continue
      byStaff.set(a.staffUserId, (byStaff.get(a.staffUserId) ?? 0) - a.amount)
    }
    const summary = {
      orderCount: confirmed.length,
      awaitingCount: rows.filter((r) => r.status === 'awaiting_confirmation').length,
      inProgressCount: rows.filter((r) => r.status === 'in_progress').length,
      grossAmount: revenueAll ? confirmed.reduce((s, r) => s + r.grossAmount, 0) : null,
      discountAmount: revenueAll ? confirmed.reduce((s, r) => s + r.discountAmount, 0) : null,
      // Doanh thu thuần = tiền thuần đơn − phần đã hoàn
      netAmount: revenueAll
        ? confirmed.reduce((s, r) => s + r.netAmount - (refunded.get(r.id) ?? 0), 0)
        : null,
      refundedAmount: revenueAll ? confirmed.reduce((s, r) => s + (refunded.get(r.id) ?? 0), 0) : null,
      paidAmount: revenueAll ? confirmed.reduce((s, r) => s + (paid.get(r.id) ?? 0), 0) : null,
      dueAmount: revenueAll
        ? confirmed.reduce((s, r) => s + Math.max(0, r.netAmount - (paid.get(r.id) ?? 0)), 0)
        : null,
      byStaff: [...byStaff.entries()]
        .map(([userId, amount]) => ({ userId, name: n.get(userId) ?? '—', amount }))
        .sort((a, b) => b.amount - a.amount),
    }
    return { items, summary, from, to, today, readAll, revenueAll, allDates }
  })
}
