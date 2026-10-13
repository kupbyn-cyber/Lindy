// Sinh src/server/ops/catalog-data.ts từ data/services.csv, data/combos.csv (bước 2.2). Không sửa tay file sinh ra.
// Dữ liệu nằm trong mã nguồn để bản build trên hosting nạp được danh mục mà không cần thư mục data/.
//   bun scripts/gen-catalog.ts
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

/** CSV đơn giản: phân cách bằng dấu phẩy, ô có dấu phẩy đặt trong "", "" là một dấu ". */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/\r\n/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ''))
  return body.map((r) => Object.fromEntries(header!.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const UNITS = new Set(['lần', 'ngón', 'hình', 'cái'])

const services = parseCsv(readFileSync(join(root, 'data/services.csv'), 'utf8')).map((r, i) => {
  if (!UNITS.has(r.unit!)) throw new Error(`Đơn vị lạ ở ${r.code}: ${r.unit}`)
  if (r.price_mode !== 'list' && r.price_mode !== 'custom') throw new Error(`Kiểu giá lạ ở ${r.code}`)
  const min = Number(r.price_min)
  const max = Number(r.price_max)
  if (!Number.isInteger(min) || !Number.isInteger(max) || min <= 0 || max < min)
    throw new Error(`Giá sai ở ${r.code}`)
  // C12: dịch vụ có cứng móng bảo hành 7 ngày; data ghi warranty_days = 7 cho đúng các dòng này.
  const hasHardening = Number(r.warranty_days) === 7
  return {
    code: r.code!,
    category: r.category!,
    name: r.name!,
    priceMode: r.price_mode as 'list' | 'custom',
    unit: r.unit!,
    priceMin: min,
    priceMax: max,
    hasHardening,
    sortOrder: (i + 1) * 10,
  }
})

const codes = new Set(services.map((s) => s.code))
const combos = parseCsv(readFileSync(join(root, 'data/combos.csv'), 'utf8')).map((r, i) => {
  const items = r.items!.split('+').map((x) => x.trim())
  for (const c of items) if (!codes.has(c)) throw new Error(`Combo ${r.code} có mã lạ ${c}`)
  const price = Number(r.price)
  if (!Number.isInteger(price) || price <= 0) throw new Error(`Giá combo sai ở ${r.code}`)
  return { code: r.code!, name: r.name!, groupName: r.group!, price, items, sortOrder: (i + 1) * 10 }
})

const out = `// Sinh từ data/services.csv và data/combos.csv bằng \`bun scripts/gen-catalog.ts\`. Không sửa tay.
// Danh mục ban đầu (PRD §6.8). Chỉ nạp khi DB chưa có mã đó; giá Linh sửa trong app không bị ghi đè.

export type SeedService = {
  code: string
  category: string
  name: string
  priceMode: 'list' | 'custom'
  unit: string
  priceMin: number
  priceMax: number
  hasHardening: boolean
  sortOrder: number
}

export type SeedCombo = {
  code: string
  name: string
  groupName: string
  price: number
  items: string[]
  sortOrder: number
}

export const SEED_SERVICES: SeedService[] = ${JSON.stringify(services, null, 2)}

export const SEED_COMBOS: SeedCombo[] = ${JSON.stringify(combos, null, 2)}
`

const target = join(root, 'src/server/ops/catalog-data.ts')
writeFileSync(target, out)
spawnSync('bunx', ['biome', 'format', '--write', target], { stdio: 'ignore', shell: true })
console.log(`Đã sinh catalog-data.ts: ${services.length} dịch vụ, ${combos.length} combo.`)
