// Chuẩn bị DB trước khi bật server trong container (Dockerfile), như entrypoint của CEN WORK:
// tạo role, chạy migration, dữ liệu nền, tài khoản Chủ đầu tiên. Lỗi thì thoát mã 1 → container không lên
// → Vibe Host giữ bản đang chạy, không đưa bản lỗi ra; lỗi hiện trong nhật ký triển khai. Không in bí mật.
// Dockerfile đóng gói file này thành release.mjs (bun build --target=node), ảnh chạy không cần node_modules.
import { classifyReleaseError, prepareDatabase, releaseStatus } from '../src/server/ops/release'

try {
  await prepareDatabase(true)
  const s = releaseStatus()
  if (s.missingEnv.length > 0) console.warn(`[release] Thiếu biến: ${s.missingEnv.join(', ')}`)
  if (s.badEnv.length > 0) console.warn(`[release] Biến sai dạng: ${s.badEnv.join(', ')}`)
  if (s.hasAccounts === false) {
    console.warn(
      '[release] DB chưa có tài khoản nào: đặt INITIAL_OWNER_NAME, INITIAL_OWNER_PHONE, INITIAL_OWNER_PASSWORD.',
    )
  }
  process.exit(0)
} catch (e) {
  const p = classifyReleaseError(e)
  console.error(`[release] Lỗi ${p.code}: ${p.text}`)
  process.exit(1)
}
