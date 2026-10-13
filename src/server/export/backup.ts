// Bản sao lưu dữ liệu nghiệp vụ (Đợt 5A, bước 5.6; PRD §15, test 19; K25). Chỉ Linh (data.export); DB kiểm lại trong
// app.backup_dump và ghi audit. Không gồm mật khẩu, phiên, đăng ký push. Sao lưu chính vẫn là sao lưu tự động của
// Vibe Host; bản này để Linh giữ ở máy và để chứng minh khôi phục được (scripts/restore-check.ts).
import { toLocalDate } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden, tooMany } from '../http/errors'

const last = new Map<string, number>()

export type BackupDump = {
  format: string
  migration: string
  exportedAt: string
  summary: {
    counts: Record<string, number>
    balances: Record<string, number>
    revenueByMonth: Record<string, number>
  }
  tables: Record<string, Record<string, unknown>[]>
}

export async function backupDump(auth: Auth, branchId?: string, now = Date.now()) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'data.export')) throw forbidden('Chỉ chủ quán tải bản sao lưu.')
  // Bản sao lưu nặng (gồm ảnh chứng từ): mỗi người một lần mỗi phút [P79]
  if (now - (last.get(auth.userId) ?? 0) < 60_000) throw tooMany('Vừa tải bản sao lưu. Thử lại sau một phút.')
  last.set(auth.userId, now)
  // Lấy dạng chữ: driver của app đổi tên trường JSON sang camelCase, bản sao lưu phải giữ đúng tên cột
  const [r] = await withUser(
    auth.userId,
    (tx) => tx<{ dump: string }[]>`select app.backup_dump()::text as dump`,
  )
  return { filename: `lindy-sao-luu-${toLocalDate(new Date())}.json`, json: r!.dump }
}

export function resetBackupLimit() {
  last.clear()
}
