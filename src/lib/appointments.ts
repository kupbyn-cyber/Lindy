// Dữ liệu lịch hẹn phía trình duyệt: truy vấn, nhãn trạng thái, xếp cột lịch chồng giờ.
import { useQuery } from '@tanstack/react-query'
import type { ChipTone } from '~/components/ui'
import type { ApptStatus } from '~/server/appointments/policy'
import type { Detail, ListItem, Warnings } from '~/server/appointments/service'
import { api } from './api'

export type { ApptStatus, Detail, ListItem, Warnings }

export const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: 'Mới đặt',
  confirmed: 'Đã chốt lịch',
  arrived: 'Khách đã đến',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
  no_show: 'Khách không đến',
}

export const STATUS_TONE: Record<ApptStatus, ChipTone> = {
  pending: 'accent',
  confirmed: 'neutral',
  arrived: 'success',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  no_show: 'danger',
}

export const FILTERS = [
  { value: 'active', label: 'Tất cả' },
  { value: 'pending', label: 'Mới đặt' },
  { value: 'confirmed', label: 'Đã chốt lịch' },
  { value: 'customer_cancel', label: 'Khách báo huỷ' },
  { value: 'cancelled', label: 'Đã huỷ' },
  { value: 'no_show', label: 'Không đến' },
] as const
export type Filter = (typeof FILTERS)[number]['value']

export type Settings = { openTime: string; closeTime: string; defaultDurationMin: number; timezone: string }

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
