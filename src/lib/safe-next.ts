// Quay lại sau đăng nhập (?next=): chỉ nhận màn Cho phép kết nối AI (MCP). Đường khác bị bỏ để không thành lỗ
// chuyển hướng sang trang ngoài (//evil, /\evil, http:…).
export function safeNext(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 4000) return undefined
  if (!raw.startsWith('/oauth/authorize?') || raw.includes('\\')) return undefined
  return raw
}
