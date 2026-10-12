// Bỏ dấu tiếng Việt cho tìm kiếm: "Sơn gel" → "son gel", "Đào" → "dao".
export function foldVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Escape ký tự đặc biệt của ILIKE để tìm "%" không khớp mọi dòng [P13]. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`)
}
