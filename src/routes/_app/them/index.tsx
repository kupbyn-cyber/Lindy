// Thêm (S40): mục chia nhóm theo việc — Hằng ngày, Tiền và báo cáo, Nhân sự, Cài đặt quán, Dữ liệu, Cá nhân. Mục và nhóm
// hiện theo quyền (server, DB kiểm lại). Mục có việc chờ hiện số, lấy lại số của thẻ Cần xử lý ở Tổng quan.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, ConfirmDialog, Icon, StatusChip } from '~/components/ui'
import { api } from '~/lib/api'
import { useBranch, useCan, useMe } from '~/lib/me'
import { disableThisDevice } from '~/lib/push-client'
import { formatIsoDate } from '~/lib/time'
import type { overview } from '~/server/reports/service'

export const Route = createFileRoute('/_app/them/')({
  head: () => ({ meta: [{ title: 'Thêm · LINDY OS' }] }),
  component: MorePage,
})

type Overview = Awaited<ReturnType<typeof overview>>
type Item = { to: string; label: string; hint?: string; show: boolean; badge?: string | number | null }

function Row(props: Item) {
  return (
    <Link to={props.to} className="lo-row lo-row-action">
      <span className="lo-row-main">
        <span className="body">{props.label}</span>
        {props.hint ? <span className="lo-row-meta caption">{props.hint}</span> : null}
      </span>
      <span className="flex flex-none items-center gap-2">
        {props.badge ? <StatusChip tone="warning">{props.badge}</StatusChip> : null}
        <Icon name="chevron-right" size={20} className="text-ink-muted" />
      </span>
    </Link>
  )
}

function Group(props: { title: string; items: Item[] }) {
  const items = props.items.filter((i) => i.show)
  if (items.length === 0) return null
  return (
    <section>
      <h2 className="overline m-0 px-4 pt-4 pb-1 text-ink-muted">{props.title}</h2>
      <div className="border-t border-line">
        {items.map((i) => (
          <Row key={i.to} {...i} />
        ))}
      </div>
    </section>
  )
}

const sum = (...n: number[]) => n.reduce((a, b) => a + b, 0) || null

function MorePage() {
  const me = useMe()
  const branch = useBranch()
  const can = useCan()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  // Cùng khoá với Tổng quan: đã mở Tổng quan thì số có sẵn, không tải lại
  const q = useQuery({
    queryKey: ['orders', 'overview', 'month'],
    queryFn: () => api<Overview>('/api/overview?period=month'),
    staleTime: 60_000,
  })
  const a = q.data?.attention

  async function logout() {
    setBusy(true)
    // Đăng xuất: gỡ đăng ký push của máy này [P21]
    await disableThisDevice().catch(() => {})
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.assign('/dang-nhap')
  }

  const approvesExpense = can('expense.approve_within_limit') || can('expense.approve_above_limit')
  const readsAllPay = can('payroll.read_all_branch')

  return (
    <section className="pb-4">
      <div className="px-4 pt-2">
        <h1 className="screen-title m-0">Thêm</h1>
        <p className="body m-0 text-ink-muted">
          {[me.displayName, branch?.roleName, branch?.shortLabel].filter(Boolean).join(' · ')}
        </p>
      </div>

      <Group
        title="Hằng ngày"
        items={[
          {
            to: '/them/chot-ngay',
            label: 'Chốt quỹ',
            hint: 'Đếm tiền mặt cuối ngày',
            show: can('cashbook.manage'),
            badge: a?.closeOverdue ? `Chưa chốt ${formatIsoDate(a.closeOverdue).slice(0, 5)}` : null,
          },
          {
            to: '/them/thu-chi',
            label: 'Thu chi',
            hint: approvesExpense ? 'Đề nghị, duyệt, chi' : 'Đề nghị chi',
            show: can('expense.request'),
            badge: a ? sum(a.expensesToApprove, a.expensesToPay) : null,
          },
          {
            to: '/lich/cham-cong',
            label: 'Chấm công',
            hint: can('attendance.approve') ? 'Duyệt công, nghỉ, bảng công' : 'Vào ca, ra ca, đăng ký nghỉ',
            show: can('attendance.own') || can('attendance.approve'),
            badge: a ? sum(a.pendingDays, a.leavesPending) : null,
          },
          {
            to: '/them/can-xem-lai',
            label: 'Cần xem lại',
            hint: 'Việc người khác tự duyệt',
            show: can('review_queue.read'),
            badge: a?.reviewTotal || null,
          },
        ]}
      />

      <Group
        title="Tiền và báo cáo"
        items={[
          {
            to: '/them/so-tien',
            label: 'Sổ tiền',
            hint: 'Số dư tiền mặt, tài khoản',
            show: can('money_accounts.read_balance'),
          },
          {
            to: '/them/bao-cao',
            label: 'Báo cáo doanh thu',
            hint: 'Theo ngày, tháng, thợ',
            show: can('revenue.read_branch'),
          },
          {
            to: '/them/luong',
            label: 'Lương',
            hint: readsAllPay ? 'Bảng lương, phiếu lương' : 'Lương tạm tính, phiếu lương',
            show: can('payroll.read_own') || readsAllPay,
            badge: a?.payrollToLock ? 'Chờ khoá' : a?.payrollUnpaid || null,
          },
          {
            to: '/them/tam-ung',
            label: 'Tạm ứng',
            hint: can('advance.approve')
              ? 'Duyệt, chi tạm ứng'
              : can('cashbook.manage')
                ? 'Đề nghị, chi tạm ứng'
                : 'Đề nghị tạm ứng',
            show: can('advance.request') || can('advance.approve'),
            badge: a ? sum(a.advancesToApprove, a.advancesToPay) : null,
          },
        ]}
      />

      <Group
        title="Nhân sự"
        items={[
          {
            to: '/them/nhan-vien',
            label: 'Nhân viên',
            hint: 'Ngày vào làm, lương cứng',
            show: readsAllPay || can('payroll.edit'),
            badge: a?.staffMissing.length || null,
          },
          {
            to: '/them/tai-khoan',
            label: 'Tài khoản',
            hint: 'Mật khẩu, vai trò, khoá',
            show: can('users.manage'),
          },
        ]}
      />

      <Group
        title="Cài đặt quán"
        items={[
          {
            to: '/them/danh-muc',
            label: 'Danh mục dịch vụ',
            hint: 'Dịch vụ, combo, giá',
            show: can('catalog.manage'),
          },
          {
            to: '/them/cai-dat-lich',
            label: 'Cài đặt lịch',
            hint: 'Giờ mở cửa, cọc, ngày đóng cửa',
            show: can('booking_settings.manage'),
          },
          {
            to: '/them/may-in',
            label: 'Máy in bill',
            hint: 'Nội dung bill, trạm in',
            show: can('print.manage'),
          },
        ]}
      />

      <Group
        title="Dữ liệu"
        items={[
          {
            to: '/them/xuat-du-lieu',
            label: 'Xuất dữ liệu',
            hint: 'Tải CSV, XLSX, sao lưu',
            show: can('data.export'),
          },
          {
            to: '/them/nhap-du-lieu-cu',
            label: 'Nhập dữ liệu cũ',
            hint: 'Doanh thu cũ từ Sheets',
            show: can('legacy.import'),
          },
          {
            to: '/them/du-lieu-thu',
            label: 'Dữ liệu dùng thử',
            hint: 'Nạp, xoá để dùng thật',
            show: can('users.manage'),
          },
        ]}
      />

      <Group
        title="Cá nhân"
        items={[
          { to: '/them/thong-bao', label: 'Thông báo', hint: 'Bật trên máy này, chọn nhóm', show: true },
          { to: '/them/doi-mat-khau', label: 'Đổi mật khẩu', show: true },
        ]}
      />

      <div className="px-4 pt-6">
        <Button block variant="danger" onClick={() => setConfirm(true)}>
          Đăng xuất
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Đăng xuất khỏi máy này?"
        confirmLabel="Đăng xuất"
        danger
        busy={busy}
        onConfirm={() => void logout()}
        onCancel={() => setConfirm(false)}
      >
        <p className="body m-0 text-ink-muted">Máy này sẽ ngừng nhận thông báo cho đến khi đăng nhập lại.</p>
      </ConfirmDialog>
    </section>
  )
}
