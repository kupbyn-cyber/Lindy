import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { ToastProvider } from './components/ui'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Lỗi 4xx (thiếu quyền, không tìm thấy) không thử lại; lỗi mạng, 5xx thử lại 2 lần.
        retry: (count, err) => {
          const status = (err as unknown as { status?: number }).status ?? 0
          return count < 2 && (status === 0 || status >= 500)
        },
        refetchOnWindowFocus: true,
      },
    },
  })
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
