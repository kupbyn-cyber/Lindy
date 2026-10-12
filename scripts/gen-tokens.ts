// Sinh src/styles/tokens.css từ design/design-system/tokens.json (bước 0.5). Không sửa tay file sinh ra.
//   bun scripts/gen-tokens.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type ColorToken = { name: string; value: { light: string; dark: string } }
type TypeStyle = {
  name: string
  fontSize: string
  lineHeight: string
  fontWeight: number
  letterSpacing?: string
}
type Tokens = {
  color: { tokens: ColorToken[] }
  type: { families: Record<string, string>; groups: { family: string; styles: TypeStyle[] }[] }
  spacing: { tokens: { name: string; value: string }[] }
  radius: { tokens: { name: string; value: string }[] }
  size: { tokens: { name: string; value: string }[] }
  shadow: { tokens: { name: string; value: { light: string; dark: string } }[] }
}

const root = process.cwd()
const t: Tokens = JSON.parse(readFileSync(join(root, 'design/design-system/tokens.json'), 'utf8'))

const light: string[] = []
const dark: string[] = []
for (const c of t.color.tokens) {
  light.push(`  --${c.name}: ${c.value.light};`)
  dark.push(`    --${c.name}: ${c.value.dark};`)
}
for (const s of t.shadow.tokens) {
  light.push(`  --${s.name}: ${s.value.light};`)
  dark.push(`    --${s.name}: ${s.value.dark};`)
}
const fixed: string[] = []
for (const [k, v] of Object.entries(t.type.families)) fixed.push(`  --font-${k}: ${v};`)
for (const group of [t.spacing, t.radius, t.size])
  for (const tk of group.tokens) fixed.push(`  --${tk.name}: ${tk.value};`)

const typeClasses: string[] = []
for (const g of t.type.groups) {
  for (const s of g.styles) {
    const rules = [
      `font-family: var(--font-${g.family});`,
      `font-size: ${s.fontSize};`,
      `line-height: ${s.lineHeight};`,
      `font-weight: ${s.fontWeight};`,
    ]
    if (s.letterSpacing) rules.push(`letter-spacing: ${s.letterSpacing};`)
    // Tailwind cũng có lớp "overline" (gạch trên chữ) — tắt để giữ đúng kiểu chữ của bộ giao diện.
    if (s.name === 'overline') rules.push('text-transform: uppercase; text-decoration-line: none;')
    if (['display-money', 'amount'].includes(s.name))
      rules.push('font-variant-numeric: lining-nums tabular-nums;')
    typeClasses.push(`.${s.name} { ${rules.join(' ')} }`)
  }
}

// Ánh xạ cho Tailwind: bg-surface, text-ink, border-line, rounded-md…
const themeColors = t.color.tokens.map((c) => `  --color-${c.name}: var(--${c.name});`)

const css = `/* SINH TỰ ĐỘNG từ design/design-system/tokens.json — không sửa tay. Chạy: bun scripts/gen-tokens.ts */

:root {
  color-scheme: light dark;
${light.join('\n')}
${fixed.join('\n')}
}

/* Sáng/tối tự đổi theo iPhone (G09); không có nút bật/tắt riêng. */
@media (prefers-color-scheme: dark) {
  :root {
${dark.join('\n')}
  }
}

@theme inline {
${themeColors.join('\n')}
}

${typeClasses.join('\n')}
`

writeFileSync(join(root, 'src/styles/tokens.css'), css)
console.log('Đã sinh src/styles/tokens.css.')
