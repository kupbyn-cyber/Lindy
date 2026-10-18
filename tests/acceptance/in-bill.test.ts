// In bill qua trạm in (Đợt 7, S36–S38): Linh cài thông tin trên bill, tạo / thu hồi mã kết nối trạm in, in thử; người xem
// được đơn bấm In bill khi đơn đã bấm Làm xong; trạm in lấy lệnh bằng mã kết nối, in, báo kết quả. Bill in tên khách
// đầy đủ, không in SĐT (S37). Chạy trên cơ sở thử riêng "CS11" để trạm in thử không lẫn vào HTK.
import { createServer, type Server } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pollOnce } from '../../public/tram-in/tram-in.mjs'
import type { BillData } from '../../src/lib/bill'
import { toLocalDate } from '../../src/lib/time'
import { createCustomer } from '../../src/server/customers/service'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { handleStation } from '../../src/server/http/route'
import { recordPayment } from '../../src/server/orders/payments'
import { confirmOrder, createOrder, getOrder, markDone } from '../../src/server/orders/service'
import {
  agentFinish,
  agentNext,
  createStation,
  hashToken,
  jobStatus,
  printBill,
  printSetup,
  printTest,
  revokeStation,
  savePrintSettings,
} from '../../src/server/print/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
let cs11 = ''
let token = ''
let stationId = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS11', 'Zz cơ sở thử in bill', 'CS11') returning id`
  cs11 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs11})`
  await owner`
    insert into money_accounts (branch_id, code, name, type)
    values (${cs11}, 'cash', 'Tiền mặt CS11', 'cash'), (${cs11}, 'bank', 'Tài khoản CS11', 'bank')`
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['trang', 'staff'],
    ['mai', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs11}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'trang', 'mai'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner`update print_stations set revoked_at = now() where branch_id = ${cs11} and revoked_at is null`
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs11}`
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id
const key = () => crypto.randomUUID()

async function status(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e.status
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

/** Đơn của trang (thợ), Nhung tạo, đã bấm Làm xong và thu đủ */
async function doneOrder(opts: { customerId?: string | null; pay?: boolean } = {}) {
  const { order } = await createOrder(auth('nhung'), {
    branchId: cs11,
    createRequestId: rid(),
    customerId: opts.customerId ?? null,
    serviceDate: today,
    items: [
      { type: 'custom', name: 'Sơn gel thạch', amount: 200_000, staff: [{ userId: uid('trang') }] },
      { type: 'custom', name: 'Đính đá', amount: 100_000, staff: [{ userId: uid('trang') }] },
    ] as never,
    discounts: [
      { scope: 0, kind: 'preset_10' },
      { scope: 'order', kind: 'preset_5' },
    ] as never,
  })
  const d = await markDone(auth('nhung'), order.id, order.version)
  if (opts.pay !== false)
    await recordPayment(auth('nhung'), order.id, {
      idempotencyKey: key(),
      amount: d.dueAmount,
      method: 'transfer',
    })
  return getOrder(auth('nhung'), order.id)
}

describe('S38 — Linh cài máy in bill', () => {
  it('chưa có trạm in: không tạo được lệnh in; chỉ Linh xem, sửa cài đặt (server và DB)', async () => {
    const s = await printSetup(auth('linh'), { branchId: cs11 })
    expect(s.stations).toEqual([])
    expect(s.settings).toMatchObject({ infoLines: '', paperWidth: 576 })
    for (const k of ['nhung', 'trang'] as const) {
      expect(await status(printSetup(auth(k), { branchId: cs11 }))).toBe(403)
      expect(
        await status(
          savePrintSettings(auth(k), { branchId: cs11, infoLines: 'x', thanks: 'y', paperWidth: 576 }),
        ),
      ).toBe(403)
      expect(await status(createStation(auth(k), { branchId: cs11, name: 'Lén' }))).toBe(403)
      await expectPgError(
        withUser(
          uid(k),
          (tx) => tx`select app.print_station_create(${cs11}::uuid, 'Lén', ${'a'.repeat(64)})`,
        ),
        '42501',
      )
      await expectPgError(
        withUser(uid(k), (tx) => tx`select app.print_settings_save(${cs11}::uuid, 'x', 'y', 576)`),
        '42501',
      )
    }
    const d = await doneOrder()
    await expectPgError(printBill(auth('nhung'), d.id, { idempotencyKey: key() }), 'P0001')
  })

  it('Linh lưu thông tin trên bill (có nhật ký), tạo mã kết nối: mã chỉ trả một lần, DB lưu dạng băm', async () => {
    const s = await savePrintSettings(auth('linh'), {
      branchId: cs11,
      infoLines: '12 Phố Thử, Hà Nội\nMở cửa 9:00–21:00',
      thanks: 'Cảm ơn bạn!',
      paperWidth: 576,
    })
    expect(s.settings).toEqual({
      infoLines: '12 Phố Thử, Hà Nội\nMở cửa 9:00–21:00',
      thanks: 'Cảm ơn bạn!',
      paperWidth: 576,
    })
    const [log] = await owner<{ details: { before: unknown } }[]>`
      select details from audit_logs where action = 'print.settings_saved' and branch_id = ${cs11}`
    expect(log!.details.before).toBeNull()

    const r = await createStation(auth('linh'), { branchId: cs11, name: 'MacBook quầy' })
    token = r.token
    stationId = r.id
    expect(token).toMatch(/^[\w-]{30,}$/)
    expect(r.setup.stations).toHaveLength(1)
    expect(JSON.stringify(r.setup)).not.toContain(token)
    const [row] = await owner<
      { tokenHash: string }[]
    >`select token_hash from print_stations where id = ${r.id}`
    expect(row!.tokenHash).toBe(hashToken(token))
    // app_user không đọc được cột băm, không đọc nội dung bill
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`select token_hash from print_stations`),
      '42501',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`select payload from print_jobs`),
      '42501',
    )
  })
})

describe('S36, S37 — in bill đơn', () => {
  let orderId = ''
  let jobId = ''

  it('thợ trên đơn bấm In bill; bill in tên khách đầy đủ, không in SĐT; dòng giá, giảm, đã thu đúng', async () => {
    const { customer } = await createCustomer(auth('nhung'), {
      name: 'Nguyễn Thị Bích Ngọc',
      phone: '0912345678',
    })
    const d = await doneOrder({ customerId: customer.id })
    orderId = d.id
    expect(d.billPrintedAt).toBeNull()
    const k = key()
    const j = await printBill(auth('trang'), d.id, { idempotencyKey: k })
    jobId = j.id
    expect(j.status).toBe('queued')
    // bấm hai lần (mạng chập chờn) không ra hai lệnh
    expect((await printBill(auth('trang'), d.id, { idempotencyKey: k })).id).toBe(j.id)

    const next = await agentNext(token)
    expect(next.job).toMatchObject({ id: j.id, kind: 'bill', paperWidth: 576 })
    const bill = next.job!.bill as BillData
    const [trang] = await owner<
      { displayName: string }[]
    >`select display_name from users where id = ${uid('trang')}`
    expect(bill).toMatchObject({
      title: `HOÁ ĐƠN ${d.codeLabel}`,
      customer: 'Nguyễn Thị Bích Ngọc',
      staff: trang!.displayName,
      shopLines: ['12 Phố Thử, Hà Nội', 'Mở cửa 9:00–21:00'],
      thanks: ['Cảm ơn bạn!'],
      items: [
        { name: 'Sơn gel thạch', detail: null, amount: 180_000 },
        { name: 'Đính đá', detail: null, amount: 100_000 },
      ],
      subtotal: 280_000,
      discounts: [{ label: 'Giảm 5%', amount: 15_000 }],
      total: 265_000,
      paid: [{ label: 'Chuyển khoản', amount: 265_000 }],
      due: 0,
    })
    expect(JSON.stringify(bill)).not.toContain('0912345678')
    expect(JSON.stringify(bill)).not.toContain('912345678')

    // lệnh đã lấy thì lần hỏi sau không lấy lại; người dùng thấy đang in
    expect((await agentNext(token)).job).toBeNull()
    expect((await jobStatus(auth('trang'), j.id)).status).toBe('printing')
    await agentFinish(token, { jobId: j.id, ok: true })
    expect(await jobStatus(auth('trang'), j.id)).toMatchObject({ status: 'printed', error: null })
    expect((await getOrder(auth('trang'), d.id)).billPrintedAt).not.toBeNull()
    const [st] = await owner<
      { lastSeenAt: Date | null }[]
    >`select last_seen_at from print_stations where id = ${stationId}`
    expect(st!.lastSeenAt).not.toBeNull()
  })

  it('in lại được; trạm báo lỗi thì lệnh ghi lỗi; báo kết quả lệnh của trạm khác không đổi gì', async () => {
    const j = await printBill(auth('nhung'), orderId, { idempotencyKey: key() })
    expect((await agentNext(token)).job?.id).toBe(j.id)
    await agentFinish(token, { jobId: j.id, ok: false, error: 'Máy in hết giấy.' })
    expect(await jobStatus(auth('nhung'), j.id)).toMatchObject({
      status: 'failed',
      error: 'Máy in hết giấy.',
    })
    // báo lại kết quả cho lệnh đã xong: không đổi
    await agentFinish(token, { jobId: jobId, ok: false, error: 'x' })
    expect((await jobStatus(auth('nhung'), jobId)).status).toBe('printed')
  })

  it('thợ không trên đơn: không thấy đơn, không in được; đơn chưa Làm xong không in; app_user không ghi thẳng bảng', async () => {
    expect(await status(printBill(auth('mai'), orderId, { idempotencyKey: key() }))).toBe(404)
    await expectPgError(
      withUser(
        uid('mai'),
        (tx) =>
          tx`select app.print_job_create(${cs11}::uuid, ${orderId}::uuid, 'bill', '{}'::jsonb, ${key()}::uuid)`,
      ),
      '22P02',
    )
    const { order } = await createOrder(auth('nhung'), {
      branchId: cs11,
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [
        { type: 'custom', name: 'Đang làm', amount: 50_000, staff: [{ userId: uid('trang') }] },
      ] as never,
      discounts: [],
    })
    await expectPgError(printBill(auth('nhung'), order.id, { idempotencyKey: key() }), 'P0001')
    await expectPgError(
      withUser(
        uid('linh'),
        (tx) => tx`
          insert into print_jobs (branch_id, order_id, kind, payload, requested_by, idempotency_key)
          values (${cs11}, ${orderId}, 'bill', '{}'::jsonb, ${uid('linh')}, ${key()})`,
      ),
      '42501',
    )
    await expectPgError(owner`delete from print_jobs where id = ${jobId}`, ['P0001', '42501'])
  })

  it('đơn đã xác nhận vẫn in được; khách lẻ in "Khách lẻ"', async () => {
    const d = await doneOrder()
    const c = await confirmOrder(auth('nhung'), d.id, d.version)
    expect(c.status).toBe('confirmed')
    const j = await printBill(auth('nhung'), d.id, { idempotencyKey: key() })
    const next = await agentNext(token)
    expect(next.job?.id).toBe(j.id)
    expect((next.job!.bill as BillData).customer).toBe('Khách lẻ')
    await agentFinish(token, { jobId: j.id, ok: true })
  })

  it('lệnh chờ quá 10 phút thì hết hạn, không tự in muộn', async () => {
    const j = await printBill(auth('nhung'), orderId, { idempotencyKey: key() })
    await owner`update print_jobs set requested_at = now() - interval '11 minutes' where id = ${j.id}`
    expect((await agentNext(token)).job).toBeNull()
    expect(await jobStatus(auth('nhung'), j.id)).toMatchObject({ status: 'expired' })
  })
})

describe('S38 — trạm in chạy thật (chương trình tram-in.mjs) với máy in giả', () => {
  let server: Server
  let port = 0
  const received: Buffer[] = []

  beforeAll(async () => {
    server = createServer((sock) => {
      const parts: Buffer[] = []
      sock.on('data', (d: Buffer) => parts.push(d))
      sock.on('end', () => received.push(Buffer.concat(parts)))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    port = (server.address() as { port: number }).port
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  // fetch giả: đưa yêu cầu của trạm in vào đúng xử lý của route /api/print/agent/*
  const f = (async (url: string, init?: RequestInit) => {
    const req = new Request(url, init)
    const action = new URL(url).pathname.split('/').pop()
    return handleStation(req, async (t) =>
      Response.json(
        action === 'next' ? await agentNext(t) : await agentFinish(t, (await req.json()) as never),
      ),
    )
  }) as typeof fetch

  it('Linh bấm In thử: trạm in vẽ bill, gửi lệnh ESC/POS tới máy in, báo đã in', async () => {
    const j = await printTest(auth('linh'), { branchId: cs11, idempotencyKey: key() })
    const cfg = { server: 'http://app.test', token, printer: `tcp://127.0.0.1:${port}` }
    const r = await pollOnce(cfg, f)
    expect(r).toEqual({ id: j.id, ok: true, error: null })
    await expect.poll(() => received.length).toBe(1)
    const buf = received[0]!
    expect([...buf.subarray(0, 2)]).toEqual([0x1b, 0x40])
    expect([...buf.subarray(2, 5)]).toEqual([0x1d, 0x76, 0x30])
    expect(buf[6]! + buf[7]! * 256).toBe(576 / 8)
    expect([...buf.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00])
    expect((await jobStatus(auth('linh'), j.id)).status).toBe('printed')
    expect(await pollOnce(cfg, f)).toBeNull()
  })

  it('máy in tắt: lệnh ghi lỗi để người bấm biết', async () => {
    const j = await printTest(auth('linh'), { branchId: cs11, idempotencyKey: key() })
    const r = await pollOnce({ server: 'http://app.test', token, printer: 'tcp://127.0.0.1:1' }, f)
    expect(r).toMatchObject({ id: j.id, ok: false })
    expect((await jobStatus(auth('linh'), j.id)).error).toMatch(/Không nối được máy in/)
  })

  it('thợ không in thử được; mã sai hoặc đã thu hồi bị chặn (401/403), không lấy được bill', async () => {
    expect(await status(printTest(auth('trang'), { branchId: cs11, idempotencyKey: key() }))).toBe(403)
    const bad = { server: 'http://app.test', token: 'a'.repeat(32), printer: `tcp://127.0.0.1:${port}` }
    await expect(pollOnce(bad, f)).rejects.toMatchObject({ auth: true })
    const noAuth = await handleStation(new Request('http://app.test/api/print/agent/next'), async () =>
      Response.json({}),
    )
    expect(noAuth.status).toBe(401)

    const d = await doneOrder()
    await printBill(auth('nhung'), d.id, { idempotencyKey: key() })
    const s = await revokeStation(auth('linh'), { stationId })
    expect(s.stations[0]!.revokedAt).not.toBeNull()
    await expectPgError(agentNext(token), '42501')
    await expect(pollOnce({ ...bad, token }, f)).rejects.toMatchObject({ auth: true })
    // hết trạm in: bấm In bill báo cần cài trạm
    await expectPgError(printBill(auth('nhung'), d.id, { idempotencyKey: key() }), 'P0001')
  })
})
