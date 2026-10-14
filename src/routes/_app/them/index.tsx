// Thêm: cài đặt cá nhân, thông báo, đăng xuất; Cài đặt lịch cho người có quyền.
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, ConfirmDialog, Icon } from '~/components/ui'
import { api } from '~/lib/api'
import { useCan, useMe } from '~/lib/me'
import { disableThisDevice } from '~/lib/push-client'

export const Route = createFileRoute('/_app/them/')({
  head: () => ({ meta: [{ title: 'Thêm · LINDY OS' }] }),
  component: MorePage,
})

function Row(props: { to: string; label: string; hint?: string }) {
  return (
    <Link to={props.to} className="lo-row lo-row-action">
      <span className="lo-row-main">
        <span className="body">{props.label}</span>
        {props.hint ? <span className="lo-row-meta caption">{props.hint}</span> : null}
      </span>
      <Icon name="chevron-right" size={20} className="text-ink-muted" />
    </Link>
  )
}

function MorePage() {
  const me = useMe()
  const can = useCan()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    // Đăng xuất: gỡ đăng ký push của máy này [P21]
    await disableThisDevice().catch(() => {})
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.assign('/dang-nhap')
  }

  return (
    <section>
      <div className="px-4 pt-2 pb-3">
        <h1 className="screen-title m-0">Thêm</h1>
        <p className="body text-ink-muted m-0">{me.displayName}</p>
      </div>
      <div className="border-t border-line">
        <Row to="/them/thong-bao" label="Thông báo" hint="Bật trên máy này, chọn nhóm nhận" />
        <Row to="/them/doi-mat-khau" label="Đổi mật khẩu" />
        {can('users.manage') ? (
          <Row to="/them/tai-khoan" label="Tài khoản" hint="Tạo tài khoản, mật khẩu, vai trò, khoá" />
        ) : null}
        {can('review_queue.read') ? (
          <Row
            to="/them/can-xem-lai"
            label="Cần xem lại"
            hint="Việc người khác tự duyệt, tự xác nhận, hoàn tiền"
          />
        ) : null}
        {can('attendance.own') || can('attendance.approve') ? (
          <Row to="/lich/cham-cong" label="Chấm công" hint="Vào ca, ra ca, đăng ký nghỉ, bảng công" />
        ) : null}
        {can('payroll.read_all_branch') || can('payroll.edit') ? (
          <Row
            to="/them/nhan-vien"
            label="Nhân viên"
            hint="Ngày vào làm, cách nhận lương, lương cứng, hoa hồng theo tháng"
          />
        ) : null}
        {can('payroll.read_own') || can('payroll.read_all_branch') ? (
          <Row to="/them/luong" label="Lương" hint="Lương tạm tính, phiếu lương, bảng lương tháng" />
        ) : null}
        {can('advance.request') || can('advance.approve') ? (
          <Row to="/them/tam-ung" label="Tạm ứng" hint="Đề nghị, duyệt, chi tạm ứng" />
        ) : null}
        {can('expense.request') ? (
          <Row to="/them/thu-chi" label="Thu chi" hint="Đề nghị chi, duyệt chi, đã chi" />
        ) : null}
        {can('money_accounts.read_balance') ? (
          <Row to="/them/so-tien" label="Sổ tiền" hint="Số dư Tiền mặt, Tài khoản; tiền vào, tiền ra" />
        ) : null}
        {can('cashbook.manage') ? (
          <Row to="/them/chot-ngay" label="Chốt quỹ" hint="Đếm tiền mặt cuối ngày, việc còn treo" />
        ) : null}
        {can('revenue.read_branch') ? (
          <Row to="/them/bao-cao" label="Báo cáo doanh thu" hint="Theo ngày, tháng, thợ, dịch vụ" />
        ) : null}
        {can('data.export') ? (
          <Row to="/them/xuat-du-lieu" label="Xuất dữ liệu" hint="Tải CSV, XLSX; bản sao lưu" />
        ) : null}
        {can('legacy.import') ? (
          <Row
            to="/them/nhap-du-lieu-cu"
            label="Nhập dữ liệu cũ"
            hint="Doanh thu cũ từ Google Sheets để tra cứu"
          />
        ) : null}
        {can('catalog.manage') ? (
          <Row to="/them/danh-muc" label="Danh mục dịch vụ" hint="Dịch vụ, combo, giá" />
        ) : null}
        {can('booking_settings.manage') ? (
          <Row
            to="/them/cai-dat-lich"
            label="Cài đặt lịch"
            hint="Giờ mở cửa, thời lượng mặc định, mùa cọc Tết, ngày đóng cửa"
          />
        ) : null}
        {can('users.manage') ? (
          <Row to="/them/du-lieu-thu" label="Dữ liệu dùng thử" hint="Nạp gói thử; xoá để bắt đầu dùng thật" />
        ) : null}
      </div>
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
