// Cập nhật tức thời (bước 0.18): một kết nối LISTEN, phát lại cho các máy đang mở app qua SSE.
// - Gói tin chỉ có loại sự kiện, cơ sở, ngày; không dữ liệu cá nhân.
// - Lọc theo quyền đọc từ DB (nạp lại mỗi phút), không theo tham số máy gửi lên [P12].
// - Tối đa 5 kết nối mỗi người [P25]; phiên bị thu hồi thì đóng kết nối [P1].
import { loadSession } from '../auth/session'
import { getSql } from '../db/client'

export const MAX_CONNECTIONS_PER_USER = 5
const RECHECK_MS = 60_000
const HEARTBEAT_MS = 25_000

type Client = {
  id: number
  userId: string
  sessionId: string
  token: string
  branchIds: Set<string>
  openedAt: number
  send: (event: string, data: unknown) => void
  close: () => void
}

type HubState = {
  clients: Map<number, Client>
  seq: number
  listening: Promise<void> | null
  timer: ReturnType<typeof setInterval> | null
}

const g = globalThis as unknown as { __lindyHub?: HubState }
g.__lindyHub ??= { clients: new Map(), seq: 0, listening: null, timer: null }
const state: HubState = g.__lindyHub

type LiveMessage =
  | { kind: 'appointments'; branchId: string; dates?: string[] }
  | { kind: 'orders'; branchId: string; dates?: string[] }
  | { kind: 'notifications'; branchId?: string; userIds: string[] }
  | { kind: 'sessions_revoked'; sessionIds: string[]; userIds: string[] }

export function dispatch(msg: LiveMessage) {
  for (const c of state.clients.values()) {
    if (msg.kind === 'appointments' || msg.kind === 'orders') {
      // Chỉ báo "có thay đổi" (loại, cơ sở, ngày); máy tải lại qua API, server lọc theo K09.
      if (c.branchIds.has(msg.branchId)) c.send(msg.kind, { branchId: msg.branchId, dates: msg.dates ?? [] })
    } else if (msg.kind === 'notifications') {
      if (msg.userIds.includes(c.userId)) c.send('notifications', {})
    } else if (msg.kind === 'sessions_revoked') {
      if (msg.sessionIds.includes(c.sessionId)) c.close()
    }
  }
}

async function ensureListening() {
  if (!state.listening) {
    state.listening = getSql()
      .listen('lindy_events', (payload) => {
        try {
          dispatch(JSON.parse(payload) as LiveMessage)
        } catch {
          // gói tin hỏng — bỏ qua
        }
      })
      .then(() => undefined)
      .catch((e) => {
        state.listening = null
        console.error('[hub] LISTEN lỗi:', (e as Error).message)
      })
  }
  await state.listening
  if (!state.timer) {
    state.timer = setInterval(() => void recheckAll(), RECHECK_MS)
    state.timer.unref?.()
  }
}

/** Nạp lại quyền mỗi phút; phiên hết hiệu lực thì đóng. */
async function recheckAll() {
  for (const c of [...state.clients.values()]) {
    try {
      const s = await loadSession(c.token)
      if (!s || s.sessionId !== c.sessionId) c.close()
      else
        c.branchIds = new Set(
          s.branches.filter((b) => b.perms.includes('appointments.read_branch')).map((b) => b.id),
        )
    } catch {
      // lỗi DB tạm thời — giữ kết nối, lần sau kiểm lại
    }
  }
}

export function connectionCount(userId?: string) {
  return [...state.clients.values()].filter((c) => !userId || c.userId === userId).length
}

/** Mở kết nối SSE cho một phiên đã kiểm. */
export async function openStream(input: {
  token: string
  userId: string
  sessionId: string
  branchIds: string[]
  signal?: AbortSignal
}): Promise<ReadableStream<Uint8Array>> {
  await ensureListening()
  const encoder = new TextEncoder()
  const id = ++state.seq
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    state.clients.delete(id)
    try {
      controllerRef?.close()
    } catch {
      // đã đóng
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      const write = (text: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          cleanup()
        }
      }
      const client: Client = {
        id,
        userId: input.userId,
        sessionId: input.sessionId,
        token: input.token,
        branchIds: new Set(input.branchIds),
        openedAt: Date.now(),
        send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        close: cleanup,
      }
      // Quá 5 kết nối của cùng người → đóng kết nối cũ nhất.
      const mine = [...state.clients.values()]
        .filter((c) => c.userId === input.userId)
        .sort((a, b) => a.openedAt - b.openedAt)
      while (mine.length >= MAX_CONNECTIONS_PER_USER) mine.shift()?.close()
      state.clients.set(id, client)
      write('retry: 3000\n\n')
      client.send('ready', {})
      heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS)
      heartbeat.unref?.()
      input.signal?.addEventListener('abort', cleanup)
    },
    cancel: cleanup,
  })
  return stream
}
