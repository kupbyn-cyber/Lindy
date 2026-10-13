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
        {can('booking_settings.manage') ? (
          <Row to="/them/cai-dat-lich" label="Cài đặt lịch" hint="Giờ mở cửa, thời lượng mặc định" />
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
