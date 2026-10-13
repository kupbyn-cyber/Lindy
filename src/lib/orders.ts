// Dữ liệu đơn hàng phía trình duyệt: truy vấn, nhãn trạng thái, tra danh mục.
import { useQuery } from '@tanstack/react-query'
import type { ChipTone } from '~/components/ui'
import type { OrderStatus } from '~/server/orders/policy'
import type { Catalog, OrderDetail, OrderListItem } from '~/server/orders/service'
import { api } from './api'
import type { CatalogLookup, Level, PaymentStatus } from './order-math'

export type { Catalog, OrderDetail, OrderListItem, OrderStatus }

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  in_progress: 'Đang làm',
  awaiting_confirmation: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
}

export const ORDER_STATUS_TONE: Record<OrderStatus, ChipTone> = {
  in_progress: 'accent',
  awaiting_confirmation: 'warning',
  confirmed: 'neutral',
  cancelled: 'danger',
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thu',
  partial: 'Thu một phần',
  paid: 'Đã thu đủ',
}

export const PAYMENT_TONE: Record<PaymentStatus, ChipTone> = {
  unpaid: 'danger',
  partial: 'warning',
  paid: 'success',
}

export const LEVEL_NOTE: Record<Level, string | null> = {
  none: null,
  staff: null,
  manager: 'Giảm giá cần Nhung duyệt.',
  owner: 'Giảm giá trên 20% cần Linh duyệt.',
}

export const ORDER_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'awaiting_confirmation', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'unpaid', label: 'Chưa thu đủ' },
  { value: 'cancelled', label: 'Đã huỷ' },
] as const
export type OrderFilterValue = (typeof ORDER_FILTERS)[number]['value']

export type OrderList = {
  items: OrderListItem[]
  summary: {
    orderCount: number
    awaitingCount: number
    inProgressCount: number
    grossAmount: number | null
    discountAmount: number | null
    netAmount: number | null
    paidAmount: number | null
    dueAmount: number | null
    byStaff: { userId: string; name: string; amount: number }[]
  }
  from: string
  to: string
  today: string
  readAll: boolean
  revenueAll: boolean
}

export function useOrders(params: {
  from: string
  to: string
  filter: OrderFilterValue
  q?: string
  /** Chỉ đơn cần Linh xem lại (Q04) */
  review?: boolean
}) {
  const qs = new URLSearchParams({ from: params.from, to: params.to, filter: params.filter })
  if (params.q) qs.set('q', params.q)
  if (params.review) qs.set('review', '1')
  return useQuery({
    queryKey: ['orders', 'list', params],
    queryFn: () => api<OrderList>(`/api/orders?${qs.toString()}`),
    placeholderData: (prev) => prev,
  })
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => api<OrderDetail>(`/api/orders/${id}`),
  })
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<Catalog>('/api/catalog'),
    staleTime: 5 * 60_000,
  })
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: () => api<{ items: { id: string; displayName: string }[] }>('/api/staff'),
    staleTime: 5 * 60_000,
  })
}

export function lookupOf(cat: Catalog | undefined): CatalogLookup {
  const s = new Map((cat?.services ?? []).map((x) => [x.id, x]))
  const c = new Map((cat?.combos ?? []).map((x) => [x.id, x]))
  return { service: (id) => s.get(id), combo: (id) => c.get(id) }
}

export const UNIT_LABEL: Record<string, string> = { lần: 'lần', ngón: 'ngón', hình: 'hình', cái: 'cái' }
