// MCP (gói 7): ghi lịch hẹn qua chat — tạo (thiếu giờ kết thúc lấy thời lượng mặc định), sửa, huỷ, khách báo huỷ.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, hhmmToMinutes, minutesToHHMM, toLocalDate } from '../../src/lib/time'
import { getAppointment, getSettings } from '../../src/server/appointments/service'
import { closeSql } from '../../src/server/db/client'
import { resetWriteLimits } from '../../src/server/http/route'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { sessionOf } from '../helpers/auth'
import { callTool, mcpToken } from '../helpers/mcp'

const day = addDays(toLocalDate(new Date()), 4)
let token = ''
let auth: Awaited<ReturnType<typeof sessionOf>>['auth']

beforeAll(async () => {
  token = (await mcpToken('linh')).token
  auth = (await sessionOf('linh')).auth
})
beforeEach(() => {
  resetMcpRateLimits()
  resetWriteLimits()
})
afterAll(async () => {
  await closeSql()
})

type Preview = { action_token: string; summary: Record<string, unknown> }
type Created = { result: { appointment: { id: string } } }

async function createViaChat(name: string, startTime: string) {
  const p = await callTool<Preview>(token, 'lindy_preview_create_appointment', {
    customerDisplayName: name,
    date: day,
    startTime,
    guestCount: 2,
  })
  expect(p.isError, JSON.stringify(p.data)).toBe(false)
  const c = await callTool<Created>(token, 'lindy_create_appointment', { action_token: p.data.action_token })
  expect(c.isError, JSON.stringify(c.data)).toBe(false)
  return { preview: p.data, id: c.data.result.appointment.id }
}

describe('MCP ghi lịch hẹn', () => {
  it('"tạo lịch cho chị Hoa 15h, 2 khách": không có giờ kết thúc → theo thời lượng mặc định, hiện trong xem trước', async () => {
    const s = await getSettings(auth)
    const { preview, id } = await createViaChat('Chị Hoa MCP', '15:00')
    const expectedEnd = minutesToHHMM(hhmmToMinutes('15:00') + s.defaultDurationMin)
    expect(preview.summary.endTime).toBe(expectedEnd)
    expect(String(preview.summary.endTimeNote)).toContain(String(s.defaultDurationMin))
    const a = await getAppointment(auth, id)
    expect(a.startTime).toBe('15:00')
    expect(a.endTime).toBe(expectedEnd)
    expect(a.guestCount).toBe(2)
  })

  it('sửa lịch: xem trước có trước → sau; thực hiện đổi đúng; lịch đổi trong app sau xem trước → báo lệch', async () => {
    const { id } = await createViaChat('Khách Sửa MCP', '10:00')
    const p = await callTool<Preview>(token, 'lindy_preview_update_appointment', { id, guestCount: 3 })
    expect(p.isError, JSON.stringify(p.data)).toBe(false)
    expect(p.data.summary.changes).toEqual({ guestCount: { before: 2, after: 3 } })
    const u = await callTool(token, 'lindy_update_appointment', { action_token: p.data.action_token })
    expect(u.isError, JSON.stringify(u.data)).toBe(false)
    expect((await getAppointment(auth, id)).guestCount).toBe(3)

    const stale = await callTool<Preview>(token, 'lindy_preview_update_appointment', { id, guestCount: 1 })
    const fresh = await callTool<Preview>(token, 'lindy_preview_update_appointment', { id, guestCount: 4 })
    expect(
      (await callTool(token, 'lindy_update_appointment', { action_token: fresh.data.action_token })).isError,
    ).toBe(false)
    const r = await callTool(token, 'lindy_update_appointment', { action_token: stale.data.action_token })
    expect(r.isError).toBe(true)
    expect((await getAppointment(auth, id)).guestCount).toBe(4)
  })

  it('huỷ lịch có lý do', async () => {
    const { id } = await createViaChat('Khách Huỷ MCP', '11:00')
    const p = await callTool<Preview>(token, 'lindy_preview_cancel_appointment', {
      id,
      reason: 'Khách đổi ý',
    })
    expect(p.isError, JSON.stringify(p.data)).toBe(false)
    expect((await getAppointment(auth, id)).status).not.toBe('cancelled')
    const r = await callTool(token, 'lindy_cancel_appointment', { action_token: p.data.action_token })
    expect(r.isError, JSON.stringify(r.data)).toBe(false)
    const a = await getAppointment(auth, id)
    expect(a.status).toBe('cancelled')
    expect(a.cancelReason).toBe('Khách đổi ý')
  })

  it('khách báo huỷ', async () => {
    const { id } = await createViaChat('Khách Báo Huỷ MCP', '12:00')
    const p = await callTool<Preview>(token, 'lindy_preview_customer_cancel_appointment', {
      id,
      note: 'Nhắn Zalo',
    })
    expect(p.isError, JSON.stringify(p.data)).toBe(false)
    const r = await callTool(token, 'lindy_customer_cancel_appointment', {
      action_token: p.data.action_token,
    })
    expect(r.isError, JSON.stringify(r.data)).toBe(false)
    expect((await getAppointment(auth, id)).customerCancelReported).toBe(true)
  })
})
