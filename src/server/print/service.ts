// In bill qua trạm in (Đợt 7; S36–S38). Người xem được đơn bấm In bill → lưu lệnh in kèm nội dung bill lúc bấm
// (app.print_job_create kiểm quyền lại). Trạm in ở quán (MacBook) dùng mã kết nối hỏi lệnh (app.print_agent_next),
// in xong báo kết quả (app.print_agent_finish). Linh (print.manage): thông tin trên bill, mã kết nối, in thử.
import { createHash, randomBytes } from 'node:crypto'
import { type BillSettings, buildBill, testBill } from '~/lib/bill'
import { toLocalDate, toLocalTime } from '~/lib/time'
import type { Auth } from '../auth/context'
import { hasPerm, requireBranch } from '../auth/context'
import { type Tx, withUser, withWorker } from '../db/client'
import { forbidden, notFound } from '../http/errors'
import { detailOf, loadRow } from '../orders/service'

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

/** Mã kết nối trạm in chỉ lưu dạng băm SHA-256 */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

type Settings = BillSettings & { paperWidth: 384 | 576 }

async function settingsOf(tx: Tx, branchId: string): Promise<Settings> {
  const [s] = await tx<{ infoLines: string; thanks: string; paperWidth: number }[]>`
    select info_lines, thanks, paper_width from print_settings where branch_id = ${branchId}`
  return {
    infoLines: s?.infoLines ?? '',
    thanks: s?.thanks ?? 'Cảm ơn bạn đã chọn LINDY.\nHẹn gặp lại bạn lần sau!',
    paperWidth: s?.paperWidth === 384 ? 384 : 576,
  }
}

async function nowAt(tx: Tx, branchId: string) {
  const [b] = await tx<{ timezone: string }[]>`select timezone from branches where id = ${branchId}`
  const now = new Date()
  return { date: toLocalDate(now, b?.timezone), time: toLocalTime(now, b?.timezone) }
}

export type PrintJobView = {
  id: string
  status: 'queued' | 'printing' | 'printed' | 'failed' | 'expired'
  error: string | null
  requestedAt: string
  finishedAt: string | null
}

async function jobView(tx: Tx, id: string): Promise<PrintJobView> {
  const [j] = await tx<
    {
      id: string
      status: PrintJobView['status']
      error: string | null
      requestedAt: Date
      finishedAt: Date | null
    }[]
  >`select id, status, error, requested_at, finished_at from print_jobs where id = ${id}`
  if (!j) throw notFound('Không tìm thấy lệnh in.')
  return {
    id: j.id,
    status: j.status,
    error: j.error,
    requestedAt: new Date(j.requestedAt).toISOString(),
    finishedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null,
  }
}

// ---------------------------------------------------------------- Nhân viên: in bill, xem trạng thái

export async function printBill(auth: Auth, orderId: string, input: { idempotencyKey: string }) {
  if (!isUuid(orderId)) throw notFound('Không tìm thấy đơn.')
  return withUser(auth.userId, async (tx) => {
    const row = await loadRow(tx, orderId)
    const d = await detailOf(tx, auth, row)
    const bill = buildBill(d, await settingsOf(tx, row.branchId), await nowAt(tx, row.branchId))
    const [r] = await tx<{ id: string }[]>`
      select app.print_job_create(${row.branchId}::uuid, ${orderId}::uuid, 'bill', ${tx.json(bill)},
                                  ${input.idempotencyKey}::uuid) as id`
    return jobView(tx, r!.id)
  })
}

export async function jobStatus(auth: Auth, id: string) {
  if (!isUuid(id)) throw notFound('Không tìm thấy lệnh in.')
  return withUser(auth.userId, (tx) => jobView(tx, id))
}

// ---------------------------------------------------------------- Linh: cài đặt máy in bill

function requireManager(auth: Auth, branchId?: string) {
  const branch = requireBranch(auth, branchId)
  if (!hasPerm(auth, branch.id, 'print.manage')) throw forbidden('Chỉ chủ quán cài đặt máy in bill.')
  return branch
}

export async function printSetup(auth: Auth, input: { branchId?: string } = {}) {
  const branch = requireManager(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const stations = await tx<
      { id: string; name: string; createdAt: Date; revokedAt: Date | null; lastSeenAt: Date | null }[]
    >`
      select id, name, created_at, revoked_at, last_seen_at from print_stations
      where branch_id = ${branch.id} order by created_at desc limit 20`
    const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
    return {
      branchId: branch.id,
      settings: await settingsOf(tx, branch.id),
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        createdAt: iso(s.createdAt)!,
        revokedAt: iso(s.revokedAt),
        lastSeenAt: iso(s.lastSeenAt),
      })),
    }
  })
}

export async function savePrintSettings(
  auth: Auth,
  input: { branchId?: string; infoLines: string; thanks: string; paperWidth: 384 | 576 },
) {
  const branch = requireManager(auth, input.branchId)
  await withUser(auth.userId, async (tx) => {
    await tx`
      select app.print_settings_save(${branch.id}::uuid, ${input.infoLines}::text, ${input.thanks}::text,
                                     ${input.paperWidth}::int)`
  })
  return printSetup(auth, { branchId: branch.id })
}

/** Tạo mã kết nối cho trạm in mới. Mã chỉ trả về một lần (DB lưu dạng băm). */
export async function createStation(auth: Auth, input: { branchId?: string; name: string }) {
  const branch = requireManager(auth, input.branchId)
  const token = randomBytes(24).toString('base64url')
  const [r] = await withUser(
    auth.userId,
    (tx) => tx<{ id: string }[]>`
      select app.print_station_create(${branch.id}::uuid, ${input.name}::text, ${hashToken(token)}::text) as id`,
  )
  return { id: r!.id, token, setup: await printSetup(auth, { branchId: branch.id }) }
}

export async function revokeStation(auth: Auth, input: { stationId: string }) {
  if (!isUuid(input.stationId)) throw notFound('Không tìm thấy trạm in.')
  const branchId = await withUser(auth.userId, async (tx) => {
    // RLS: chỉ người có print.manage ở cơ sở của trạm thấy trạm; hàm DB kiểm quyền lại
    const [s] = await tx<
      { branchId: string }[]
    >`select branch_id from print_stations where id = ${input.stationId}`
    if (!s) throw notFound('Không tìm thấy trạm in.')
    requireManager(auth, s.branchId)
    await tx`select app.print_station_revoke(${input.stationId}::uuid)`
    return s.branchId
  })
  return printSetup(auth, { branchId })
}

export async function printTest(auth: Auth, input: { branchId?: string; idempotencyKey: string }) {
  const branch = requireManager(auth, input.branchId)
  return withUser(auth.userId, async (tx) => {
    const bill = testBill(await settingsOf(tx, branch.id), await nowAt(tx, branch.id))
    const [r] = await tx<{ id: string }[]>`
      select app.print_job_create(${branch.id}::uuid, null, 'test', ${tx.json(bill)},
                                  ${input.idempotencyKey}::uuid) as id`
    return jobView(tx, r!.id)
  })
}

// ---------------------------------------------------------------- Trạm in (mã kết nối, không có phiên đăng nhập)

export async function agentNext(token: string) {
  const [j] = await withWorker(
    (tx) => tx<{ jobId: string; kind: string; payload: unknown; paperWidth: number }[]>`
      select * from app.print_agent_next(${hashToken(token)}::text)`,
  )
  return j ? { job: { id: j.jobId, kind: j.kind, bill: j.payload, paperWidth: j.paperWidth } } : { job: null }
}

export async function agentFinish(
  token: string,
  input: { jobId: string; ok: boolean; error?: string | null },
) {
  await withWorker(async (tx) => {
    await tx`
      select app.print_agent_finish(${hashToken(token)}::text, ${input.jobId}::uuid, ${input.ok},
                                    ${input.error ?? null}::text)`
  })
  return { ok: true }
}
