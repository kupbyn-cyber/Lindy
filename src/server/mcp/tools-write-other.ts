// Tool ghi còn lại (gói 8): đề nghị chi, duyệt công ngày, duyệt nghỉ, duyệt tạm ứng, sửa tên/SĐT khách.
// Mỗi việc một cặp xem trước / thực hiện; thực hiện gọi đúng service của app, quyền do service + RLS quyết.
import { z } from 'zod'
import { actOnLeave } from '../attendance/leave'
import { DecideBody } from '../attendance/schema'
import { dayBoard, decideDay } from '../attendance/service'
import { hasPerm, requireBranch } from '../auth/context'
import { CustomerBody } from '../customers/schema'
import { getCustomer, updateCustomer } from '../customers/service'
import { ExpenseBody } from '../expenses/schema'
import { createExpense, listExpenses } from '../expenses/service'
import { conflict, forbidden, invalid, notFound } from '../http/errors'
import { limitWrites } from '../http/route'
import { actOnAdvance, listAdvances } from '../payroll/advances'
import { SCOPE_WRITE } from './config'
import { createIntent, executeIntent } from './intents'
import { defineTool, isoDate, uuid } from './kit'

const EXECUTE_NOTE =
  'Chỉ gọi khi người dùng đã xem bản xem trước và yêu cầu thực hiện. Tham số duy nhất là action_token từ tool xem trước.'
const PREVIEW_NOTE = 'Chỉ tạo bản xem trước, CHƯA ghi gì; trả action_token cho tool thực hiện.'
const MONEY = 'Tiền là số nguyên VND (8450000 = 8.450.000đ).'
const tokenInput = z.object({ action_token: z.string().min(20).max(200) })

// ---------------------------------------------------------------- Đề nghị chi

export const previewCreateExpense = defineTool({
  name: 'lindy_preview_create_expense',
  title: 'Xem trước: đề nghị chi',
  description:
    `${PREVIEW_NOTE} Ghi đề nghị chi: nhóm chi (categoryCode, lấy từ danh sách categories của lindy_list_expenses), ` +
    `số tiền (amount, 1–100.000.000), nội dung (note). ${MONEY}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({
    categoryCode: z.string().max(30),
    amount: z.number().int(),
    note: z.string().max(300),
  }),
  run: async (args, { auth, principal }) => {
    const branch = requireBranch(auth, undefined)
    if (!hasPerm(auth, branch.id, 'expense.request')) throw forbidden('Không có quyền đề nghị chi.')
    ExpenseBody.parse({ ...args, createRequestId: crypto.randomUUID() })
    const { categories } = await listExpenses(auth, { filter: 'pending' })
    const cat = categories.find((c) => c.code === args.categoryCode)
    if (!cat) {
      throw invalid(
        `Nhóm chi không đúng. Chọn một mã: ${categories.map((c) => `${c.code} (${c.name})`).join(', ')}.`,
      )
    }
    const payload = { categoryCode: args.categoryCode, amount: args.amount, note: args.note.trim() }
    return createIntent({
      principal,
      actionType: 'create_expense',
      executeTool: 'lindy_create_expense',
      payload,
      summary: { action: 'Ghi đề nghị chi', category: cat.name, ...payload },
    })
  },
})

export const createExpenseTool = defineTool({
  name: 'lindy_create_expense',
  title: 'Ghi đề nghị chi',
  description: `Thực hiện ghi đề nghị chi đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'create_expense',
      // createRequestId = id intent: chạy lại không ghi phiếu thứ hai
      run: (payload, intentId) =>
        createExpense(auth, ExpenseBody.parse({ ...payload, createRequestId: intentId })),
    })
  },
})

// ---------------------------------------------------------------- Duyệt công ngày

const DECISIONS = ['worked', 'leave', 'unexcused'] as const

export const previewDecideAttendance = defineTool({
  name: 'lindy_preview_decide_attendance',
  title: 'Xem trước: duyệt công ngày',
  description:
    `${PREVIEW_NOTE} Quyết công một người một ngày (userId, date YYYY-MM-DD, không phải ngày tương lai): ` +
    'status worked (Đi làm) | leave (Nghỉ có phép) | unexcused (Nghỉ không phép), note nếu có. ' +
    'Lấy userId từ lindy_attendance_day.',
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({
    userId: uuid,
    date: isoDate,
    status: z.enum(DECISIONS),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  run: async (args, { auth, principal }) => {
    const branch = requireBranch(auth, undefined)
    if (!hasPerm(auth, branch.id, 'attendance.approve')) throw forbidden('Chỉ Nhung, Linh duyệt công.')
    DecideBody.parse(args)
    const board = await dayBoard(auth, { date: args.date })
    // dayBoard đổi ngày sai/tương lai thành hôm nay: phải đúng ngày được hỏi [phản biện vòng 2 L9]
    if (board.date !== args.date) throw invalid('Không duyệt công cho ngày tương lai.')
    if (board.locked) throw invalid('Tháng này đã khoá lương, không đổi công được.')
    const person = board.people.find((p) => p.userId === args.userId)
    if (!person) throw notFound('Người này không có trong bảng công ngày đó.')
    const payload = { ...args, note: args.note ?? null, decidedBefore: person.decided ?? null }
    return createIntent({
      principal,
      actionType: 'decide_attendance',
      executeTool: 'lindy_decide_attendance',
      payload,
      summary: {
        action: 'Duyệt công ngày',
        name: person.name,
        date: args.date,
        before: person.decided ?? person.status,
        after: args.status,
        checkIn: person.checkIn,
        note: args.note ?? null,
      },
    })
  },
})

export const decideAttendanceTool = defineTool({
  name: 'lindy_decide_attendance',
  title: 'Duyệt công ngày',
  description: `Thực hiện quyết công đã xem trước. Công đã đổi trong app sau lúc xem trước thì dừng. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'decide_attendance',
      run: async (payload) => {
        const p = payload as {
          userId: string
          date: string
          status: (typeof DECISIONS)[number]
          note: string | null
          decidedBefore: string | null
        }
        // decideDay không có version: đọc lại, khác lúc xem trước thì không ghi [phản biện L7]
        const board = await dayBoard(auth, { date: p.date })
        const person = board.people.find((x) => x.userId === p.userId)
        if (board.date !== p.date || !person || (person.decided ?? null) !== p.decidedBefore) {
          throw conflict('Công ngày này đã thay đổi sau lúc xem trước. Xem trước lại.')
        }
        return decideDay(auth, { userId: p.userId, date: p.date, status: p.status, note: p.note })
      },
    })
  },
})

// ---------------------------------------------------------------- Duyệt / từ chối nghỉ

export const previewDecideLeave = defineTool({
  name: 'lindy_preview_decide_leave',
  title: 'Xem trước: duyệt đơn nghỉ',
  description:
    `${PREVIEW_NOTE} Duyệt hoặc từ chối một đơn nghỉ đang chờ (id lấy từ pendingLeaves của lindy_attendance_day): ` +
    'decision approve | reject, note nếu có.',
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({
    id: uuid,
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  run: async ({ id, decision, note }, { auth, principal }) => {
    const board = await dayBoard(auth, {})
    const leave = board.pendingLeaves.find((l) => l.id === id)
    if (!leave) throw notFound('Không tìm thấy đơn nghỉ đang chờ duyệt.')
    if (!leave.can[decision]) throw forbidden('Không duyệt được đơn nghỉ này.')
    return createIntent({
      principal,
      actionType: 'decide_leave',
      executeTool: 'lindy_decide_leave',
      payload: { id, decision, version: leave.version, note: note ?? null },
      summary: {
        action: decision === 'approve' ? 'Duyệt đơn nghỉ' : 'Từ chối đơn nghỉ',
        name: leave.name,
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        reason: leave.reason,
        note: note ?? null,
      },
    })
  },
})

export const decideLeaveTool = defineTool({
  name: 'lindy_decide_leave',
  title: 'Duyệt đơn nghỉ',
  description: `Thực hiện duyệt/từ chối đơn nghỉ đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'decide_leave',
      run: (payload) => {
        const p = payload as {
          id: string
          decision: 'approve' | 'reject'
          version: number
          note: string | null
        }
        return actOnLeave(auth, p.id, p.decision, { version: p.version, note: p.note })
      },
    })
  },
})

// ---------------------------------------------------------------- Duyệt / từ chối tạm ứng

export const previewDecideAdvance = defineTool({
  name: 'lindy_preview_decide_advance',
  title: 'Xem trước: duyệt tạm ứng',
  description:
    `${PREVIEW_NOTE} Duyệt hoặc từ chối một đề nghị tạm ứng đang chờ (id từ lindy_list_advances): ` +
    `decision approve | reject, note nếu có. Không chi tiền ở đây. ${MONEY}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({
    id: uuid,
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  run: async ({ id, decision, note }, { auth, principal }) => {
    const { items } = await listAdvances(auth, { filter: 'pending' })
    const adv = items.find((a) => a.id === id)
    if (!adv) throw notFound('Không tìm thấy đề nghị tạm ứng đang chờ duyệt.')
    if (!adv.can[decision]) throw forbidden('Không duyệt được đề nghị tạm ứng này.')
    return createIntent({
      principal,
      actionType: 'decide_advance',
      executeTool: 'lindy_decide_advance',
      payload: { id, decision, version: adv.version, note: note ?? null },
      summary: {
        action: decision === 'approve' ? 'Duyệt tạm ứng' : 'Từ chối tạm ứng',
        name: adv.name,
        amount: adv.amount,
        note: note ?? null,
      },
    })
  },
})

export const decideAdvanceTool = defineTool({
  name: 'lindy_decide_advance',
  title: 'Duyệt tạm ứng',
  description: `Thực hiện duyệt/từ chối tạm ứng đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'decide_advance',
      run: (payload) => {
        const p = payload as {
          id: string
          decision: 'approve' | 'reject'
          version: number
          note: string | null
        }
        return actOnAdvance(auth, p.id, p.decision, { version: p.version, note: p.note })
      },
    })
  },
})

// ---------------------------------------------------------------- Sửa tên / SĐT khách

export const previewUpdateCustomer = defineTool({
  name: 'lindy_preview_update_customer',
  title: 'Xem trước: sửa khách',
  description: `${PREVIEW_NOTE} Sửa tên và/hoặc SĐT của một khách (id từ lindy_search_customers). Bỏ SĐT: phone = null.`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: z.object({
    id: uuid,
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().max(40).nullable().optional(),
  }),
  run: async ({ id, name, phone }, { auth, principal }) => {
    if (name === undefined && phone === undefined) throw invalid('Chưa có gì cần đổi.')
    const cur = await getCustomer(auth, id)
    if (!cur.canEdit) throw forbidden('Chỉ Nhung, Linh sửa được thông tin khách.')
    const next = { name: name ?? cur.name, phone: phone === undefined ? cur.phone : phone }
    CustomerBody.parse(next)
    return createIntent({
      principal,
      actionType: 'update_customer',
      executeTool: 'lindy_update_customer',
      payload: { id, version: cur.version, ...next },
      summary: {
        action: 'Sửa thông tin khách',
        before: { name: cur.name, phone: cur.phone },
        after: next,
      },
    })
  },
})

export const updateCustomerTool = defineTool({
  name: 'lindy_update_customer',
  title: 'Sửa khách',
  description: `Thực hiện sửa tên/SĐT khách đã xem trước. ${EXECUTE_NOTE}`,
  scope: SCOPE_WRITE,
  readOnly: false,
  input: tokenInput,
  run: ({ action_token }, { auth, principal }) => {
    limitWrites(auth.userId)
    return executeIntent({
      token: action_token,
      principal,
      actionType: 'update_customer',
      run: (payload) => {
        const p = payload as { id: string; version: number; name: string; phone: string | null }
        return updateCustomer(auth, p.id, { version: p.version, name: p.name, phone: p.phone })
      },
    })
  },
})

export const WRITE_OTHER_TOOLS = [
  previewCreateExpense,
  createExpenseTool,
  previewDecideAttendance,
  decideAttendanceTool,
  previewDecideLeave,
  decideLeaveTool,
  previewDecideAdvance,
  decideAdvanceTool,
  previewUpdateCustomer,
  updateCustomerTool,
]
