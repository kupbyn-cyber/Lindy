// Chụp ảnh thành phẩm (S18, S21, S35): mở camera iPhone (hoặc chọn ảnh có sẵn), app tự ghép khung LINDY NAIL STUDIO
// khổ 3:4, bấm Lưu / Chia sẻ
// để lưu vào Ảnh hoặc gửi Instagram, Zalo. Ảnh không gửi lên server, không lưu trong app.
import { useEffect, useRef, useState } from 'react'
import { Button, Note, Sheet, useToast } from '~/components/ui'
import type { OrderDetail } from '~/lib/orders'
import { canvasToJpeg, drawFrame, frameFileName, loadPhoto } from '~/lib/photo-frame'

export function PhotoSheet(props: { open: boolean; order: OrderDetail; onClose: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null)
  // Đã lưu / gửi xong ảnh đang xem: báo cho người dùng và đổi nút cuối thành Đóng
  const [saved, setSaved] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)

  // Đóng bảng thì bỏ ảnh cũ (giải phóng bộ nhớ)
  useEffect(() => {
    if (props.open) return
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url)
      return null
    })
    setSaved(false)
    setError(null)
  }, [props.open])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setSaved(false)
    setError(null)
    try {
      const photo = await loadPhoto(file)
      const canvas = await drawFrame(photo)
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
      // iPhone trả về khi đã lưu vào Ảnh hoặc gửi xong
      await navigator.share({ files: [file] })
      setSaved(true)
      toast('Đã lưu / gửi ảnh.')
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
          saved ? (
            <>
              <Button block onClick={() => camera.current?.click()} disabled={busy}>
                Chụp ảnh khác
              </Button>
              <Button block variant="primary" onClick={props.onClose}>
                Đóng
              </Button>
            </>
          ) : (
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
                  onClick={() => setSaved(true)}
                >
                  Tải ảnh
                </a>
              )}
            </>
          )
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
          {/* Cao tối đa ~nửa màn hình để thấy trọn ảnh 4:5 cùng các nút, không phải cuộn */}
          <img
            src={result.url}
            alt="Ảnh thành phẩm có khung LINDY"
            className="mx-auto block h-auto max-h-[58dvh] w-auto max-w-full rounded-[var(--radius-md)] border border-line"
          />
          {saved ? (
            <>
              <p className="body-strong m-0 text-success">Đã lưu / gửi ảnh.</p>
              {canShare ? (
                <Button variant="quiet" block onClick={() => void share()}>
                  Gửi thêm nơi khác
                </Button>
              ) : null}
            </>
          ) : canShare ? (
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
            Chụp móng vừa làm kèm bill, app tự ghép khung LINDY NAIL STUDIO (khổ 3:4) để lưu hoặc đăng
            Instagram.
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
