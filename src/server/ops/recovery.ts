// Nhập lại dữ liệu thật sau sự cố 01/11/2026 (công cụ dùng một lần, migration 0031). Chỉ Chủ; DB kiểm lại quyền, kiểm
// sha256 của file và chỉ cho thành công một lần trong app.recovery_import. Gỡ file này sau khi dùng xong.
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { withUser } from '../db/client'
import { forbidden } from '../http/errors'

export const RECOVERY_MAX_PAYLOAD = 4 * 1024 * 1024

export type RecoveryReport = { committed: boolean; rows: Record<string, number> }

export async function recoveryImport(
  auth: Auth,
  input: { branchId?: string; payload: string; commit: boolean },
): Promise<RecoveryReport> {
  const branch = requireBranch(auth, input.branchId)
  if (!hasPerm(auth, branch.id, 'users.manage')) throw forbidden('Chỉ chủ quán làm được việc này.')
  // Lấy dạng chữ: driver của app đổi tên trường JSON sang camelCase
  const [r] = await withUser(
    auth.userId,
    (tx) =>
      tx<{ report: string }[]>`
        select app.recovery_import(${branch.id}, ${input.payload}, ${input.commit})::text as report`,
  )
  return JSON.parse(r!.report) as RecoveryReport
}
