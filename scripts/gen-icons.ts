// Sinh icon PNG cho PWA từ design/design-system/assets/Brand/lindy-os-app-icon.svg (bước 0.15).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = process.cwd()
const svg = readFileSync(join(root, 'design/design-system/assets/Brand/lindy-os-app-icon.svg'), 'utf8')
const out = join(root, 'public/icons')
mkdirSync(out, { recursive: true })

const sizes: [string, number][] = [
  ['icon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512], // chữ L nằm trong vùng an toàn 80% nên dùng chung hình
]
for (const [name, size] of sizes) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(out, name), png)
}
console.log(`Đã sinh ${sizes.length} icon trong public/icons.`)
