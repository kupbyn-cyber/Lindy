// Chặn xoá nhầm DB thật [P15]: chỉ cho phép host localhost và tên DB kết thúc _dev hoặc _test.
export function assertDisposableDb(urlString: string, allowedSuffixes: string[] = ['_dev', '_test']) {
  const url = new URL(urlString)
  const db = url.pathname.replace(/^\//, '')
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (!localHosts.has(url.hostname)) {
    throw new Error(`Từ chối: DB ${db} không ở localhost (${url.hostname}).`)
  }
  if (!allowedSuffixes.some((s) => db.endsWith(s))) {
    throw new Error(`Từ chối: tên DB "${db}" không kết thúc bằng ${allowedSuffixes.join(' hoặc ')}.`)
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Từ chối: NODE_ENV=production.')
  }
  return db
}
