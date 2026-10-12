// Phát sự kiện thông báo trong cùng giao dịch nghiệp vụ (outbox). Push gửi nền; lỗi push không làm mất dữ liệu.
import type { Tx } from '../db/client'
import { NOTIFICATION_TYPES, type NotificationType } from './types'

export type EmitInput = {
  branchId: string
  type: NotificationType
  entityType?: string
  entityId?: string
  dedupeKey?: string
  /** Trong app (đã đăng nhập): có thể có tên khách. */
  title: string
  body: string
  /** Màn hình khoá: không tên khách, không SĐT, không ghi chú (§9.3). */
  pushTitle?: string
  pushBody: string
  url: string
}

export async function emitEvent(tx: Tx, e: EmitInput) {
  const audience = NOTIFICATION_TYPES[e.type].audience
  const [row] = await tx<{ id: string | null }[]>`
    select app.emit_event(
      ${e.branchId}::uuid, ${e.type}, ${e.entityType ?? null}, ${e.entityId ?? null}::uuid, ${e.dedupeKey ?? null},
      ${audience}, ${e.title.slice(0, 120)}, ${e.body.slice(0, 300)}, ${(e.pushTitle ?? 'LINDY OS').slice(0, 60)},
      ${e.pushBody.slice(0, 160)}, ${e.url}
    ) as id`
  return row?.id ?? null
}

/** Dùng trong việc nền (không có người thao tác). Gọi trong withWorker. */
export async function emitSystemEvent(tx: Tx, e: EmitInput) {
  const audience = NOTIFICATION_TYPES[e.type].audience
  const [row] = await tx<{ id: string | null }[]>`
    select app.emit_system_event(
      ${e.branchId}::uuid, ${e.type}, ${e.entityType ?? null}, ${e.entityId ?? null}::uuid, ${e.dedupeKey ?? null},
      ${audience}, ${e.title.slice(0, 120)}, ${e.body.slice(0, 300)}, ${(e.pushTitle ?? 'LINDY OS').slice(0, 60)},
      ${e.pushBody.slice(0, 160)}, ${e.url}
    ) as id`
  return row?.id ?? null
}
