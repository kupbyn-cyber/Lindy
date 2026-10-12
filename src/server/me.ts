// Thông tin người đang đăng nhập gửi cho giao diện. Giao diện dùng quyền để ẩn nút; server vẫn kiểm lại.
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type { Auth } from './auth/context'

export type Me = {
  userId: string
  displayName: string
  mustChangePassword: boolean
  branches: { id: string; name: string; shortLabel: string; perms: string[] }[]
}

export function toMe(auth: Auth): Me {
  return {
    userId: auth.userId,
    displayName: auth.displayName,
    mustChangePassword: auth.mustChangePassword,
    branches: auth.branches,
  }
}

/** Dùng trong beforeLoad của layout (chạy cả lúc SSR lẫn trên máy). */
export const getMeFn = createServerFn({ method: 'GET' }).handler(async (): Promise<Me | null> => {
  const { getAuth } = await import('./auth/context')
  const auth = await getAuth(getRequest())
  return auth ? toMe(auth) : null
})
