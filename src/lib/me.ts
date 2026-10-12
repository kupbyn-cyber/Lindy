import { getRouteApi } from '@tanstack/react-router'
import type { Me } from '~/server/me'

const appRoute = getRouteApi('/_app')

export function useMe(): Me {
  return appRoute.useRouteContext().me
}

/** Cơ sở đang làm việc. Chỉ có một cơ sở thì tự chọn (UI01). */
export function useBranch() {
  const me = useMe()
  return me.branches[0] ?? null
}

export function useCan() {
  const branch = useBranch()
  return (perm: string) => !!branch?.perms.includes(perm)
}
