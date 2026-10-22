// Cài đặt danh mục (UI14, bước 2.22). Linh (catalog.manage) thêm, sửa, ngừng bán, xoá (S42) dịch vụ và combo.
// Ghi qua hàm SQL kiểm quyền, có lịch sử giá; đơn cũ không đổi vì dòng đơn lưu tên, giá lúc bán (P35).
import { z } from 'zod'
import type { Auth } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, invalid } from '../http/errors'
import { loadCatalog } from '../orders/service'

const price = z
  .number()
  .int('Giá phải là số nguyên.')
  .min(1, 'Giá phải lớn hơn 0.')
  .max(10_000_000, 'Tối đa 10.000.000đ.')

export const ServiceBody = z
  .strictObject({
    id: z.uuid().nullable().optional(),
    category: z.string().trim().min(1, 'Nhập nhóm dịch vụ.').max(40),
    name: z.string().trim().min(1, 'Nhập tên dịch vụ.').max(100),
    priceMode: z.enum(['list', 'custom']),
    unit: z.enum(['lần', 'ngón', 'hình', 'cái']),
    priceMin: price,
    priceMax: price.nullable().optional(),
    hasHardening: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((s) => s.priceMode === 'list' || (s.priceMax != null && s.priceMax >= s.priceMin), {
    message: 'Giá cao nhất phải lớn hơn hoặc bằng giá thấp nhất.',
  })

export const ComboBody = z.strictObject({
  id: z.uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Nhập tên combo.').max(100),
  groupName: z.string().trim().min(1, 'Nhập nhóm combo.').max(40),
  price,
  isActive: z.boolean(),
  serviceIds: z.array(z.uuid()).max(10).optional(),
})

const canManage = (auth: Auth) => auth.branches.some((b) => b.perms.includes('catalog.manage'))

export async function saveService(auth: Auth, input: z.infer<typeof ServiceBody>) {
  if (!canManage(auth)) throw forbidden('Chỉ chủ quán sửa được danh mục.')
  return withUser(auth.userId, async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      select app.catalog_save_service(${input.id ?? null}, ${input.category}, ${input.name}, ${input.priceMode},
        ${input.unit}, ${input.priceMin}, ${input.priceMode === 'list' ? input.priceMin : input.priceMax!},
        ${input.hasHardening}, ${input.isActive}) as id`
    return { id: r!.id, catalog: await loadCatalog(tx) }
  })
}

export async function saveCombo(auth: Auth, input: z.infer<typeof ComboBody>) {
  if (!canManage(auth)) throw forbidden('Chỉ chủ quán sửa được danh mục.')
  if (!input.id && (input.serviceIds?.length ?? 0) < 2) throw invalid('Combo cần ít nhất 2 dịch vụ.')
  return withUser(auth.userId, async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      select app.catalog_save_combo(${input.id ?? null}, ${input.name}, ${input.groupName}, ${input.price},
        ${input.isActive}, ${input.serviceIds ?? []}::uuid[]) as id`
    return { id: r!.id, catalog: await loadCatalog(tx) }
  })
}

export const DeleteBody = z.strictObject({
  kind: z.enum(['service', 'combo']),
  id: z.uuid(),
})

// S42: xoá là đánh dấu đã xoá và ngừng bán (không xoá dòng); món biến mất khỏi menu và màn Danh mục, đơn cũ giữ nguyên.
export async function deleteItem(auth: Auth, input: z.infer<typeof DeleteBody>) {
  if (!canManage(auth)) throw forbidden('Chỉ chủ quán sửa được danh mục.')
  return withUser(auth.userId, async (tx) => {
    await tx`select app.catalog_delete(${input.kind}, ${input.id})`
    return { catalog: await loadCatalog(tx) }
  })
}

export async function priceHistory(auth: Auth, itemId: string) {
  if (!canManage(auth)) throw forbidden()
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return []
  return withUser(auth.userId, async (tx) => {
    const rows = await tx<
      {
        oldMin: string | null
        oldMax: string | null
        newMin: string
        newMax: string
        changedAt: Date
        name: string | null
      }[]
    >`select h.old_min, h.old_max, h.new_min, h.new_max, h.changed_at, u.display_name as name
      from catalog_price_history h left join users u on u.id = h.changed_by
      where h.item_id = ${itemId} order by h.id desc limit 20`
    return rows.map((r) => ({
      oldMin: r.oldMin == null ? null : Number(r.oldMin),
      oldMax: r.oldMax == null ? null : Number(r.oldMax),
      newMin: Number(r.newMin),
      newMax: Number(r.newMax),
      changedAt: new Date(r.changedAt).toISOString(),
      changedByName: r.name,
    }))
  })
}
