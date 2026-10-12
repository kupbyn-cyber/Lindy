// Web Push (bước 0.17): đăng ký theo máy, gửi nền từ hàng đợi, gửi lại khi lỗi.
// - Endpoint chỉ nhận https và host dịch vụ push thật, kiểm cả ở đây và ở DB [P6].
// - Trước khi gửi kiểm lại người nhận còn hoạt động và còn quyền cơ sở.
// - Lỗi 404/410: máy đã huỷ đăng ký → tắt đăng ký.
import webpush from 'web-push'
import { z } from 'zod'
import type { Auth } from '../auth/context'
import { withUser, withWorker } from '../db/client'
import { env } from '../env'
import { invalid, notFound } from '../http/errors'

const PUSH_HOST =
  /^https:\/\/(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)\//
export const MAX_DEVICES = 5
export const RETRY_MINUTES = [1, 5, 30, 30] // sau lần 1, 2, 3, 4; lần 5 hỏng thì dừng
export const MAX_ATTEMPTS = 5

export const SubscriptionBody = z.strictObject({
  endpoint: z
    .string()
    .max(1000)
    .refine((u) => PUSH_HOST.test(u), 'Địa chỉ nhận thông báo không hợp lệ.'),
  keys: z.strictObject({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(8).max(100),
  }),
  expirationTime: z.number().nullable().optional(),
})

export function vapidPublicKey() {
  return env('VAPID_PUBLIC_KEY') ?? null
}

export async function registerSubscription(
  auth: Auth,
  body: z.infer<typeof SubscriptionBody>,
  userAgent: string | null,
) {
  const [row] = await withUser(
    auth.userId,
    (tx) =>
      tx<{ id: string }[]>`
      select app.register_push(${auth.sessionId}::uuid, ${body.endpoint}, ${body.keys.p256dh},
                               ${body.keys.auth}, ${userAgent?.slice(0, 300) ?? null}) as id`,
  )
  return row!.id
}

export async function listMySubscriptions(auth: Auth) {
  return withUser(
    auth.userId,
    (tx) =>
      tx<
        {
          id: string
          userAgent: string | null
          createdAt: string
          lastSuccessAt: string | null
          sessionId: string | null
        }[]
      >`
      select id, user_agent, created_at, last_success_at, session_id
      from push_subscriptions where user_id = ${auth.userId} and disabled_at is null
      order by created_at desc`,
  )
}

export async function disableSubscription(auth: Auth, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound()
  const [r] = await withUser(
    auth.userId,
    (tx) => tx<{ ok: boolean }[]>`select app.disable_push(${id}::uuid) as ok`,
  )
  if (!r?.ok) throw notFound('Không tìm thấy máy này.')
}

export async function sendSelfTest(auth: Auth, branchId: string) {
  await withUser(auth.userId, (tx) => tx`select app.emit_self_test(${branchId}::uuid)`)
}

// ---------------------------------------------------------------- Gửi nền

export type PushPayload = { title: string; body: string; url: string; tag: string }
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }
export type Sender = (target: PushTarget, payload: PushPayload) => Promise<void>

let vapidReady = false
const webPushSender: Sender = async (target, payload) => {
  if (!vapidReady) {
    const pub = env('VAPID_PUBLIC_KEY')
    const priv = env('VAPID_PRIVATE_KEY')
    if (!pub || !priv) throw Object.assign(new Error('Chưa cấu hình khoá VAPID.'), { statusCode: 0 })
    webpush.setVapidDetails(env('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv)
    vapidReady = true
  }
  await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: 'high' })
}

type Job = {
  id: string
  attempts: number
  subscriptionId: string
  endpoint: string
  p256dh: string
  auth: string
  subDisabled: boolean
  userActive: boolean
  hasAccess: boolean
  pushTitle: string
  pushBody: string
  url: string
  eventId: string
}

/** Lấy và gửi các thông báo đến hạn. Trả về số đã gửi thành công. */
export async function processDueDeliveries(send: Sender = webPushSender, batch = 50) {
  const jobs = await withWorker(async (tx) => {
    // Việc đang gửi mà treo quá 5 phút (server tắt giữa chừng) → trả lại hàng đợi.
    await tx`update notification_deliveries set status = 'pending', locked_at = null
             where status = 'sending' and locked_at < now() - interval '5 minutes'`
    return tx<Job[]>`
      with claimed as (
        update notification_deliveries d
        set status = 'sending', locked_at = now(), attempts = d.attempts + 1
        where d.id in (
          select id from notification_deliveries
          where status = 'pending' and next_attempt_at <= now()
          order by id limit ${batch}
          for update skip locked)
        returning d.id, d.attempts, d.recipient_id, d.subscription_id
      )
      select c.id::text as id, c.attempts, c.subscription_id,
             ps.endpoint, ps.p256dh, ps.auth, ps.disabled_at is not null as sub_disabled,
             u.is_active as user_active,
             exists (select 1 from user_branch_roles ubr
                     where ubr.user_id = r.user_id and ubr.branch_id = r.branch_id and ubr.revoked_at is null) as has_access,
             e.push_title, e.push_body, e.url, e.id as event_id
      from claimed c
      join notification_recipients r on r.id = c.recipient_id
      join notification_events e on e.id = r.event_id
      join push_subscriptions ps on ps.id = c.subscription_id
      join users u on u.id = r.user_id`
  })

  let sent = 0
  for (const job of jobs) {
    if (job.subDisabled || !job.userActive || !job.hasAccess) {
      await withWorker(
        (tx) =>
          tx`update notification_deliveries set status = 'skipped', locked_at = null where id = ${job.id}`,
      )
      continue
    }
    try {
      await send(
        { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } },
        { title: job.pushTitle, body: job.pushBody, url: job.url, tag: job.eventId },
      )
      sent++
      await withWorker(async (tx) => {
        await tx`update notification_deliveries set status = 'sent', sent_at = now(), locked_at = null, last_error = null
                 where id = ${job.id}`
        await tx`update push_subscriptions set last_success_at = now() where id = ${job.subscriptionId}`
      })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0
      const message = `${status} ${(err as Error).message ?? ''}`.slice(0, 300)
      await withWorker(async (tx) => {
        if (status === 404 || status === 410) {
          await tx`update push_subscriptions set disabled_at = now(), disabled_reason = 'expired'
                   where id = ${job.subscriptionId} and disabled_at is null`
          await tx`update notification_deliveries set status = 'failed', last_error = ${message}, locked_at = null
                   where id = ${job.id}`
        } else if (job.attempts >= MAX_ATTEMPTS) {
          await tx`update notification_deliveries set status = 'failed', last_error = ${message}, locked_at = null
                   where id = ${job.id}`
        } else {
          const minutes = RETRY_MINUTES[job.attempts - 1] ?? 30
          await tx`update notification_deliveries
                   set status = 'pending', last_error = ${message}, locked_at = null,
                       next_attempt_at = now() + make_interval(mins => ${minutes})
                   where id = ${job.id}`
        }
      })
    }
  }
  return sent
}

export function invalidPush(msg: string) {
  return invalid(msg)
}
