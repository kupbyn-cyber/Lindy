// MCP (gói 6): tool đọc số liệu kinh doanh — kết quả khớp đúng service mà màn app đang dùng.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../../src/lib/time'
import { dayBoard, monthSheet } from '../../src/server/attendance/service'
import { closeSql } from '../../src/server/db/client'
import { listSeasons } from '../../src/server/deposits/service'
import { listExpenses } from '../../src/server/expenses/service'
import { resetWriteLimits } from '../../src/server/http/route'
import { resetMcpRateLimits } from '../../src/server/mcp/http'
import { getBook, listEntries } from '../../src/server/money/service'
import { listAdvances } from '../../src/server/payroll/advances'
import { payrollMonth } from '../../src/server/payroll/service'
import { dayReport, monthReport, overview } from '../../src/server/reports/service'
import { sessionOf } from '../helpers/auth'
import { callTool, mcpToken, rpc } from '../helpers/mcp'

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown
const today = toLocalDate(new Date())
const month = today.slice(0, 7)

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

describe('MCP đọc số liệu', () => {
  it('tools/list có thêm đủ 12 tool số liệu', async () => {
    const { body } = await rpc(token, 'tools/list')
    const names = (body!.result!.tools as { name: string }[]).map((t) => t.name)
    for (const n of [
      'lindy_overview',
      'lindy_day_report',
      'lindy_month_report',
      'lindy_month_profit',
      'lindy_money_book',
      'lindy_money_entries',
      'lindy_list_expenses',
      'lindy_deposit_seasons',
      'lindy_attendance_month',
      'lindy_attendance_day',
      'lindy_payroll_month',
      'lindy_list_advances',
    ])
      expect(names, n).toContain(n)
  })

  it('báo cáo và tổng quan khớp service', async () => {
    expect((await callTool(token, 'lindy_overview', { period: 'month' })).data).toEqual(
      json(await overview(auth, { period: 'month' })),
    )
    expect((await callTool(token, 'lindy_day_report', { date: today })).data).toEqual(
      json(await dayReport(auth, { date: today })),
    )
    expect((await callTool(token, 'lindy_month_report', { month })).data).toEqual(
      json(await monthReport(auth, { month })),
    )
  })

  it('lợi nhuận tháng lấy đúng trường profit của monthReport (Linh có profit.read)', async () => {
    const r = await callTool<{ profit: unknown; month: string }>(token, 'lindy_month_profit', { month })
    expect(r.isError).toBe(false)
    const m = await monthReport(auth, { month })
    expect(r.data.profit).toEqual(json(m.profit))
    expect(r.data.profit).not.toBeNull()
  })

  it('sổ tiền, thu chi, cọc khớp service', async () => {
    const from = addDays(today, -30)
    expect((await callTool(token, 'lindy_money_book')).data).toEqual(json(await getBook(auth, {})))
    expect((await callTool(token, 'lindy_money_entries', { from, to: today })).data).toEqual(
      json(await listEntries(auth, { from, to: today, unreconciled: false })),
    )
    expect((await callTool(token, 'lindy_list_expenses', { filter: 'all' })).data).toEqual(
      json(await listExpenses(auth, { filter: 'all' })),
    )
    expect((await callTool<{ items: unknown }>(token, 'lindy_deposit_seasons')).data).toEqual(
      json(await listSeasons(auth)),
    )
  })

  it('công, lương, tạm ứng khớp service', async () => {
    expect((await callTool(token, 'lindy_attendance_month', { month })).data).toEqual(
      json(await monthSheet(auth, { month })),
    )
    expect((await callTool(token, 'lindy_attendance_day', { date: today })).data).toEqual(
      json(await dayBoard(auth, { date: today })),
    )
    expect((await callTool(token, 'lindy_payroll_month', { month })).data).toEqual(
      json(await payrollMonth(auth, { month })),
    )
    expect((await callTool(token, 'lindy_list_advances', { filter: 'all' })).data).toEqual(
      json(await listAdvances(auth, { filter: 'all' })),
    )
  })

  it('tháng sai dạng → lỗi tool có câu tiếng Việt', async () => {
    const r = await callTool<{ message: string }>(token, 'lindy_month_report', { month: '11/2026' })
    expect(r.isError).toBe(true)
    expect(r.data.message).toContain('YYYY-MM')
  })
})
