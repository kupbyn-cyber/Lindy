// Bộ khung tool MCP: khai báo tool (zod .strict() → JSON Schema), đổi lỗi sang câu tiếng Việt cho AI.
// Tool chỉ gọi service sẵn có trong src/server/*; danh tính luôn là ctx.auth dựng từ OAuth token, không từ tham số.
import { z } from 'zod'
import type { Auth } from '../auth/context'
import { AppError, fromDbError } from '../http/errors'
import type { Scope } from './config'
import type { McpPrincipal } from './oauth'

export type ToolCtx = { auth: Auth; principal: McpPrincipal; requestId: string }

export type ToolDef = {
  name: string
  title: string
  description: string
  scope: Scope
  /** true: chỉ đọc (gợi ý cho client MCP) */
  readOnly: boolean
  input: z.ZodType
  inputSchema: Record<string, unknown>
  run: (args: unknown, ctx: ToolCtx) => Promise<unknown>
}

export function defineTool<S extends z.ZodObject>(def: {
  name: string
  title: string
  description: string
  scope: Scope
  readOnly: boolean
  input: S
  run: (args: z.infer<S>, ctx: ToolCtx) => Promise<unknown>
}): ToolDef {
  const strict = def.input.strict()
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(strict, { io: 'input' }) as Record<
    string,
    unknown
  >
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    scope: def.scope,
    readOnly: def.readOnly,
    input: strict,
    inputSchema,
    run: (args, ctx) => def.run(args as z.infer<S>, ctx),
  }
}

/** Tham số chung */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD.')
export const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Tháng dạng YYYY-MM.')
export const uuid = z.uuid('Mã không hợp lệ.')

export type ToolFailure = { error: string; message: string; data?: unknown }

/**
 * Đổi lỗi theo đúng thứ tự của errorResponse (src/server/http/route.ts): AppError → ZodError → lỗi PostgreSQL
 * (luật trong hàm SQL, P0001/42501) → câu chung [phản biện vòng 2 L4].
 */
export function toToolFailure(e: unknown): ToolFailure {
  if (e instanceof AppError) {
    return { error: e.code ?? 'error', message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) }
  }
  if (e instanceof z.ZodError) {
    const first = e.issues[0]
    const path = first?.path?.length ? `${first.path.join('.')}: ` : ''
    return {
      error: 'invalid',
      message:
        first?.message && !first.message.startsWith('Invalid')
          ? `${path}${first.message}`
          : `${path}Dữ liệu không hợp lệ.`,
    }
  }
  const db = fromDbError(e)
  if (db) return toToolFailure(db)
  console.error('[mcp] lỗi tool không mong đợi:', (e as Error)?.name)
  return { error: 'internal', message: 'Có lỗi xảy ra. Thử lại sau.' }
}
