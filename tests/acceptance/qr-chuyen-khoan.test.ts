// QR chuyển khoản (S23–S26): Linh nhập tài khoản nhận tiền; chỉ chủ sửa được (server và DB), có nhật ký trước / sau;
// chi tiết đơn gửi thông tin QR cho người ghi được tiền thu (Linh, Nhung), không gửi cho thợ.
// Chạy trên cơ sở thử riêng "CS9" để không đổi tài khoản ngân hàng của HTK mà file test khác dùng.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toLocalDate } from '../../src/lib/time'
import { closeSql, withUser } from '../../src/server/db/client'
import { AppError } from '../../src/server/http/errors'
import { BankAccountBody } from '../../src/server/money/schema'
import { getBook, saveBankAccount } from '../../src/server/money/service'
import { createOrder, getOrder, markDone } from '../../src/server/orders/service'
import { rid, type SeedKey, sessionOf } from '../helpers/auth'
import { expectPgError, ownerSql, seed } from '../helpers/db'

const owner = ownerSql()
type S = Awaited<ReturnType<typeof sessionOf>>
const S: Partial<Record<SeedKey, S>> = {}
const today = toLocalDate(new Date())
let cs9 = ''
let bankId = ''

beforeAll(async () => {
  const [org] = await owner<{ id: string }[]>`select id from organizations limit 1`
  const [b] = await owner<{ id: string }[]>`
    insert into branches (organization_id, code, name, short_label)
    values (${org!.id}, 'CS9', 'Zz cơ sở thử QR chuyển khoản', 'CS9') returning id`
  cs9 = b!.id
  await owner`insert into branch_booking_settings (branch_id) values (${cs9})`
  await owner`
    insert into money_accounts (branch_id, code, name, type)
    values (${cs9}, 'cash', 'Tiền mặt CS9', 'cash'), (${cs9}, 'bank', 'Tài khoản CS9', 'bank')`
  const [acc] = await owner<{ id: string }[]>`
    select id from money_accounts where branch_id = ${cs9} and type = 'bank'`
  bankId = acc!.id
  for (const [k, role] of [
    ['linh', 'owner'],
    ['nhung', 'manager'],
    ['trang', 'staff'],
  ] as const) {
    await owner`
      insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
      select ${seed().users[k]!.id}, ${cs9}, id, 'test' from roles where code = ${role}`
  }
  for (const k of ['linh', 'nhung', 'trang'] as const) S[k] = await sessionOf(k)
})
afterAll(async () => {
  await owner`update user_branch_roles set revoked_at = now() where branch_id = ${cs9}`
  await owner.end()
  await closeSql()
})
const auth = (k: SeedKey) => S[k]!.auth
const uid = (k: SeedKey) => seed().users[k]!.id

async function status(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e.status
    throw e
  }
  throw new Error('Mong lỗi nhưng chạy được.')
}

const input = { branchId: '', bankBin: '970436', accountNo: '0011001234567', accountName: 'NGUYEN THI LINH' }

describe('S26 — tài khoản nhận chuyển khoản', () => {
  it('chưa nhập: sổ tiền có tài khoản ngân hàng, chưa có thông tin QR; chỉ Linh được sửa', async () => {
    const b = await getBook(auth('nhung'), { branchId: cs9 })
    expect(b.bankAccount).toMatchObject({ id: bankId, bankBin: null, bankAccountNo: null })
    expect(b.can.editBank).toBe(false)
    expect((await getBook(auth('linh'), { branchId: cs9 })).can.editBank).toBe(true)
  })

  it('Nhung, thợ bị chặn ở server; gọi thẳng hàm DB cũng bị chặn; app_user không UPDATE được bảng', async () => {
    expect(await status(saveBankAccount(auth('nhung'), { ...input, branchId: cs9 }))).toBe(403)
    expect(await status(saveBankAccount(auth('trang'), { ...input, branchId: cs9 }))).toBe(403)
    for (const k of ['nhung', 'trang'] as const) {
      await expectPgError(
        withUser(
          uid(k),
          (tx) => tx`select app.bank_account_save(${cs9}::uuid, '970436', '0011001234567', 'NGUYEN VAN A')`,
        ),
        '42501',
      )
    }
    await expectPgError(
      withUser(
        uid('linh'),
        (tx) => tx`update money_accounts set bank_account_no = '999999' where id = ${bankId}`,
      ),
      '42501',
    )
    const [r] = await owner<
      { bankBin: string | null }[]
    >`select bank_bin from money_accounts where id = ${bankId}`
    expect(r!.bankBin).toBeNull()
  })

  it('kiểm đầu vào: schema chuẩn hoá số tài khoản; DB chặn mã ngân hàng, số tài khoản sai', async () => {
    const ok = BankAccountBody.parse({
      bankBin: '970436',
      accountNo: ' 0011 0012 34567 ',
      accountName: ' A ',
    })
    expect(ok).toMatchObject({ accountNo: '0011001234567', accountName: 'A' })
    expect(BankAccountBody.safeParse({ bankBin: '97043', accountNo: '0011', accountName: 'A' }).success).toBe(
      false,
    )
    expect(
      BankAccountBody.safeParse({ bankBin: '970436', accountNo: 'số-tk', accountName: 'A' }).success,
    ).toBe(false)
    await expectPgError(
      withUser(
        uid('linh'),
        (tx) => tx`select app.bank_account_save(${cs9}::uuid, 'abc', '0011001234567', 'A')`,
      ),
      'P0001',
    )
    await expectPgError(
      withUser(uid('linh'), (tx) => tx`select app.bank_account_save(${cs9}::uuid, '970436', '12', 'A')`),
      'P0001',
    )
  })

  it('Linh lưu, sửa: sổ tiền hiện đúng, nhật ký ghi trước / sau', async () => {
    const b1 = await saveBankAccount(auth('linh'), { ...input, branchId: cs9 })
    expect(b1.bankAccount).toMatchObject({
      bankBin: '970436',
      bankAccountNo: '0011001234567',
      bankAccountName: 'NGUYEN THI LINH',
    })
    await saveBankAccount(auth('linh'), {
      ...input,
      branchId: cs9,
      bankBin: '970422',
      accountNo: '1234567890',
    })
    const logs = await owner<{ actorUserId: string; details: { before: unknown; after: unknown } }[]>`
      select actor_user_id, details from audit_logs
      where action = 'money_account.bank_saved' and entity_id = ${bankId} order by id`
    expect(logs).toHaveLength(2)
    expect(logs[0]!.actorUserId).toBe(uid('linh'))
    expect(logs[0]!.details.before).toBeNull()
    expect(logs[1]!.details).toEqual({
      before: { bin: '970436', accountNo: '0011001234567', accountName: 'NGUYEN THI LINH' },
      after: { bin: '970422', accountNo: '1234567890', accountName: 'NGUYEN THI LINH' },
    })
  })
})

describe('S23, S24 — chi tiết đơn gửi thông tin QR', () => {
  it('Linh, Nhung (ghi được tiền thu) nhận tài khoản; thợ trên đơn không nhận', async () => {
    const { order } = await createOrder(auth('nhung'), {
      branchId: cs9,
      createRequestId: rid(),
      customerId: null,
      serviceDate: today,
      items: [{ type: 'custom', name: 'Thử QR', amount: 88_000, staff: [{ userId: uid('trang') }] }] as never,
      discounts: [],
    })
    const d = await markDone(auth('nhung'), order.id, order.version)
    expect(d.can.recordPayment).toBe(true)
    const want = { bankBin: '970422', accountNo: '1234567890', accountName: 'NGUYEN THI LINH' }
    expect(d.transferQr).toEqual(want)
    expect((await getOrder(auth('linh'), order.id)).transferQr).toEqual(want)
    const t = await getOrder(auth('trang'), order.id)
    expect(t.can.recordPayment).toBe(false)
    expect(t.transferQr).toBeNull()
  })
})
