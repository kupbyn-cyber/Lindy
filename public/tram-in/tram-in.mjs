#!/usr/bin/env node
// Trạm in LINDY (Đợt 7): chạy trên MacBook ở quán, hỏi app mỗi 2 giây có bill cần in không; có thì vẽ bill thành ảnh
// (phông Be Vietnam Pro, chữ LINDY có chân — chữ có dấu không lỗi), đổi sang lệnh in ảnh ESC/POS, gửi tới máy in:
//   tcp://192.168.1.50:9100   máy in nối dây mạng / WiFi (cổng 9100)
//   cups://Ten_May_In         máy in cắm USB đã thêm vào macOS (in thô, không qua driver)
//   file:///dev/cu.Printer    máy in bluetooth đã ghép đôi với MacBook (cổng nối tiếp)
// Lệnh: node tram-in.mjs [run | setup --server … --token … --printer … | find | sample --printer …]
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const CONFIG = join(DIR, 'config.json')
const SANS = 'Be Vietnam Pro'
const SERIF = 'Cormorant Garamond'
const log = (...a) => console.log(new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- Vẽ bill (SVG)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const vnd = (n) => `${n < 0 ? '−' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

/** Ngắt chữ theo từ cho vừa `max` ký tự (ước lượng bề rộng chữ, đủ cho bill) */
function wrap(text, max) {
  const out = []
  let cur = ''
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= max || !cur) cur = next
    else {
      out.push(cur)
      cur = w
    }
  }
  if (cur) out.push(cur)
  return out.length ? out : ['']
}

/** Bill → SVG trắng đen rộng `W` điểm (576 = khổ 80mm, 384 = khổ 58mm) */
export function billSvg(bill, W = 576) {
  const k = W / 576
  const pad = Math.round(16 * k)
  const rows = []
  const sz = (n) => Math.round(n * k)
  // Số ký tự vừa một dòng ở cỡ chữ `size` (Be Vietnam Pro trung bình ~0.56 em)
  const fit = (size, width = W - 2 * pad) => Math.max(8, Math.floor(width / (size * 0.56)))

  const center = (text, size, o = {}) => {
    for (const line of o.nowrap ? [text] : wrap(text, fit(size))) rows.push({ t: 'center', text: line, size, ...o })
  }
  const pair = (left, right, size, weight = 400) => {
    const rightW = String(right).length * size * 0.6 + sz(16)
    const lines = wrap(left, fit(size, W - 2 * pad - rightW))
    lines.forEach((l, i) => rows.push({ t: 'pair', left: l, right: i === 0 ? right : '', size, weight }))
  }
  const rule = (dashed = false) => rows.push({ t: 'rule', dashed })
  const gap = (h) => rows.push({ t: 'gap', h })

  center('LINDY', sz(64), { weight: 600, font: SERIF, spacing: sz(10), nowrap: true })
  center('NAIL STUDIO', sz(20), { weight: 500, spacing: sz(6), nowrap: true })
  if (bill.shopLines?.length) {
    gap(sz(6))
    for (const l of bill.shopLines) center(l, sz(20))
  }
  gap(sz(8))
  rule()
  center(bill.title, sz(28), { weight: 700 })
  center(bill.time, sz(22))
  gap(sz(4))
  if (bill.customer) pair(`Khách: ${bill.customer}`, '', sz(22))
  if (bill.staff) pair(`Thợ: ${bill.staff}`, '', sz(22))
  rule(true)
  for (const it of bill.items ?? []) {
    pair(it.name, vnd(it.amount), sz(24), 600)
    if (it.detail) pair(`   ${it.detail}`, '', sz(20))
  }
  rule(true)
  if (bill.discounts?.length) {
    pair('Tạm tính', vnd(bill.subtotal), sz(22))
    for (const d of bill.discounts) pair(d.label, vnd(-d.amount), sz(22))
    rule()
  }
  pair('TỔNG', `${vnd(bill.total)}đ`, sz(34), 700)
  for (const p of bill.paid ?? []) pair(`Đã thu · ${p.label}`, `${vnd(p.amount)}đ`, sz(22))
  pair('Còn lại', `${vnd(bill.due)}đ`, sz(22), bill.due > 0 ? 700 : 400)
  rule()
  if (bill.warrantyUntil) center(`Bảo hành đến ${bill.warrantyUntil}`, sz(22), { weight: 600 })
  if (bill.thanks?.length) {
    gap(sz(6))
    for (const l of bill.thanks) center(l, sz(22))
  }

  let y = pad
  const parts = []
  const text = (x, base, s, anchor, r, body) =>
    parts.push(
      `<text x="${x}" y="${base}" text-anchor="${anchor}" font-family="${r.font ?? SANS}" font-size="${s}" font-weight="${r.weight ?? 400}" letter-spacing="${r.spacing ?? 0}" xml:space="preserve">${esc(body)}</text>`,
    )
  for (const r of rows) {
    if (r.t === 'gap') {
      y += r.h
      continue
    }
    if (r.t === 'rule') {
      y += sz(10)
      parts.push(
        `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="#000" stroke-width="2"${r.dashed ? ' stroke-dasharray="6 6"' : ''}/>`,
      )
      y += sz(14)
      continue
    }
    y += Math.round(r.size * 1.35)
    const base = y - Math.round(r.size * 0.3)
    if (r.t === 'center') text(W / 2, base, r.size, 'middle', r, r.text)
    else {
      text(pad, base, r.size, 'start', r, r.left)
      if (r.right) text(W - pad, base, r.size, 'end', r, r.right)
    }
  }
  y += pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${parts.join('')}</g></svg>`
}

// ---------------------------------------------------------------- Ảnh → lệnh in ESC/POS

/** Ảnh RGBA (rộng chia hết cho 8) → lệnh ESC/POS in ảnh (GS v 0) từng dải 255 dòng, đẩy giấy, cắt */
export function toEscPos({ width, height, pixels }) {
  if (width % 8) throw new Error('Bề rộng ảnh phải chia hết cho 8.')
  const bpr = width / 8
  const out = [Buffer.from([0x1b, 0x40])]
  for (let y0 = 0; y0 < height; y0 += 255) {
    const h = Math.min(255, height - y0)
    const data = Buffer.alloc(bpr * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        const i = ((y0 + y) * width + x) * 4
        const a = pixels[i + 3] / 255
        const lum = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) * a + 255 * (1 - a)
        if (lum < 140) data[y * bpr + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    out.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8]), data)
  }
  out.push(Buffer.from([0x1b, 0x64, 0x04]), Buffer.from([0x1d, 0x56, 0x42, 0x00]))
  return Buffer.concat(out)
}

/** Bill → ảnh RGBA bằng resvg (phông đóng kèm trong thư mục fonts) */
export async function renderBill(bill, width = 576, fontDir = join(DIR, 'fonts')) {
  const { Resvg } = await import('@resvg/resvg-js')
  const fontFiles = [
    'BeVietnamPro-Regular.ttf',
    'BeVietnamPro-SemiBold.ttf',
    'BeVietnamPro-Bold.ttf',
    'CormorantGaramond-SemiBold.ttf',
  ].map((f) => join(fontDir, f))
  const img = new Resvg(billSvg(bill, width), {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: SANS },
  }).render()
  return { width: img.width, height: img.height, pixels: img.pixels }
}

// ---------------------------------------------------------------- Gửi tới máy in

export function parsePrinter(url) {
  const m = /^(tcp|cups|file):\/\/(.+)$/.exec(String(url ?? '').trim())
  if (!m) throw new Error('Máy in phải dạng tcp://IP:9100, cups://Ten_May_In hoặc file:///dev/cu.Ten')
  if (m[1] === 'tcp') {
    const [host, port] = m[2].split(':')
    return { type: 'tcp', host, port: Number(port || 9100) }
  }
  return m[1] === 'cups' ? { type: 'cups', queue: m[2] } : { type: 'file', path: m[2] }
}

export function sendToPrinter(printer, buf, timeoutMs = 15000) {
  const p = typeof printer === 'string' ? parsePrinter(printer) : printer
  if (p.type === 'tcp')
    return new Promise((resolve, reject) => {
      const s = connect({ host: p.host, port: p.port })
      const timer = setTimeout(() => {
        s.destroy()
        reject(new Error(`Máy in ${p.host}:${p.port} không phản hồi.`))
      }, timeoutMs)
      s.on('error', (e) => {
        clearTimeout(timer)
        reject(new Error(`Không nối được máy in ${p.host}:${p.port} (${e.code ?? e.message}).`))
      })
      s.on('connect', () => s.end(buf))
      s.on('close', (hadError) => {
        clearTimeout(timer)
        if (!hadError) resolve()
      })
    })
  if (p.type === 'cups')
    return (async () => {
      const f = join(tmpdir(), `lindy-bill-${Date.now()}.bin`)
      await writeFile(f, buf)
      await new Promise((resolve, reject) =>
        execFile('lp', ['-d', p.queue, '-o', 'raw', f], (e) =>
          e ? reject(new Error(`In qua ${p.queue} lỗi: ${e.message}`)) : resolve(),
        ),
      )
    })()
  return writeFile(p.path, buf)
}

// ---------------------------------------------------------------- Chạy

function readConfig() {
  if (!existsSync(CONFIG)) throw new Error('Chưa cài đặt. Chạy: node tram-in.mjs setup --server … --token … --printer …')
  return JSON.parse(readFileSync(CONFIG, 'utf8'))
}

export async function pollOnce(cfg, f = fetch) {
  const auth = { authorization: `Bearer ${cfg.token}` }
  const r = await f(`${cfg.server}/api/print/agent/next`, { headers: auth })
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Mã kết nối sai hoặc đã bị thu hồi.'), { auth: true })
  if (!r.ok) throw new Error(`App trả lỗi ${r.status}.`)
  const { job } = await r.json()
  if (!job) return null
  let ok = true
  let error = null
  try {
    const img = await renderBill(job.bill, job.paperWidth)
    await sendToPrinter(cfg.printer, toEscPos(img))
  } catch (e) {
    ok = false
    error = String(e?.message ?? e).slice(0, 300)
  }
  await f(`${cfg.server}/api/print/agent/finish`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ jobId: job.id, ok, error }),
  })
  return { id: job.id, ok, error }
}

async function run() {
  const cfg = readConfig()
  log(`Trạm in LINDY đang chạy · app ${cfg.server} · máy in ${cfg.printer}`)
  let wait = 2000
  for (;;) {
    try {
      const r = await pollOnce(cfg)
      if (r) {
        log(r.ok ? 'Đã in bill.' : `Lỗi in: ${r.error}`)
        continue
      }
      wait = 2000
    } catch (e) {
      log(e.message)
      wait = e.auth ? 60000 : Math.min(wait * 2, 30000)
    }
    await sleep(wait)
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

function setup() {
  const server = (arg('server') ?? '').replace(/\/+$/, '')
  const token = arg('token') ?? ''
  const printer = arg('printer') ?? ''
  if (!/^https?:\/\//.test(server)) throw new Error('Thiếu --server (địa chỉ app, ví dụ https://lindy.n2.tinhgon.xyz).')
  if (!/^[\w-]{20,100}$/.test(token)) throw new Error('Thiếu hoặc sai --token (mã kết nối tạo ở Thêm → Máy in bill).')
  parsePrinter(printer)
  writeFileSync(CONFIG, JSON.stringify({ server, token, printer }, null, 2))
  // Tự chạy khi mở máy, tự bật lại nếu tắt; caffeinate giữ máy không ngủ khi cắm sạc
  const plistDir = join(homedir(), 'Library', 'LaunchAgents')
  mkdirSync(plistDir, { recursive: true })
  const plist = join(plistDir, 'vn.lindy.tramin.plist')
  const x = (s) => esc(s)
  writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>vn.lindy.tramin</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-is</string>
    <string>${x(process.execPath)}</string><string>${x(join(DIR, 'tram-in.mjs'))}</string><string>run</string>
  </array>
  <key>WorkingDirectory</key><string>${x(DIR)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${x(join(DIR, 'tram-in.log'))}</string>
  <key>StandardErrorPath</key><string>${x(join(DIR, 'tram-in.log'))}</string>
</dict></plist>
`,
  )
  execFile('launchctl', ['unload', plist], () =>
    execFile('launchctl', ['load', '-w', plist], (e) => {
      if (e) console.error('Không bật được tự chạy:', e.message)
      else console.log(`Đã cài trạm in. Nhật ký: ${join(DIR, 'tram-in.log')}`)
    }),
  )
}

function find() {
  console.log('Máy in đã thêm vào macOS (dùng cups://Tên):')
  execFile('lpstat', ['-p'], (_e, out) => {
    console.log(out?.trim() || '  (chưa có)')
    execFile('/bin/sh', ['-c', 'ls /dev/cu.* 2>/dev/null'], (_e2, out2) => {
      console.log('\nCổng nối tiếp / bluetooth (dùng file:///dev/cu.Tên):')
      console.log(out2?.trim() || '  (chưa có)')
      console.log('\nMáy in dây mạng / WiFi: in trang tự kiểm tra của máy in để xem IP, dùng tcp://IP:9100')
    })
  })
}

async function sample() {
  const printer = arg('printer') ?? readConfig().printer
  const bill = {
    v: 1,
    kind: 'test',
    shopLines: ['Trạm in LINDY'],
    title: 'IN THỬ TỪ MACBOOK',
    time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    customer: 'Khách thử',
    staff: 'Thợ thử',
    items: [{ name: 'Sơn gel trơn', detail: null, amount: 80000 }],
    subtotal: 80000,
    discounts: [],
    total: 80000,
    paid: [{ label: 'Tiền mặt', amount: 80000 }],
    due: 0,
    warrantyUntil: null,
    thanks: ['Máy in chạy tốt!'],
  }
  await sendToPrinter(printer, toEscPos(await renderBill(bill, Number(arg('width') ?? 576))))
  console.log('Đã gửi bill thử tới', printer)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2] ?? 'run'
  const go = { run, setup, find, sample }[cmd]
  if (!go) {
    console.error('Lệnh: run | setup --server … --token … --printer … | find | sample --printer …')
    process.exit(1)
  }
  Promise.resolve()
    .then(go)
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
