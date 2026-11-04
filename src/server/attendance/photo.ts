// Vào ca bằng ảnh (S59–S61). Máy chụp, đóng dấu giờ máy chủ, nén JPEG ≤ 150KB rồi gửi; DB ghi giờ vào ca, ghi ảnh và
// tự duyệt Đi làm trong cùng giao dịch (app.attendance_check_in_photo). Ảnh xem được: của mình; Linh, Nhung xem cả cơ sở
// (RLS). Việc nền xoá dữ liệu ảnh quá 35 ngày, giữ dòng công.

import { sniffImage } from '../attachments/service'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser, withWorker } from '../db/client'
import { forbidden, invalid, notFound } from '../http/errors'
import { myToday } from './service'

export const MAX_CHECKIN_PHOTO_BYTES = 150 * 1024

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

export async function checkInWithPhoto(auth: Auth, branchId: string | undefined, bytes: Uint8Array) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'attendance.own')) throw forbidden('Không có quyền chấm công.')
  if (bytes.length === 0) throw invalid('Chưa có ảnh vào ca.')
  if (bytes.length > MAX_CHECKIN_PHOTO_BYTES) throw invalid('Ảnh quá 150KB. Chụp lại.')
  if (sniffImage(bytes) !== 'image/jpeg') throw invalid('Chỉ nhận ảnh JPEG.')
  await withUser(
    auth.userId,
    (tx) => tx`select app.attendance_check_in_photo(${branch.id}, ${Buffer.from(bytes)}::bytea)`,
  )
  return myToday(auth, branch.id)
}

/** Ảnh vào ca; RLS chỉ trả ảnh của mình hoặc cả cơ sở cho Linh, Nhung. Không thấy thì 404, không lộ ảnh có tồn tại. */
export async function getCheckInPhoto(auth: Auth, id: string) {
  if (!isUuid(id)) throw notFound()
  return withUser(auth.userId, async (tx) => {
    const [p] = await tx<{ data: Buffer | null }[]>`select data from attendance_photos where id = ${id}`
    if (!p) throw notFound('Không tìm thấy ảnh.')
    if (!p.data) throw notFound('Ảnh đã xoá sau 35 ngày.')
    return p.data
  })
}

const PURGE_EVERY_MS = 60 * 60_000
let lastPurge = 0

/** Xoá dữ liệu ảnh vào ca quá 35 ngày. Không truyền `force` thì mỗi giờ chạy một lần (worker gọi mỗi phút). */
export async function purgeOldCheckInPhotos(opts: { force?: boolean; now?: number } = {}) {
  const now = opts.now ?? Date.now()
  if (!opts.force && now - lastPurge < PURGE_EVERY_MS) return 0
  lastPurge = now
  const [r] = await withWorker((tx) => tx<{ n: number }[]>`select app.attendance_photo_purge() as n`)
  return r?.n ?? 0
}
