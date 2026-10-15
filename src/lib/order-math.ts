// Tính tiền một đơn (PRD §6.1–6.7; C10–C15; K12). Hàm thuần dùng chung: máy khách hiện tổng ngay khi tích chọn,
// server tính lại từ danh mục và bỏ mọi số tiền máy gửi lên [P26]. Tiền là số nguyên VND.
//
// - Giá gốc của dòng: giá niêm yết, hoặc giá áp dụng nếu nằm trong/trên khoảng (C14). Thấp hơn giá thấp nhất
//   → khoản giảm "below_list", cần lý do và Nhung duyệt, không tính vào bậc % (K12).
// - Giảm % cộng dồn trên giá gốc (C15). Giảm cả bill chia theo tỷ lệ giá gốc từng dòng, lệch làm tròn vào dòng cuối (§6.2).
// - Mức duyệt mỗi dòng = tổng % (giảm của dòng + giảm cả bill): ≤ 10% thợ, ≤ 20% Nhung, > 20% Linh (C15).
// - Một thợ nhận cả dòng; nhiều thợ nhập tay, tổng phải bằng tiền thuần của dòng (C10).
// - Cơ sở hoa hồng = phần được chia + phần giảm quán chịu (ưu đãi bù khiếu nại), chia theo tỷ lệ (invariant 12).
import { formatVND } from './money'
import { addDays } from './time'

export const MAX_ITEMS = 30
export const MAX_DISCOUNTS = 20
export const MAX_QUANTITY = 20
export const MAX_LINE_AMOUNT = 10_000_000

export type Level = 'none' | 'staff' | 'manager' | 'owner'
const RANK: Record<Level, number> = { none: 0, staff: 1, manager: 2, owner: 3 }
export const maxLevel = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b)
export const levelAtLeast = (have: Level, need: Level) => RANK[have] >= RANK[need]

/** Quyền cần để tự áp hoặc duyệt một mức giảm. */
export const LEVEL_PERMISSION: Record<Exclude<Level, 'none'>, string> = {
  staff: 'discount.apply_up_to_10pct',
  manager: 'discount.approve_up_to_20pct',
  owner: 'discount.approve_any',
}

/** Mức cao nhất một người tự áp/duyệt được theo quyền. */
export function levelOf(perms: string[]): Level {
  if (perms.includes(LEVEL_PERMISSION.owner)) return 'owner'
  if (perms.includes(LEVEL_PERMISSION.manager)) return 'manager'
  if (perms.includes(LEVEL_PERMISSION.staff)) return 'staff'
  return 'none'
}

export const LEVEL_LABEL: Record<Level, string> = {
  none: 'Không cần duyệt',
  staff: 'Thợ tự áp',
  manager: 'Cần Nhung duyệt',
  owner: 'Cần Linh duyệt',
}

export type CatalogService = {
  id: string
  code: string
  name: string
  category: string
  priceMode: 'list' | 'custom'
  unit: string
  priceMin: number
  priceMax: number
  hasHardening: boolean
  isActive: boolean
}

export type CatalogCombo = {
  id: string
  code: string
  name: string
  groupName: string
  price: number
  hasHardening: boolean
  isActive: boolean
}

export type CatalogLookup = {
  service: (id: string) => CatalogService | undefined
  combo: (id: string) => CatalogCombo | undefined
}

export type StaffShare = { userId: string; amount?: number | null }

type ItemCommon = { staff: StaffShare[]; unallocatedReason?: string | null }
export type ItemInput =
  | (ItemCommon & {
      type: 'service'
      serviceId: string
      quantity: number
      unitPrice?: number | null
      belowReason?: string | null
    })
  | (ItemCommon & { type: 'combo'; comboId: string })
  | (ItemCommon & { type: 'surcharge' | 'custom'; name: string; amount: number })

export type DiscountKind = 'preset_5' | 'preset_10' | 'birthday' | 'manual' | 'complaint_compensation'
export type DiscountInput = {
  /** 'order' = cả bill; số = vị trí dòng (từ 0). */
  scope: 'order' | number
  kind: DiscountKind
  percent?: number | null
  amount?: number | null
  reason?: string | null
  /** Ưu đãi bù khiếu nại: phiếu xử lý cấp ưu đãi (bước 2.18). */
  ticketId?: string | null
}

export const PRESET_PERCENT: Partial<Record<DiscountKind, number>> = {
  preset_5: 5,
  preset_10: 10,
  birthday: 10,
}

export const DISCOUNT_LABEL: Record<DiscountKind | 'below_list', string> = {
  preset_5: 'Giảm 5%',
  preset_10: 'Giảm 10%',
  birthday: 'Sinh nhật 10%',
  manual: 'Giảm khác',
  complaint_compensation: 'Ưu đãi bù khiếu nại',
  below_list: 'Giá thấp hơn niêm yết',
}

export type ComputedAllocation = { userId: string; allocatedNetAmount: number; commissionBaseAmount: number }

export type ComputedItem = {
  type: ItemInput['type']
  serviceId: string | null
  comboId: string | null
  name: string
  unit: string
  priceMode: 'list' | 'custom' | 'fixed'
  listMin: number
  listMax: number
  unitPrice: number
  quantity: number
  grossAmount: number
  /** Giảm do giá thấp hơn khoảng/niêm yết (K12) — nằm trong lineDiscountAmount. */
  belowAmount: number
  belowReason: string | null
  /** Giảm của riêng dòng (gồm belowAmount). */
  lineDiscountAmount: number
  /** Phần giảm cả bill chia vào dòng. */
  orderDiscountAmount: number
  discountAmount: number
  netAmount: number
  /** Phần giảm quán chịu (ưu đãi bù khiếu nại) của dòng. */
  shopBorneAmount: number
  outOfRange: boolean
  hasHardening: boolean
  /** Tổng % giảm tính bậc duyệt (không gồm belowAmount). */
  tierPercent: number
  level: Level
  allocations: ComputedAllocation[]
  unallocatedReason: string | null
}

export type ComputedDiscount = {
  scope: 'order' | number
  kind: DiscountKind | 'below_list'
  percent: number | null
  amount: number
  shopBorne: boolean
  reason: string
  ticketId: string | null
}

export type ComputedOrder = {
  items: ComputedItem[]
  discounts: ComputedDiscount[]
  grossAmount: number
  discountAmount: number
  netAmount: number
  requiredLevel: Level
  hasHardening: boolean
  /** Lỗi chặn lưu. */
  errors: string[]
  /** Việc còn thiếu trước khi bấm Làm xong / Xác nhận. */
  doneProblems: string[]
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const blank = (s: string | null | undefined) => (s ?? '').trim() === ''
const EPS = 1e-9

export function levelForPercent(p: number): Level {
  if (p <= EPS) return 'none'
  if (p <= 10 + EPS) return 'staff'
  if (p <= 20 + EPS) return 'manager'
  return 'owner'
}

/** Chia `total` theo tỷ lệ `weights` (số nguyên), phần lệch vào phần tử cuối có trọng số. */
export function splitProportional(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0) return []
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0))
  const parts = weights.map((w) => Math.floor((total * w) / sum))
  let last = -1
  weights.forEach((w, i) => {
    if (w > 0) last = i
  })
  parts[last] = parts[last]! + (total - parts.reduce((a, b) => a + b, 0))
  return parts
}

export function computeOrder(
  input: { items: ItemInput[]; discounts: DiscountInput[] },
  catalog: CatalogLookup,
): ComputedOrder {
  const errors: string[] = []
  const doneProblems: string[] = []
  const lineNo = (i: number) => `Dòng ${i + 1}`

  if (input.items.length > MAX_ITEMS) errors.push(`Một đơn tối đa ${MAX_ITEMS} dòng.`)
  if (input.discounts.length > MAX_DISCOUNTS) errors.push(`Một đơn tối đa ${MAX_DISCOUNTS} khoản giảm.`)

  // 1. Giá gốc từng dòng
  const items: ComputedItem[] = input.items.map((it, i) => {
    const base = blankItem(it.type, blank(it.unallocatedReason) ? null : it.unallocatedReason!.trim())
    if (it.type === 'service') {
      const s = catalog.service(it.serviceId)
      if (!s) {
        errors.push(`${lineNo(i)}: không tìm thấy dịch vụ trong danh mục.`)
        return base
      }
      const quantity = it.quantity
      if (!isInt(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
        errors.push(`${lineNo(i)}: số lượng từ 1 đến ${MAX_QUANTITY}.`)
      const unitPrice = it.unitPrice ?? s.priceMin
      if (!isInt(unitPrice) || unitPrice < 1 || unitPrice > MAX_LINE_AMOUNT)
        errors.push(`${lineNo(i)}: giá không hợp lệ.`)
      const q = isInt(quantity) ? quantity : 1
      const refUnit = Math.max(unitPrice, s.priceMin)
      const below = unitPrice < s.priceMin ? (s.priceMin - unitPrice) * q : 0
      const belowReason = blank(it.belowReason) ? null : it.belowReason!.trim()
      if (below > 0 && !belowReason)
        errors.push(
          `${lineNo(i)}: giá thấp hơn ${s.priceMode === 'list' ? 'niêm yết' : 'khoảng'}, cần ghi lý do.`,
        )
      return {
        ...base,
        type: 'service',
        serviceId: s.id,
        name: s.name,
        unit: s.unit,
        priceMode: s.priceMode,
        listMin: s.priceMin,
        listMax: s.priceMax,
        unitPrice,
        quantity: q,
        grossAmount: refUnit * q,
        belowAmount: below,
        belowReason: below > 0 ? belowReason : null,
        lineDiscountAmount: below,
        outOfRange: unitPrice > s.priceMax,
        hasHardening: s.hasHardening,
      }
    }
    if (it.type === 'combo') {
      const c = catalog.combo(it.comboId)
      if (!c) {
        errors.push(`${lineNo(i)}: không tìm thấy combo trong danh mục.`)
        return base
      }
      return {
        ...base,
        comboId: c.id,
        name: c.name,
        listMin: c.price,
        listMax: c.price,
        unitPrice: c.price,
        grossAmount: c.price,
        hasHardening: c.hasHardening,
      }
    }
    const name = (it.name ?? '').trim()
    if (name.length < 1 || name.length > 100) errors.push(`${lineNo(i)}: nhập tên (tối đa 100 ký tự).`)
    if (!isInt(it.amount) || it.amount < 1 || it.amount > MAX_LINE_AMOUNT)
      errors.push(`${lineNo(i)}: số tiền không hợp lệ.`)
    const amount = isInt(it.amount) ? it.amount : 0
    return { ...base, name, listMin: amount, listMax: amount, unitPrice: amount, grossAmount: amount }
  })

  for (const [i, it] of items.entries()) {
    if (it.grossAmount > MAX_LINE_AMOUNT) errors.push(`${lineNo(i)}: một dòng tối đa 10.000.000đ.`)
  }
  const billGross = items.reduce((a, it) => a + it.grossAmount, 0)

  // 2. Khoản giảm
  const discounts: ComputedDiscount[] = []
  const seen = new Set<string>()
  const tier = items.map(() => 0)
  for (const [k, d] of input.discounts.entries()) {
    const label = `Khoản giảm ${k + 1}`
    const onOrder = d.scope === 'order'
    const target = onOrder ? null : items[d.scope as number]
    if (!onOrder && (!isInt(d.scope) || !target)) {
      errors.push(`${label}: dòng áp giảm không tồn tại.`)
      continue
    }
    const key = `${d.scope}:${d.kind}`
    if (d.kind !== 'manual' && seen.has(key)) {
      errors.push(`${label}: mỗi loại giảm chỉ áp một lần trên một dòng hoặc cả bill.`)
      continue
    }
    seen.add(key)
    const base = onOrder ? billGross : target!.grossAmount
    let percent: number | null = PRESET_PERCENT[d.kind] ?? null
    let amount = 0
    let reason = DISCOUNT_LABEL[d.kind]
    if (d.kind === 'manual') {
      if (blank(d.reason)) errors.push(`${label}: cần ghi lý do giảm.`)
      reason = (d.reason ?? '').trim()
      if (d.percent != null) {
        if (!isInt(d.percent) || d.percent < 1 || d.percent > 100)
          errors.push(`${label}: % giảm từ 1 đến 100.`)
        percent = d.percent
      } else if (!isInt(d.amount) || d.amount! < 1) {
        errors.push(`${label}: nhập % hoặc số tiền giảm.`)
      } else {
        amount = d.amount!
      }
    } else if (d.kind === 'complaint_compensation') {
      if (!isInt(d.percent) || d.percent! < 10 || d.percent! > 20)
        errors.push(`${label}: ưu đãi bù khiếu nại từ 10% đến 20%.`)
      percent = d.percent ?? 0
      if (!blank(d.reason)) reason = `${reason}: ${d.reason!.trim()}`
    }
    if (percent != null) amount = Math.round((base * percent) / 100)
    if (amount > base) errors.push(`${label}: số tiền giảm lớn hơn giá.`)
    const pct = percent ?? (base > 0 ? (amount * 100) / base : 0)
    if (onOrder) for (const i of tier.keys()) tier[i] = tier[i]! + pct
    else tier[d.scope as number] = tier[d.scope as number]! + pct
    discounts.push({
      scope: d.scope,
      kind: d.kind,
      percent,
      amount,
      shopBorne: d.kind === 'complaint_compensation',
      reason: reason.slice(0, 200),
      ticketId: d.kind === 'complaint_compensation' ? (d.ticketId ?? null) : null,
    })
  }

  // 3. Dồn giảm vào dòng
  for (const d of discounts) {
    if (d.scope === 'order') {
      const shares = splitProportional(
        d.amount,
        items.map((it) => it.grossAmount),
      )
      shares.forEach((s, i) => {
        const it = items[i]!
        it.orderDiscountAmount += s
        if (d.shopBorne) it.shopBorneAmount += s
      })
    } else {
      const it = items[d.scope]!
      it.lineDiscountAmount += d.amount
      if (d.shopBorne) it.shopBorneAmount += d.amount
    }
  }
  for (const [i, it] of items.entries()) {
    if (it.belowAmount > 0) {
      discounts.push({
        scope: i,
        kind: 'below_list',
        percent: null,
        amount: it.belowAmount,
        shopBorne: false,
        reason: it.belowReason ?? '',
        ticketId: null,
      })
    }
  }

  // 4. Tiền thuần, mức duyệt, chia thợ
  let requiredLevel: Level = 'none'
  for (const [i, it] of items.entries()) {
    const src = input.items[i]!
    it.discountAmount = it.lineDiscountAmount + it.orderDiscountAmount
    it.netAmount = it.grossAmount - it.discountAmount
    if (it.netAmount < 0) errors.push(`${lineNo(i)}: tổng giảm lớn hơn giá dòng.`)
    it.tierPercent = Math.round(tier[i]! * 1000) / 1000
    it.level = levelForPercent(tier[i]!)
    if (it.belowAmount > 0) it.level = maxLevel(it.level, 'manager')
    requiredLevel = maxLevel(requiredLevel, it.level)

    const staff = src.staff ?? []
    const ids = staff.map((s) => s.userId)
    if (new Set(ids).size !== ids.length) errors.push(`${lineNo(i)}: một thợ chỉ chọn một lần.`)
    if (staff.length === 1) {
      it.allocations = [
        { userId: staff[0]!.userId, allocatedNetAmount: it.netAmount, commissionBaseAmount: 0 },
      ]
    } else if (staff.length > 1) {
      const amounts = staff.map((s) => s.amount)
      if (amounts.some((a) => !isInt(a) || a! < 0)) {
        errors.push(`${lineNo(i)}: nhập số tiền cho từng thợ.`)
      } else {
        const sum = amounts.reduce((a, b) => a! + b!, 0)!
        if (sum !== it.netAmount)
          errors.push(
            `${lineNo(i)}: tổng chia cho thợ ${formatVND(sum)} phải bằng tiền thuần của dòng ${formatVND(it.netAmount)}.`,
          )
      }
      it.allocations = staff.map((s) => ({
        userId: s.userId,
        allocatedNetAmount: isInt(s.amount) ? s.amount : 0,
        commissionBaseAmount: 0,
      }))
    }
    if (it.allocations.length > 0) {
      const extra = splitProportional(
        it.shopBorneAmount,
        it.allocations.map((a) => a.allocatedNetAmount),
      )
      it.allocations.forEach((a, j) => {
        a.commissionBaseAmount = a.allocatedNetAmount + extra[j]!
      })
      it.unallocatedReason = null
    } else if (!it.unallocatedReason) {
      doneProblems.push(`${lineNo(i)} (${it.name}) chưa chọn thợ.`)
    }
  }
  if (items.length === 0) doneProblems.push('Đơn chưa có dịch vụ nào.')

  const grossAmount = billGross
  const netAmount = items.reduce((a, it) => a + it.netAmount, 0)
  return {
    items,
    discounts,
    grossAmount,
    discountAmount: grossAmount - netAmount,
    netAmount,
    requiredLevel,
    hasHardening: items.some((it) => it.hasHardening),
    errors,
    doneProblems,
  }
}

function blankItem(type: ItemInput['type'], unallocatedReason: string | null): ComputedItem {
  return {
    type,
    serviceId: null,
    comboId: null,
    name: '',
    unit: 'lần',
    priceMode: 'fixed',
    listMin: 0,
    listMax: 0,
    unitPrice: 0,
    quantity: 1,
    grossAmount: 0,
    belowAmount: 0,
    belowReason: null,
    lineDiscountAmount: 0,
    orderDiscountAmount: 0,
    discountAmount: 0,
    netAmount: 0,
    shopBorneAmount: 0,
    outOfRange: false,
    hasHardening: false,
    tierPercent: 0,
    level: 'none',
    allocations: [],
    unallocatedReason,
  }
}

/** Hạn bảo hành (C12): có cứng móng 7 ngày, không có 3 ngày, tính từ ngày làm dịch vụ. */
export function warrantyUntil(serviceDate: string, hasHardening: boolean) {
  return addDays(serviceDate, hasHardening ? 7 : 3)
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refund_partial' | 'refund_full'
/** Trạng thái thu (PRD §6.3): tự tính từ phải thu, đã thu (kể cả trừ cọc), đã hoàn (Đợt 3). */
export function paymentStatus(net: number, paid: number, refunded = 0): PaymentStatus {
  if (refunded > 0) return refunded >= paid ? 'refund_full' : 'refund_partial'
  if (paid >= net) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thu',
  partial: 'Thu một phần',
  paid: 'Đã thu đủ',
  refund_partial: 'Hoàn một phần',
  refund_full: 'Hoàn toàn bộ',
}
