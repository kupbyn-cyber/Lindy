// UI17 — Bật thông báo trên máy này, hướng dẫn iPhone từng bước (§9.3), chọn nhóm nhận.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button, Note, StatusChip, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { disableThisDevice, enablePush, isIos, type PushSupport, pushSupport } from '~/lib/push-client'
import { LABEL_TONE } from '~/lib/status-tone'
import { formatDateTimeShort } from '~/lib/time'

export const Route = createFileRoute('/_app/them/thong-bao')({
  head: () => ({ meta: [{ title: 'Cài đặt thông báo · LINDY OS' }] }),
  component: NotificationSettings,
})

type Device = {
  id: string
  userAgent: string | null
  createdAt: string
  lastSuccessAt: string | null
  thisDevice: boolean
}

function deviceName(ua: string | null) {
  if (!ua) return 'Máy không rõ'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Edg\//.test(ua)) return 'Edge trên máy tính'
  if (/Chrome\//.test(ua)) return 'Chrome trên máy tính'
  if (/Safari\//.test(ua)) return 'Safari trên máy tính'
  if (/Firefox\//.test(ua)) return 'Firefox'
  return 'Máy khác'
}

function IphoneGuide() {
  return (
    <ol className="body m-0 flex flex-col gap-2 pl-5">
      <li>Mở app bằng Safari trên iPhone (iOS 16.4 trở lên).</li>
      <li>
        Bấm nút <strong>Chia sẻ</strong> (ô vuông có mũi tên) → <strong>Thêm vào MH chính</strong> →{' '}
        <strong>Thêm</strong>.
      </li>
      <li>Mở app LINDY OS từ biểu tượng chữ L trên màn hình chính.</li>
      <li>Đăng nhập lại trong app đã ghim (app ghim có phiên đăng nhập riêng với Safari).</li>
      <li>
        Vào <strong>Thêm → Thông báo</strong>, bấm <strong>Bật thông báo trên máy này</strong>, rồi chọn{' '}
        <strong>Cho phép</strong>.
      </li>
      <li>
        Bấm <strong>Gửi thử</strong> để kiểm máy đã nhận được.
      </li>
    </ol>
  )
}

function NotificationSettings() {
  const toast = useToast()
  const qc = useQueryClient()
  const [support, setSupport] = useState<PushSupport>({ ok: false, reason: 'ssr' })
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSupport(pushSupport())
    if (typeof Notification !== 'undefined') setPermission(Notification.permission)
  }, [])

  const devices = useQuery({
    queryKey: ['notifications', 'devices'],
    queryFn: () => api<{ items: Device[] }>('/api/push/subscriptions'),
  })
  const prefs = useQuery({
    queryKey: ['notifications', 'prefs'],
    queryFn: () =>
      api<{ items: { type: string; label: string; enabled: boolean }[] }>('/api/notifications/preferences'),
  })
  const setPref = useMutation({
    mutationFn: (b: { type: string; enabled: boolean }) =>
      api('/api/notifications/preferences', { method: 'PUT', body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'prefs'] }),
    onError: (e) => toast(errorText(e), 'error'),
  })
  const test = useMutation({
    mutationFn: () => api('/api/push/test', { method: 'POST' }),
    onSuccess: () => toast('Đã gửi thông báo thử.'),
    onError: (e) => toast(errorText(e), 'error'),
  })

  const thisDevice = devices.data?.items.find((d) => d.thisDevice)

  async function enable() {
    setBusy(true)
    try {
      await enablePush()
      setPermission(Notification.permission)
      toast('Đã bật thông báo trên máy này.')
      await qc.invalidateQueries({ queryKey: ['notifications', 'devices'] })
    } catch (e) {
      toast(errorText(e), 'error')
      if (typeof Notification !== 'undefined') setPermission(Notification.permission)
    } finally {
      setBusy(false)
    }
  }

  async function disable(id: string, mine: boolean) {
    try {
      if (mine) await disableThisDevice(id)
      else await api(`/api/push/subscriptions/${id}`, { method: 'DELETE' })
      toast('Đã tắt thông báo trên máy đó.')
      await qc.invalidateQueries({ queryKey: ['notifications', 'devices'] })
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <section className="flex flex-col gap-6 px-4 pt-2">
      <h1 className="screen-title m-0">Thông báo</h1>

      <div className="flex flex-col gap-3">
        <p className="overline m-0 text-ink-muted">Máy này</p>
        {support.ok ? (
          thisDevice ? (
            <Note>Máy này đang nhận thông báo đẩy.</Note>
          ) : permission === 'denied' ? (
            <Note tone="warning">
              Máy đã chặn thông báo của LINDY OS. Bật lại trong Cài đặt → Thông báo → LINDY OS, rồi quay lại
              đây.
            </Note>
          ) : (
            <Button
              variant="primary"
              block
              loading={busy}
              loadingText="Đang bật…"
              onClick={() => void enable()}
            >
              Bật thông báo trên máy này
            </Button>
          )
        ) : support.reason === 'ios-not-installed' ? (
          <Note tone="warning">
            iPhone chỉ nhận thông báo khi app đã được thêm vào màn hình chính. Làm theo các bước dưới.
          </Note>
        ) : support.reason === 'insecure' ? (
          <Note tone="warning">
            Thông báo đẩy cần kết nối HTTPS. Bản chạy thử trên máy tính chưa bật được trên điện thoại.
          </Note>
        ) : support.reason === 'unsupported' ? (
          <Note tone="warning">
            Trình duyệt này không hỗ trợ thông báo đẩy. Thông báo vẫn hiện trong app.
          </Note>
        ) : null}
        {thisDevice ? (
          <Button block loading={test.isPending} loadingText="Đang gửi…" onClick={() => test.mutate()}>
            Gửi thử
          </Button>
        ) : null}
        <p className="caption m-0 text-ink-muted">
          Không bật được hoặc mất mạng thì thông báo vẫn có trong app (biểu tượng chuông). Màn hình khoá không
          hiện SĐT hay ghi chú.
        </p>
      </div>

      {support.ok && !isIos() ? null : (
        <div className="flex flex-col gap-3">
          <p className="overline m-0 text-ink-muted">Bật trên iPhone</p>
          <IphoneGuide />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="overline m-0 text-ink-muted">Nhóm thông báo nhận</p>
        <div className="border-t border-line -mx-4">
          {prefs.data?.items.map((p) => (
            <label key={p.type} className="lo-row lo-row-action">
              <span className="body">{p.label}</span>
              <input
                type="checkbox"
                className="h-6 w-6 accent-[var(--accent)]"
                checked={p.enabled}
                onChange={(e) => setPref.mutate({ type: p.type, enabled: e.target.checked })}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="overline m-0 text-ink-muted">Các máy đang nhận</p>
        {devices.data?.items.length === 0 ? (
          <p className="body m-0 text-ink-muted">Chưa có máy nào.</p>
        ) : null}
        <div className="border-t border-line -mx-4">
          {devices.data?.items.map((d) => (
            <div key={d.id} className="lo-row">
              <span className="lo-row-main">
                <span className="body">
                  {deviceName(d.userAgent)}{' '}
                  {d.thisDevice ? <StatusChip tone={LABEL_TONE.thisDevice}>Máy này</StatusChip> : null}
                </span>
                <span className="lo-row-meta caption">
                  Bật lúc {formatDateTimeShort(d.createdAt)}
                  {d.lastSuccessAt ? ` · nhận gần nhất ${formatDateTimeShort(d.lastSuccessAt)}` : ''}
                </span>
              </span>
              <Button variant="quiet" onClick={() => void disable(d.id, d.thisDevice)}>
                Tắt
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
