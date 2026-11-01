// Nhập lại dữ liệu (chỉ Chủ): công cụ dùng một lần sau sự cố 01/11/2026. Không có lối vào từ menu, mở bằng địa chỉ trực
// tiếp. Chạy thử trước, xem báo cáo rồi mới nhập thật. Gỡ trang này sau khi dùng xong.
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, ConfirmDialog, Note, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import type { RecoveryReport } from '~/server/ops/recovery'

export const Route = createFileRoute('/_app/them/nhap-lai-du-lieu')({
  head: () => ({ meta: [{ title: 'Nhập lại dữ liệu · LINDY OS' }] }),
  component: RecoveryPage,
})

function RecoveryPage() {
  const can = useCan()
  const toast = useToast()
  const [payload, setPayload] = useState<string | null>(null)
  const [report, setReport] = useState<RecoveryReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can('users.manage')) return <Note tone="warning">Chỉ chủ quán dùng được mục này.</Note>

  async function pick(file: File | undefined) {
    setReport(null)
    setError(null)
    setPayload(file ? await file.text() : null)
  }

  async function run(commit: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await api<RecoveryReport>('/api/recovery-import', { body: { payload, commit } })
      setReport(res)
      setAsking(false)
      if (res.committed) toast('Đã nhập lại dữ liệu.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 px-4 pt-2">
      <h1 className="screen-title m-0">Nhập lại dữ liệu</h1>
      <p className="body m-0 text-ink-muted">
        Thêm dữ liệu thật từ bản sao lưu 01/11 vào app, không sửa dữ liệu đang có. Chỉ nhận đúng file đã chuẩn
        bị, chỉ nhập được một lần.
      </p>
      <input
        type="file"
        accept=".json"
        aria-label="File dữ liệu"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button block disabled={!payload} loading={busy} onClick={() => void run(false)}>
        Chạy thử
      </Button>
      {error && !asking ? <Note tone="danger">{error}</Note> : null}
      {report ? (
        <div className="lo-card flex flex-col gap-1">
          <span className="body-strong">
            {report.committed ? 'Đã nhập xong' : 'Chạy thử đạt, chưa ghi gì'}
          </span>
          {Object.entries(report.rows).map(([table, n]) => (
            <span key={table} className="caption text-ink-muted">
              {table}: {n}
            </span>
          ))}
        </div>
      ) : null}
      {report && !report.committed ? (
        <Button variant="danger" block onClick={() => setAsking(true)}>
          Nhập thật
        </Button>
      ) : null}
      <ConfirmDialog
        open={asking}
        title="Nhập dữ liệu vào app?"
        confirmLabel="Nhập thật"
        danger
        busy={busy}
        onConfirm={() => void run(true)}
        onCancel={() => setAsking(false)}
      >
        <p className="body m-0 text-ink-muted">Chỉ nhập được một lần.</p>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </section>
  )
}
