// Tiến trình nền chạy trong server (bật bằng RUN_WORKER, mặc định bật): gửi push, việc định kỳ.
// Chỉ khởi động một lần mỗi tiến trình; an toàn khi chạy nhiều tiến trình nhờ FOR UPDATE SKIP LOCKED và dedupe_key.
import { notifyOverdue } from './appointments/overdue'
import { getSql } from './db/client'
import { env } from './env'
import { processDueDeliveries } from './notifications/push'

type WorkerState = { started: boolean; running: boolean; again: boolean; jobs: (() => Promise<void>)[] }
const g = globalThis as unknown as { __lindyWorker?: WorkerState }
g.__lindyWorker ??= { started: false, running: false, again: false, jobs: [] }
const state: WorkerState = g.__lindyWorker

const PUSH_INTERVAL_MS = 30_000
const PERIODIC_INTERVAL_MS = 60_000

/** Việc định kỳ khác (ví dụ báo lịch quá giờ) đăng ký ở đây. */
export function registerPeriodicJob(job: () => Promise<void>) {
  state.jobs.push(job)
}

async function pushTick() {
  if (state.running) {
    state.again = true
    return
  }
  state.running = true
  try {
    do {
      state.again = false
      await processDueDeliveries()
    } while (state.again)
  } catch (e) {
    console.error('[worker] gửi push lỗi:', (e as Error).message)
  } finally {
    state.running = false
  }
}

export function ensureWorker() {
  if (state.started) return
  if (env('RUN_WORKER') === '0') return
  state.started = true
  state.jobs.push(async () => {
    await notifyOverdue()
  })
  void getSql()
    .listen('lindy_push', () => void pushTick())
    .catch((e) => console.error('[worker] LISTEN lỗi:', (e as Error).message))
  setInterval(() => void pushTick(), PUSH_INTERVAL_MS).unref?.()
  setInterval(() => {
    for (const job of state.jobs) {
      job().catch((e) => console.error('[worker] việc định kỳ lỗi:', (e as Error).message))
    }
  }, PERIODIC_INTERVAL_MS).unref?.()
  void pushTick()
}
