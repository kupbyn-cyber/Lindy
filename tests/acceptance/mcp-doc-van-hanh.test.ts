// MCP (gói 5): tool đọc vận hành — kết quả khớp đúng service mà màn app đang dùng.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { attentionList, createAppointment, listAppointments } from '../../src/server/appointments/service'
import { createCustomer, recentCustomers } from '../../src/server/customers/service'
import { closeSql } from '../../src/server/db/client'
import { resetWriteLimits } from '../../src/server/http/route'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { listOrders } from '../../src/server/orders/service'
import { reviewQueue } from '../../src/server/review/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { callTool, mcpToken, rpc } from '../helpers/mcp'

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown
const today = toLocalDate(new Date())
const from = addDays(today, -30)
const to = addDays(today, 30)

let token = ''
let auth: Awaited<ReturnType<typeof sessionOf>>['auth']
beforeAll(async () => {
  token = (await mcpToken('linh' as SeedKey)).token
  auth = (await sessionOf('linh')).auth
  // Dữ liệu riêng của file test: một khách có hồ sơ và một lịch ngày mai
  const c = await createCustomer(auth, { name: 'Khách MCP đọc', phone: '0912345601' })
  await createAppointment(auth, {
    customerId: c.customer.id,
    customerDisplayName: 'Khách MCP đọc',
    phone: '0912345601',
    date: addDays(today, 1),
    startTime: '10:00',
    endTime: '11:00',
    guestCount: 1,
    serviceSummary: null,
    notes: null,
    createRequestId: rid(),
  })
})
beforeEach(() => {
  resetMcpRateLimits()
  resetWriteLimits()
})
afterAll(async () => {
  await closeSql()
})

describe('MCP đọc vận hành', () => {
  it('tools/list có đủ 8 tool vận hành, mô tả tiếng Việt', async () => {
    const { body } = await rpc(token, 'tools/list')
    const tools = body!.result!.tools as { name: string; description: string }[]
    for (const n of [
      'lindy_list_appointments',
      'lindy_get_appointment',
      'lindy_list_attention',
      'lindy_list_orders',
      'lindy_get_order',
      'lindy_search_customers',
      'lindy_get_customer',
      'lindy_review_queue',
    ]) {
      const t = tools.find((x) => x.name === n)
      expect(t, n).toBeTruthy()
      expect(t!.description.length).toBeGreaterThan(20)
    }
  })

  it('lịch hẹn theo khoảng ngày khớp listAppointments', async () => {
    const r = await callTool(token, 'lindy_list_appointments', { from, to })
    expect(r.isError).toBe(false)
    expect(r.data).toEqual(json(await listAppointments(auth, { from, to })))
  })

  it('chi tiết lịch, đơn, khách gọi được khi có id', async () => {
    const appts = (await listAppointments(auth, { from, to })) as unknown as {
      items?: { id: string }[]
    }
    const firstAppt = appts.items?.[0]
    expect(firstAppt).toBeTruthy()
    const r = await callTool<{ phone?: string }>(token, 'lindy_get_appointment', { id: firstAppt!.id })
    expect(r.isError).toBe(false)
    const orders = (await listOrders(auth, { from, to, filter: 'all' })) as unknown as {
      items?: { id: string }[]
    }
    const r2 = await callTool(token, 'lindy_list_orders', { from, to })
    expect(r2.data).toEqual(json(await listOrders(auth, { from, to, filter: 'all', review: false })))
    if (orders.items?.[0]) {
      const r3 = await callTool(token, 'lindy_get_order', { id: orders.items[0].id })
      expect(r3.isError).toBe(false)
    }
    const customers = await recentCustomers(auth)
    const r4 = await callTool<{ items: unknown[] }>(token, 'lindy_search_customers', {})
    expect(r4.data.items).toEqual(json(customers))
    const found = await callTool<{ items: { id: string; phoneMasked: string }[] }>(
      token,
      'lindy_search_customers',
      { q: 'Khách MCP đọc' },
    )
    const hit = found.data.items[0]
    expect(hit?.phoneMasked).not.toContain('0912345601')
    const r5 = await callTool<Record<string, unknown>>(token, 'lindy_get_customer', { id: hit!.id })
    expect(r5.isError).toBe(false)
    expect(JSON.stringify(r5.data)).toContain('0912345601')
  })

  it('cần chú ý và Cần xem lại khớp service', async () => {
    expect((await callTool(token, 'lindy_list_attention')).data).toEqual(json(await attentionList(auth)))
    expect((await callTool(token, 'lindy_review_queue')).data).toEqual(json(await reviewQueue(auth)))
  })

  it('tham số sai (ngày sai dạng, id lạ) → lỗi tool có câu tiếng Việt', async () => {
    const bad = await callTool<{ message: string }>(token, 'lindy_list_appointments', { from: '10/11', to })
    expect(bad.isError).toBe(true)
    expect(bad.data.message).toContain('YYYY-MM-DD')
    const nf = await callTool<{ message: string }>(token, 'lindy_get_order', {
      id: '00000000-0000-4000-8000-000000000000',
    })
    expect(nf.isError).toBe(true)
    expect(nf.data.message.length).toBeGreaterThan(0)
  })
})
