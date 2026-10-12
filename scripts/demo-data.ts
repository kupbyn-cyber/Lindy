// Dữ liệu demo cho DB dev (bước 1.19): lịch mẫu tuần này, SĐT giả 0900000xxx. Chỉ chạy trên DB localhost _dev.
//   bun scripts/demo-data.ts
import { createHash, randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { foldVietnamese } from '../src/lib/text'
import { addDays, fromLocal, toLocalDate } from '../src/lib/time'
import { assertDisposableDb } from './lib/db-guard'
import { loadEnv, requireEnv } from './lib/env'

loadEnv()
const url = requireEnv('MIGRATE_DATABASE_URL')
assertDisposableDb(url, ['_dev'])
const sql = postgres(url, { onnotice: () => {}, max: 1, transform: postgres.camel })

type Demo = [
  dayOffset: number,
  start: string,
  end: string,
  name: string,
  guests: number,
  service: string | null,
  by: string,
  confirm: boolean,
  phone?: string,
]

const DEMO: Demo[] = [
  [0, '09:00', '11:00', 'Mai Anh', 1, 'sơn gel tay', 'trang', false, '0900000001'],
  [0, '10:00', '11:30', 'Hà Linh', 2, 'tay + chân', 'chin', true, '0900000002'],
  [0, '10:00', '12:00', 'Nhóm 3 khách', 3, 'đắp gel', 'nhung', true],
  [0, '10:30', '11:30', 'Thu Trang', 1, 'uốn mi', 'trang', false],
  [0, '11:00', '13:00', 'Khách', 1, null, 'linh', true],
  [0, '14:00', '16:00', 'Phương', 1, 'nhặt da + sơn', 'chin', false, '0900000003'],
  [0, '20:30', '22:00', 'Ngọc', 1, 'phá móng', 'nhung', true],
  [1, '09:30', '11:30', 'Lan', 1, 'sơn gel tay', 'trang', false],
  [1, '13:00', '15:00', 'Hồng Nhung', 2, 'combo 139k', 'nhung', true],
  [2, '15:00', '17:00', 'Thảo', 1, 'mi', 'chin', true],
  [3, '10:00', '12:00', 'Vy', 1, 'móng giả', 'trang', false],
  [5, '18:00', '20:00', 'Quỳnh', 4, 'nhóm 4 người', 'linh', true],
]

try {
  const users = new Map(
    (
      await sql<{ id: string; email: string }[]>`select id, email from users where email like '%@lindy.test'`
    ).map((u) => [u.email.split('@')[0]!, u.id]),
  )
  const [branch] = await sql<
    { id: string; timezone: string }[]
  >`select id, timezone from branches where code = 'HTK'`
  const today = toLocalDate(new Date())
  let n = 0
  for (const [off, s, e, name, guests, service, by, confirm, phone] of DEMO) {
    const date = addDays(today, off)
    const uid = users.get(by)!
    await sql`
      insert into appointments (branch_id, customer_display_name, phone, start_at, end_at, guest_count, service_summary,
                                status, search_norm, created_by, updated_by, create_request_id, create_request_hash)
      values (${branch!.id}, ${name}, ${phone ?? null}, ${fromLocal(date, s, branch!.timezone)}, ${fromLocal(date, e, branch!.timezone)},
              ${guests}, ${service}, ${confirm ? 'confirmed' : 'pending'},
              ${foldVietnamese([name, phone ?? '', service ?? ''].join(' '))}, ${uid}, ${uid}, ${randomUUID()},
              ${createHash('sha256').update(randomUUID()).digest('hex')})`
    n++
  }
  console.log(`Đã tạo ${n} lịch demo từ hôm nay đến 5 ngày tới.`)
} finally {
  await sql.end()
}
