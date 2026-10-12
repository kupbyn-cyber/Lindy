// Trung tâm thông báo (UI17). Mọi truy vấn chạy dưới danh tính người dùng; RLS chỉ cho thấy của mình [P12].
import { z } from 'zod'
import type { Auth } from '../auth/context'
import { type Tx, withUser } from '../db/client'
import { notFound } from '../http/errors'
import { NOTIFICATION_TYPES, type NotificationType, typesFor } from './types'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  url: string
  readAt: string | null
  createdAt: string
}

export async function listNotifications(auth: Auth, limit = 50) {
  return withUser(
    auth.userId,
    (tx) =>
      tx<NotificationItem[]>`
      select id, type, title, body, url, read_at, created_at
      from notification_recipients
      where user_id = ${auth.userId}
      order by created_at desc
      limit ${Math.min(Math.max(limit, 1), 100)}`,
  )
}

export async function unreadCount(auth: Auth) {
  const [r] = await withUser(
    auth.userId,
    (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from notification_recipients
                         where user_id = ${auth.userId} and read_at is null`,
  )
  return r?.n ?? 0
}

export async function markRead(auth: Auth, id: string | 'all') {
  return withUser(auth.userId, async (tx) => {
    if (id === 'all') {
      await tx`update notification_recipients set read_at = now() where user_id = ${auth.userId} and read_at is null`
      return
    }
    if (!z.uuid().safeParse(id).success) throw notFound()
    const rows = await tx`update notification_recipients set read_at = coalesce(read_at, now())
                          where id = ${id} and user_id = ${auth.userId} returning id`
    if (rows.length === 0) throw notFound('Không tìm thấy thông báo.')
  })
}

export async function getPreferences(auth: Auth) {
  const perms = [...new Set(auth.branches.flatMap((b) => b.perms))]
  const rows = await withUser(
    auth.userId,
    (tx) =>
      tx<{ type: string; enabled: boolean }[]>`select type, enabled from notification_preferences
                                             where user_id = ${auth.userId}`,
  )
  const map = new Map(rows.map((r) => [r.type, r.enabled]))
  return typesFor(perms).map((t) => ({ ...t, enabled: map.get(t.type) ?? true }))
}

export const PreferenceBody = z.strictObject({
  type: z.enum(Object.keys(NOTIFICATION_TYPES) as [NotificationType, ...NotificationType[]]),
  enabled: z.boolean(),
})

export async function setPreference(auth: Auth, body: z.infer<typeof PreferenceBody>) {
  await withUser(
    auth.userId,
    (tx: Tx) =>
      tx`insert into notification_preferences (user_id, type, enabled)
       values (${auth.userId}, ${body.type}, ${body.enabled})
       on conflict (user_id, type) do update set enabled = excluded.enabled, updated_at = now()`,
  )
}
