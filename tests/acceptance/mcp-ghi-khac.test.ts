// MCP (gói 8): đề nghị chi, duyệt công, duyệt nghỉ, duyệt tạm ứng, sửa khách qua xem trước → thực hiện.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addMonths, toLocalDate } from '../../src/lib/time'
import { createLeave } from '../../src/server/attendance/leave'
import { dayBoard } from '../../src/server/attendance/service'
import { createCustomer, getCustomer } from '../../src/server/customers/service'
import { closeSql } from '../../src/server/db/client'
import { listExpenses } from '../../src/server/expenses/service'
import { resetWriteLimits } from '../../src/server/http/route'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { createAdvance, listAdvances } from '../../src/server/payroll/advances'
import { savePolicy, saveProfile } from '../../src/server/staff/service'
import { rid, sessionOf } from '../helpers/auth'
import { ownerSql, seed } from '../helpers/db'
import { callTool, mcpToken, rpc } from '../helpers/mcp'

const owner = ownerSql()
const today = toLocalDate(new Date())
let token = ''
let linh: Awaited<ReturnType<typeof sessionOf>>['auth']
let trang: Awaited<ReturnType<typeof sessionOf>>['auth']
let cs = ''
const thisMonth = today.slice(0, 7)
const startDate = `${addMonths(thisMonth, -3)}-01`

// Cơ sở thử riêng (như cham-cong.test.ts). Tên bắt đầu bằng "Aa" để là cơ sở đầu tiên của Linh trong lúc chạy
// file này — tool MCP dùng cơ sở đầu tiên. afterAll thu hồi vai trò nên các file test khác không bị ảnh hưởng.
beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CSM', 'Aa cơ sở thử MCP', 'CSM') returning id`
  cs = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs})`
  await owner`insert into payroll_settings (branch_id) values (${cs})`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['chin', 'staff_booking_plus'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs}, id, 'test' from roles where code = ${role}`
  }
  linh = (await sessionOf('linh')).auth
  trang = (await sessionOf('trang')).auth
  expect(linh.branches[0]!.id).toBe(cs)
  for (const k of ['chin', 'trang'] as const) {
    await saveProfile(linh, {
      branchId: cs,
      userId: seed().users[k]!.id,
      startDate,
      endDate: null,
      payMethod: 'cash',
    })
  }
  await savePolicy(linh, {
    branchId: cs,
    userId: seed().users.trang!.id,
    effectiveMonth: `${thisMonth}-01`,
    baseSalary: 5_000_000,
    commissionBps: 1000,
    leaveDays: 3,
    managerKpi: false,
    reason: 'Thử MCP',
  })
  token = (await mcpToken('linh')).token
})
beforeEach(() => {
  resetMcpRateLimits()
  resetWriteLimits()
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs}`
  await owner.end()
  await closeSql()
})

type Preview = { action_token: string; summary: Record<string, unknown> }

async function previewThenRun(previewTool: string, runTool: string, args: Record<string, unknown>) {
  const p = await callTool<Preview>(token, previewTool, args)
  expect(p.isError, JSON.stringify(p.data)).toBe(false)
  const r = await callTool<{ replayed: boolean; result: unknown }>(token, runTool, {
    action_token: p.data.action_token,
  })
  expect(r.isError, JSON.stringify(r.data)).toBe(false)
  const again = await callTool<{ replayed: boolean }>(token, runTool, { action_token: p.data.action_token })
  expect(again.data.replayed).toBe(true)
  return { preview: p.data, result: r.data.result }
}

describe('MCP ghi khác', () => {
  it('tools/list đủ 39 tool', async () => {
    const { body } = await rpc(token, 'tools/list')
    const names = (body!.result!.tools as { name: string }[]).map((t) => t.name)
    expect(names.length).toBe(39)
    expect(new Set(names).size).toBe(39)
    expect(names.filter((n) => n.startsWith('lindy_preview_')).length).toBe(9)
  })

  it('đề nghị chi: nhóm sai → gợi ý mã; đúng → 1 phiếu, chạy lại không thêm', async () => {
    const bad = await callTool<{ message: string }>(token, 'lindy_preview_create_expense', {
      categoryCode: 'khong_co',
      amount: 150000,
      note: 'Mua bông',
    })
    expect(bad.isError).toBe(true)
    expect(bad.data.message).toContain('supplies')
    const before = (await listExpenses(linh, { filter: 'all' })).items.length
    await previewThenRun('lindy_preview_create_expense', 'lindy_create_expense', {
      categoryCode: 'supplies',
      amount: 150000,
      note: 'Mua bông tẩy trang MCP',
    })
    const after = (await listExpenses(linh, { filter: 'all' })).items
    expect(after.length).toBe(before + 1)
    expect(after.filter((e) => e.note === 'Mua bông tẩy trang MCP').length).toBe(1)
  })

  it('duyệt công: bổ sung công thiếu ghi chú → đúng câu của DB; có ghi chú → ghi; ngày tương lai bị chặn', async () => {
    const yesterday = addDays(today, -1)
    const uid = seed().users.trang!.id
    const p = await callTool<Preview>(token, 'lindy_preview_decide_attendance', {
      userId: uid,
      date: yesterday,
      status: 'worked',
    })
    expect(p.isError, JSON.stringify(p.data)).toBe(false)
    const r = await callTool<{ message: string }>(token, 'lindy_decide_attendance', {
      action_token: p.data.action_token,
    })
    expect(r.isError).toBe(true)
    expect(r.data.message).toMatch(/lý do|ghi chú/i)

    await previewThenRun('lindy_preview_decide_attendance', 'lindy_decide_attendance', {
      userId: uid,
      date: yesterday,
      status: 'worked',
      note: 'Quên chụp ảnh vào ca',
    })
    const board = await dayBoard(linh, { date: yesterday })
    expect(board.people.find((x) => x.userId === uid)?.decided).toBe('worked')

    const future = await callTool<{ message: string }>(token, 'lindy_preview_decide_attendance', {
      userId: uid,
      date: addDays(today, 2),
      status: 'worked',
    })
    expect(future.isError).toBe(true)
    expect(future.data.message).toContain('tương lai')
  })

  it('duyệt công: đã đổi trong app sau lúc xem trước → dừng, không ghi', async () => {
    const day = addDays(today, -2)
    const uid = seed().users.chin!.id
    const p = await callTool<Preview>(token, 'lindy_preview_decide_attendance', {
      userId: uid,
      date: day,
      status: 'unexcused',
    })
    expect(p.isError, JSON.stringify(p.data)).toBe(false)
    const other = await callTool<Preview>(token, 'lindy_preview_decide_attendance', {
      userId: uid,
      date: day,
      status: 'leave',
    })
    const ok = await callTool(token, 'lindy_decide_attendance', { action_token: other.data.action_token })
    expect(ok.isError, JSON.stringify(ok.data)).toBe(false)
    const stale = await callTool<{ message: string }>(token, 'lindy_decide_attendance', {
      action_token: p.data.action_token,
    })
    expect(stale.isError).toBe(true)
    expect(stale.data.message).toContain('đã thay đổi')
    const board = await dayBoard(linh, { date: day })
    expect(board.people.find((x) => x.userId === uid)?.decided).toBe('leave')
  })

  it('duyệt đơn nghỉ', async () => {
    const l = await createLeave(trang, {
      branchId: cs,
      createRequestId: rid(),
      fromDate: addDays(today, 10),
      toDate: addDays(today, 10),
      reason: 'Đi khám MCP',
    })
    const { result } = await previewThenRun('lindy_preview_decide_leave', 'lindy_decide_leave', {
      id: l.id,
      decision: 'approve',
    })
    expect((result as { status: string }).status).toBe('approved')
  })

  it('từ chối tạm ứng (không chi tiền)', async () => {
    const a = await createAdvance(trang, {
      branchId: cs,
      createRequestId: rid(),
      amount: 500000,
      reason: 'Tạm ứng MCP',
    })
    const { preview, result } = await previewThenRun('lindy_preview_decide_advance', 'lindy_decide_advance', {
      id: a.id,
      decision: 'reject',
      note: 'Cuối tháng',
    })
    expect(preview.summary.amount).toBe(500000)
    expect((result as { status: string }).status).toBe('rejected')
    const pending = await listAdvances(linh, { filter: 'pending' })
    expect(pending.items.find((x) => x.id === a.id)).toBeUndefined()
  })

  it('sửa tên, SĐT khách: xem trước có trước → sau', async () => {
    const c = await createCustomer(linh, { name: 'Khách Sửa Tên MCP', phone: '0912345602' })
    const { preview } = await previewThenRun('lindy_preview_update_customer', 'lindy_update_customer', {
      id: c.customer.id,
      name: 'Khách Đã Sửa MCP',
    })
    expect(preview.summary.before).toEqual({ name: 'Khách Sửa Tên MCP', phone: '0912345602' })
    const after = await getCustomer(linh, c.customer.id)
    expect(after.name).toBe('Khách Đã Sửa MCP')
    expect(after.phone).toBe('0912345602')
  })
})
