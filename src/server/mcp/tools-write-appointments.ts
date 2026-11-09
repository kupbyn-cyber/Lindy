// Tool ghi lịch hẹn (gói 7): mỗi việc một cặp lindy_preview_<việc> (xem trước, chưa ghi) / lindy_<việc> (thực hiện
// bằng action_token). Thực hiện gọi đúng service của app; quyền do service + RLS quyết.
import { z } from 'zod'
import { hhmmToMinutes, minutesToHHMM } from '~/lib/time'
import { CreateBody, UpdateBody } from '../appointments/schema'
import {
  checkWarnings,
  createAppointment,
  getAppointment,
  getSettings,
  transitionAppointment,
  updateAppointment,
} from '../appointments/service'
import { hasPerm, requireBranch } from '../auth/context'
import { forbidden, invalid } from '../http/errors'
import { limitWrites } from '../http/route'
import { SCOPE_WRITE } from './config'
import { createIntent, executeIntent } from './intents'
import { defineTool, isoDate, uuid } from './kit'

const EXECUTE_NOTE =
  'Chỉ gọi khi người dùng đã xem bản xem trước và yêu cầu thực hiện. Tham số duy nhất là action_token từ tool xem trước.'
const PREVIEW_NOTE = 'Chỉ tạo bản xem trước, CHƯA ghi gì; trả action_token cho tool thực hiện.'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:MM (24 giờ).')
const tokenInput = z.object({ action_token: z.string().min(20).max(200) })

// ---------------------------------------------------------------- Tạo lịch

const createInput = z.object({
  customerDisplayName: z.string().trim().min(1).max(100),
  phone: z.string().max(40).nullable().optional(),
  customerId: uuid.nullable().optional(),
  date: isoDate,
  startTime: hhmm,
  endTime: hhmm.optional(),
  guestCount: z.number().int().min(1).max(4),
  serviceSummary: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export const previewCreateAppointment = defineTool({
  name: 'lindy_preview_create_appointment',
  title: 'Xem trước: tạo lịch hẹn',
  description:
    `${PREVIEW_NOTE} Tạo lịch hẹn cho khách (tên, SĐT nếu có, ngày YYYY-MM-DD, giờ bắt đầu HH:MM, số khách 1–4). ` +
    'Không có giờ kết thúc thì lấy thời lượng mặc định trong cài đặt lịch của quán (hiện trong bản xem trước). ' +
    'Bản xem trước có cảnh báo trùng giờ, trùng SĐT, ngoài giờ mở cửa.',
  scope: SCOPE_WRITE,
  readOnly: false,
  input: createInput,
  run: async (args, { auth, principal }) => {
    const branch = requireBranch(auth, undefined)
    if (!hasPerm(auth, branch.id, 'appointments.create')) throw forbidden('Không có quyền tạo lịch.')
    // Thiếu giờ kết thúc: thời lượng mặc định của quán, không để AI tự đoán [phản biện vòng 2 L8]
    let endTime = args.endTime
    let durationFromSettings: number | null = null
    if (!endTime) {
      const s = await getSettings(auth)
      durationFromSettings = s.defaultDurationMin
      const end = hhmmToMinutes(args.startTime) + s.defaultDurationMin
      if (end >= 24 * 60) throw invalid('Giờ kết thúc vượt sang ngày sau. Cho biết giờ kết thúc.')
      endTime = minutesToHHMM(end)
    }
    const payload = {
      customerId: args.customerId ?? null,
      customerDisplayName: args.customerDisplayName,
      phone: args.phone ?? null,
      date: args.date,
      startTime: args.startTime,
      endTime,
      guestCount: args.guestCount,
      serviceSummary: args.serviceSummary ?? null,
      notes: args.notes ?? null,
    }
    // Kiểm đủ như API trước khi cấp mã (giờ kết thúc sau giờ bắt đầu do service kiểm lúc thực hiện)
    CreateBody.parse({ ...payload, createRequestId: crypto.randomUUID() })
    if (hhmmToMinutes(endTime) <= hhmmToMinutes(args.startTime))
      throw invalid('Giờ kết thúc phải sau giờ bắt đầu.')
    const warnings = await checkWarnings(auth, {
      date: payload.date,
      startTime: payload.startTime,
      endTime,
      phone: payload.phone,
    })
    return createIntent({
      principal,
      actionType: 'create_appointment',
      executeTool: 'lindy_create_appointment',
      payload,
      summary: {
        action: 'Tạo lịch hẹn',
        ...payload,
        ...(durationFromSettings
          ? { endTimeNote: `Giờ kết thúc theo thời lượng mặc định ${durationFromSettings} phút.` }
          : {}),
        warnings,
      },
    })
  },
})

export const createAppointmentTool = defineTool({
  name: 'lindy_create_appointment',
  title: 'Tạo lịch hẹn',
  description: `Thực hiện tạo lịch hẹn đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'create_appointment',
      // createRequestId = id intent: service tìm lại theo create_request_id nên không tạo trùng [phản biện L6]
      run: (payload, intentId) =>
        createAppointment(auth, CreateBody.parse({ ...payload, createRequestId: intentId })),
    })
  },
})

// ---------------------------------------------------------------- Sửa lịch

const updateFields = {
  customerDisplayName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().max(40).nullable().optional(),
  customerId: uuid.nullable().optional(),
  date: isoDate.optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  guestCount: z.number().int().min(1).max(4).optional(),
  serviceSummary: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}
type UpdateKey = keyof typeof updateFields

export const previewUpdateAppointment = defineTool({
  name: 'lindy_preview_update_appointment',
  title: 'Xem trước: sửa lịch hẹn',
  description: `${PREVIEW_NOTE} Sửa lịch hẹn (id) — chỉ gửi các trường cần đổi. Bản xem trước hiện trước → sau.`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({ id: uuid, ...updateFields }),
  run: async ({ id, ...changes }, { auth, principal }) => {
    const current = await getAppointment(auth, id)
    if (!current.can.edit)
      throw forbidden('Lịch này không sửa được (đã kết thúc, đã có đơn hoặc đã qua giờ hẹn).')
    const keys = (Object.keys(changes) as UpdateKey[]).filter((k) => changes[k] !== undefined)
    if (keys.length === 0) throw invalid('Chưa có trường nào cần đổi.')
    const input = { version: current.version, ...Object.fromEntries(keys.map((k) => [k, changes[k]])) }
    UpdateBody.parse(input)
    const before: Record<string, unknown> = {
      customerDisplayName: current.name,
      phone: current.phone,
      customerId: current.customerId,
      date: current.date,
      startTime: current.startTime,
      endTime: current.endTime,
      guestCount: current.guestCount,
      serviceSummary: current.serviceSummary,
      notes: current.notes,
    }
    return createIntent({
      principal,
      actionType: 'update_appointment',
      executeTool: 'lindy_update_appointment',
      payload: { id, input },
      summary: {
        action: 'Sửa lịch hẹn',
        appointment: { id, name: current.name, date: current.date, startTime: current.startTime },
        changes: Object.fromEntries(
          keys.map((k) => [k, { before: before[k] ?? null, after: changes[k] ?? null }]),
        ),
      },
    })
  },
})

export const updateAppointmentTool = defineTool({
  name: 'lindy_update_appointment',
  title: 'Sửa lịch hẹn',
  description: `Thực hiện sửa lịch hẹn đã xem trước. Lịch đã đổi trong app sau lúc xem trước sẽ báo lệch phiên bản. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'update_appointment',
      run: (payload) => {
        const p = payload as { id: string; input: unknown }
        return updateAppointment(auth, p.id, UpdateBody.parse(p.input))
      },
    })
  },
})

// ---------------------------------------------------------------- Huỷ lịch / Khách báo huỷ

export const previewCancelAppointment = defineTool({
  name: 'lindy_preview_cancel_appointment',
  title: 'Xem trước: huỷ lịch hẹn',
  description: `${PREVIEW_NOTE} Huỷ một lịch hẹn (id), kèm lý do (reason) nếu có.`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({ id: uuid, reason: z.string().trim().max(500).optional() }),
  run: async ({ id, reason }, { auth, principal }) => {
    const current = await getAppointment(auth, id)
    if (!current.can.cancel) throw forbidden('Lịch này không huỷ được ở trạng thái hiện tại.')
    return createIntent({
      principal,
      actionType: 'cancel_appointment',
      executeTool: 'lindy_cancel_appointment',
      payload: { id, version: current.version, reason: reason ?? null },
      summary: {
        action: 'Huỷ lịch hẹn',
        appointment: {
          id,
          name: current.name,
          date: current.date,
          startTime: current.startTime,
          guestCount: current.guestCount,
          status: current.status,
        },
        reason: reason ?? null,
        deposit: current.deposit ?? null,
      },
    })
  },
})

export const cancelAppointmentTool = defineTool({
  name: 'lindy_cancel_appointment',
  title: 'Huỷ lịch hẹn',
  description: `Thực hiện huỷ lịch hẹn đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'cancel_appointment',
      run: (payload) => {
        const p = payload as { id: string; version: number; reason: string | null }
        return transitionAppointment(auth, p.id, 'cancel', {
          version: p.version,
          ...(p.reason ? { reason: p.reason } : {}),
        })
      },
    })
  },
})

export const previewCustomerCancelAppointment = defineTool({
  name: 'lindy_preview_customer_cancel_appointment',
  title: 'Xem trước: khách báo huỷ',
  description: `${PREVIEW_NOTE} Ghi "Khách báo huỷ" cho một lịch hẹn (id), kèm ghi chú (note) nếu có.`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({ id: uuid, note: z.string().trim().max(500).optional() }),
  run: async ({ id, note }, { auth, principal }) => {
    const current = await getAppointment(auth, id)
    if (!current.can.reportCustomerCancel) throw forbidden('Lịch này không ghi được "Khách báo huỷ".')
    return createIntent({
      principal,
      actionType: 'customer_cancel_appointment',
      executeTool: 'lindy_customer_cancel_appointment',
      payload: { id, version: current.version, note: note ?? null },
      summary: {
        action: 'Khách báo huỷ',
        appointment: { id, name: current.name, date: current.date, startTime: current.startTime },
        note: note ?? null,
      },
    })
  },
})

export const customerCancelAppointmentTool = defineTool({
  name: 'lindy_customer_cancel_appointment',
  title: 'Khách báo huỷ',
  description: `Thực hiện ghi "Khách báo huỷ" đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'customer_cancel_appointment',
      run: (payload) => {
        const p = payload as { id: string; version: number; note: string | null }
        return transitionAppointment(auth, p.id, 'report_customer_cancel', {
          version: p.version,
          ...(p.note ? { note: p.note } : {}),
        })
      },
    })
  },
})

export const WRITE_APPOINTMENT_TOOLS = [
  previewCreateAppointment,
  createAppointmentTool,
  previewUpdateAppointment,
  updateAppointmentTool,
  previewCancelAppointment,
  cancelAppointmentTool,
  previewCustomerCancelAppointment,
  customerCancelAppointmentTool,
]
