// Ảnh chứng từ (Đợt 3B-2, bước 3.19). Gắn vào phiếu chi, phiếu hoàn, phiếu Linh lập; JPEG/PNG ≤ 1MB (máy thu nhỏ trước).
// Quyền xem, gắn, gỡ do hàm DB kiểm (attachment_can_view/add, attachment_remove); ở đây kiểm thêm byte đầu file.
import type { Auth } from '../auth/context'
import { withUser } from '../db/client'
import { invalid, notFound } from '../http/errors'

export const MAX_ATTACHMENT_BYTES = 1024 * 1024
export const OWNER_TYPES = ['expense', 'refund', 'voucher'] as const
export type OwnerType = (typeof OWNER_TYPES)[number]

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

/** Loại ảnh theo byte đầu file; không tin content-type máy gửi. */
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length >= 8 && png.every((x, i) => b[i] === x)) return 'image/png'
  return null
}

function checkOwner(type: string, ownerId: string): asserts type is OwnerType {
  if (!OWNER_TYPES.includes(type as OwnerType) || !isUuid(ownerId)) throw notFound('Không tìm thấy phiếu.')
}

export async function listAttachments(auth: Auth, type: string, ownerId: string) {
  checkOwner(type, ownerId)
  return withUser(auth.userId, async (tx) => {
    const [can] = await tx<{ view: boolean; add: boolean }[]>`
      select app.attachment_can_view(${type}, ${ownerId}::uuid) as view, app.attachment_can_add(${type}, ${ownerId}::uuid) as add`
    if (!can?.view) throw notFound('Không tìm thấy phiếu.')
    const rows = await tx<
      {
        id: string
        size: number
        mime: string
        uploadedAt: Date
        uploadedBy: string
        uploadedByName: string | null
      }[]
    >`
      select a.id, a.size, a.mime, a.uploaded_at, a.uploaded_by, u.display_name as uploaded_by_name
      from attachments a left join users u on u.id = a.uploaded_by
      where a.owner_type = ${type} and a.owner_id = ${ownerId} order by a.uploaded_at`
    const owner = auth.branches.some((b) => b.perms.includes('review_queue.read'))
    return {
      items: rows.map((r) => ({
        id: r.id,
        size: r.size,
        mime: r.mime,
        uploadedAt: new Date(r.uploadedAt).toISOString(),
        uploadedByName: r.uploadedByName,
        canRemove: r.uploadedBy === auth.userId || owner,
      })),
      canAdd: !!can.add && rows.length < 3,
    }
  })
}

export async function addAttachment(auth: Auth, type: string, ownerId: string, bytes: Uint8Array) {
  checkOwner(type, ownerId)
  if (bytes.length === 0) throw invalid('Chưa chọn ảnh.')
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw invalid('Ảnh quá 1MB. Chụp lại hoặc chọn ảnh nhỏ hơn.')
  const mime = sniffImage(bytes)
  if (!mime) throw invalid('Chỉ nhận ảnh JPEG hoặc PNG.')
  await withUser(auth.userId, async (tx) => {
    await tx`select app.attachment_add(${type}, ${ownerId}::uuid, ${mime}, ${Buffer.from(bytes)}::bytea)`
  })
  return listAttachments(auth, type, ownerId)
}

export async function getAttachment(auth: Auth, id: string) {
  if (!isUuid(id)) throw notFound()
  return withUser(auth.userId, async (tx) => {
    const [a] = await tx<
      { mime: string; data: Buffer }[]
    >`select mime, data from attachments where id = ${id}`
    if (!a) throw notFound('Không tìm thấy ảnh.')
    return a
  })
}

export async function removeAttachment(auth: Auth, id: string) {
  if (!isUuid(id)) throw notFound()
  await withUser(auth.userId, (tx) => tx`select app.attachment_remove(${id}::uuid)`)
  return { ok: true }
}
