// Khung app sau đăng nhập (bước 0.14): AppBar, BottomNav 5 mục, chuông thông báo, cập nhật tức thời.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { useEffect } from 'react'
import { AppBar, cx, Icon, type IconName } from '~/components/ui'
import { api } from '~/lib/api'
import { useLiveEvents } from '~/lib/live'
import { useBranch } from '~/lib/me'
import { registerServiceWorker } from '~/lib/push-client'
import { useKeyboardInset } from '~/lib/use-keyboard-inset'
import { getMeFn } from '~/server/me'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const me = await getMeFn()
    if (!me) throw redirect({ to: '/dang-nhap' })
    if (me.mustChangePassword) throw redirect({ to: '/doi-mat-khau' })
    return { me }
  },
  component: AppLayout,
})

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Tổng quan', icon: 'home' },
  { to: '/don-hang', label: 'Đơn hàng', icon: 'receipt' },
  { to: '/lich', label: 'Lịch', icon: 'calendar' },
  { to: '/khach', label: 'Khách', icon: 'user' },
  { to: '/them', label: 'Thêm', icon: 'more' },
]

function AppLayout() {
  const branch = useBranch()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Không còn nút tròn "+ Tạo đơn" (S16): mọi đơn tạo từ lịch
  useLiveEvents(branch?.id ?? null)
  useKeyboardInset()
  useEffect(() => {
    void registerServiceWorker()
  }, [])
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 60_000,
  })

  return (
    <div className="min-h-dvh">
      <AppBar
        branch={branch?.shortLabel}
        right={
          <Link
            to="/thong-bao"
            className="lo-icon-btn"
            aria-label={`Thông báo${unread.data?.count ? `, ${unread.data.count} chưa đọc` : ''}`}
          >
            <Bell size={22} strokeWidth={1.7} aria-hidden="true" />
            {unread.data?.count ? (
              <span className="lo-nav-badge caption">
                {unread.data.count > 99 ? '99+' : unread.data.count}
              </span>
            ) : null}
          </Link>
        }
      />
      <main className="pb-[calc(var(--lo-bottom-offset)+var(--space-8))]">
        {branch ? (
          <Outlet />
        ) : (
          <p className="body p-4 text-ink-muted">
            Tài khoản chưa được cấp quyền ở cơ sở nào. Báo chủ quán để được cấp.
          </p>
        )}
      </main>
      <nav className="lo-nav" aria-label="Điều hướng chính">
        {NAV.map((it) => {
          const on = it.to === '/' ? pathname === '/' : pathname.startsWith(it.to)
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cx('lo-nav-item', on && 'is-active')}
              aria-current={on ? 'page' : undefined}
            >
              <span className="lo-nav-icon">
                <Icon name={it.icon} size={24} />
              </span>
              <span className="lo-nav-label nav-label">{it.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
