// Tìm dịch vụ trong danh mục (C09): gõ không dấu và gõ tắt vẫn ra. "son gel" → Sơn gel trơn; "tdc" → Tẩy da chết.
// Danh mục nhỏ (khoảng 32 mục) nên lọc ngay trên máy, không gọi server.
import { foldVietnamese } from './text'

function clean(s: string) {
  return foldVietnamese(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Indexed = { text: string; words: string[]; initials: string; category: string }

function index(name: string, category?: string): Indexed {
  const text = clean(name)
  const words = text.split(' ').filter(Boolean)
  return { text, words, initials: words.map((w) => w[0]).join(''), category: clean(category ?? '') }
}

/** Điểm khớp: số nhỏ khớp tốt hơn; null là không khớp. */
function score(it: Indexed, q: string, tokens: string[]): number | null {
  if (it.text.startsWith(q)) return 0
  if (it.text.includes(` ${q}`)) return 1
  if (tokens.every((t) => it.words.some((w) => w.startsWith(t)))) return 2
  if (!q.includes(' ') && q.length >= 2 && it.initials.startsWith(q)) return 3
  if (it.text.includes(q)) return 4
  if (it.category.startsWith(q)) return 5
  return null
}

/** Lọc và xếp các mục theo từ khoá; từ khoá trống trả nguyên danh sách. */
export function searchCatalog<T extends { name: string; category?: string }>(items: T[], query: string): T[] {
  const q = clean(query)
  if (!q) return items
  const tokens = q.split(' ')
  return items
    .map((item, i) => ({ item, i, s: score(index(item.name, item.category), q, tokens) }))
    .filter((x): x is { item: T; i: number; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.item)
}
