// Kiểm thử nghiệm thu module lịch đặt §13: test 01–20, 24, 25 (21–23 thử tay trên iPhone; 26–36 ở Đợt 2, 3).
// Kèm test bảo mật S04, S05, S11, S12, S13 (kế hoạch 9.2).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { createUser, revokeBranch } from '../../src/server/admin/users'
import { notifyOverdue } from '../../src/server/appointments/overdue'
import { CreateBody, UpdateBody } from '../../src/server/appointments/schema'
import {
  auditTrail,
  checkWarnings,
  createAppointment,
  getAppointment,
  listAppointments,
  transitionAppointment,
  updateAppointment,
} from '../../src/server/appointments/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { limitWrites, resetWriteLimits } from '../../src/server/http/route'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}

beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'chin', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth

// Mỗi test dùng một ngày riêng trong tương lai để cảnh báo trùng giờ không lẫn nhau.
let dayOffset = 30
const nextDay = () => addDays(toLocalDate(new Date()), dayOffset++)

async function err(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

function input(over: Partial<Parameters<typeof createAppointment>[1]> = {}) {
  return {
    customerDisplayName: 'Mai Anh',
    phone: null,
    date: nextDay(),
    startTime: '09:00',
    endTime: '11:00',
    guestCount: 1,
    serviceSummary: 'sơn gel tay',
    notes: null,
    createRequestId: rid(),
    ...over,
  }
}

async function eventsFor(appointmentId: string) {
  return owner<{ type: string; recipients: string[] }[]>`
    select e.type, coalesce(array_agg(r.user_id) filter (where r.user_id is not null), '{}') as recipients
    from notification_events e left join notification_recipients r on r.event_id = e.id
    where e.entity_id = ${appointmentId}
    group by e.id, e.type order by e.created_at`
}

describe('Tạo lịch', () => {
  it('01 — Trang tạo lịch 09:00, 2 khách: Mới đặt, không có trường thợ, kết thúc 11:00', async () => {
    const res = await createAppointment(auth('trang'), input({ guestCount: 2 }))
    expect(res.appointment.status).toBe('pending')
    expect(res.appointment.startTime).toBe('09:00')
    expect(res.appointment.endTime).toBe('11:00')
    const detail = await getAppointment(auth('trang'), res.appointment.id)
    expect(Object.keys(detail).some((k) => /staff/i.test(k))).toBe(false)
    const cols =
      await owner`select column_name from information_schema.columns where table_name = 'appointments'`
    expect(cols.map((c) => c.columnName)).not.toContain('staff_id')
  })

  it('10 — Nhung "Tạo và chốt": Đã chốt lịch ngay, confirmed_by = Nhung', async () => {
    const res = await createAppointment(auth('nhung'), input({ confirm: true }))
    expect(res.appointment.status).toBe('confirmed')
    const [r] = await owner`select confirmed_by from appointments where id = ${res.appointment.id}`
    expect(r!.confirmedBy).toBe(seed().users.nhung!.id)
  })

  it('10b — Trang không "Tạo và chốt" được (giao diện và API)', async () => {
    const e = await err(createAppointment(auth('trang'), input({ confirm: true })))
    expect(e.status).toBe(403)
  })

  it('K05 — tối đa 4 khách một lịch; giờ kết thúc phải cùng ngày', async () => {
    expect(CreateBody.safeParse(input({ guestCount: 5 })).success).toBe(false)
    expect(CreateBody.safeParse(input({ guestCount: 4 })).success).toBe(true)
    const { appointment } = await createAppointment(auth('chin'), input())
    await expectPgError(
      withUser(
        seed().users.chin!.id,
        (tx) => tx`update appointments set guest_count = 5 where id = ${appointment.id}`,
      ),
      ['23514', 'P0001'],
    )
    const e = await err(createAppointment(auth('trang'), input({ startTime: '23:00', endTime: '00:30' })))
    expect(e.status).toBe(422)
  })

  it('17 — bấm lưu hai lần (cùng mã yêu cầu) → chỉ một lịch', async () => {
    const body = input()
    const [a, b] = await Promise.all([
      createAppointment(auth('trang'), body),
      createAppointment(auth('trang'), body),
    ])
    expect(a.appointment.id).toBe(b.appointment.id)
    const [n] =
      await owner`select count(*)::int as n from appointments where create_request_id = ${body.createRequestId}`
    expect(n!.n).toBe(1)
  })

  it('S05 — cùng mã yêu cầu nhưng nội dung khác → 422, không trả lịch cũ như đã lưu [P3]', async () => {
    const body = input()
    await createAppointment(auth('trang'), body)
    const e = await err(createAppointment(auth('trang'), { ...body, startTime: '10:00', endTime: '12:00' }))
    expect(e.status).toBe(422)
    expect(e.message).toMatch('nội dung khác')
  })
})

describe('Sửa lịch', () => {
  it('02 — Trang sửa lịch mình tạo còn Mới đặt: được, lịch sử lưu trước/sau', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const d = await updateAppointment(auth('trang'), appointment.id, {
      version: 1,
      notes: 'khách thích màu nude',
    })
    expect(d.notes).toBe('khách thích màu nude')
    const trail = await auditTrail(auth('trang'), appointment.id)
    const upd = trail.find((t) => t.action === 'updated')!
    expect((upd.beforeJson as { notes: string | null }).notes).toBeNull()
    expect((upd.afterJson as { notes: string }).notes).toBe('khách thích màu nude')
  })

  it('03 — Trang sửa lịch mình tạo đã chốt: bị chặn ở API và DB', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const c = await transitionAppointment(auth('nhung'), appointment.id, 'confirm', { version: 1 })
    expect(c.status).toBe('confirmed')
    expect(c.can.edit).toBe(true) // Nhung vẫn sửa được
    const t = await getAppointment(auth('trang'), appointment.id)
    expect(t.can.edit).toBe(false) // giao diện ẩn nút Sửa
    const e = await err(updateAppointment(auth('trang'), appointment.id, { version: t.version, notes: 'x' }))
    expect(e.status).toBe(403)
    await expectPgError(
      withUser(
        seed().users.trang!.id,
        (tx) => tx`update appointments set notes = 'x' where id = ${appointment.id}`,
      ),
      '42501',
    )
  })

  it('04 — Trang sửa lịch do Chin tạo: bị chặn (API và DB)', async () => {
    const { appointment } = await createAppointment(auth('chin'), input())
    const e = await err(updateAppointment(auth('trang'), appointment.id, { version: 1, notes: 'x' }))
    expect(e.status).toBe(403)
    await expectPgError(
      withUser(
        seed().users.trang!.id,
        (tx) => tx`update appointments set notes = 'x' where id = ${appointment.id}`,
      ),
      '42501',
    )
  })

  it('09 — Chin đổi giờ, huỷ lịch do Trang tạo: được, ghi đúng người; Trang nhận thông báo', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const d = await updateAppointment(auth('chin'), appointment.id, {
      version: 1,
      startTime: '13:00',
      endTime: '15:00',
    })
    expect(d.startTime).toBe('13:00')
    expect(d.updatedByName).toBe('Chin')
    const c = await transitionAppointment(auth('chin'), appointment.id, 'cancel', {
      version: d.version,
      reason: 'Khách đổi ý',
    })
    expect(c.status).toBe('cancelled')
    expect(c.cancelledByName).toBe('Chin')
    const ev = await eventsFor(appointment.id)
    const trangId = seed().users.trang!.id
    expect(ev.find((e) => e.type === 'appointment.rescheduled')!.recipients).toContain(trangId)
    expect(ev.find((e) => e.type === 'appointment.cancelled')!.recipients).toContain(trangId)
  })

  it('16 — hai người cùng sửa một lịch: người lưu sau nhận 409, không ghi đè', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    await updateAppointment(auth('chin'), appointment.id, { version: 1, notes: 'Chin sửa' })
    const e = await err(updateAppointment(auth('nhung'), appointment.id, { version: 1, notes: 'Nhung sửa' }))
    expect(e.status).toBe(409)
    expect((e.data as { notes: string }).notes).toBe('Chin sửa')
    const [r] = await owner`select notes from appointments where id = ${appointment.id}`
    expect(r!.notes).toBe('Chin sửa')
  })

  it('P24 — gửi lại PATCH sau mất mạng (server đã đúng nội dung) → không báo 409', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    await updateAppointment(auth('trang'), appointment.id, { version: 1, notes: 'ghi chú' })
    const again = await updateAppointment(auth('trang'), appointment.id, { version: 1, notes: 'ghi chú' })
    expect(again.notes).toBe('ghi chú')
  })

  it('S04 — PATCH kèm trường hệ thống → 422; sửa thẳng ở DB → bị chặn [P2]', async () => {
    for (const extra of [
      { status: 'confirmed' },
      { confirmedBy: seed().users.nhung!.id },
      { createdBy: 'x' },
      { branchId: 'x' },
    ]) {
      expect(UpdateBody.safeParse({ version: 1, ...extra }).success).toBe(false)
    }
    const { appointment } = await createAppointment(auth('trang'), input())
    const trangId = seed().users.trang!.id
    // Tự chốt lịch của mình
    await expectPgError(
      withUser(
        trangId,
        (tx) => tx`update appointments set status = 'confirmed' where id = ${appointment.id}`,
      ),
      '42501',
    )
    // Đổi người tạo, chuyển cơ sở
    await expectPgError(
      withUser(
        trangId,
        (tx) =>
          tx`update appointments set created_by = ${seed().users.chin!.id} where id = ${appointment.id}`,
      ),
      '42501',
    )
    await expectPgError(
      withUser(
        trangId,
        (tx) => tx`update appointments set branch_id = ${seed().branchIds.CS2!} where id = ${appointment.id}`,
      ),
      '42501',
    )
    // Ghi đè người chốt: giá trị máy gửi bị thay bằng giá trị server
    await withUser(
      trangId,
      (tx) =>
        tx`update appointments set confirmed_by = ${seed().users.nhung!.id} where id = ${appointment.id}`,
    )
    const [r] = await owner`select confirmed_by, status from appointments where id = ${appointment.id}`
    expect(r!.confirmedBy).toBeNull()
    expect(r!.status).toBe('pending')
    // Không xoá được
    await expectPgError(
      withUser(trangId, (tx) => tx`delete from appointments where id = ${appointment.id}`),
      '42501',
    )
  })
})

describe('Huỷ, khách báo huỷ, khách đến', () => {
  it('05 — Trang huỷ lịch mình tạo còn Mới đặt, có lý do: được; lưu người huỷ, lý do', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const d = await transitionAppointment(auth('trang'), appointment.id, 'cancel', {
      version: 1,
      reason: 'Ghi nhầm ngày',
    })
    expect(d.status).toBe('cancelled')
    expect(d.cancelReason).toBe('Ghi nhầm ngày')
    expect(d.cancelledByName).toBe('Trang')
  })

  it('06 — Trang huỷ lịch mình tạo nhưng bỏ trống lý do: 422 (cả ở DB)', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const e = await err(
      transitionAppointment(auth('trang'), appointment.id, 'cancel', { version: 1, reason: '  ' }),
    )
    expect(e.status).toBe(422)
    await expectPgError(
      withUser(
        seed().users.trang!.id,
        (tx) => tx`update appointments set status = 'cancelled' where id = ${appointment.id}`,
      ),
      ['P0001', '23514'],
    )
  })

  it('07 — Trang huỷ lịch đã chốt hoặc lịch người khác: 403, gợi ý Khách báo huỷ', async () => {
    const own = await createAppointment(auth('trang'), input())
    await transitionAppointment(auth('nhung'), own.appointment.id, 'confirm', { version: 1 })
    const e1 = await err(
      transitionAppointment(auth('trang'), own.appointment.id, 'cancel', { version: 2, reason: 'x' }),
    )
    expect(e1.status).toBe(403)
    expect(e1.message).toMatch('Khách báo huỷ')
    const other = await createAppointment(auth('chin'), input())
    const e2 = await err(
      transitionAppointment(auth('trang'), other.appointment.id, 'cancel', { version: 1, reason: 'x' }),
    )
    expect(e2.status).toBe(403)
    const d = await getAppointment(auth('trang'), other.appointment.id)
    expect(d.can.cancel).toBe(false)
    expect(d.can.reportCustomerCancel).toBe(true)
  })

  it('08 — Trang bấm Khách báo huỷ trên lịch đã chốt: giữ trạng thái, có nhãn; Linh, Nhung, Chin nhận thông báo', async () => {
    const { appointment } = await createAppointment(auth('nhung'), input({ confirm: true }))
    const d = await transitionAppointment(auth('trang'), appointment.id, 'report_customer_cancel', {
      version: 1,
      note: 'Khách nhắn bận',
    })
    expect(d.status).toBe('confirmed')
    expect(d.customerCancelReported).toBe(true)
    const ev = (await eventsFor(appointment.id)).find((e) => e.type === 'appointment.customer_cancel')!
    const { users } = seed()
    expect(ev.recipients).toEqual(expect.arrayContaining([users.linh!.id, users.nhung!.id, users.chin!.id]))
    expect(ev.recipients).not.toContain(users.trang!.id)
  })

  it('S12 — bấm Khách báo huỷ lần hai: giữ thời điểm, không thông báo mới [P10]', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const first = await transitionAppointment(auth('trang'), appointment.id, 'report_customer_cancel', {
      version: 1,
    })
    const [t1] =
      await owner`select customer_cancel_reported_at from appointments where id = ${appointment.id}`
    await new Promise((r) => setTimeout(r, 30))
    await transitionAppointment(auth('chin'), appointment.id, 'report_customer_cancel', {
      version: first.version,
      note: 'gọi lại lần 2',
    })
    const [t2] =
      await owner`select customer_cancel_reported_at from appointments where id = ${appointment.id}`
    expect(new Date(t2!.customerCancelReportedAt).getTime()).toBe(
      new Date(t1!.customerCancelReportedAt).getTime(),
    )
    const ev = (await eventsFor(appointment.id)).filter((e) => e.type === 'appointment.customer_cancel')
    expect(ev.length).toBe(1)
  })

  it('25 — Trang bấm Khách đã đến trên lịch do Chin tạo: được', async () => {
    const { appointment } = await createAppointment(auth('chin'), input())
    const d = await transitionAppointment(auth('trang'), appointment.id, 'arrived', { version: 1 })
    expect(d.status).toBe('arrived')
  })

  it('Khách không đến, Hoàn thành bấm tay: chỉ người có quyền lịch mở rộng', async () => {
    const a = await createAppointment(auth('trang'), input())
    expect(
      (await err(transitionAppointment(auth('trang'), a.appointment.id, 'no_show', { version: 1 }))).status,
    ).toBe(403)
    expect(
      (await transitionAppointment(auth('chin'), a.appointment.id, 'no_show', { version: 1 })).status,
    ).toBe('no_show')
    // Không mở lại lịch Không đến
    await expectPgError(
      withUser(
        seed().users.chin!.id,
        (tx) => tx`update appointments set status = 'confirmed' where id = ${a.appointment.id}`,
      ),
      'P0001',
    )
    const b = await createAppointment(auth('trang'), input())
    await transitionAppointment(auth('trang'), b.appointment.id, 'arrived', { version: 1 })
    expect(
      (await err(transitionAppointment(auth('trang'), b.appointment.id, 'complete', { version: 2 }))).status,
    ).toBe(403)
    expect(
      (await transitionAppointment(auth('nhung'), b.appointment.id, 'complete', { version: 2 })).status,
    ).toBe('completed')
  })

  it('S11 — chốt, huỷ với version cũ → 409 [P9]', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    await updateAppointment(auth('trang'), appointment.id, {
      version: 1,
      startTime: '16:00',
      endTime: '18:00',
    })
    const e = await err(transitionAppointment(auth('nhung'), appointment.id, 'confirm', { version: 1 }))
    expect(e.status).toBe(409)
    expect((e.data as { startTime: string }).startTime).toBe('16:00')
  })

  it('18 — huỷ lịch đã chốt: còn trong DB, có lịch sử; ẩn khỏi lịch mặc định, hiện khi lọc Đã huỷ', async () => {
    const date = nextDay()
    const { appointment } = await createAppointment(auth('nhung'), input({ date, confirm: true }))
    await transitionAppointment(auth('nhung'), appointment.id, 'cancel', { version: 1, reason: 'Khách huỷ' })
    const [r] = await owner`select status from appointments where id = ${appointment.id}`
    expect(r!.status).toBe('cancelled')
    const trail = await auditTrail(auth('nhung'), appointment.id)
    expect(trail.map((t) => t.action)).toEqual(['created_confirmed', 'cancelled'])
    const active = await listAppointments(auth('trang'), { from: date, to: date })
    expect(active.items.find((i) => i.id === appointment.id)).toBeUndefined()
    const cancelled = await listAppointments(auth('trang'), { from: date, to: date, filter: 'cancelled' })
    expect(cancelled.items.find((i) => i.id === appointment.id)).toBeTruthy()
  })
})

describe('Cảnh báo §8', () => {
  it('11 — hai lịch khác khách cùng 10:00–11:30: hiện song song, "Cùng giờ có 1 lịch khác", không chặn', async () => {
    const date = nextDay()
    await createAppointment(
      auth('trang'),
      input({ date, startTime: '10:00', endTime: '11:30', customerDisplayName: 'A' }),
    )
    const b = await createAppointment(
      auth('chin'),
      input({ date, startTime: '10:00', endTime: '11:30', customerDisplayName: 'B' }),
    )
    expect(b.appointment.status).toBe('pending')
    expect(b.warnings.overlapCount).toBe(1)
    const list = await listAppointments(auth('trang'), { from: date, to: date })
    expect(list.items.length).toBe(2)
  })

  it('12 — 09:00–10:00 và 10:00–11:00 không tính là trùng giờ', async () => {
    const date = nextDay()
    await createAppointment(auth('trang'), input({ date, startTime: '09:00', endTime: '10:00' }))
    const w = await checkWarnings(auth('trang'), { date, startTime: '10:00', endTime: '11:00' })
    expect(w.overlapCount).toBe(0)
  })

  it('13 — hai lịch cùng SĐT, trùng giờ: nhắc "Có thể trùng khách" (SĐT viết khác kiểu vẫn nhận ra, K06)', async () => {
    const date = nextDay()
    const a = await createAppointment(
      auth('trang'),
      input({ date, phone: '0912 345 678', startTime: '14:00', endTime: '16:00' }),
    )
    const w = await checkWarnings(auth('chin'), {
      date,
      startTime: '15:00',
      endTime: '17:00',
      phone: '+84 912-345-678',
    })
    expect(w.duplicates).toEqual([{ id: a.appointment.id, startTime: '14:00' }])
  })

  it('14 — cùng SĐT, khác giờ trong ngày: không nhắc', async () => {
    const date = nextDay()
    await createAppointment(
      auth('trang'),
      input({ date, phone: '0987654321', startTime: '09:00', endTime: '10:00' }),
    )
    const w = await checkWarnings(auth('trang'), {
      date,
      startTime: '15:00',
      endTime: '16:00',
      phone: '0987654321',
    })
    expect(w.duplicates).toEqual([])
  })

  it('15 — lịch 20:30–22:30: lưu được, cảnh báo Ngoài giờ mở cửa', async () => {
    const res = await createAppointment(auth('trang'), input({ startTime: '20:30', endTime: '22:30' }))
    expect(res.appointment.outsideHours).toBe(true)
    expect(res.warnings.outsideHours).toBe(true)
  })

  it('lịch huỷ, không đến không tính trùng giờ', async () => {
    const date = nextDay()
    const a = await createAppointment(auth('trang'), input({ date, startTime: '10:00', endTime: '11:00' }))
    await transitionAppointment(auth('trang'), a.appointment.id, 'cancel', { version: 1, reason: 'nhầm' })
    const w = await checkWarnings(auth('trang'), { date, startTime: '10:00', endTime: '11:00' })
    expect(w.overlapCount).toBe(0)
  })
})

describe('Thông báo §9', () => {
  it('19 — tạo, đổi giờ, huỷ: mỗi thao tác đúng một sự kiện; người thao tác không nhận', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    const u = await updateAppointment(auth('trang'), appointment.id, {
      version: 1,
      startTime: '10:00',
      endTime: '12:00',
    })
    await transitionAppointment(auth('trang'), appointment.id, 'cancel', {
      version: u.version,
      reason: 'Khách huỷ',
    })
    const ev = await eventsFor(appointment.id)
    expect(ev.map((e) => e.type)).toEqual([
      'appointment.created',
      'appointment.rescheduled',
      'appointment.cancelled',
    ])
    for (const e of ev) expect(e.recipients).not.toContain(seed().users.trang!.id)
    // Sửa ghi chú (không đổi giờ) không phát thông báo
    const b = await createAppointment(auth('trang'), input())
    await updateAppointment(auth('trang'), b.appointment.id, { version: 1, notes: 'x' })
    expect((await eventsFor(b.appointment.id)).length).toBe(1)
  })

  it('20 — Nhung chốt lịch: nhân viên thường không nhận thông báo chốt', async () => {
    const { appointment } = await createAppointment(auth('trang'), input())
    await transitionAppointment(auth('nhung'), appointment.id, 'confirm', { version: 1 })
    const ev = (await eventsFor(appointment.id)).find((e) => e.type === 'appointment.confirmed')!
    expect(ev.recipients).not.toContain(seed().users.trang!.id)
    expect(ev.recipients).toEqual(expect.arrayContaining([seed().users.linh!.id, seed().users.chin!.id]))
  })

  it('23 — nội dung đẩy ra màn hình khoá không có tên khách, SĐT, ghi chú', async () => {
    const { appointment } = await createAppointment(
      auth('trang'),
      input({ customerDisplayName: 'Ngọc Hân', phone: '0911222333', notes: 'dị ứng keo' }),
    )
    const [e] =
      await owner`select push_title, push_body from notification_events where entity_id = ${appointment.id}`
    const text = `${e!.pushTitle} ${e!.pushBody}`
    expect(text).not.toMatch(/Ngọc Hân|0911222333|dị ứng/)
  })

  it('K02 — lịch qua giờ kết thúc chưa đánh dấu → báo một lần cho Linh, Nhung, Chin', async () => {
    const today = toLocalDate(new Date())
    const { appointment } = await createAppointment(
      auth('trang'),
      input({ date: today, startTime: '00:00', endTime: '00:15' }),
    )
    // Ép giờ kết thúc vào quá khứ gần (lịch tạo trong ngày hôm nay có thể chưa qua giờ)
    await owner`update appointments set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
                where id = ${appointment.id}`
    await notifyOverdue()
    await notifyOverdue()
    const ev = (await eventsFor(appointment.id)).filter((e) => e.type === 'appointment.overdue')
    expect(ev.length).toBe(1)
    expect(ev[0]!.recipients).not.toContain(seed().users.trang!.id)
    expect(ev[0]!.recipients).toContain(seed().users.chin!.id)
  })
})

describe('Phạm vi và quyền', () => {
  it('24 — nhân viên bị thu quyền cơ sở: không đọc, không sửa lịch', async () => {
    const created = await owner.begin((tx) =>
      createUser(tx, 'test', { name: 'Tạm', email: 'tam-24@lindy.test', role: 'staff', branch: 'HTK' }),
    )
    await owner`update user_credentials set must_change_password = false where user_id = ${created.userId}`
    const { appointment } = await createAppointment(auth('chin'), input())
    await owner.begin((tx) => revokeBranch(tx, 'test', 'tam-24@lindy.test', 'HTK'))
    const rows = await withUser(
      created.userId,
      (tx) => tx`select id from appointments where id = ${appointment.id}`,
    )
    expect(rows.length).toBe(0)
    const upd = await withUser(
      created.userId,
      (tx) => tx`update appointments set notes = 'x' where id = ${appointment.id} returning id`,
    )
    expect(upd.length).toBe(0)
  })

  it('S14 — người ở cơ sở 2 không thấy, không sửa, không tạo lịch ở cơ sở 1', async () => {
    const { appointment } = await createAppointment(auth('chin'), input())
    expect((await err(getAppointment(auth('mai'), appointment.id))).status).toBe(404)
    expect(
      (await err(updateAppointment(auth('mai'), appointment.id, { version: 1, notes: 'x' }))).status,
    ).toBe(404)
    expect(
      (await err(createAppointment(auth('mai'), input({ branchId: seed().branchIds.HTK })))).status,
    ).toBe(404)
    await expectPgError(
      withUser(
        seed().users.mai!.id,
        (tx) =>
          tx`insert into appointments (branch_id, customer_display_name, start_at, end_at, created_by, updated_by,
                                     create_request_id, create_request_hash)
           values (${seed().branchIds.HTK!}, 'x', now(), now() + interval '1 hour', ${seed().users.mai!.id},
                   ${seed().users.mai!.id}, gen_random_uuid(), repeat('a', 64))`,
      ),
      '42501',
    )
  })

  it('S13 — giới hạn khoảng ngày, độ dài; danh sách không trả SĐT, ghi chú [P11]', async () => {
    const date = nextDay()
    const e = await err(listAppointments(auth('trang'), { from: date, to: addDays(date, 63) }))
    expect(e.status).toBe(422)
    await createAppointment(auth('trang'), input({ date, phone: '0900000001', notes: 'bí mật' }))
    const list = await listAppointments(auth('trang'), { from: date, to: date })
    for (const it of list.items) {
      expect(Object.keys(it)).not.toContain('phone')
      expect(Object.keys(it)).not.toContain('notes')
    }
    expect(CreateBody.safeParse(input({ notes: 'x'.repeat(1001) })).success).toBe(false)
    expect(CreateBody.safeParse(input({ customerDisplayName: 'x'.repeat(101) })).success).toBe(false)
  })

  it('S13 — ghi quá 30 thao tác/phút → 429', () => {
    resetWriteLimits()
    const t = Date.now()
    for (let i = 0; i < 30; i++) limitWrites('u-rate', t)
    expect(() => limitWrites('u-rate', t)).toThrow('Thao tác quá nhanh')
    expect(() => limitWrites('u-rate', t + 61_000)).not.toThrow()
    resetWriteLimits()
  })

  it('tìm theo tên không dấu và theo SĐT; "%" không khớp mọi lịch [P13]', async () => {
    const date = nextDay()
    await createAppointment(
      auth('trang'),
      input({ date, customerDisplayName: 'Nguyễn Thị Đào', phone: '0933111222' }),
    )
    const byName = await listAppointments(auth('trang'), { q: 'nguyen thi dao' })
    expect(byName.items.some((i) => i.name === 'Nguyễn Thị Đào')).toBe(true)
    const byPhone = await listAppointments(auth('trang'), { q: '0933 111 222' })
    expect(byPhone.items.some((i) => i.name === 'Nguyễn Thị Đào')).toBe(true)
    const pct = await listAppointments(auth('trang'), { q: '%' })
    expect(pct.items.length).toBe(0)
  })

  it('lịch sử: thợ chỉ xem được lịch do mình tạo', async () => {
    const { appointment } = await createAppointment(auth('chin'), input())
    expect((await err(auditTrail(auth('trang'), appointment.id))).status).toBe(403)
    expect((await auditTrail(auth('chin'), appointment.id)).length).toBe(1)
    expect((await auditTrail(auth('nhung'), appointment.id)).length).toBe(1)
  })
})
