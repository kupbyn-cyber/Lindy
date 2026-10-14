// Chụp ảnh thành phẩm (S18–S21): mở camera iPhone (hoặc chọn ảnh có sẵn), app tự ghép khung LINDY, bấm Lưu / Chia sẻ
// để lưu vào Ảnh hoặc gửi Instagram, Zalo. Ảnh không gửi lên server, không lưu trong app.
import { useEffect, useRef, useState } from 'react'
import { Button, Note, Sheet, useToast } from '~/components/ui'
import type { OrderDetail } from '~/lib/orders'
import { canvasToJpeg, drawFrame, frameFileName, frameInfo, loadPhoto } from '~/lib/photo-frame'

export function PhotoSheet(props: { open: boolean; order: OrderDetail; onClose: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)

  // Đóng bảng thì bỏ ảnh cũ (giải phóng bộ nhớ)
  useEffect(() => {
    if (props.open) return
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url)
      return null
    })
    setError(null)
  }, [props.open])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const photo = await loadPhoto(file)
      const canvas = await drawFrame(photo, frameInfo(props.order))
      if ('close' in photo && typeof photo.close === 'function') photo.close()
      const blob = await canvasToJpeg(canvas)
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { blob, url: URL.createObjectURL(blob) }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không ghép được khung. Thử lại.')
    } finally {
      setBusy(false)
      if (camera.current) camera.current.value = ''
      if (library.current) library.current.value = ''
    }
  }

  const fileName = frameFileName(props.order)
  const file = result ? new File([result.blob], fileName, { type: 'image/jpeg' }) : null
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] })

  async function share() {
    if (!file) return
    try {
      await navigator.share({ files: [file] })
    } catch (e) {
      // Người dùng đóng bảng chia sẻ thì thôi
      if (e instanceof Error && e.name !== 'AbortError') toast('Không mở được bảng chia sẻ.', 'error')
    }
  }

  return (
    <Sheet
      open={props.open}
      title="Chụp ảnh thành phẩm"
      onClose={props.onClose}
      footer={
        result ? (
          <>
            <Button block onClick={() => camera.current?.click()} disabled={busy}>
              Chụp lại
            </Button>
            {canShare ? (
              <Button block variant="primary" onClick={() => void share()}>
                Lưu / Chia sẻ
              </Button>
            ) : (
              <a
                className="lo-btn lo-btn-primary lo-btn-block button-label"
                href={result.url}
                download={fileName}
              >
                Tải ảnh
              </a>
            )}
          </>
        ) : null
      }
    >
      {/* Camera sau của iPhone; ảnh trong thư viện thì không có capture */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {result ? (
        <>
          <img
            src={result.url}
            alt="Ảnh thành phẩm có khung LINDY"
            className="block w-full rounded-[var(--radius-md)] border border-line"
          />
          {canShare ? (
            <p className="caption m-0 text-ink-muted">
              Lưu / Chia sẻ: chọn “Lưu hình ảnh” để vào Ảnh, hoặc gửi thẳng Instagram, Zalo.
            </p>
          ) : (
            <p className="caption m-0 text-ink-muted">Nhấn giữ ảnh rồi chọn “Lưu vào Ảnh”.</p>
          )}
        </>
      ) : (
        <>
          <p className="body m-0 text-ink-muted">
            Chụp móng vừa làm, app tự ghép khung LINDY (dịch vụ, tên khách che bớt, thợ, ngày) để lưu hoặc
            đăng Instagram.
          </p>
          <Button
            variant="primary"
            block
            loading={busy}
            loadingText="Đang ghép khung…"
            onClick={() => camera.current?.click()}
          >
            Chụp ảnh
          </Button>
          <Button variant="quiet" block disabled={busy} onClick={() => library.current?.click()}>
            Chọn ảnh có sẵn
          </Button>
        </>
      )}
      {error ? <Note tone="danger">{error}</Note> : null}
    </Sheet>
  )
}
