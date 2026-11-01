// Mỗi màu một nghĩa (S49, S51): tone chỉ đến từ src/lib/status-tone.ts, trạng thái tiền giữ G10.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_TONE,
  DAY_TONE,
  DEPOSIT_STATE_TONE,
  DEPOSIT_TONE,
  LABEL_TONE,
  LEAVE_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_TONE,
  PAYROLL_TONE,
  REQUEST_TONE,
} from '../../src/lib/status-tone'

const TONES = ['success', 'warning', 'danger', 'progress', 'waiting', 'neutral']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []
  })
}

describe('màu trạng thái một nguồn', () => {
  it('không màn nào viết tone tay trên StatusChip', () => {
    const bad = sourceFiles('src').filter((f) => /<StatusChip\s+tone="/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })

  it('mọi tone hợp lệ, không có accent (màu hành động không dùng cho trạng thái)', () => {
    const maps = [
      ORDER_STATUS_TONE,
      PAYMENT_TONE,
      APPOINTMENT_TONE,
      DEPOSIT_TONE,
      DEPOSIT_STATE_TONE,
      DAY_TONE,
      LEAVE_TONE,
      REQUEST_TONE,
      PAYROLL_TONE,
      LABEL_TONE,
    ]
    for (const m of maps) for (const t of Object.values(m)) expect(TONES).toContain(t)
  })

  it('G10: tiền xanh, cam, đỏ', () => {
    expect(PAYMENT_TONE.paid).toBe('success')
    expect(PAYMENT_TONE.partial).toBe('warning')
    expect(PAYMENT_TONE.unpaid).toBe('danger')
  })

  it('cùng một nghĩa cùng một màu', () => {
    // Đã huỷ ở mọi chuỗi trạng thái
    expect(ORDER_STATUS_TONE.cancelled).toBe('neutral')
    expect(APPOINTMENT_TONE.cancelled).toBe('neutral')
    expect(REQUEST_TONE.cancelled).toBe('neutral')
    expect(LEAVE_TONE.cancelled).toBe('neutral')
    expect(DEPOSIT_TONE.voided).toBe('neutral')
    // Chờ người khác làm
    expect(ORDER_STATUS_TONE.awaiting_confirmation).toBe('waiting')
    expect(REQUEST_TONE.requested).toBe('waiting')
    expect(REQUEST_TONE.approved).toBe('waiting')
    expect(LEAVE_TONE.requested).toBe('waiting')
    expect(DAY_TONE.pending).toBe('waiting')
    expect(DEPOSIT_TONE.recorded).toBe('waiting')
    expect(DEPOSIT_STATE_TONE.pending).toBe('waiting')
    // Đang làm
    expect(ORDER_STATUS_TONE.in_progress).toBe('progress')
    expect(APPOINTMENT_TONE.in_progress).toBe('progress')
  })
})
