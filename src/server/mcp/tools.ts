// Danh sách tool MCP của LINDY OS. Mỗi nhóm tool nằm ở file riêng; đăng ký tại đây.
import { z } from 'zod'
import { SCOPE_READ } from './config'
import { defineTool, type ToolDef } from './kit'
import { READ_OPS_TOOLS } from './tools-read-ops'

const getMe = defineTool({
  name: 'lindy_get_me',
  title: 'Tài khoản đang kết nối',
  description:
    'Tên, vai trò và cơ sở của tài khoản LINDY OS đang kết nối. Gọi đầu tiên để biết đang làm việc với quán nào.',
  scope: SCOPE_READ,
  readOnly: true,
  input: z.object({}),
  run: async (_args, { auth, principal }) => ({
    displayName: auth.displayName,
    branches: auth.branches.map((b) => ({
      id: b.id,
      name: b.name,
      shortLabel: b.shortLabel,
      role: b.roleName,
    })),
    connectedApp: principal.clientLabel,
    scopes: principal.scopes,
  }),
})

export const TOOLS: ToolDef[] = [getMe, ...READ_OPS_TOOLS]

export function findTool(name: string) {
  return TOOLS.find((t) => t.name === name)
}
