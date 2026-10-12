// Cài đặt lịch mặc định cho mỗi cơ sở: 09:00–21:00 (Q25), 120 phút (B09), sức chứa để trống (B11).
import type postgres from 'postgres'

export async function seedBooking(sql: postgres.Sql, branchIds: Record<string, string>) {
  const [t] = await sql<
    { exists: boolean }[]
  >`select to_regclass('public.branch_booking_settings') is not null as exists`
  if (!t?.exists) return
  for (const id of Object.values(branchIds)) {
    await sql`
      insert into branch_booking_settings (branch_id, open_time, close_time, default_duration_min)
      values (${id}, '09:00', '21:00', 120)
      on conflict (branch_id) do nothing`
  }
}
