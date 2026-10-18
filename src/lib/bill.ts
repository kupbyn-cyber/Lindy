// Nội dung bill in ra máy in nhiệt (Đợt 7, S36–S38): dựng từ đơn lúc bấm In bill, lưu kèm lệnh in; trạm in vẽ thành
// ảnh rồi in. Tên khách in đầy đủ, không in SĐT (S37). Dòng thông tin quán và lời cảm ơn do Linh sửa (print_settings).

import { DISCOUNT_LABEL } from './order-math'
import type { OrderDetail } from './orders'

export type BillData = {
  v: 1
  kind: 'bill' | 'test'
  /** Dòng dưới chữ LINDY NAIL STUDIO (địa chỉ…) */
  shopLines: string[]
  title: string
  /** "19/10/2026 · 14:05" */
  time: string
  customer: string | null
  staff: string | null
  items: { name: string; detail: string | null; amount: number }[]
  subtotal: number
  discounts: { label: string; amount: number }[]
  total: number
  paid: { label: string; amount: number }[]
  due: number
  /** "22/10/2026" */
  warrantyUntil: string | null
  thanks: string[]
}

export type BillSettings = { infoLines: string; thanks: string }

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4)

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
/** 8450000 → "8.450.000" (không phụ thuộc ngôn ngữ máy) */
export const groupVnd = (n: number) =>
  `${n < 0 ? '−' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const vnd = groupVnd

const PAY_LABEL: Record<string, string> = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', deposit: 'Trừ cọc' }

/**
 * Bill của đơn. Mỗi dòng dịch vụ in giá sau giảm riêng của dòng (không chia phần giảm cả bill vào dòng); giảm cả bill in
 * riêng bên dưới, nên tạm tính − giảm = tổng.
 */
export function buildBill(d: OrderDetail, s: BillSettings, at: { date: string; time: string }): BillData {
  const lineDiscount = (pos: number) =>
    d.discounts.filter((x) => x.scope === pos).reduce((a, x) => a + x.amount, 0)
  const items = d.items.map((it) => ({
    name: it.name,
    detail: it.quantity > 1 ? `${it.quantity} ${it.unit} × ${vnd(it.unitPrice)}` : null,
    amount: it.grossAmount - lineDiscount(it.position),
  }))
  const discounts = d.discounts
    .filter((x) => x.scope === 'order')
    .map((x) => ({
      label:
        x.kind === 'manual'
          ? `Giảm giá${x.percent ? ` ${x.percent}%` : ''}`
          : x.kind === 'complaint_compensation'
            ? `Ưu đãi${x.percent ? ` ${x.percent}%` : ''}`
            : DISCOUNT_LABEL[x.kind],
      amount: x.amount,
    }))
  const byMethod = new Map<string, number>()
  for (const p of d.payments.filter((p) => !p.voided))
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
  const paid = [...byMethod].map(([m, amount]) => ({ label: PAY_LABEL[m] ?? m, amount }))
  if (d.refundedAmount > 0) paid.push({ label: 'Đã hoàn', amount: -d.refundedAmount })
  const staff = [...new Set(d.items.flatMap((it) => it.staff.map((x) => x.name)).filter(Boolean))]
  return {
    v: 1,
    kind: 'bill',
    shopLines: lines(s.infoLines),
    title: `HOÁ ĐƠN ${d.codeLabel}`,
    time: `${dmy(at.date)} · ${at.time}`,
    customer: d.customer?.name ?? d.guestLabel ?? 'Khách lẻ',
    staff: staff.length ? staff.join(', ') : null,
    items,
    subtotal: items.reduce((a, x) => a + x.amount, 0),
    discounts,
    total: d.netAmount,
    paid,
    due: d.dueAmount,
    warrantyUntil: d.warrantyUntil ? dmy(d.warrantyUntil) : null,
    thanks: lines(s.thanks),
  }
}

/** Bill in thử (Thêm → Máy in bill) */
export function testBill(s: BillSettings, at: { date: string; time: string }): BillData {
  return {
    v: 1,
    kind: 'test',
    shopLines: lines(s.infoLines),
    title: 'IN THỬ',
    time: `${dmy(at.date)} · ${at.time}`,
    customer: 'Tên khách',
    staff: 'Tên thợ',
    items: [
      { name: 'Sơn gel trơn', detail: null, amount: 80_000 },
      { name: 'Mắt mèo', detail: `10 ngón × ${vnd(7000)}`, amount: 70_000 },
    ],
    subtotal: 150_000,
    discounts: [{ label: 'Giảm 10%', amount: 15_000 }],
    total: 135_000,
    paid: [{ label: 'Chuyển khoản', amount: 135_000 }],
    due: 0,
    warrantyUntil: null,
    thanks: lines(s.thanks),
  }
}
