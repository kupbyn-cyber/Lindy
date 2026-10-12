// CLI quản trị tài khoản (bước 0.13). Mật khẩu tạm ghi vào .local/, KHÔNG in ra màn hình [P14].
//   bun scripts/user.ts list
//   bun scripts/user.ts create --name "Trang" --phone 0912345678 --role staff --branch HTK
//   bun scripts/user.ts reset-password --user 0912345678
//   bun scripts/user.ts grant --user 0912345678 --role staff_booking_plus --branch HTK
//   bun scripts/user.ts revoke --user 0912345678 --branch HTK
//   bun scripts/user.ts lock --user 0912345678      (unlock tương tự)
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import {
  createUser,
  grantRole,
  listUsers,
  lockUser,
  resetPassword,
  revokeBranch,
  unlockUser,
} from '../src/server/admin/users'
import { loadEnv, ROOT, requireEnv } from './lib/env'

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
function need(name: string) {
  const v = arg(name)
  if (!v) throw new Error(`Thiếu --${name}`)
  return v
}

function savePassword(label: string, password: string) {
  const dir = join(ROOT, '.local')
  if (!existsSync(dir)) mkdirSync(dir)
  const file = join(dir, 'mat-khau-tam.txt')
  appendFileSync(file, `${new Date().toISOString()}\t${label}\t${password}\n`)
  console.log(
    `Mật khẩu tạm của ${label} đã ghi vào .local/mat-khau-tam.txt. Người dùng phải đổi khi đăng nhập lần đầu.`,
  )
}

loadEnv()
const actor = `cli:${userInfo().username}`
const sql = postgres(requireEnv('MIGRATE_DATABASE_URL'), {
  onnotice: () => {},
  max: 1,
  transform: postgres.camel,
})
const cmd = process.argv[2]
try {
  await sql.begin(async (tx) => {
    switch (cmd) {
      case 'list': {
        for (const u of await listUsers(tx)) {
          console.log(
            `${u.isActive ? ' ' : '✗'} ${u.displayName.padEnd(16)} ${String(u.login).padEnd(24)} ${u.roles ?? '(không có quyền)'}`,
          )
        }
        break
      }
      case 'create': {
        const res = await createUser(tx, actor, {
          name: need('name'),
          phone: arg('phone'),
          email: arg('email'),
          role: need('role'),
          branch: need('branch'),
        })
        savePassword(need('name'), res.password)
        break
      }
      case 'reset-password': {
        const res = await resetPassword(tx, actor, need('user'))
        savePassword(need('user'), res.password)
        console.log('Đã thu hồi mọi phiên đăng nhập của tài khoản này.')
        break
      }
      case 'grant':
        await grantRole(tx, actor, need('user'), need('role'), need('branch'))
        console.log('Đã cấp quyền. Người dùng cần đăng nhập lại.')
        break
      case 'revoke':
        console.log(
          `Đã thu ${await revokeBranch(tx, actor, need('user'), need('branch'))} vai trò; đã thu hồi phiên và push.`,
        )
        break
      case 'lock':
        await lockUser(tx, actor, need('user'))
        console.log('Đã khoá tài khoản; đã thu hồi phiên và push.')
        break
      case 'unlock':
        await unlockUser(tx, actor, need('user'))
        console.log('Đã mở khoá tài khoản.')
        break
      default:
        console.log(
          'Lệnh: list | create | reset-password | grant | revoke | lock | unlock (xem đầu file scripts/user.ts)',
        )
    }
  })
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await sql.end()
}
