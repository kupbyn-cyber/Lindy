// Intent ghi của MCP: xem trước → người dùng đồng ý → thực hiện đúng một lần. Theo ý CEN WORK
// src/lib/mcp/write-intents.server.ts, nhưng service Lindy tự mở giao dịch withUser nên không chạy nghiệp vụ trong cùng
// giao dịch khoá intent. Cách làm (plan.md, Quyết định kỹ thuật):
//   (1) giao dịch worker khoá intent `for update`, pending → executing;
//   (2) gọi service (ngoài giao dịch đó);
//   (3) giao dịch worker ghi kết quả: done (lưu result) hoặc failed (lưu lỗi).
// Gọi lại mã đã done → trả kết quả cũ. Đang executing < 2 phút → "đang thực hiện"; > 2 phút (tiến trình chết giữa
// chừng) → "không rõ đã ghi chưa", không tự chạy lại. Lưới thứ hai: createRequestId = id intent, version của bản ghi.
import { randomBytes } from 'node:crypto'
import type postgres from 'postgres'
import { withWorker } from '../db/client'
import { AppError, conflict, invalid } from '../http/errors'
import { toToolFailure } from './kit'
import type { McpPrincipal } from './oauth'
import { sha256Hex } from './oauth'

const STUCK_MS = 2 * 60_000

export type IntentPreview = {
  status: 'preview'
  action_token: string
  expires_at: string
  next_tool: string
  summary: Record<string, unknown>
  note: string
}

export async function createIntent(input: {
  principal: McpPrincipal
  actionType: string
  executeTool: string
  payload: Record<string, unknown>
  summary: Record<string, unknown>
}): Promise<IntentPreview> {
  const token = `lindymcp_wi_${randomBytes(32).toString('base64url')}`
  const [row] = await withWorker(
    (tx) => tx<{ expiresAt: Date }[]>`
      insert into mcp_write_intents (token_hash, user_id, grant_id, action_type, payload, summary)
      values (${sha256Hex(token)}, ${input.principal.userId}, ${input.principal.grantId}, ${input.actionType},
              ${tx.json(input.payload as postgres.JSONValue)}, ${tx.json(input.summary as postgres.JSONValue)})
      returning expires_at`,
  )
  return {
    status: 'preview',
    action_token: token,
    expires_at: new Date(row!.expiresAt).toISOString(),
    next_tool: input.executeTool,
    summary: input.summary,
    note:
      'Chưa có gì thay đổi. Cho người dùng xem bản xem trước này; chỉ khi họ yêu cầu thực hiện mới gọi ' +
      `${input.executeTool} với action_token (hết hạn sau 15 phút, dùng một lần).`,
  }
}

type IntentRow = {
  id: string
  userId: string
  grantId: string
  actionType: string
  payload: Record<string, unknown>
  status: 'pending' | 'executing' | 'done' | 'failed'
  result: unknown
  error: { error: string; message: string } | null
  expired: boolean
  claimedAt: Date | null
}

export async function executeIntent<T>(input: {
  token: string
  principal: McpPrincipal
  actionType: string
  run: (payload: Record<string, unknown>, intentId: string) => Promise<T>
}): Promise<{ status: 'done'; replayed: boolean; result: T }> {
  // (1) Khoá và nhận intent
  type Claimed = { kind: 'replay'; result: T } | { kind: 'run'; id: string; payload: Record<string, unknown> }
  const claimed = await withWorker(async (tx): Promise<Claimed> => {
    const [row] = await tx<IntentRow[]>`
      select id, user_id, grant_id, action_type, payload, status, result, error,
             (expires_at <= now()) as expired, claimed_at
      from mcp_write_intents where token_hash = ${sha256Hex(input.token)}
      for update`
    if (!row || row.userId !== input.principal.userId || row.grantId !== input.principal.grantId) {
      throw invalid('action_token không hợp lệ. Gọi lại tool xem trước.')
    }
    if (row.actionType !== input.actionType) {
      throw invalid('action_token không dành cho thao tác này. Gọi đúng tool thực hiện trong next_tool.')
    }
    if (row.status === 'done') return { kind: 'replay', result: row.result as T }
    if (row.status === 'failed') {
      throw new AppError(
        422,
        row.error?.message ?? 'Thao tác đã lỗi. Gọi lại tool xem trước.',
        'intent_failed',
      )
    }
    if (row.status === 'executing') {
      const stuck = !row.claimedAt || Date.now() - new Date(row.claimedAt).getTime() > STUCK_MS
      throw conflict(
        stuck
          ? 'Không rõ thao tác này đã ghi xong chưa. Kiểm tra trong app trước khi làm lại.'
          : 'Thao tác đang thực hiện. Thử lại sau ít giây.',
      )
    }
    if (row.expired) throw invalid('Bản xem trước đã hết hạn. Gọi lại tool xem trước.')
    await tx`update mcp_write_intents set status = 'executing', claimed_at = now() where id = ${row.id}`
    return { kind: 'run', id: row.id, payload: row.payload }
  })
  if (claimed.kind === 'replay') return { status: 'done', replayed: true, result: claimed.result }

  // (2) Gọi service
  let result: T
  try {
    result = await input.run(claimed.payload, claimed.id)
  } catch (e) {
    const failure = toToolFailure(e)
    await withWorker(
      (tx) => tx`
        update mcp_write_intents set status = 'failed', finished_at = now(),
          error = ${tx.json({ error: failure.error, message: failure.message })}
        where id = ${claimed.id}`,
    )
    throw e
  }

  // (3) Ghi kết quả
  await withWorker(
    (tx) => tx`
      update mcp_write_intents set status = 'done', finished_at = now(),
        result = ${tx.json(JSON.parse(JSON.stringify(result ?? null)) as postgres.JSONValue)}
      where id = ${claimed.id}`,
  )
  return { status: 'done', replayed: false, result }
}
