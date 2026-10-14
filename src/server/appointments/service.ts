// Nghiệp vụ lịch hẹn (bước 1.4–1.9). Danh tính lấy từ phiên; mọi thao tác chạy dưới withUser nên RLS và
// trigger appointments_guard kiểm lại quyền ở DB. Thay đổi lịch + lịch sử + sự kiện thông báo trong một giao dịch.
import { createHash } from 'node:crypto'
import { normalizePhone } from '~/lib/phone'
import { escapeLike, foldVietnamese } from '~/lib/text'
import { addDays, formatIsoDate, fromLocal, isIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { type DepositBlock, type DepositState, depositBlock, depositState } from '../deposits/view'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import { emitEvent } from '../notifications/emit'
import { type ApptCan, type ApptStatus, appointmentCan } from './policy'
import type { CreateInput, ListFilter, UpdateInput } from './schema'

export const MAX_RANGE_DAYS = 62
export const MAX_ROWS = 500

type Row = {
  id: string
  branchId: string
  customerId: string | null
  customerDisplayName: string
  phone: string | null
  startAt: Date
  endAt: Date
  guestCount: number
  serviceSummary: string | null
  notes: string | null
  status: ApptStatus
  confirmedBy: string | null
  confirmedAt: Date | null
  customerCancelReportedAt: Date | null
  customerCancelReportedBy: string | null
  customerCancelNote: string | null
  cancelledBy: string | null
  cancelledAt: Date | null
  cancelReason: string | null
  outsideHours: boolean
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
  version: number
  createRequestHash: string
  depositRequired: boolean
  depositPerGuest: string | null
  depositSeasonId: string | null
  /** Có khi đọc bằng listAppointments/attentionList (tổng cọc của lịch) */
  depositPending?: string | null
  depositHeld?: string | null
  depositAny?: boolean | null
}

/** Dòng trên lịch: có SĐT (S10 thay B08 phần ô lịch), không có ghi chú (P11). */
export type ListItem = {
  id: string
  date: string
  startTime: string
  endTime: string
  startAt: string
  endAt: string
  name: string
  phone: string | null
  guestCount: number
  serviceSummary: string | null
  status: ApptStatus
  customerCancelReported: boolean
  outsideHours: boolean
  mine: boolean
  /** Nhãn cọc (K16): missing = Chưa cọc; pending = Cọc chờ xác nhận; held = Đã cọc; null = không cần cọc */
  depositState: DepositState | null
}

export type Warnings = {
  overlapCount: number
  duplicates: { id: string; startTime: string }[]
  outsideHours: boolean
}

export type Detail = ListItem & {
  customerId: string | null
  notes: string | null
  version: number
  createdByName: string | null
  updatedByName: string | null
  confirmedByName: string | null
  cancelledByName: string | null
  cancelReason: string | null
  customerCancelNote: string | null
  customerCancelReportedByName: string | null
  createdAt: string
  updatedAt: string
  can: ApptCan
  warnings: Warnings
  /** Đơn tạo từ lịch (kể cả đơn người xem không mở được, K09). */
  orders: {
    id: string
    codeLabel: string
    status: string
    visible: boolean
    guestNo: number | null
    name: string | null
  }[]
  /** Lịch tạo trong mùa cọc (C01); null = không cần cọc */
  deposit: DepositBlock | null
}

async function linkedOrders(tx: Tx, id: string) {
  const rows = await tx<
    {
      id: string
      code: number
      status: string
      visible: boolean
      guestNo: number | null
      customerName: string | null
    }[]
  >`select id, code, status, visible, guest_no, customer_name from app.appointment_orders(${id})`
  return rows.map((r) => ({
    id: r.id,
    codeLabel: `#${String(r.code).padStart(4, '0')}`,
    status: r.status,
    visible: r.visible,
    guestNo: r.guestNo,
    // Tên khách trên đơn chỉ hiện với đơn người xem mở được (K09)
    name: r.visible ? r.customerName : null,
  }))
}

const activeCount = (orders: { status: string }[]) => orders.filter((o) => o.status !== 'cancelled').length

type Settings = { openTime: string; closeTime: string; defaultDurationMin: number; timezone: string }

async function loadSettings(tx: Tx, branchId: string): Promise<Settings> {
  const [s] = await tx<Settings[]>`
    select to_char(s.open_time, 'HH24:MI') as open_time, to_char(s.close_time, 'HH24:MI') as close_time,
           s.default_duration_min, b.timezone
    from branches b join branch_booking_settings s on s.branch_id = b.id
    where b.id = ${branchId}`
  if (!s) throw notFound('Không tìm thấy cài đặt lịch của cơ sở.')
  return s
}

function toItem(r: Row, userId: string, tz: string): ListItem {
  return {
    id: r.id,
    date: toLocalDate(r.startAt, tz),
    startTime: toLocalTime(r.startAt, tz),
    endTime: toLocalTime(r.endAt, tz),
    startAt: new Date(r.startAt).toISOString(),
    endAt: new Date(r.endAt).toISOString(),
    name: r.customerDisplayName,
    phone: r.phone,
    guestCount: r.guestCount,
    serviceSummary: r.serviceSummary,
    status: r.status,
    customerCancelReported: r.customerCancelReportedAt != null,
    outsideHours: r.outsideHours,
    mine: r.createdBy === userId,
    depositState: depositState(
      r.depositRequired,
      r.status,
      Number(r.depositPending ?? 0),
      Number(r.depositHeld ?? 0),
      !!r.depositAny,
    ),
  }
}

/** Cột tổng cọc của lịch cho danh sách (chỉ lịch cần cọc) */
const DEPOSIT_COLS = (tx: Tx) => tx`
  left join lateral (
    select coalesce(sum(d.amount) filter (where d.status = 'recorded'), 0) as deposit_pending,
           coalesce(sum(d.amount - coalesce(d.resolved_amount, 0) - app.deposit_applied(d.id))
                    filter (where d.status = 'confirmed'), 0) as deposit_held,
           coalesce(bool_or(d.status <> 'voided'), false) as deposit_any
    from appointment_deposits d where d.appointment_id = a.id
  ) dp on a.deposit_required`

function perms(auth: Auth, branchId: string) {
  return auth.branches.find((b) => b.id === branchId)?.perms ?? []
}

function cleanPhone(raw: string | null | undefined) {
  const p = normalizePhone(raw)
  if (!p.ok) throw invalid(p.error)
  return p.value
}

const blankToNull = (s: string | null | undefined) => (s == null || s.trim() === '' ? null : s.trim())

function searchNorm(name: string, phone: string | null, service: string | null) {
  return foldVietnamese([name, phone ?? '', service ?? ''].join(' ')).slice(0, 300)
}

// ---------------------------------------------------------------- Cảnh báo (§8), tính lại ở server

async function computeWarnings(
  tx: Tx,
  branchId: string,
  start: Date,
  end: Date,
  phone: string | null,
  excludeId: string | null,
  settings: Settings,
): Promise<Warnings> {
  // Trùng giờ: A.start < B.end và B.start < A.end; không tính lịch huỷ, không đến (§8.1, test 12)
  const rows = await tx<{ id: string; phone: string | null; startAt: Date }[]>`
    select id, phone, start_at from appointments
    where branch_id = ${branchId}
      and status not in ('cancelled', 'no_show')
      and start_at < ${end} and ${start} < end_at
      and (${excludeId}::uuid is null or id <> ${excludeId}::uuid)`
  const duplicates = phone
    ? rows
        .filter((r) => r.phone === phone)
        .map((r) => ({ id: r.id, startTime: toLocalTime(r.startAt, settings.timezone) }))
    : []
  const ls = toLocalTime(start, settings.timezone)
  const le = toLocalTime(end, settings.timezone)
  return {
    overlapCount: rows.length,
    duplicates,
    outsideHours: ls < settings.openTime || le > settings.closeTime,
  }
}

export async function checkWarnings(
  auth: Auth,
  input: {
    branchId?: string
    date: string
    startTime: string
    endTime: string
    phone?: string | null
    excludeId?: string
  },
) {
  const branch = requireBranch(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const s = await loadSettings(tx, branch.id)
    const start = fromLocal(input.date, input.startTime, s.timezone)
    const end = fromLocal(input.date, input.endTime, s.timezone)
    const phone = normalizePhone(input.phone)
    return computeWarnings(
      tx,
      branch.id,
      start,
      end,
      phone.ok ? phone.value : null,
      input.excludeId ?? null,
      s,
    )
  })
}

/** Hồ sơ khách chọn kèm lịch phải tồn tại (RLS: cùng tổ chức). */
async function checkCustomer(tx: Tx, id: string | null | undefined) {
  if (!id) return null
  const [c] = await tx`select id from customers where id = ${id}`
  if (!c) throw invalid('Không tìm thấy hồ sơ khách.')
  return id
}

// ---------------------------------------------------------------- Tạo lịch (1.4)

function requestHash(v: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex')
}

function notifyText(r: { customerDisplayName: string; guestCount: number; serviceSummary: string | null }) {
  return [`${r.guestCount} khách`, r.serviceSummary].filter(Boolean).join(' · ')
}

export async function createAppointment(auth: Auth, input: CreateInput) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'appointments.create')) throw forbidden('Không có quyền tạo lịch.')
  const phone = cleanPhone(input.phone)
  const service = blankToNull(input.serviceSummary)
  const notes = blankToNull(input.notes)
  const name = input.customerDisplayName.trim()

  return withUser(auth.userId, async (tx) => {
    const s = await loadSettings(tx, branch.id)
    const start = fromLocal(input.date, input.startTime, s.timezone)
    const end = fromLocal(input.date, input.endTime, s.timezone)
    if (end <= start) throw invalid('Giờ kết thúc phải sau giờ bắt đầu.')
    const customerId = await checkCustomer(tx, input.customerId)

    const hash = requestHash({
      branch: branch.id,
      ...(customerId ? { customerId } : {}),
      name,
      phone,
      start: start.toISOString(),
      end: end.toISOString(),
      guests: input.guestCount,
      service,
      notes,
    })

    // Chống tạo trùng (test 17, P3): cùng mã + cùng nội dung → trả lịch đã tạo; khác nội dung → 422.
    const replay = async () => {
      const [ex] = await tx<Row[]>`select * from appointments
                                   where created_by = ${auth.userId} and create_request_id = ${input.createRequestId}`
      if (!ex) return null
      if (ex.createRequestHash !== hash) throw invalid('Lịch này đã lưu với nội dung khác. Mở lịch để sửa.')
      return ex
    }
    const existing = await replay()
    if (existing) {
      return {
        appointment: toItem(existing, auth.userId, s.timezone),
        replayed: true,
        warnings: await computeWarnings(
          tx,
          branch.id,
          existing.startAt,
          existing.endAt,
          existing.phone,
          existing.id,
          s,
        ),
      }
    }

    const [row] = await tx<Row[]>`
      insert into appointments (branch_id, customer_id, customer_display_name, phone, start_at, end_at, guest_count,
                                service_summary, notes, status, search_norm, created_by, updated_by,
                                create_request_id, create_request_hash)
      values (${branch.id}, ${customerId}, ${name}, ${phone}, ${start}, ${end}, ${input.guestCount}, ${service}, ${notes},
              'confirmed', ${searchNorm(name, phone, service)},
              ${auth.userId}, ${auth.userId}, ${input.createRequestId}, ${hash})
      on conflict (created_by, create_request_id) do nothing
      returning *`
    const created = row ?? (await replay())
    if (!created) throw conflict('Không lưu được lịch. Thử lại.')
    if (!row) {
      return {
        appointment: toItem(created, auth.userId, s.timezone),
        replayed: true,
        warnings: await computeWarnings(
          tx,
          branch.id,
          created.startAt,
          created.endAt,
          created.phone,
          created.id,
          s,
        ),
      }
    }

    const when = `${input.startTime} ${formatIsoDate(input.date).slice(0, 5)}`
    await emitEvent(tx, {
      branchId: branch.id,
      type: 'appointment.created',
      entityType: 'appointment',
      entityId: created.id,
      title: `Lịch mới ${when} · ${name}`,
      body: notifyText(created),
      pushBody: `Lịch mới ${when} — mở app xem.`,
      url: `/lich/${created.id}`,
    })
    const warnings = await computeWarnings(tx, branch.id, start, end, phone, created.id, s)
    return { appointment: toItem(created, auth.userId, s.timezone), replayed: false, warnings }
  })
}

// ---------------------------------------------------------------- Đọc

async function names(tx: Tx, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))]
  if (list.length === 0) return new Map<string, string>()
  const rows = await tx<{ id: string; displayName: string }[]>`
    select id, display_name from users where id = any(${list}::uuid[])`
  return new Map(rows.map((r) => [r.id, r.displayName]))
}

async function loadRow(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Không tìm thấy lịch.')
  // RLS: ngoài cơ sở của mình thì không thấy → 404 (§12)
  const [row] = await tx<Row[]>`select * from appointments where id = ${id}`
  if (!row) throw notFound('Không tìm thấy lịch.')
  return row
}

async function toDetail(tx: Tx, auth: Auth, row: Row): Promise<Detail> {
  const s = await loadSettings(tx, row.branchId)
  const n = await names(tx, [
    row.createdBy,
    row.updatedBy,
    row.confirmedBy,
    row.cancelledBy,
    row.customerCancelReportedBy,
  ])
  const get = (id: string | null) => (id ? (n.get(id) ?? null) : null)
  const orders = await linkedOrders(tx, row.id)
  const deposit = await depositBlock(tx, auth, row)
  return {
    ...toItem(row, auth.userId, s.timezone),
    customerId: row.customerId,
    notes: row.notes,
    version: row.version,
    createdByName: get(row.createdBy),
    updatedByName: get(row.updatedBy),
    confirmedByName: get(row.confirmedBy),
    cancelledByName: get(row.cancelledBy),
    cancelReason: row.cancelReason,
    customerCancelNote: row.customerCancelNote,
    customerCancelReportedByName: get(row.customerCancelReportedBy),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    can: appointmentCan(perms(auth, row.branchId), auth.userId, row, activeCount(orders)),
    warnings: ['cancelled', 'no_show'].includes(row.status)
      ? { overlapCount: 0, duplicates: [], outsideHours: row.outsideHours }
      : await computeWarnings(tx, row.branchId, row.startAt, row.endAt, row.phone, row.id, s),
    orders,
    deposit,
    // Nhãn theo các khoản cọc thật của lịch (dòng đọc bằng select * không có tổng cọc)
    depositState: deposit?.state ?? null,
  }
}

export async function getAppointment(auth: Auth, id: string) {
  return withUser(auth.userId, async (tx) => toDetail(tx, auth, await loadRow(tx, id)))
}

/** Chi tiết lịch trong một giao dịch đang mở (thao tác cọc trả về lịch đã cập nhật). */
export async function appointmentDetail(tx: Tx, auth: Auth, id: string) {
  return toDetail(tx, auth, await loadRow(tx, id))
}

export async function listAppointments(
  auth: Auth,
  input: { branchId?: string; from?: string; to?: string; filter?: ListFilter; q?: string },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'appointments.read_branch')) throw forbidden()
  const q = foldVietnamese(input.q ?? '').slice(0, 100)
  const filter = input.filter ?? 'active'

  return withUser(auth.userId, async (tx) => {
    const s = await loadSettings(tx, branch.id)
    let from: Date | null = null
    let to: Date | null = null
    if (input.from || input.to) {
      if (!input.from || !input.to || !isIsoDate(input.from) || !isIsoDate(input.to))
        throw invalid('Khoảng ngày không hợp lệ.')
      if (input.to < input.from) throw invalid('Ngày kết thúc phải sau ngày bắt đầu.')
      if (addDays(input.from, MAX_RANGE_DAYS) < input.to)
        throw invalid(`Mỗi lần xem tối đa ${MAX_RANGE_DAYS} ngày.`)
      from = fromLocal(input.from, '00:00', s.timezone)
      to = fromLocal(addDays(input.to, 1), '00:00', s.timezone)
    } else if (!q) {
      throw invalid('Chọn khoảng ngày hoặc nhập từ khoá tìm.')
    }
    // Tìm SĐT: so khớp cả số đã chuẩn hoá; kết quả không kèm số.
    const phoneQ = normalizePhone(input.q)
    const phoneDigits = phoneQ.ok && phoneQ.value ? phoneQ.value : null
    const like = q ? `%${escapeLike(q)}%` : null

    const rows = await tx<Row[]>`
      select a.*, dp.deposit_pending, dp.deposit_held, dp.deposit_any from appointments a ${DEPOSIT_COLS(tx)}
      where branch_id = ${branch.id}
        and (${from}::timestamptz is null or start_at >= ${from})
        and (${to}::timestamptz is null or start_at < ${to})
        and (${like}::text is null or search_norm like ${like} escape '\\'
             or (${phoneDigits}::text is not null and phone like ${phoneDigits ? `%${escapeLike(phoneDigits)}%` : null} escape '\\'))
        and case ${filter}
              when 'active' then status <> 'cancelled'
              when 'customer_cancel' then customer_cancel_reported_at is not null and status in ('pending', 'confirmed')
              when 'cancelled' then status = 'cancelled'
              when 'no_show' then status = 'no_show'
              else true end
      order by ${q && !from ? tx`start_at desc` : tx`start_at asc`}, created_at
      limit ${MAX_ROWS}`
    return { items: rows.map((r) => toItem(r, auth.userId, s.timezone)), settings: s }
  })
}

/**
 * Danh sách Cần xử lý cho người có quyền lịch mở rộng (§7.1). Quá giờ theo K02: qua giờ kết thúc.
 * Cọc (Đợt 3): cọc chờ xác nhận (Nhung, Linh), lịch chưa cọc (K16), cọc chờ hoàn/giữ (Linh, Nhung, Chin).
 */
export async function attentionList(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'appointments.manage_all'))
    return {
      customerCancel: [],
      overdue: [],
      depositsToConfirm: [],
      depositsMissing: [],
      depositsToResolve: [],
      depositsToReview: [],
    }
  return withUser(auth.userId, async (tx) => {
    const s = await loadSettings(tx, branch.id)
    const rows = await tx<Row[]>`
      select a.*, dp.deposit_pending, dp.deposit_held, dp.deposit_any from appointments a ${DEPOSIT_COLS(tx)}
      where branch_id = ${branch.id} and status in ('pending', 'confirmed')
        and (customer_cancel_reported_at is not null or end_at < now())
        and end_at > now() - interval '7 days'
      order by start_at limit 200`
    // Lịch cần cọc còn việc: chưa cọc (còn mở, chưa qua giờ), cọc chờ xác nhận, cọc còn giữ khi lịch đã kết thúc
    const dep = await tx<Row[]>`
      select a.*, dp.deposit_pending, dp.deposit_held, dp.deposit_any from appointments a ${DEPOSIT_COLS(tx)}
      where a.branch_id = ${branch.id} and a.deposit_required
        and ((dp.deposit_pending > 0)
          or (not dp.deposit_any and a.status in ('pending', 'confirmed') and a.end_at > now())
          or (dp.deposit_held > 0 and a.status in ('cancelled', 'no_show', 'completed')))
      order by a.start_at limit 200`
    const now = Date.now()
    const item = (r: Row) => toItem(r, auth.userId, s.timezone)
    const can = (p: string) => hasPerm(auth, branch.id, p)
    // Cọc xử lý khác gợi ý (hoàn khi nên giữ, hoặc ngược lại) → Linh xem lại [P49]
    const review = can('review_queue.read')
      ? await tx<Row[]>`
          select a.*, dp.deposit_pending, dp.deposit_held, dp.deposit_any from appointments a ${DEPOSIT_COLS(tx)}
          where a.branch_id = ${branch.id}
            and exists (select 1 from appointment_deposits x where x.appointment_id = a.id
                        and x.needs_owner_review and x.reviewed_at is null)
          order by a.start_at desc limit 100`
      : []
    return {
      depositsToReview: review.map(item),
      depositsToConfirm: can('deposits.confirm')
        ? dep.filter((r) => Number(r.depositPending ?? 0) > 0).map(item)
        : [],
      depositsMissing: dep
        .filter((r) => !r.depositAny && ['pending', 'confirmed'].includes(r.status))
        .map(item),
      depositsToResolve: can('deposits.resolve')
        ? dep
            .filter(
              (r) =>
                Number(r.depositHeld ?? 0) > 0 && ['cancelled', 'no_show', 'completed'].includes(r.status),
            )
            .map(item)
        : [],
      overdue: rows.filter((r) => new Date(r.endAt).getTime() < now).map(item),
      customerCancel: rows
        .filter((r) => r.customerCancelReportedAt && new Date(r.endAt).getTime() >= now)
        .map(item),
    }
  })
}

export async function auditTrail(auth: Auth, id: string) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id)
    const can = appointmentCan(perms(auth, row.branchId), auth.userId, row)
    if (!can.viewAudit) throw forbidden('Chỉ xem được lịch sử lịch do mình tạo.')
    const rows = await tx<
      {
        id: string
        action: string
        actorUserId: string | null
        beforeJson: unknown
        afterJson: unknown
        reason: string | null
        occurredAt: Date
      }[]
    >`select id::text as id, action, actor_user_id, before_json, after_json, reason, occurred_at
      from appointment_audit_events where appointment_id = ${id} order by id`
    const n = await names(
      tx,
      rows.map((r) => r.actorUserId),
    )
    return rows.map((r) => ({
      ...r,
      actorName: r.actorUserId ? (n.get(r.actorUserId) ?? null) : null,
      occurredAt: new Date(r.occurredAt).toISOString(),
    }))
  })
}

// ---------------------------------------------------------------- Sửa (1.5)

export async function updateAppointment(auth: Auth, id: string, input: UpdateInput) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id)
    const can = appointmentCan(
      perms(auth, row.branchId),
      auth.userId,
      row,
      activeCount(await linkedOrders(tx, row.id)),
    )
    if (!can.edit) {
      throw forbidden(
        ['cancelled', 'no_show', 'completed'].includes(row.status)
          ? 'Lịch đã kết thúc, không sửa được.'
          : 'Chỉ sửa được lịch do mình tạo, khi chưa tạo đơn và chưa đến giờ hẹn.',
      )
    }
    const s = await loadSettings(tx, row.branchId)

    const name = input.customerDisplayName?.trim() ?? row.customerDisplayName
    const phone = input.phone !== undefined ? cleanPhone(input.phone) : row.phone
    const service =
      input.serviceSummary !== undefined ? blankToNull(input.serviceSummary) : row.serviceSummary
    const notes = input.notes !== undefined ? blankToNull(input.notes) : row.notes
    const guests = input.guestCount ?? row.guestCount
    const date = input.date ?? toLocalDate(row.startAt, s.timezone)
    const start = fromLocal(date, input.startTime ?? toLocalTime(row.startAt, s.timezone), s.timezone)
    const end = fromLocal(date, input.endTime ?? toLocalTime(row.endAt, s.timezone), s.timezone)
    if (end <= start) throw invalid('Giờ kết thúc phải sau giờ bắt đầu.')
    const customerId =
      input.customerId !== undefined && input.customerId !== row.customerId
        ? await checkCustomer(tx, input.customerId)
        : row.customerId

    const same =
      customerId === row.customerId &&
      name === row.customerDisplayName &&
      phone === row.phone &&
      service === row.serviceSummary &&
      notes === row.notes &&
      guests === row.guestCount &&
      start.getTime() === new Date(row.startAt).getTime() &&
      end.getTime() === new Date(row.endAt).getTime()

    if (row.version !== input.version) {
      // Gửi lại sau mất mạng mà server đã đúng nội dung → coi là thành công [P24]
      if (same) return toDetail(tx, auth, row)
      throw conflict(
        'Lịch vừa được người khác sửa. Xem bản mới nhất rồi sửa lại.',
        await toDetail(tx, auth, row),
      )
    }
    if (same) return toDetail(tx, auth, row)

    // S08: số đơn luôn bằng số khách — không giảm số khách dưới khách đang có đơn (DB kiểm lại)
    if (guests < row.guestCount) {
      const [m] = await tx<{ max: number }[]>`select app.appointment_max_guest(${id}) as max`
      if (m && m.max > guests)
        throw invalid(`Lịch đang có đơn của khách thứ ${m.max}. Huỷ đơn đó trước khi giảm số khách.`)
    }

    const [updated] = await tx<Row[]>`
      update appointments set
        customer_id = ${customerId}, customer_display_name = ${name}, phone = ${phone}, start_at = ${start}, end_at = ${end},
        guest_count = ${guests}, service_summary = ${service}, notes = ${notes},
        search_norm = ${searchNorm(name, phone, service)}
      where id = ${id} and version = ${input.version}
      returning *`
    if (!updated) {
      throw conflict(
        'Lịch vừa được người khác sửa. Xem bản mới nhất rồi sửa lại.',
        await toDetail(tx, auth, await loadRow(tx, id)),
      )
    }

    const timeChanged =
      start.getTime() !== new Date(row.startAt).getTime() || end.getTime() !== new Date(row.endAt).getTime()
    if (timeChanged) {
      const oldWhen = `${toLocalTime(row.startAt, s.timezone)} ${formatIsoDate(toLocalDate(row.startAt, s.timezone)).slice(0, 5)}`
      const newWhen = `${toLocalTime(start, s.timezone)} ${formatIsoDate(date).slice(0, 5)}`
      await emitEvent(tx, {
        branchId: row.branchId,
        type: 'appointment.rescheduled',
        entityType: 'appointment',
        entityId: id,
        title: `Đổi giờ · ${name}`,
        body: `${oldWhen} → ${newWhen}`,
        pushBody: `Lịch ${oldWhen} đã đổi giờ — mở app xem.`,
        url: `/lich/${id}`,
      })
    }
    return toDetail(tx, auth, updated)
  })
}

// ---------------------------------------------------------------- Chuyển trạng thái (1.6)

export type Transition = 'cancel' | 'report_customer_cancel' | 'arrived' | 'no_show' | 'complete'

const TARGET: Record<Exclude<Transition, 'report_customer_cancel'>, ApptStatus> = {
  cancel: 'cancelled',
  arrived: 'arrived',
  no_show: 'no_show',
  complete: 'completed',
}

export async function transitionAppointment(
  auth: Auth,
  id: string,
  action: Transition,
  input: { version: number; reason?: string; note?: string },
) {
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, id)
    const can = appointmentCan(
      perms(auth, row.branchId),
      auth.userId,
      row,
      activeCount(await linkedOrders(tx, row.id)),
    )
    const s = await loadSettings(tx, row.branchId)
    const when = `${toLocalTime(row.startAt, s.timezone)} ${formatIsoDate(toLocalDate(row.startAt, s.timezone)).slice(0, 5)}`

    // Khách báo huỷ lần hai: giữ thời điểm cũ, chỉ thêm ghi chú vào lịch sử, không phát thông báo [P10, S12]
    if (action === 'report_customer_cancel' && row.customerCancelReportedAt) {
      if (!perms(auth, row.branchId).includes('appointments.report_customer_cancel')) throw forbidden()
      const note = input.note?.trim()
      if (note) {
        await tx`insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, reason)
                 values (${id}, ${row.branchId}, ${auth.userId}, 'note', ${note})`
      }
      return toDetail(tx, auth, row)
    }

    const allowed = {
      cancel: can.cancel,
      report_customer_cancel: can.reportCustomerCancel,
      arrived: can.markArrived,
      no_show: can.noShow,
      complete: can.complete,
    }[action]
    if (!allowed) {
      throw forbidden(
        action === 'cancel'
          ? 'Không huỷ được lịch này. Bấm Huỷ lịch để gửi yêu cầu cho Linh, Nhung, Chin.'
          : action === 'no_show' && ['pending', 'confirmed'].includes(row.status)
            ? 'Chưa đến giờ hẹn, chưa ghi khách không đến được.'
            : 'Không có quyền làm việc này với lịch ở trạng thái hiện tại.',
      )
    }
    const reason = input.reason?.trim() ?? ''
    if (action === 'cancel' && reason === '') throw invalid('Cần ghi lý do huỷ.')
    if (row.version !== input.version) {
      throw conflict(
        'Lịch vừa được người khác sửa. Xem bản mới nhất rồi thao tác lại.',
        await toDetail(tx, auth, row),
      )
    }

    const [updated] =
      action === 'report_customer_cancel'
        ? await tx<Row[]>`
            update appointments set customer_cancel_reported_at = now(), customer_cancel_note = ${input.note?.trim() || null}
            where id = ${id} and version = ${input.version} returning *`
        : await tx<Row[]>`
            update appointments set status = ${TARGET[action]}, cancel_reason = ${action === 'cancel' ? reason : row.cancelReason}
            where id = ${id} and version = ${input.version} returning *`
    if (!updated) {
      throw conflict(
        'Lịch vừa được người khác sửa. Xem bản mới nhất rồi thao tác lại.',
        await toDetail(tx, auth, await loadRow(tx, id)),
      )
    }

    const base = { branchId: row.branchId, entityType: 'appointment', entityId: id, url: `/lich/${id}` }
    if (action === 'cancel') {
      await emitEvent(tx, {
        ...base,
        type: 'appointment.cancelled',
        title: `Huỷ lịch ${when} · ${row.customerDisplayName}`,
        body: `Lý do: ${reason}`,
        pushBody: `Lịch ${when} đã huỷ — mở app xem.`,
      })
    } else if (action === 'report_customer_cancel') {
      await emitEvent(tx, {
        ...base,
        type: 'appointment.customer_cancel',
        title: `Yêu cầu huỷ lịch ${when} · ${row.customerDisplayName}`,
        body: input.note?.trim() ? `Lý do: ${input.note.trim()}` : 'Cần huỷ chính thức nếu đúng.',
        pushBody: `Có yêu cầu huỷ lịch ${when} — mở app xử lý.`,
      })
    }
    return toDetail(tx, auth, updated)
  })
}

// ---------------------------------------------------------------- Cài đặt lịch (1.15)

export async function getSettings(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  return withUser(auth.userId, async (tx) => {
    const s = await loadSettings(tx, branch.id)
    // Mùa cọc đang bật hôm nay: form tạo lịch hiện phần cọc và số gợi ý (module §5.1, §6.1, test 29–30)
    const [season] = await tx<{ name: string; endDate: string; amountPerGuest: string }[]>`
      select name, end_date::text as end_date, amount_per_guest
      from app.deposit_season_on(${branch.id}, (now() at time zone ${s.timezone})::date) where id is not null`
    return {
      ...s,
      depositSeason: season
        ? { name: season.name, endDate: season.endDate, amountPerGuest: Number(season.amountPerGuest) }
        : null,
    }
  })
}

export async function updateSettings(
  auth: Auth,
  input: { branchId?: string; openTime: string; closeTime: string; defaultDurationMin: number },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'booking_settings.manage'))
    throw forbidden('Chỉ chủ quán đổi được cài đặt lịch.')
  if (input.closeTime <= input.openTime) throw invalid('Giờ đóng cửa phải sau giờ mở cửa.')
  return withUser(auth.userId, async (tx) => {
    const before = await loadSettings(tx, branch.id)
    await tx`
      update branch_booking_settings
      set open_time = ${input.openTime}, close_time = ${input.closeTime},
          default_duration_min = ${input.defaultDurationMin}, updated_at = now(), updated_by = ${auth.userId}
      where branch_id = ${branch.id}`
    await tx`
      insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
      values (${auth.userId}, ${branch.id}, 'booking_settings.updated', 'branch', ${branch.id},
              ${tx.json({ before, after: input })})`
    return loadSettings(tx, branch.id)
  })
}

export { toLocalDate }
