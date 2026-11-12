// Dữ liệu lịch hẹn phía trình duyệt: truy vấn, nhãn trạng thái, xếp cột lịch chồng giờ.
import { useQuery } from '@tanstack/react-query'
import type { ChipTone } from '~/lib/status-tone'
import type { ApptStatus } from '~/server/appointments/policy'
import type { Detail, ListItem, Warnings } from '~/server/appointments/service'
import type { DepositStatus } from '~/server/deposits/policy'
import type { DepositState } from '~/server/deposits/view'
import { api } from './api'
import { APPOINTMENT_TONE, DEPOSIT_STATE_TONE, DEPOSIT_TONE } from './status-tone'

export type { ApptStatus, DepositState, Detail, ListItem, Warnings }

export const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: 'Mới đặt',
  confirmed: 'Đã chốt lịch',
  arrived: 'Khách đã đến',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
  no_show: 'Khách không đến',
}

export const STATUS_TONE: Record<ApptStatus, ChipTone> = APPOINTMENT_TONE

export const FILTERS = [
  { value: 'active', label: 'Tất cả' },
  { value: 'customer_cancel', label: 'Yêu cầu huỷ' },
  { value: 'cancelled', label: 'Đã huỷ' },
  { value: 'no_show', label: 'Không đến' },
] as const
export type Filter = (typeof FILTERS)[number]['value']

export type Settings = {
  openTime: string
  closeTime: string
  defaultDurationMin: number
  timezone: string
  /** Chip dịch vụ của form lịch (S65), Linh sửa ở Cài đặt lịch */
  serviceChips: string[]
  /** Mùa cọc đang bật hôm nay (Đợt 3): lịch tạo hôm nay cần cọc */
  depositSeason?: { name: string; endDate: string; amountPerGuest: number } | null
}

export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; tone: ChipTone }> = {
  recorded: { label: 'Chờ xác nhận', tone: DEPOSIT_TONE.recorded },
  confirmed: { label: 'Đã nhận cọc', tone: DEPOSIT_TONE.confirmed },
  refunded: { label: 'Đã hoàn cọc', tone: DEPOSIT_TONE.refunded },
  forfeited: { label: 'Quán giữ cọc', tone: DEPOSIT_TONE.forfeited },
  voided: { label: 'Đã huỷ', tone: DEPOSIT_TONE.voided },
}

/** Nhãn cọc trên lịch (K16). done: đã trừ, hoàn, giữ hết — không hiện nhãn. */
export const DEPOSIT_STATE_CHIP: Partial<Record<DepositState, { label: string; tone: ChipTone }>> = {
  missing: { label: 'Chưa cọc', tone: DEPOSIT_STATE_TONE.missing },
  pending: { label: 'Cọc chờ xác nhận', tone: DEPOSIT_STATE_TONE.pending },
  held: { label: 'Đã cọc', tone: DEPOSIT_STATE_TONE.held },
}

export function useAppointments(params: { from: string; to: string; filter: Filter; q?: string }) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  else {
    qs.set('from', params.from)
    qs.set('to', params.to)
  }
  qs.set('filter', params.filter)
  return useQuery({
    queryKey: ['appointments', 'list', params.q ? { q: params.q, filter: params.filter } : params],
    queryFn: () => api<{ items: ListItem[]; settings: Settings }>(`/api/appointments?${qs.toString()}`),
    placeholderData: (prev) => prev,
  })
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointments', 'detail', id],
    queryFn: () => api<Detail>(`/api/appointments/${id}`),
  })
}

export function useBookingSettings() {
  return useQuery({
    queryKey: ['booking-settings'],
    queryFn: () => api<Settings>('/api/booking-settings'),
    staleTime: 5 * 60_000,
  })
}

export type Placed = ListItem & { col: number; cols: number; top: number; height: number }

/** Xếp lịch chồng giờ thành cột song song (như Apple Calendar), không mất lịch nào trên màn hình hẹp. */
export function layoutDay(items: ListItem[], pxPerMin: number): Placed[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number) as [number, number]
    return h * 60 + m
  }
  const sorted = [...items]
    .map((it) => ({ it, s: toMin(it.startTime), e: Math.max(toMin(it.endTime), toMin(it.startTime) + 15) }))
    .sort((a, b) => a.s - b.s || b.e - a.e)
  const out: Placed[] = []
  let cluster: { it: ListItem; s: number; e: number; col: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1))
    for (const c of cluster) {
      out.push({
        ...c.it,
        col: c.col,
        cols,
        top: c.s * pxPerMin,
        height: Math.max((c.e - c.s) * pxPerMin, 22),
      })
    }
    cluster = []
  }
  for (const x of sorted) {
    if (cluster.length > 0 && x.s >= clusterEnd) flush()
    if (cluster.length === 0) clusterEnd = x.e
    // Cột đầu tiên còn trống tại giờ bắt đầu
    const used = new Set(cluster.filter((c) => c.e > x.s).map((c) => c.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...x, col })
    clusterEnd = Math.max(clusterEnd, x.e)
  }
  if (cluster.length) flush()
  return out
}

export function addMinutes(hhmm: string, n: number) {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const t = Math.min(h * 60 + m + n, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
