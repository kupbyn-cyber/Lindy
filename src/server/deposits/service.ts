// Tiền cọc mùa Tết (module §6; Đợt 3 bước 3.4–3.7). Danh tính lấy từ phiên; mọi thao tác chạy dưới withUser nên RLS và
// trigger deposits_guard kiểm lại quyền, chuyển trạng thái, gợi ý hoàn/giữ ở DB. Bút toán do trigger deposits_ledger ghi.
// - Ghi cọc: mọi người (deposits.record), chống bấm hai lần bằng mã ghi cọc; Nhung, Linh nhận thông báo (test 31).
// - Xác nhận: Nhung, Linh (deposits.confirm) → tiền vào sổ. Huỷ: người ghi khi chưa xác nhận, hoặc Nhung, Linh.
// - Hoàn / giữ: Linh, Nhung, Chin (deposits.resolve) khi lịch đã huỷ, không đến hoặc xong mà còn dư; trái gợi ý → Cần
//   xem lại của Linh [P49].
import { formatVND } from '~/lib/money'
import { formatIsoDate, toLocalDate, toLocalTime } from '~/lib/time'
import { appointmentDetail } from '../appointments/service'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import { emitEvent } from '../notifications/emit'
import { type DepositStatus, RESOLVABLE_APPT } from './policy'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

type Appt = {
  id: string
  branchId: string
  status: string
  startAt: Date
  customerDisplayName: string
  depositRequired: boolean
}

async function loadAppt(tx: Tx, id: string) {
  if (!isUuid(id)) throw notFound('Không tìm thấy lịch.')
  const [a] = await tx<Appt[]>`
    select id, branch_id, status, start_at, customer_display_name, deposit_required from appointments where id = ${id}`
  if (!a) throw notFound('Không tìm thấy lịch.')
  return a
}

type DepRow = {
  id: string
  appointmentId: string
  branchId: string
  status: DepositStatus
  amount: string
  moneyAccountId: string
  recordedBy: string
  version: number
}

async function loadDeposit(tx: Tx, id: string) {
  if (!isUuid(id)) throw notFound('Không tìm thấy khoản cọc.')
  const [d] = await tx<DepRow[]>`
    select id, appointment_id, branch_id, status, amount, money_account_id, recorded_by, version
    from appointment_deposits where id = ${id} for update`
  if (!d) throw notFound('Không tìm thấy khoản cọc.')
  return d
}

async function tzOf(tx: Tx, branchId: string) {
  const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
  return b?.timezone ?? 'Asia/Ho_Chi_Minh'
}

// ---------------------------------------------------------------- Ghi cọc (3.6)

export async function recordDeposit(
  auth: Auth,
  appointmentId: string,
  input: { idempotencyKey: string; amount: number; method: 'cash' | 'transfer'; note?: string | null },
) {
  return withUser(auth.userId, async (tx) => {
    const a = await loadAppt(tx, appointmentId)
    if (!hasPerm(auth, a.branchId, 'deposits.record')) throw forbidden('Không có quyền ghi cọc.')
    if (!a.depositRequired) throw invalid('Lịch này không cần cọc (không tạo trong mùa cọc).')

    const [dup] = await tx<{ appointmentId: string; amount: string; method: string }[]>`
      select appointment_id, amount, method from appointment_deposits where idempotency_key = ${input.idempotencyKey}`
    if (dup) {
      if (dup.appointmentId !== a.id || Number(dup.amount) !== input.amount || dup.method !== input.method)
        throw invalid('Mã ghi cọc đã dùng cho khoản khác. Tải lại trang.')
      return appointmentDetail(tx, auth, a.id)
    }
    if (!['pending', 'confirmed', 'arrived', 'in_progress'].includes(a.status))
      throw invalid('Lịch đã kết thúc, không ghi cọc được.')

    const [account] = await tx<{ id: string }[]>`
      select id from money_accounts
      where branch_id = ${a.branchId} and is_active and type = ${input.method === 'cash' ? 'cash' : 'bank'}
      order by code limit 1`
    if (!account) throw invalid('Chưa có tài khoản nhận tiền cho hình thức này.')

    const note = input.note?.trim() || null
    const [row] = await tx<{ id: string }[]>`
      insert into appointment_deposits (appointment_id, branch_id, amount, method, money_account_id, note, recorded_by,
                                        idempotency_key)
      values (${a.id}, ${a.branchId}, ${input.amount}, ${input.method}, ${account.id}, ${note}, ${auth.userId},
              ${input.idempotencyKey})
      on conflict (idempotency_key) do nothing
      returning id`
    if (row) {
      const tz = await tzOf(tx, a.branchId)
      const when = `${toLocalTime(a.startAt, tz)} ${formatIsoDate(toLocalDate(a.startAt, tz)).slice(0, 5)}`
      await emitEvent(tx, {
        branchId: a.branchId,
        type: 'deposit.recorded',
        entityType: 'appointment',
        entityId: a.id,
        title: `Cọc chờ xác nhận · ${a.customerDisplayName}`,
        body: `${formatVND(input.amount)} ${input.method === 'cash' ? 'tiền mặt' : 'chuyển khoản'} · lịch ${when}`,
        // Màn hình khoá: không tên khách, SĐT, ghi chú (module §9.3)
        pushBody: `Có cọc ${formatVND(input.amount)} chờ xác nhận (lịch ${when}) — mở app xem.`,
        url: `/lich/${a.id}`,
      })
    }
    return appointmentDetail(tx, auth, a.id)
  })
}

// ---------------------------------------------------------------- Xác nhận, huỷ (3.6)

function checkVersion(d: DepRow, version: number) {
  if (d.version !== version)
    throw conflict('Khoản cọc vừa được người khác cập nhật. Xem bản mới nhất rồi thao tác lại.')
}

export async function confirmDeposit(auth: Auth, id: string, version: number) {
  return withUser(auth.userId, async (tx) => {
    const d = await loadDeposit(tx, id)
    if (!hasPerm(auth, d.branchId, 'deposits.confirm'))
      throw forbidden('Chỉ Nhung, Linh xác nhận được tiền cọc.')
    if (d.status === 'confirmed') return appointmentDetail(tx, auth, d.appointmentId) // bấm hai lần
    if (d.status !== 'recorded') throw invalid('Khoản cọc không còn chờ xác nhận.')
    checkVersion(d, version)
    await tx`update appointment_deposits set status = 'confirmed' where id = ${id} and version = ${version}`
    // S41: Làm xong là xác nhận bill luôn, nên cọc xác nhận sau khi đơn của lịch đã xong được trừ ngay vào bill
    // (trước đây trừ lúc Nhung xác nhận bill; test 35, 54)
    const done = await tx<{ id: string }[]>`
      select id from orders where appointment_id = ${d.appointmentId}
        and status in ('awaiting_confirmation', 'confirmed')
      order by guest_no nulls first, created_at`
    for (const o of done) await tx`select app.apply_deposits(${o.id})`
    return appointmentDetail(tx, auth, d.appointmentId)
  })
}

export async function voidDeposit(auth: Auth, id: string, version: number, reason: string) {
  return withUser(auth.userId, async (tx) => {
    const d = await loadDeposit(tx, id)
    const mine = d.recordedBy === auth.userId && hasPerm(auth, d.branchId, 'deposits.record')
    const allowed = hasPerm(auth, d.branchId, 'deposits.confirm') || (d.status === 'recorded' && mine)
    if (!allowed) throw forbidden('Chỉ người ghi (khi chưa xác nhận) hoặc Nhung, Linh huỷ được khoản cọc.')
    if (d.status !== 'recorded' && d.status !== 'confirmed') throw invalid('Khoản cọc này không huỷ được.')
    checkVersion(d, version)
    await tx`
      update appointment_deposits set status = 'voided', void_reason = ${reason.trim()}
      where id = ${id} and version = ${version}`
    return appointmentDetail(tx, auth, d.appointmentId)
  })
}

// ---------------------------------------------------------------- Hoàn cọc, giữ cọc (3.7)

export async function resolveDeposit(
  auth: Auth,
  id: string,
  action: 'refund' | 'forfeit',
  input: { version: number; reason: string; method?: 'cash' | 'transfer' | null },
) {
  return withUser(auth.userId, async (tx) => {
    const d = await loadDeposit(tx, id)
    if (!hasPerm(auth, d.branchId, 'deposits.resolve'))
      throw forbidden('Chỉ Linh, Nhung, Chin hoàn hoặc giữ cọc.')
    if (d.status !== 'confirmed') throw invalid('Chỉ hoàn hoặc giữ khoản cọc đã xác nhận.')
    const a = await loadAppt(tx, d.appointmentId)
    if (!RESOLVABLE_APPT.includes(a.status))
      throw invalid('Hoàn hoặc giữ cọc sau khi lịch đã huỷ, khách không đến, hoặc đã làm xong.')
    checkVersion(d, input.version)
    let account: string | null = null
    if (action === 'refund') {
      if (input.method) {
        const [acc] = await tx<{ id: string }[]>`
          select id from money_accounts
          where branch_id = ${d.branchId} and is_active and type = ${input.method === 'cash' ? 'cash' : 'bank'}
          order by code limit 1`
        if (!acc) throw invalid('Chưa có tài khoản cho hình thức này.')
        account = acc.id
      } else {
        account = d.moneyAccountId
      }
    }
    await tx`
      update appointment_deposits
      set status = ${action === 'refund' ? 'refunded' : 'forfeited'}, resolve_reason = ${input.reason.trim()},
          resolve_account_id = ${account}
      where id = ${id} and version = ${input.version}`
    return appointmentDetail(tx, auth, d.appointmentId)
  })
}

export async function reviewDeposit(auth: Auth, id: string) {
  return withUser(auth.userId, async (tx) => {
    const d = await loadDeposit(tx, id)
    if (!hasPerm(auth, d.branchId, 'review_queue.read')) throw forbidden('Chỉ chủ quán đánh dấu đã xem lại.')
    await tx`update appointment_deposits set reviewed_by = ${auth.userId}, reviewed_at = now() where id = ${id}`
    return appointmentDetail(tx, auth, d.appointmentId)
  })
}

// ---------------------------------------------------------------- Mùa cọc (3.4)

export type Season = {
  id: string
  name: string
  startDate: string
  endDate: string
  amountPerGuest: number
  refundNoticeHours: number
  forfeitOwnerUserId: string
  forfeitOwnerName: string | null
  isActive: boolean
  updatedByName: string | null
  updatedAt: string
}

export async function listSeasons(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  return withUser(auth.userId, async (tx) => {
    const rows = await tx<
      (Omit<Season, 'amountPerGuest' | 'updatedAt'> & { amountPerGuest: string; updatedAt: Date })[]
    >`
      select s.id, s.name, s.start_date::text as start_date, s.end_date::text as end_date, s.amount_per_guest,
             s.refund_notice_hours, s.forfeit_owner_user_id, uo.display_name as forfeit_owner_name, s.is_active,
             uu.display_name as updated_by_name, s.updated_at
      from deposit_seasons s
      left join users uo on uo.id = s.forfeit_owner_user_id
      left join users uu on uu.id = s.updated_by
      where s.branch_id = ${branch.id}
      order by s.start_date desc limit 20`
    const today = toLocalDate(new Date(), await tzOf(tx, branch.id))
    const manage = hasPerm(auth, branch.id, 'booking_settings.manage')
    const people = manage
      ? await tx<
          { id: string; displayName: string }[]
        >`select id, display_name from app.branch_staff(${branch.id})`
      : []
    const seasons = rows.map(
      (r): Season => ({
        ...r,
        amountPerGuest: Number(r.amountPerGuest),
        updatedAt: new Date(r.updatedAt).toISOString(),
      }),
    )
    return {
      today,
      seasons,
      current: seasons.find((s) => s.isActive && s.startDate <= today && today <= s.endDate) ?? null,
      people,
      me: auth.userId,
      can: { manage },
    }
  })
}

export async function saveSeason(
  auth: Auth,
  input: {
    branchId?: string
    id?: string | null
    name: string
    startDate: string
    endDate: string
    amountPerGuest: number
    refundNoticeHours: number
    forfeitOwnerUserId: string
    isActive: boolean
  },
) {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'booking_settings.manage')) throw forbidden('Chỉ chủ quán cài được mùa cọc.')
  await withUser(auth.userId, async (tx) => {
    await tx`
      select app.deposit_season_save(${input.id ?? null}::uuid, ${branch.id}::uuid, ${input.name}::text,
                                     ${input.startDate}::date, ${input.endDate}::date, ${input.amountPerGuest}::bigint,
                                     ${input.refundNoticeHours}::int, ${input.forfeitOwnerUserId}::uuid,
                                     ${input.isActive}::boolean)`
  })
  return listSeasons(auth, branch.id)
}
