// MCP (gói 7): intent ghi — xem trước không ghi, thực hiện đúng một lần, mã hết hạn/sai chủ/sai việc bị từ chối.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { closeSql } from '../../src/server/db/client'
import { resetWriteLimits } from '../../src/server/http/route'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { ownerSql } from '../helpers/db'
import { callTool, mcpToken } from '../helpers/mcp'

const owner = ownerSql()
const day = addDays(toLocalDate(new Date()), 3)
let token = ''

beforeAll(async () => {
  token = (await mcpToken('linh')).token
})
beforeEach(() => {
  resetMcpRateLimits()
  resetWriteLimits()
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})

type Preview = { action_token: string; next_tool: string; summary: Record<string, unknown> }

async function preview(name: string, startTime = '13:00') {
  const r = await callTool<Preview>(token, 'lindy_preview_create_appointment', {
    customerDisplayName: name,
    date: day,
    startTime,
    endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    guestCount: 1,
  })
  expect(r.isError, JSON.stringify(r.data)).toBe(false)
  return r.data
}

const countByName = async (name: string) => {
  const [r] = await owner<{ n: number }[]>`
    select count(*)::int as n from appointments where customer_display_name = ${name}`
  return r!.n
}

describe('MCP intent ghi', () => {
  it('xem trước không tạo lịch; thực hiện tạo đúng 1 lịch; gọi lại cùng mã trả kết quả cũ', async () => {
    const name = 'Intent Một Lần'
    const p = await preview(name)
    expect(p.next_tool).toBe('lindy_create_appointment')
    expect(await countByName(name)).toBe(0)
    const first = await callTool<{ replayed: boolean; result: { appointment: { id: string } } }>(
      token,
      'lindy_create_appointment',
      { action_token: p.action_token },
    )
    expect(first.isError, JSON.stringify(first.data)).toBe(false)
    expect(first.data.replayed).toBe(false)
    expect(await countByName(name)).toBe(1)
    const again = await callTool<{ replayed: boolean; result: { appointment: { id: string } } }>(
      token,
      'lindy_create_appointment',
      { action_token: p.action_token },
    )
    expect(again.isError).toBe(false)
    expect(again.data.replayed).toBe(true)
    expect(again.data.result.appointment.id).toBe(first.data.result.appointment.id)
    expect(await countByName(name)).toBe(1)
  })

  it('mã hết hạn bị từ chối', async () => {
    const p = await preview('Intent Hết Hạn', '14:00')
    await owner`update mcp_write_intents set expires_at = now() - interval '1 minute'
                where status = 'pending' and summary->>'customerDisplayName' = 'Intent Hết Hạn'`
    const r = await callTool<{ message: string }>(token, 'lindy_create_appointment', {
      action_token: p.action_token,
    })
    expect(r.isError).toBe(true)
    expect(r.data.message).toContain('hết hạn')
    expect(await countByName('Intent Hết Hạn')).toBe(0)
  })

  it('mã của grant khác hoặc việc khác bị từ chối', async () => {
    const p = await preview('Intent Sai Chủ', '15:00')
    const other = (await mcpToken('linh')).token
    const r = await callTool(other, 'lindy_create_appointment', { action_token: p.action_token })
    expect(r.isError).toBe(true)
    const wrong = await callTool(token, 'lindy_cancel_appointment', { action_token: p.action_token })
    expect(wrong.isError).toBe(true)
    expect(await countByName('Intent Sai Chủ')).toBe(0)
  })

  it('đang thực hiện (< 2 phút) → "đang thực hiện", không tạo lịch; quá 2 phút → "không rõ"', async () => {
    const name = 'Intent Đang Chạy'
    const p = await preview(name, '16:00')
    await owner`update mcp_write_intents set status = 'executing', claimed_at = now()
                where summary->>'customerDisplayName' = ${name}`
    const r = await callTool<{ message: string }>(token, 'lindy_create_appointment', {
      action_token: p.action_token,
    })
    expect(r.isError).toBe(true)
    expect(r.data.message).toContain('đang thực hiện')
    await owner`update mcp_write_intents set claimed_at = now() - interval '5 minutes'
                where summary->>'customerDisplayName' = ${name}`
    const r2 = await callTool<{ message: string }>(token, 'lindy_create_appointment', {
      action_token: p.action_token,
    })
    expect(r2.data.message).toContain('Không rõ')
    expect(await countByName(name)).toBe(0)
  })

  it('token chỉ có quyền đọc gọi xem trước → challenge insufficient_scope', async () => {
    const ro = (await mcpToken('linh', ['lindy:read', 'offline_access'])).token
    const r = await callTool(ro, 'lindy_preview_create_appointment', {
      customerDisplayName: 'Không Quyền',
      date: day,
      startTime: '10:00',
      guestCount: 1,
    })
    expect(r.isError).toBe(true)
    const challenge = (r.result!._meta!['mcp/www_authenticate'] as string[])[0]!
    expect(challenge).toContain('insufficient_scope')
    expect(challenge).toContain('lindy:write')
  })
})
