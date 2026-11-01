// Bước 2.4 — hàm tính tiền đơn (PRD §6, §18; C10–C15; K12). Dùng danh mục thật trong data/.
import { describe, expect, it } from 'vitest'
import {
  type CatalogLookup,
  collectSuggestion,
  computeOrder,
  type DiscountInput,
  type ItemInput,
  levelOf,
  paymentStatus,
  pendingDepositShare,
  splitProportional,
  warrantyUntil,
} from '../../src/lib/order-math'
import { SEED_COMBOS, SEED_SERVICES } from '../../src/server/ops/catalog-data'

// id = mã để test dễ đọc
const catalog: CatalogLookup = {
  service: (id) => {
    const s = SEED_SERVICES.find((x) => x.code === id)
    return s && { ...s, id: s.code, isActive: true }
  },
  combo: (id) => {
    const c = SEED_COMBOS.find((x) => x.code === id)
    if (!c) return undefined
    const hasHardening = c.items.some((code) => SEED_SERVICES.find((s) => s.code === code)?.hasHardening)
    return {
      id: c.code,
      code: c.code,
      name: c.name,
      groupName: c.groupName,
      price: c.price,
      hasHardening,
      isActive: true,
    }
  },
}

const svc = (code: string, staff: string[] = ['chin'], extra: Partial<ItemInput> = {}): ItemInput =>
  ({
    type: 'service',
    serviceId: code,
    quantity: 1,
    staff: staff.map((userId) => ({ userId })),
    ...extra,
  }) as ItemInput
const run = (items: ItemInput[], discounts: DiscountInput[] = []) =>
  computeOrder({ items, discounts }, catalog)

describe('Tiền dòng và giá', () => {
  it('52 — Mắt mèo 10 ngón → tự điền 10 × 7.000đ = 70.000đ', () => {
    const o = run([svc('DS01', ['trang'], { quantity: 10 } as Partial<ItemInput>)])
    expect(o.errors).toEqual([])
    expect(o.items[0]!.unitPrice).toBe(7000)
    expect(o.netAmount).toBe(70000)
  })

  it('46 — Phá móng cũ (20–50k): tự điền 20.000đ; 35.000đ bình thường; 15.000đ thành giảm cần lý do và Nhung duyệt; 60.000đ có nhãn vượt khoảng', () => {
    const auto = run([svc('CB07')])
    expect(auto.items[0]!.unitPrice).toBe(20000)
    expect(auto.requiredLevel).toBe('none')

    const mid = run([svc('CB07', ['chin'], { unitPrice: 35000 } as Partial<ItemInput>)])
    expect(mid.errors).toEqual([])
    expect(mid.netAmount).toBe(35000)
    expect(mid.requiredLevel).toBe('none')
    expect(mid.items[0]!.outOfRange).toBe(false)

    const lowNoReason = run([svc('CB07', ['chin'], { unitPrice: 15000 } as Partial<ItemInput>)])
    expect(lowNoReason.errors.join()).toMatch(/cần ghi lý do/)

    const low = run([
      svc('CB07', ['chin'], { unitPrice: 15000, belowReason: 'Khách quen' } as Partial<ItemInput>),
    ])
    expect(low.errors).toEqual([])
    expect(low.grossAmount).toBe(20000)
    expect(low.discountAmount).toBe(5000)
    expect(low.netAmount).toBe(15000)
    expect(low.discounts).toEqual([
      expect.objectContaining({ kind: 'below_list', amount: 5000, reason: 'Khách quen' }),
    ])
    // K12: luôn cần Nhung, không tính vào bậc % (5.000/20.000 = 25% nhưng không thành "Linh duyệt")
    expect(low.requiredLevel).toBe('manager')

    const high = run([svc('CB07', ['chin'], { unitPrice: 60000 } as Partial<ItemInput>)])
    expect(high.errors).toEqual([])
    expect(high.items[0]!.outOfRange).toBe(true)
    expect(high.netAmount).toBe(60000)
    expect(high.requiredLevel).toBe('none')
  })

  it('giá niêm yết sửa thấp hơn cũng là giảm cần Nhung duyệt', () => {
    const o = run([
      svc('CB02', ['trang'], { unitPrice: 60000, belowReason: 'Lỗi màu' } as Partial<ItemInput>),
    ])
    expect(o.netAmount).toBe(60000)
    expect(o.requiredLevel).toBe('manager')
  })

  it('giới hạn: số lượng 1–20, một dòng ≤ 10.000.000đ, dịch vụ phải có trong danh mục', () => {
    expect(run([svc('DS01', ['a'], { quantity: 21 } as Partial<ItemInput>)]).errors.join()).toMatch(
      /số lượng/,
    )
    expect(run([{ type: 'custom', name: 'Khác', amount: 10_000_001, staff: [] }]).errors.join()).toMatch(
      /số tiền/,
    )
    expect(run([svc('XX99')]).errors.join()).toMatch(/không tìm thấy/)
  })
})

describe('Giảm giá và mức duyệt (C15, test 32, 47, 48)', () => {
  it('32 — thợ áp 10% được; 15% cần Nhung; 20% Nhung; 25% cần Linh', () => {
    const at = (percent: number) =>
      run([svc('CB02')], [{ scope: 'order', kind: 'manual', percent, reason: 'Khách quen' }]).requiredLevel
    expect(at(10)).toBe('staff')
    expect(at(15)).toBe('manager')
    expect(at(20)).toBe('manager')
    expect(at(25)).toBe('owner')
  })

  it('47 — thợ áp 5% + sinh nhật 10% = 15% → cần Nhung duyệt', () => {
    const o = run(
      [svc('CB02')],
      [
        { scope: 0, kind: 'preset_5' },
        { scope: 0, kind: 'birthday' },
      ],
    )
    expect(o.items[0]!.tierPercent).toBe(15)
    expect(o.requiredLevel).toBe('manager')
    expect(o.netAmount).toBe(70000 - 3500 - 7000)
  })

  it('48 — sinh nhật 10% trên combo 199k → 179.100đ', () => {
    const o = run(
      [{ type: 'combo', comboId: 'CBO199', staff: [{ userId: 'trang' }] }],
      [{ scope: 0, kind: 'birthday' }],
    )
    expect(o.netAmount).toBe(179100)
    expect(o.requiredLevel).toBe('staff')
  })

  it('giảm cả bill và giảm dòng cộng dồn khi tính bậc', () => {
    const o = run(
      [svc('CB02'), svc('CB01')],
      [
        { scope: 'order', kind: 'preset_10' },
        { scope: 1, kind: 'preset_5' },
      ],
    )
    expect(o.items[0]!.level).toBe('staff')
    expect(o.items[1]!.level).toBe('manager')
    expect(o.requiredLevel).toBe('manager')
  })

  it('mỗi loại giảm chỉ một lần trên một dòng; giảm khác cần lý do', () => {
    expect(
      run(
        [svc('CB02')],
        [
          { scope: 0, kind: 'preset_10' },
          { scope: 0, kind: 'preset_10' },
        ],
      ).errors.join(),
    ).toMatch(/một lần/)
    expect(run([svc('CB02')], [{ scope: 0, kind: 'manual', percent: 5 }]).errors.join()).toMatch(/lý do/)
    expect(run([svc('CB02')], [{ scope: 3, kind: 'preset_5' }]).errors.join()).toMatch(/không tồn tại/)
  })

  it('giảm tiền cố định cả bill tính % theo tổng bill', () => {
    const o = run([svc('MG03')], [{ scope: 'order', kind: 'manual', amount: 44000, reason: 'Khai trương' }])
    expect(o.netAmount).toBe(176000)
    expect(o.items[0]!.tierPercent).toBe(20)
    expect(o.requiredLevel).toBe('manager')
  })
})

describe('Chia thợ và doanh thu (test 1, 4, 49, 33, 34)', () => {
  it('1 — bill 348.000đ chia Nhung 239.000đ, Chin 109.000đ → doanh thu quán 348.000đ', () => {
    const o = run([
      { type: 'custom', name: 'Đắp gel + design', amount: 239000, staff: [{ userId: 'nhung' }] },
      { type: 'custom', name: 'Sơn gel + mắt mèo', amount: 109000, staff: [{ userId: 'chin' }] },
    ])
    expect(o.errors).toEqual([])
    expect(o.netAmount).toBe(348000)
    const by = byStaff(o)
    expect(by).toEqual({ nhung: 239000, chin: 109000 })
  })

  it('4 — giảm 10% đơn nhiều thợ → tổng phần chia khớp doanh thu thuần', () => {
    const o = run(
      [
        svc('MG03', ['nhung']),
        svc('DS06', ['chin'], { quantity: 7, unitPrice: 13000 } as Partial<ItemInput>),
        svc('CB08', ['trang']),
      ],
      [{ scope: 'order', kind: 'preset_10' }],
    )
    expect(o.errors).toEqual([])
    const total = Object.values(byStaff(o)).reduce((a, b) => a + b, 0)
    expect(total).toBe(o.netAmount)
    expect(o.discountAmount).toBe(Math.round(o.grossAmount * 0.1))
  })

  it('49 — combo 139k do Chin và Trang làm: 80.000đ + 59.000đ lưu được; lệch tổng không lưu được', () => {
    const combo = (a: number, b: number): ItemInput => ({
      type: 'combo',
      comboId: 'CBO139',
      staff: [
        { userId: 'chin', amount: a },
        { userId: 'trang', amount: b },
      ],
    })
    const ok = run([combo(80000, 59000)])
    expect(ok.errors).toEqual([])
    expect(byStaff(ok)).toEqual({ chin: 80000, trang: 59000 })
    expect(run([combo(80000, 50000)]).errors.join()).toMatch(/phải bằng tiền thuần/)
  })

  it('33 — ưu đãi bù khiếu nại 20% bill 500.000đ của Chin → doanh thu 400.000đ, cơ sở hoa hồng 500.000đ', () => {
    const o = run(
      [{ type: 'custom', name: 'Đắp gel', amount: 500000, staff: [{ userId: 'chin' }] }],
      [{ scope: 'order', kind: 'complaint_compensation', percent: 20, reason: 'Phiếu #12' }],
    )
    expect(o.errors).toEqual([])
    expect(o.netAmount).toBe(400000)
    const a = o.items[0]!.allocations[0]!
    expect(a.allocatedNetAmount).toBe(400000)
    expect(a.commissionBaseAmount).toBe(500000)
    expect(o.requiredLevel).toBe('manager')
  })

  it('34 — phụ thu 50.000đ của Trang → cơ sở hoa hồng và doanh thu +50.000đ', () => {
    const o = run([
      svc('CB02', ['trang']),
      { type: 'surcharge', name: 'Phụ thu móng dài', amount: 50000, staff: [{ userId: 'trang' }] },
    ])
    expect(o.netAmount).toBe(120000)
    expect(o.items[1]!.allocations[0]).toEqual({
      userId: 'trang',
      allocatedNetAmount: 50000,
      commissionBaseAmount: 50000,
    })
  })

  it('dòng chưa chọn thợ chặn Làm xong, trừ khi có lý do; một thợ chọn hai lần là lỗi', () => {
    expect(run([svc('CB02', [])]).doneProblems.join()).toMatch(/chưa chọn thợ/)
    expect(
      run([svc('CB02', [], { unallocatedReason: 'Bán lẻ' } as Partial<ItemInput>)]).doneProblems,
    ).toEqual([])
    expect(run([]).doneProblems.join()).toMatch(/chưa có dịch vụ/)
    expect(
      run([
        {
          type: 'combo',
          comboId: 'CBO99',
          staff: [
            { userId: 'a', amount: 50000 },
            { userId: 'a', amount: 49000 },
          ],
        },
      ]).errors.join(),
    ).toMatch(/một lần/)
  })

  it('làm tròn: 1.000 đơn ngẫu nhiên — tổng dòng, tổng chia thợ, cơ sở hoa hồng khớp từng đồng', () => {
    let seed = 42
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    const codes = SEED_SERVICES.map((s) => s.code)
    let checked = 0
    for (let k = 0; k < 1000; k++) {
      const items: ItemInput[] = Array.from({ length: 1 + rnd(5) }, () =>
        svc(codes[rnd(codes.length)]!, [['linh', 'nhung', 'chin', 'trang'][rnd(4)]!], {
          quantity: 1 + rnd(10),
        } as Partial<ItemInput>),
      )
      const discounts: DiscountInput[] = [
        { scope: 'order', kind: 'manual', percent: 1 + rnd(19), reason: 'x' },
        { scope: rnd(items.length), kind: 'preset_5' },
      ]
      if (rnd(2)) discounts.push({ scope: 'order', kind: 'complaint_compensation', percent: 10 + rnd(11) })
      const o = run(items, discounts)
      if (o.errors.length > 0) continue
      checked++
      const lines = o.items.reduce((a, it) => a + it.netAmount, 0)
      expect(lines).toBe(o.netAmount)
      expect(o.grossAmount - o.discountAmount).toBe(o.netAmount)
      const discSum = o.discounts.reduce((a, d) => a + d.amount, 0)
      expect(discSum).toBe(o.discountAmount)
      for (const it of o.items) {
        const alloc = it.allocations.reduce((a, x) => a + x.allocatedNetAmount, 0)
        const base = it.allocations.reduce((a, x) => a + x.commissionBaseAmount, 0)
        expect(alloc).toBe(it.netAmount)
        expect(base).toBe(it.netAmount + it.shopBorneAmount)
      }
    }
    expect(checked).toBeGreaterThan(900)
  })
})

describe('Gợi ý thu khi cọc chờ xác nhận (S53)', () => {
  it('đơn một khách nhận cả phần chờ; lịch nhiều khách chia đều, phần lẻ vào Khách 1', () => {
    expect(pendingDepositShare(100_000, null, 1)).toBe(100_000)
    expect(pendingDepositShare(200_000, 1, 2)).toBe(100_000)
    expect(pendingDepositShare(200_000, 2, 2)).toBe(100_000)
    expect(pendingDepositShare(100_000, 1, 3)).toBe(33_334)
    expect(pendingDepositShare(100_000, 2, 3)).toBe(33_333)
  })

  it('số gợi ý là phần còn lại, không âm khi cọc lớn hơn bill', () => {
    expect(collectSuggestion({ dueAmount: 300_000, depositPending: 100_000 })).toBe(200_000)
    expect(collectSuggestion({ dueAmount: 300_000, depositPending: 0 })).toBe(300_000)
    expect(collectSuggestion({ dueAmount: 80_000, depositPending: 100_000 })).toBe(0)
  })
})

describe('Bảo hành, thu tiền, quyền', () => {
  it('50 — bill có Cứng móng (2 lớp) làm 10/11 → bảo hành đến 17/11; chỉ Sơn gel trơn → 13/11', () => {
    const hard = run([svc('CB03'), svc('CB02')])
    expect(warrantyUntil('2026-11-10', hard.hasHardening)).toBe('2026-11-17')
    const soft = run([svc('CB02')])
    expect(warrantyUntil('2026-11-10', soft.hasHardening)).toBe('2026-11-13')
    const combo139 = run([{ type: 'combo', comboId: 'CBO139', staff: [] }])
    expect(combo139.hasHardening).toBe(true)
  })

  it('trạng thái thu tiền tự tính', () => {
    expect(paymentStatus(500000, 0)).toBe('unpaid')
    expect(paymentStatus(500000, 300000)).toBe('partial')
    expect(paymentStatus(500000, 500000)).toBe('paid')
  })

  it('mức tự áp/duyệt theo quyền', () => {
    expect(levelOf(['discount.apply_up_to_10pct'])).toBe('staff')
    expect(levelOf(['discount.apply_up_to_10pct', 'discount.approve_up_to_20pct'])).toBe('manager')
    expect(levelOf(['discount.approve_any'])).toBe('owner')
  })

  it('chia tỷ lệ: phần lệch vào phần tử cuối có trọng số', () => {
    expect(splitProportional(100, [1, 1, 1])).toEqual([33, 33, 34])
    expect(splitProportional(7, [3, 0])).toEqual([7, 0])
    expect(splitProportional(5, [0, 0])).toEqual([5, 0])
  })
})

function byStaff(o: ReturnType<typeof run>) {
  const m: Record<string, number> = {}
  for (const it of o.items)
    for (const a of it.allocations) m[a.userId] = (m[a.userId] ?? 0) + a.allocatedNetAmount
  return m
}
