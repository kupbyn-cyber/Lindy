// Bước 2.3 — tìm kiếm thông minh trong danh mục (C09, test 51).
import { describe, expect, it } from 'vitest'
import { searchCatalog } from '../../src/lib/catalog-search'
import { SEED_COMBOS, SEED_SERVICES } from '../../src/server/ops/catalog-data'

const items = [
  ...SEED_SERVICES.map((s) => ({ name: s.name, category: s.category })),
  ...SEED_COMBOS.map((c) => ({ name: c.name, category: 'Combo' })),
]
const names = (q: string) => searchCatalog(items, q).map((x) => x.name)

describe('Tìm dịch vụ', () => {
  it('51 — "son gel" ra Sơn gel trơn đầu tiên; "tdc" ra Tẩy da chết', () => {
    expect(names('son gel')[0]).toBe('Sơn gel trơn')
    expect(names('tdc')[0]).toBe('Tẩy da chết, chà gót chân')
  })

  it('gõ không dấu, gõ tắt, có dấu đều ra', () => {
    expect(names('mat meo')[0]).toBe('Mắt mèo')
    expect(names('Mắt mèo')[0]).toBe('Mắt mèo')
    expect(names('cung mong').slice(0, 2)).toEqual(['Cứng móng (2 lớp)', 'Cứng móng tạo cầu'])
    expect(names('sgt')[0]).toBe('Sơn gel trơn')
    expect(names('pha mong')[0]).toBe('Phá móng cũ')
    expect(names('199')[0]).toBe('Combo móng giả 199k')
  })

  it('từ khoá trống trả cả danh mục; không khớp trả rỗng', () => {
    expect(searchCatalog(items, '  ')).toHaveLength(32)
    expect(names('xyzxyz')).toEqual([])
    expect(names('%')).toHaveLength(32)
  })

  it('tìm theo nhóm', () => {
    expect(names('mi')).toEqual(expect.arrayContaining(['Uốn mi Collagen', 'Uốn mi phủ đen']))
  })
})
