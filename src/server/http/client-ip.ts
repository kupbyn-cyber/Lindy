// IP người dùng cho chống dò mật khẩu theo IP (login).
// Sau proxy (TRUST_PROXY=1) lấy phần tử CUỐI của X-Forwarded-For: proxy Vibe Host thêm IP thật vào cuối,
// còn phần đầu do trình duyệt tự khai, tin vào đó thì kẻ xấu né được khoá theo IP hoặc khoá oan IP của quán
// (như clientIp của CEN WORK). Không có proxy thì dùng địa chỉ kết nối.
export function clientIp(headers: Headers, trustProxy: boolean, socketIp: string | undefined): string {
  if (trustProxy) {
    const parts = (headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const last = parts.at(-1)
    if (last) return last
  }
  return socketIp || 'unknown'
}
