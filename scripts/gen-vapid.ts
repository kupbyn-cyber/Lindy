// Sinh khoá VAPID riêng cho LINDY vào .env (bước 0.17). Đã có thì giữ nguyên. Không in khoá ra màn hình [P14].
import webpush from 'web-push'
import { loadEnv, upsertEnv } from './lib/env'

loadEnv()
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  console.log('Khoá VAPID đã có trong .env, giữ nguyên.')
} else {
  const keys = webpush.generateVAPIDKeys()
  upsertEnv({
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    // Thay bằng email liên hệ thật của quán trước khi chạy thật (Apple, Google dùng để liên hệ khi có sự cố).
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? 'mailto:admin@lindy-os.invalid',
  })
}
