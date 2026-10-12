// Bước 0.16–0.18: outbox, trung tâm thông báo, Web Push, SSE. Test S08, S14 (phần thông báo, push, SSE).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { login } from '../../src/server/auth/login'
import { loadSession } from '../../src/server/auth/session'
import { closeSql, withUser } from '../../src/server/db/client'
import type { AppError } from '../../src/server/http/errors'
import { listNotifications, markRead } from '../../src/server/notifications/center'
import { emitEvent } from '../../src/server/notifications/emit'
import { dispatch, MAX_CONNECTIONS_PER_USER, openStream } from '../../src/server/notifications/hub'
import {
  disableSubscription,
  type PushPayload,
  type PushTarget,
  processDueDeliveries,
  registerSubscription,
  SubscriptionBody,
} from '../../src/server/notifications/push'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
let ip = 100
const session = async (key: 'linh' | 'nhung' | 'chin' | 'trang' | 'mai') => {
  const u = seed().users[key]!
  const s = await login({
    identifier: u.email,
    password: u.password,
    ip: `10.1.0.${ip++}`,
    userAgent: 'test',
  })
  return { ...s, auth: (await loadSession(s.token))! }
}

beforeAll(async () => {
  await owner`update notification_deliveries set status = 'skipped' where status = 'pending'`
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})

const sub = (n: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/test-${n}`,
  keys: { p256dh: `p256dh-${n}-xxxxxxxxxx`, auth: `auth-${n}-xx` },
})

describe('Outbox [0.16]', () => {
  it('một thao tác → một sự kiện; người thao tác không nhận; người ở cơ sở khác không nhận', async () => {
    const { users, branchIds } = seed()
    const id = await withUser(users.chin!.id, (tx) =>
      emitEvent(tx, {
        branchId: branchIds.HTK!,
        type: 'appointment.created',
        title: 'Lịch mới 10:00',
        body: 'Mai Anh · 2 khách',
        pushBody: 'Lịch mới 10:00 — mở app xem.',
        url: '/lich',
      }),
    )
    const rows = await owner<
      { userId: string }[]
    >`select user_id from notification_recipients where event_id = ${id}`
    const got = rows.map((r) => r.userId)
    expect(got).toContain(users.linh!.id)
    expect(got).toContain(users.trang!.id)
    expect(got).not.toContain(users.chin!.id)
    expect(got).not.toContain(users.mai!.id)
    const [n] = await owner`select count(*)::int as n from notification_events where id = ${id}`
    expect(n!.n).toBe(1)
  })

  it('giao dịch bị huỷ → không có sự kiện', async () => {
    const { users, branchIds } = seed()
    await expect(
      withUser(users.chin!.id, async (tx) => {
        await emitEvent(tx, {
          branchId: branchIds.HTK!,
          type: 'appointment.created',
          title: 'rollback-test',
          body: 'x',
          pushBody: 'x',
          url: '/lich',
        })
        throw new Error('huỷ')
      }),
    ).rejects.toThrow('huỷ')
    const [n] =
      await owner`select count(*)::int as n from notification_recipients where title = 'rollback-test'`
    expect(n!.n).toBe(0)
  })

  it('cùng dedupe_key → chỉ một sự kiện [P22]', async () => {
    const { users, branchIds } = seed()
    const e = {
      branchId: branchIds.HTK!,
      type: 'appointment.overdue' as const,
      dedupeKey: 'overdue:test-1',
      title: 'Quá giờ',
      body: 'x',
      pushBody: 'x',
      url: '/lich',
    }
    const a = await withUser(users.chin!.id, (tx) => emitEvent(tx, e))
    const b = await withUser(users.chin!.id, (tx) => emitEvent(tx, e))
    expect(a).toBeTruthy()
    expect(b).toBeNull()
  })

  it('chỉ người có quyền lịch mở rộng nhận "Chốt lịch"; thợ thường không nhận (test 20)', async () => {
    const { users, branchIds } = seed()
    const id = await withUser(users.nhung!.id, (tx) =>
      emitEvent(tx, {
        branchId: branchIds.HTK!,
        type: 'appointment.confirmed',
        title: 'Đã chốt',
        body: 'x',
        pushBody: 'x',
        url: '/lich',
      }),
    )
    const rows = await owner<
      { userId: string }[]
    >`select user_id from notification_recipients where event_id = ${id}`
    const got = rows.map((r) => r.userId)
    expect(got).toEqual(expect.arrayContaining([users.linh!.id, users.chin!.id]))
    expect(got).not.toContain(users.trang!.id)
  })

  it('S14 — phát sự kiện vào cơ sở khác → bị chặn', async () => {
    const { users, branchIds } = seed()
    await expectPgError(
      withUser(users.trang!.id, (tx) =>
        emitEvent(tx, {
          branchId: branchIds.CS2!,
          type: 'appointment.created',
          title: 'x',
          body: 'x',
          pushBody: 'x',
          url: '/lich',
        }),
      ),
      '42501',
    )
  })

  it('URL thông báo phải cùng origin [P19]', async () => {
    const { users, branchIds } = seed()
    await expectPgError(
      withUser(users.chin!.id, (tx) =>
        emitEvent(tx, {
          branchId: branchIds.HTK!,
          type: 'appointment.created',
          title: 'x',
          body: 'x',
          pushBody: 'x',
          url: '//evil.example/x',
        }),
      ),
      '23514',
    )
  })
})

describe('Trung tâm thông báo — S14', () => {
  it('chỉ thấy và đánh dấu được thông báo của mình', async () => {
    const trang = await session('trang')
    const linh = await session('linh')
    const mine = await listNotifications(trang.auth)
    expect(mine.length).toBeGreaterThan(0)
    const other = mine[0]!
    await expect(markRead(linh.auth, other.id)).rejects.toMatchObject({ status: 404 })
    await markRead(trang.auth, other.id)
    const [r] = await owner`select read_at from notification_recipients where id = ${other.id}`
    expect(r!.readAt).not.toBeNull()
  })
})

describe('Đăng ký Web Push — S08', () => {
  it('chỉ nhận https và host dịch vụ push thật', () => {
    expect(SubscriptionBody.safeParse(sub('ok')).success).toBe(true)
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://127.0.0.1/x',
      'https://169.254.169.254/latest',
      'https://evil.example/fcm.googleapis.com/',
      'https://fcm.googleapis.com.evil.example/x',
    ]) {
      expect(SubscriptionBody.safeParse({ ...sub('x'), endpoint }).success).toBe(false)
    }
  })

  it('DB cũng chặn endpoint lạ (khi gọi thẳng hàm)', async () => {
    const s = await session('trang')
    await expectPgError(
      withUser(
        s.userId,
        (tx) =>
          tx`select app.register_push(${s.sessionId}::uuid, 'https://169.254.169.254/x', 'p256dh-xxxxxxxxxx', 'auth-xxxxx', null)`,
      ),
      '23514',
    )
  })

  it('tối đa 5 máy mỗi người; máy thứ 6 bị từ chối', async () => {
    const s = await session('nhung')
    for (let i = 0; i < 5; i++) await registerSubscription(s.auth, sub(`nhung-${i}`), 'UA')
    await expect(registerSubscription(s.auth, sub('nhung-6'), 'UA')).rejects.toMatchObject({ code: 'P0001' })
  })

  it('S14 — tắt đăng ký của người khác → 404', async () => {
    const trang = await session('trang')
    const linh = await session('linh')
    const id = await registerSubscription(trang.auth, sub('trang-1'), 'UA')
    const e = await disableSubscription(linh.auth, id).catch((x: AppError) => x)
    expect((e as AppError).status).toBe(404)
    await disableSubscription(trang.auth, id)
  })

  it('đăng xuất (thu hồi phiên) → đăng ký của máy đó bị tắt [P21]', async () => {
    const s = await session('chin')
    const id = await registerSubscription(s.auth, sub('chin-logout'), 'UA')
    const { logout } = await import('../../src/server/auth/login')
    await logout(s.sessionId, s.userId)
    const [r] = await owner`select disabled_at from push_subscriptions where id = ${id}`
    expect(r!.disabledAt).not.toBeNull()
  })
})

describe('Gửi push nền [0.17]', () => {
  it('thành công → sent; 410 → tắt đăng ký; lỗi tạm → hẹn gửi lại; tài khoản bị khoá → bỏ qua', async () => {
    const { users, branchIds } = seed()
    await owner`update notification_deliveries set status = 'skipped' where status = 'pending'`
    const linh = await session('linh')
    const ok = await registerSubscription(linh.auth, sub('linh-ok'), 'UA')
    const gone = await registerSubscription(linh.auth, sub('linh-gone'), 'UA')
    const flaky = await registerSubscription(linh.auth, sub('linh-flaky'), 'UA')

    await withUser(users.chin!.id, (tx) =>
      emitEvent(tx, {
        branchId: branchIds.HTK!,
        type: 'appointment.rescheduled',
        title: 'Đổi giờ — Mai Anh',
        body: 'Mai Anh 0912345678',
        pushBody: 'Lịch 14:30 đã đổi giờ — mở app xem.',
        url: '/lich/abc',
      }),
    )

    const calls: { target: PushTarget; payload: PushPayload }[] = []
    const sender = async (target: PushTarget, payload: PushPayload) => {
      calls.push({ target, payload })
      if (target.endpoint.endsWith('linh-gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      if (target.endpoint.endsWith('linh-flaky'))
        throw Object.assign(new Error('Server error'), { statusCode: 500 })
    }
    await processDueDeliveries(sender)

    const linhCalls = calls.filter((c) => c.target.endpoint.includes('linh-'))
    expect(linhCalls.length).toBe(3)
    // Màn hình khoá không có tên khách, SĐT (test 23)
    for (const c of linhCalls) {
      expect(c.payload.body).toBe('Lịch 14:30 đã đổi giờ — mở app xem.')
      expect(c.payload.body).not.toMatch(/Mai Anh|0912/)
    }
    const st = async (subId: string) =>
      (
        await owner<{ status: string; nextAttemptAt: Date }[]>`
        select status, next_attempt_at from notification_deliveries where subscription_id = ${subId}
        order by id desc limit 1`
      )[0]!
    expect((await st(ok)).status).toBe('sent')
    expect((await st(gone)).status).toBe('failed')
    const [g] = await owner`select disabled_at from push_subscriptions where id = ${gone}`
    expect(g!.disabledAt).not.toBeNull()
    const f = await st(flaky)
    expect(f.status).toBe('pending')
    expect(new Date(f.nextAttemptAt).getTime()).toBeGreaterThan(Date.now())

    // Khoá Linh rồi đến hạn gửi lại → bỏ qua, không gửi
    await owner`update users set is_active = false where id = ${users.linh!.id}`
    await owner`update notification_deliveries set next_attempt_at = now() where subscription_id = ${flaky}`
    calls.length = 0
    try {
      await processDueDeliveries(sender)
    } finally {
      await owner`update users set is_active = true where id = ${users.linh!.id}`
    }
    expect(calls.filter((c) => c.target.endpoint.includes('linh-flaky')).length).toBe(0)
    expect((await st(flaky)).status).toBe('skipped')
  })
})

describe('SSE [0.18] — S14', () => {
  async function collect(stream: ReadableStream<Uint8Array>, ms: number) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const timer = setTimeout(() => void reader.cancel(), ms)
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        text += decoder.decode(value)
      }
    } finally {
      clearTimeout(timer)
    }
    return text
  }

  it('chỉ nhận sự kiện lịch của cơ sở mình', async () => {
    const { branchIds } = seed()
    const trang = await session('trang')
    const mai = await session('mai')
    const a = await openStream({
      token: trang.token,
      userId: trang.userId,
      sessionId: trang.sessionId,
      branchIds: [branchIds.HTK!],
    })
    const b = await openStream({
      token: mai.token,
      userId: mai.userId,
      sessionId: mai.sessionId,
      branchIds: [branchIds.CS2!],
    })
    const pa = collect(a, 400)
    const pb = collect(b, 400)
    setTimeout(() => dispatch({ kind: 'appointments', branchId: branchIds.HTK!, dates: ['2026-10-20'] }), 50)
    const [ta, tb] = await Promise.all([pa, pb])
    expect(ta).toContain('event: appointments')
    expect(tb).not.toContain('event: appointments')
  })

  it('pg_notify trong giao dịch → máy đang mở nhận được sau khi commit', async () => {
    const { branchIds } = seed()
    const trang = await session('trang')
    const s = await openStream({
      token: trang.token,
      userId: trang.userId,
      sessionId: trang.sessionId,
      branchIds: [branchIds.HTK!],
    })
    const p = collect(s, 800)
    await new Promise((r) => setTimeout(r, 100))
    await owner`select pg_notify('lindy_events', ${JSON.stringify({ kind: 'appointments', branchId: branchIds.HTK, dates: [] })})`
    expect(await p).toContain('event: appointments')
  })

  it('phiên bị thu hồi → kết nối bị đóng [P1]', async () => {
    const { branchIds } = seed()
    const t = await session('trang')
    const s = await openStream({
      token: t.token,
      userId: t.userId,
      sessionId: t.sessionId,
      branchIds: [branchIds.HTK!],
    })
    const p = collect(s, 3000)
    setTimeout(
      () => dispatch({ kind: 'sessions_revoked', sessionIds: [t.sessionId], userIds: [t.userId] }),
      50,
    )
    const started = Date.now()
    await p
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it(`tối đa ${MAX_CONNECTIONS_PER_USER} kết nối mỗi người [P25]`, async () => {
    const { branchIds } = seed()
    const t = await session('linh')
    const streams = []
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER + 1; i++) {
      streams.push(
        await openStream({
          token: t.token,
          userId: t.userId,
          sessionId: t.sessionId,
          branchIds: [branchIds.HTK!],
        }),
      )
    }
    // Kết nối đầu tiên đã bị đóng
    const first = await collect(streams[0]!, 300)
    expect(first).toContain('event: ready')
    const { connectionCount } = await import('../../src/server/notifications/hub')
    expect(connectionCount(t.userId)).toBe(MAX_CONNECTIONS_PER_USER)
    for (const s of streams.slice(1)) await s.cancel()
  })
})
