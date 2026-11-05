// Bước 2.2 — Danh mục dịch vụ và combo: nạp ban đầu, chạy lại không nhân đôi, quyền đọc/ghi.
import { afterAll, describe, expect, it } from 'vitest'
import { closeSql, withUser } from '../../src/server/db/client'
import { SEED_COMBOS, SEED_SERVICES } from '../../src/server/ops/catalog-data'
import { seedBase } from '../../src/server/ops/seed'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
afterAll(async () => {
  await owner.end()
  await closeSql()
})

describe('2.2 Danh mục', () => {
  it('nạp đủ 29 món (28 dịch vụ + Kìm, S64), 4 combo; combo 139k có cứng móng, combo 99k không', async () => {
    expect(SEED_SERVICES).toHaveLength(29)
    expect(SEED_COMBOS).toHaveLength(4)
    const [n] = await owner<{ s: number; c: number; i: number }[]>`
      select (select count(*)::int from services where code !~ '^DV') as s,
             (select count(*)::int from combos where code !~ '^CBX') as c,
             (select count(*)::int from combo_items ci join combos x on x.id = ci.combo_id where x.code !~ '^CBX') as i`
    expect(n).toEqual({ s: 29, c: 4, i: 15 })
    const rows = await owner<{ code: string; hasHardening: boolean }[]>`
      select c.code, h.has_hardening from combos c join combo_hardening h on h.combo_id = c.id
      where c.code !~ '^CBX' order by c.code`
    expect(Object.fromEntries(rows.map((r) => [r.code, r.hasHardening]))).toEqual({
      CBO139: true,
      CBO179: false,
      CBO199: false,
      CBO99: false,
    })
    const hard = await owner<{ code: string }[]>`select code from services where has_hardening order by code`
    expect(hard.map((r) => r.code)).toEqual(['CB03', 'CB04'])
    // S64: chỉ Kìm là hàng bán, 110.000đ, nhóm Sản phẩm
    const retail = await owner<{ code: string; name: string; category: string; priceMin: string }[]>`
      select code, name, category, price_min from services where is_retail order by code`
    expect(retail).toEqual([{ code: 'SP01', name: 'Kìm', category: 'Sản phẩm', priceMin: '110000' }])
  })

  it('chạy seed lần hai không nhân đôi, không ghi đè giá đã sửa', async () => {
    // MI02 chỉ dùng trong test này để không ảnh hưởng test đơn hàng chạy song song.
    await owner`update services set price_min = 230000, price_max = 230000 where code = 'MI02'`
    try {
      await owner.begin((tx) => seedBase(tx))
      const [n] = await owner<{ s: number; c: number; i: number }[]>`
        select (select count(*)::int from services where code !~ '^DV') as s,
               (select count(*)::int from combos where code !~ '^CBX') as c,
               (select count(*)::int from combo_items ci join combos x on x.id = ci.combo_id where x.code !~ '^CBX') as i`
      expect(n).toEqual({ s: 29, c: 4, i: 15 })
      const [mi] = await owner<{ priceMin: string }[]>`select price_min from services where code = 'MI02'`
      expect(Number(mi!.priceMin)).toBe(230000)
    } finally {
      await owner`update services set price_min = 220000, price_max = 220000 where code = 'MI02'`
    }
  })

  it('S64 — DB đã có món "Kìm" Linh tự thêm: seed gắn cờ hàng bán cho món đó, không thêm SP01', async () => {
    const rollback = new Error('rollback')
    await expect(
      owner.begin(async (tx) => {
        // Giả lập DB trước khi có SP01: đổi mã SP01 tạm (rollback ở cuối), thêm món "kìm " Linh tự tạo
        await tx`update services set code = 'DVSPOLD', name = 'Món cũ' where code = 'SP01'`
        const [org] = await tx<{ id: string }[]>`select organization_id as id from services limit 1`
        await tx`
          insert into services (organization_id, code, category, name, price_mode, unit, price_min, price_max)
          values (${org!.id}, 'DVKIM', 'Khác', 'kìm ', 'list', 'cái', 120000, 120000)`
        await seedBase(tx)
        const rows = await tx<{ code: string; isRetail: boolean }[]>`
          select code, is_retail from services where code in ('SP01', 'DVKIM') order by code`
        expect(rows).toEqual([{ code: 'DVKIM', isRetail: true }])
        throw rollback
      }),
    ).rejects.toBe(rollback)
  })

  it('thợ đọc được danh mục; không sửa, không xoá được', async () => {
    const trang = seed().users.trang!.id
    const [r] = await withUser(
      trang,
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from services where code !~ '^DV'`,
    )
    expect(r!.n).toBe(29)
    await expectPgError(
      withUser(trang, (tx) => tx`update services set price_min = 1 where code = 'CB01'`),
      '42501',
    )
    await expectPgError(
      withUser(trang, (tx) => tx`delete from combos where code = 'CBO99'`),
      '42501',
    )
    await expectPgError(
      withUser(
        trang,
        (tx) => tx`insert into catalog_price_history (organization_id, item_type, item_id, new_min, new_max)
                   select organization_id, 'service', id, 1, 1 from services limit 1`,
      ),
      '42501',
    )
  })

  it('Linh cũng không sửa thẳng bảng được (chỉ qua hàm ở bước 2.22)', async () => {
    await expectPgError(
      withUser(seed().users.linh!.id, (tx) => tx`update services set price_min = 1 where code = 'CB01'`),
      '42501',
    )
  })

  it('người ở cơ sở 2 cùng tổ chức đọc được danh mục chung', async () => {
    const [r] = await withUser(
      seed().users.mai!.id,
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from combos where code !~ '^CBX'`,
    )
    expect(r!.n).toBe(4)
  })
})
