// Dữ liệu dùng thử trên app thật (S12, S17, Đợt 6F). Chủ bấm Thêm → Dữ liệu dùng thử:
// - "Nạp dữ liệu thử": tạo khoảng 2 tuần lịch (7 ngày trước đến 7 ngày sau), 40–60 đơn có thanh toán, mở sổ, thu chi,
//   chấm công, hồ sơ và mức lương, một đề nghị tạm ứng. Đi qua đúng các hàm nghiệp vụ của app, thao tác dưới tên từng
//   người thật trong cơ sở (kiểm quyền như khi dùng thật). Không phát thông báo trong lúc nạp.
// - "Xoá, bắt đầu dùng thật": xoá sạch dữ liệu nghiệp vụ (app.demo_golive_wipe), chỉ một lần.
// Khách thử có SĐT 09000001xx để dễ nhận ra.
import { randomUUID } from 'node:crypto'
import { foldVietnamese } from '~/lib/text'
import { addDays, addMonths, toLocalDate, toLocalTime } from '~/lib/time'
import staffCsv from '../../../data/staff.csv?raw'
import { createAppointment, transitionAppointment } from '../appointments/service'
import { decideDay } from '../attendance/service'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { actOnExpense, createExpense } from '../expenses/service'
import { forbidden, invalid } from '../http/errors'
import { openBook } from '../money/service'
import { quietNotifications } from '../notifications/emit'
import { recordPayment } from '../orders/payments'
import { confirmOrder, createOrderFromAppointment, markDone, updateOrder } from '../orders/service'
import { createAdvance } from '../payroll/advances'
import { savePolicy, saveProfile, saveSettings } from '../staff/service'

export const GOLIVE_CONFIRM = 'XOA DU LIEU THU'

export type DemoState = 'empty' | 'loaded' | 'live'

function requireOwner(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'users.manage')) throw forbidden('Chỉ chủ quán làm được việc này.')
  return branch
}

export async function demoStatus(auth: Auth, branchId?: string) {
  const branch = requireOwner(auth, branchId)
  return withUser(auth.userId, async (tx) => {
    const [s] = await tx<{ state: DemoState; loadedAt: Date | null; liveAt: Date | null }[]>`
      select state, loaded_at, live_at from demo_state where id = 1`
    const [c] = await tx<{ appointments: number; orders: number; customers: number }[]>`
      select (select count(*)::int from appointments where branch_id = ${branch.id}) as appointments,
             (select count(*)::int from orders where branch_id = ${branch.id}) as orders,
             (select count(*)::int from customers) as customers`
    return {
      state: s?.state ?? 'empty',
      loadedAt: s?.loadedAt ? new Date(s.loadedAt).toISOString() : null,
      liveAt: s?.liveAt ? new Date(s.liveAt).toISOString() : null,
      counts: c ?? { appointments: 0, orders: 0, customers: 0 },
    }
  })
}

export async function goLive(auth: Auth, input: { branchId?: string; confirm: string }) {
  const branch = requireOwner(auth, input.branchId)
  if (input.confirm.trim().toUpperCase() !== GOLIVE_CONFIRM)
    throw invalid(`Gõ đúng "${GOLIVE_CONFIRM}" để xác nhận.`)
  await withUser(auth.userId, (tx) => tx`select app.demo_golive_wipe(${branch.id})`)
  return demoStatus(auth, branch.id)
}

// ---------------------------------------------------------------- Nạp dữ liệu thử

const NAMES = [
  'Mai Anh',
  'Thu Hà',
  'Ngọc Lan',
  'Phương Thảo',
  'Minh Châu',
  'Bảo Ngọc',
  'Thanh Tâm',
  'Quỳnh Như',
  'Hải Yến',
  'Kim Ngân',
  'Thùy Dương',
  'Lan Chi',
  'Mỹ Duyên',
  'Tường Vy',
  'Gia Hân',
  'Khánh Vân',
  'Diễm My',
  'Ánh Tuyết',
]

// Mẫu dịch vụ theo mã danh mục; mã nào không có trong danh mục của quán thì bỏ qua
const TEMPLATES: { label: string; lines: { code: string; quantity?: number }[] }[] = [
  { label: 'sơn gel tay', lines: [{ code: 'CB02' }] },
  { label: 'sơn gel + mắt mèo', lines: [{ code: 'CB02' }, { code: 'DS01', quantity: 10 }] },
  { label: 'nối móng', lines: [{ code: 'MG03' }] },
  { label: 'nối móng + đắp gel', lines: [{ code: 'MG03' }, { code: 'CB03' }] },
  { label: 'nhặt da + sơn gel', lines: [{ code: 'CB01' }, { code: 'CB02' }] },
]

const SLOTS_PAST = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00']
const SLOTS_FUTURE = ['10:00', '14:00', '18:00']

let loading = false

type Person = { userId: string; displayName: string; perms: string[] }

function plusMinutes(hhmm: string, n: number) {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const t = h * 60 + m + n
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function staffRows() {
  return staffCsv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [name, role, base, rate, leave] = line.split(',')
      return {
        name: foldVietnamese(name ?? ''),
        manager: role === 'Quản lý',
        base: Number(base),
        bps: Math.round(Number(rate) * 10_000),
        leave: Number(leave),
      }
    })
    .filter((r) => r.name && Number.isFinite(r.base) && Number.isFinite(r.bps))
}

/**
 * Nạp gói thử. App còn dữ liệu cũ (thử tay trước đây) thì phải gửi `replaceExisting` kèm chữ xác nhận: dọn sạch dữ liệu
 * nghiệp vụ trước rồi nạp (chỉ khi chưa nạp lần nào, app.demo_clear_existing).
 */
export async function loadDemo(
  auth: Auth,
  input: { branchId?: string; replaceExisting?: boolean; confirm?: string } = {},
) {
  const branch = requireOwner(auth, input.branchId)
  if (loading) throw invalid('Đang nạp dữ liệu thử, chờ một chút.')
  const status = await demoStatus(auth, branch.id)
  if (status.state !== 'empty') throw invalid('Gói dữ liệu thử đã nạp hoặc app đã dùng thật.')
  const hasData = !!(status.counts.appointments || status.counts.orders || status.counts.customers)
  if (hasData && !input.replaceExisting)
    throw invalid('App đã có lịch, đơn hoặc khách. Chọn "Xoá dữ liệu hiện có rồi nạp gói thử".')
  if (hasData && input.confirm?.trim().toUpperCase() !== GOLIVE_CONFIRM)
    throw invalid(`Gõ đúng "${GOLIVE_CONFIRM}" để xác nhận xoá dữ liệu hiện có.`)
  loading = true
  try {
    if (hasData) await withUser(auth.userId, (tx) => tx`select app.demo_clear_existing(${branch.id})`)
    const summary = await quietNotifications.run(true, () => build(auth, branch.id))
    await withUser(auth.userId, (tx) => tx`select app.demo_mark_loaded(${branch.id})`)
    return { ...(await demoStatus(auth, branch.id)), summary }
  } finally {
    loading = false
  }
}

async function build(owner: Auth, branchId: string) {
  const b = owner.branches.find((x) => x.id === branchId)!
  const { people, tz, services, accounts } = await withUser(owner.userId, async (tx) => {
    const people = await tx<Person[]>`select user_id, display_name, perms from app.demo_people(${branchId})`
    const [t] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
    const services = await tx<{ id: string; code: string }[]>`select id, code from services where is_active`
    const accounts = await tx<{ id: string; type: 'cash' | 'bank' }[]>`
      select id, type from money_accounts where branch_id = ${branchId} and is_active order by code`
    return { people, tz: t?.timezone ?? 'Asia/Ho_Chi_Minh', services, accounts }
  })
  const authOf = (p: Person): Auth => ({
    sessionId: 'demo',
    userId: p.userId,
    displayName: p.displayName,
    mustChangePassword: false,
    branches: [{ ...b, perms: p.perms }],
  })
  const has = (p: Person, perm: string) => p.perms.includes(perm)
  // Người xác nhận đơn: ưu tiên quản lý (không phải chủ) để giống cách quán làm
  const confirmer =
    people.find((p) => has(p, 'order.confirm') && !has(p, 'users.manage')) ??
    people.find((p) => p.userId === owner.userId)!
  const mgr = authOf(confirmer)
  const workers = people.filter((p) => has(p, 'order.create_draft') && has(p, 'appointments.create_order'))
  if (workers.length === 0) throw invalid('Cơ sở chưa có tài khoản nào tạo được đơn.')
  // Thợ làm: tránh người xác nhận để đơn không vào Cần xem lại (Q04), trừ khi quán chỉ có một người
  const stylists = workers.filter((p) => p.userId !== confirmer.userId)
  const doers = stylists.length ? stylists : workers
  const svc = new Map(services.map((s) => [s.code, s.id]))
  const templates = TEMPLATES.filter((t) => t.lines.every((l) => svc.has(l.code)))
  if (templates.length === 0) throw invalid('Danh mục dịch vụ chưa có các mã mẫu (CB02, MG03…).')

  const now = new Date()
  const today = toLocalDate(now, tz)
  const nowTime = toLocalTime(now, tz)
  const summary = { appointments: 0, orders: 0, profiles: 0, expenses: 0 }

  // 1. Hồ sơ, mức lương (theo data/staff.csv), tháng bắt đầu tính lương
  const prevMonth = `${addMonths(today.slice(0, 7), -1)}-01`
  const rows = staffRows()
  const withProfile: Person[] = []
  for (const p of people) {
    const r = rows.find((x) => x.name === foldVietnamese(p.displayName))
    if (!r) continue
    await saveProfile(owner, {
      branchId,
      userId: p.userId,
      startDate: prevMonth,
      endDate: null,
      payMethod: 'transfer',
    })
    await savePolicy(owner, {
      branchId,
      userId: p.userId,
      effectiveMonth: prevMonth,
      baseSalary: r.base,
      commissionBps: r.bps,
      leaveDays: r.leave,
      managerKpi: r.manager,
      reason: 'Dữ liệu thử',
    })
    withProfile.push(p)
    summary.profiles++
  }
  await saveSettings(owner, { branchId, startMonth: `${today.slice(0, 7)}-01` })

  // 2. Mở sổ tiền từ ngày 1 của tháng chứa ngày đầu gói thử (sổ chỉ mở từ ngày 1 của tháng)
  if (hasPerm(owner, branchId, 'cashbook.owner') && accounts.length) {
    await openBook(owner, {
      branchId,
      openingDate: `${addDays(today, -7).slice(0, 7)}-01`,
      amounts: accounts.map((a) => ({ accountId: a.id, amount: a.type === 'cash' ? 2_000_000 : 15_000_000 })),
    })
  }

  // 3. Lịch và đơn
  let k = 0
  const nameAt = (i: number) => NAMES[i % NAMES.length]!
  const phoneOf = (name: string) => `09000001${String(NAMES.indexOf(name)).padStart(2, '0')}`
  for (let d = -7; d <= 7; d++) {
    const date = addDays(today, d)
    const slots = d <= 0 ? SLOTS_PAST : SLOTS_FUTURE
    // Hôm nay: lịch đã qua giờ bắt đầu có đơn (đơn đầu chờ xác nhận, còn lại đang làm); lịch sau giờ hiện tại chưa có đơn
    for (const [si, start] of slots.entries()) {
      const i = k++
      const name = nameAt(i)
      const creator = workers[i % workers.length]!
      const guests = si === 1 && d % 2 === 0 ? 2 : 1
      const tpl = templates[i % templates.length]!
      const { appointment } = await createAppointment(authOf(creator), {
        branchId,
        customerDisplayName: name,
        phone: phoneOf(name),
        date,
        startTime: start,
        endTime: plusMinutes(start, 90),
        guestCount: guests,
        serviceSummary: tpl.label,
        notes: null,
        createRequestId: randomUUID(),
      })
      summary.appointments++
      const past = d < 0 || (d === 0 && start < nowTime)
      if (!past) continue
      // Hôm qua có một lịch khách báo huỷ, hôm kia một lịch khách không đến
      if (d === -1 && si === 4 && has(confirmer, 'appointments.cancel_all')) {
        await transitionAppointment(mgr, appointment.id, 'cancel', {
          version: 1,
          reason: 'Khách báo huỷ: bận việc đột xuất',
        })
        continue
      }
      if (d === -2 && si === 4 && has(confirmer, 'appointments.manage_all')) {
        await transitionAppointment(mgr, appointment.id, 'no_show', { version: 1 })
        continue
      }
      const { orders } = await createOrderFromAppointment(authOf(creator), appointment.id, {
        createRequestId: randomUUID(),
        guests: guests > 1 ? [{ guestNo: 2, name: null, phone: null }] : undefined,
      })
      for (const [gi, o] of orders.entries()) {
        const t = templates[(i + gi) % templates.length]!
        const doer = doers[(i + gi) % doers.length]!
        const saved = await updateOrder(mgr, o.id, {
          version: o.version,
          customerId: o.customer?.id ?? null,
          serviceDate: date,
          items: t.lines.map((l) => ({
            type: 'service',
            serviceId: svc.get(l.code)!,
            quantity: l.quantity ?? 1,
            staff: [{ userId: doer.userId }],
          })) as never,
          discounts: [],
        })
        summary.orders++
        // Hôm nay: đơn đầu chờ xác nhận, các đơn sau còn đang làm
        if (d === 0) {
          if (si === 0) await markDone(mgr, saved.id, saved.version)
          continue
        }
        const done = await markDone(mgr, saved.id, saved.version)
        const ok = await confirmOrder(mgr, done.id, done.version)
        if (ok.dueAmount > 0) {
          // Vài đơn mới thu một phần để có "khách còn nợ"
          const partial = d === -1 && si === 0
          await recordPayment(mgr, ok.id, {
            idempotencyKey: randomUUID(),
            amount: partial ? Math.floor(ok.dueAmount / 2000) * 1000 : ok.dueAmount,
            method: (i + gi) % 3 === 0 ? 'cash' : 'transfer',
          })
        }
      }
    }
  }

  // 4. Chấm công 7 ngày qua (Nhung, Linh duyệt); một người nghỉ có phép một ngày
  if (has(confirmer, 'attendance.approve')) {
    for (let d = -7; d <= -1; d++) {
      for (const [pi, p] of withProfile.entries()) {
        await decideDay(mgr, {
          branchId,
          userId: p.userId,
          date: addDays(today, d),
          status: d === -3 && pi === withProfile.length - 1 ? 'leave' : 'worked',
          note: 'Dữ liệu thử',
        })
      }
    }
  }

  // 5. Thu chi: hai phiếu vận hành đã duyệt, đã chi; một phiếu chờ duyệt
  if (has(confirmer, 'expense.request')) {
    for (const [code, amount, note, pay] of [
      ['supplies', 350_000, 'Mua gel, bông, giấy lau (thử)', true],
      ['utilities', 800_000, 'Tiền điện tháng trước (thử)', true],
      ['cleaning', 120_000, 'Nước lau sàn (thử)', false],
    ] as const) {
      const e = await createExpense(mgr, {
        branchId,
        createRequestId: randomUUID(),
        categoryCode: code,
        amount,
        note,
      })
      summary.expenses++
      if (!pay) continue
      const approver = hasPerm(mgr, branchId, 'expense.approve_within_limit') ? mgr : owner
      const a = await actOnExpense(approver, e.id, 'approve', { version: e.version })
      if (hasPerm(mgr, branchId, 'cashbook.manage'))
        await actOnExpense(mgr, a.id, 'pay', { version: a.version, method: 'cash' })
    }
  }

  // 6. Một đề nghị tạm ứng chờ Linh duyệt
  const asker = withProfile.find((p) => p.userId !== owner.userId && p.userId !== confirmer.userId)
  if (asker) {
    await createAdvance(authOf(asker), {
      branchId,
      createRequestId: randomUUID(),
      amount: 500_000,
      reason: 'Tạm ứng (thử)',
    })
  }
  return summary
}
