// Lịch sử MCP: mỗi lần đồng ý / đổi token / gọi tool ghi 1 dòng audit_logs (entity_type = 'mcp').
// Không ghi token, mã, tham số tool. Dùng chung tài khoản Linh nên chỉ tách được theo app (Claude/ChatGPT).
import { withWorker } from '../db/client'
import type { ClientLabel } from './config'

export type McpAuditEntry = {
  action: 'mcp.tool_call' | 'mcp.oauth.authorize' | 'mcp.oauth.token' | 'mcp.oauth.revoke'
  outcome: 'success' | 'denied' | 'error'
  requestId: string
  client: ClientLabel
  clientId?: string
  grantId?: string
  tool?: string
  detail?: string
  errorCode?: string
}

export async function writeMcpAudit(userId: string, entry: McpAuditEntry) {
  const { action, ...details } = entry
  try {
    await withWorker(
      (tx) => tx`
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
        values (${userId}, ${action}, 'mcp', ${entry.grantId ?? null}, ${tx.json(details)})`,
    )
  } catch (e) {
    // Lịch sử không được làm hỏng thao tác chính; chỉ ghi loại lỗi.
    console.error('[mcp] không ghi được lịch sử:', (e as Error)?.name)
  }
}
