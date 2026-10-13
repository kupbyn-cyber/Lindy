// Bước 2.22 — Linh thêm, sửa, ngừng bán dịch vụ và combo; đổi giá có lịch sử, không đổi đơn cũ (P35).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchCatalog } from '../../src/lib/catalog-search'
import { toLocalDate } from '../../src/lib/time'
import { priceHistory, saveCombo, saveService } from '../../src/server/catalog/service'
import { closeSql } from '../../src/server/db/client'
import type { AppError } from '../../src/server/http/errors'
import { createOrder, getCatalog, getOrder } from '../../src/server/orders/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
beforeAll(async () => {
  for (const k of ['linh', 'nhung', 'trang'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth

describe('2.22 Cài đặt danh mục', () => {
  it('Linh thêm dịch vụ mới → tìm thấy ngay khi tạo đơn; đổi giá không đổi đơn cũ, có lịch sử giá', async () => {
    const res = await saveService(auth('linh'), {
      category: 'Design',
      name: 'Vẽ hoa nổi',
      priceMode: 'custom',
      unit: 'ngón',
      priceMin: 20000,
      priceMax: 60000,
      hasHardening: false,
      isActive: true,
    })
    const svc = res.catalog.services.find((s) => s.id === res.id)!
    expect(svc.code).toMatch(/^DV\d{3}$/)
    const cat = await getCatalog(auth('trang'))
    expect(searchCatalog(cat.services, 've hoa noi')[0]?.id).toBe(res.id)

    const { order } = await createOrder(auth('trang'), {
      createRequestId: rid(),
      customerId: null,
      serviceDate: toLocalDate(new Date()),
      items: [
        { type: 'service', serviceId: res.id, quantity: 2, staff: [{ userId: seed().users.trang!.id }] },
      ],
      discounts: [],
    })
    expect(order.netAmount).toBe(40000)

    await saveService(auth('linh'), {
      id: res.id,
      category: 'Design',
      name: 'Vẽ hoa nổi',
      priceMode: 'custom',
      unit: 'ngón',
      priceMin: 25000,
      priceMax: 60000,
      hasHardening: false,
      isActive: true,
    })
    const again = await getOrder(auth('trang'), order.id)
    expect(again.items[0]!.unitPrice).toBe(20000)
    expect(again.netAmount).toBe(40000)
    const hist = await priceHistory(auth('linh'), res.id)
    expect(hist.map((h) => [h.oldMin, h.newMin])).toEqual([
      [20000, 25000],
      [null, 20000],
    ])
  })

  it('ngừng bán: vẫn còn trong danh mục (đơn cũ hiển thị được), có cờ is_active = false', async () => {
    const res = await saveService(auth('linh'), {
      category: 'Chăm sóc',
      name: 'Massage tay thử',
      priceMode: 'list',
      unit: 'lần',
      priceMin: 50000,
      hasHardening: false,
      isActive: true,
    })
    const off = await saveService(auth('linh'), {
      id: res.id,
      category: 'Chăm sóc',
      name: 'Massage tay thử',
      priceMode: 'list',
      unit: 'lần',
      priceMin: 50000,
      hasHardening: false,
      isActive: false,
    })
    expect(off.catalog.services.find((s) => s.id === res.id)?.isActive).toBe(false)
  })

  it('Nhung, thợ không sửa được danh mục', async () => {
    const body = {
      category: 'Cơ bản',
      name: 'X',
      priceMode: 'list' as const,
      unit: 'lần' as const,
      priceMin: 1000,
      hasHardening: false,
      isActive: true,
    }
    for (const k of ['nhung', 'trang'] as const) {
      const e = await saveService(auth(k), body).catch((x) => x)
      expect((e as AppError).status).toBe(403)
    }
  })

  it('combo mới cần ít nhất 2 dịch vụ; sửa giá combo có lịch sử', async () => {
    const [a, b] = await owner<
      { id: string }[]
    >`select id from services where code in ('CB01', 'CB02') order by code`
    const e = await saveCombo(auth('linh'), {
      name: 'Combo lẻ',
      groupName: 'Móng thật',
      price: 90000,
      isActive: true,
      serviceIds: [a!.id],
    }).catch((x) => x)
    expect((e as AppError).status).toBe(422)
    const c = await saveCombo(auth('linh'), {
      name: 'Combo thử 100k',
      groupName: 'Móng thật',
      price: 100000,
      isActive: true,
      serviceIds: [a!.id, b!.id],
    })
    const combo = c.catalog.combos.find((x) => x.id === c.id)!
    expect(combo.itemNames).toEqual(['Cắt sửa', 'Sơn gel trơn'])
    expect(combo.code).toMatch(/^CBX\d{2}$/)
    await saveCombo(auth('linh'), {
      id: c.id,
      name: 'Combo thử 100k',
      groupName: 'Móng thật',
      price: 95000,
      isActive: true,
    })
    const hist = await priceHistory(auth('linh'), c.id)
    expect(hist[0]).toMatchObject({ oldMin: 100000, newMin: 95000 })
  })
})
