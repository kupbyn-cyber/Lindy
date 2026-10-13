// Ảnh chứng từ của một phiếu (Đợt 3B-2, bước 3.19): xem, thêm (chụp hoặc chọn ảnh), gỡ. Máy thu nhỏ ảnh trước khi gửi
// (cạnh dài ≤ 1600px, JPEG) để ảnh ≤ 1MB; server kiểm lại loại ảnh, cỡ ảnh và quyền theo phiếu gốc.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Button, Note, useToast } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import type { listAttachments } from '~/server/attachments/service'

type List = Awaited<ReturnType<typeof listAttachments>>

const MAX_SIDE = 1600
const MAX_BYTES = 1024 * 1024

function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
}

/** Đọc ảnh để vẽ: createImageBitmap (Safari 15+), không có thì dùng thẻ img (data URL — CSP chỉ cho data:). */
async function loadImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(file)
      return { src: b, w: b.width, h: b.height }
    } catch {
      // thử cách dưới
    }
  }
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('decode'))
    readDataUrl(file).then((u) => {
      img.src = u
    }, reject)
  })
  return { src: img, w: img.naturalWidth, h: img.naturalHeight }
}

/** Thu nhỏ ảnh về JPEG; ảnh không đọc được (vd. định dạng lạ) thì báo lỗi để chụp lại. */
async function shrink(file: File): Promise<Blob> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.w, img.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.w * scale)
  canvas.height = Math.round(img.h * scale)
  canvas.getContext('2d')!.drawImage(img.src, 0, 0, canvas.width, canvas.height)
  for (const q of [0.8, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new Error('Ảnh quá lớn sau khi thu nhỏ.')
}

export function Attachments(props: { ownerType: 'expense' | 'refund' | 'voucher'; ownerId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = ['money', 'attachments', props.ownerType, props.ownerId]
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<List>(`/api/attachments?ownerType=${props.ownerType}&ownerId=${props.ownerId}`),
  })

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      let blob: Blob
      try {
        blob = await shrink(file)
      } catch {
        throw new Error('Không đọc được ảnh này. Chụp lại bằng máy ảnh hoặc chọn ảnh JPEG, PNG.')
      }
      const res = await fetch(`/api/attachments?ownerType=${props.ownerType}&ownerId=${props.ownerId}`, {
        method: 'POST',
        body: blob,
        headers: { 'content-type': 'image/jpeg' },
        credentials: 'same-origin',
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | List | null
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Không gửi được ảnh.')
      qc.setQueryData(key, data)
      toast('Đã thêm ảnh chứng từ.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/attachments/${id}/remove`, { body: {} })
      await qc.invalidateQueries({ queryKey: key })
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const d = q.data
  if (!d) return null
  if (d.items.length === 0 && !d.canAdd) return null
  return (
    <div className="flex flex-col gap-2">
      <span className="label text-ink-muted">Ảnh chứng từ</span>
      {d.items.length ? (
        <div className="flex flex-wrap gap-2">
          {d.items.map((a) => (
            <div key={a.id} className="flex flex-col items-center gap-1">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/attachments/${a.id}`}
                  alt={`Chứng từ do ${a.uploadedByName ?? ''} gửi`}
                  className="h-16 w-16 rounded-[var(--radius-sm)] border border-line object-cover"
                />
              </a>
              {a.canRemove ? (
                <button
                  type="button"
                  className="caption border-0 bg-transparent p-0 text-danger"
                  onClick={() => void remove(a.id)}
                >
                  Gỡ
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {d.canAdd ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
            }}
          />
          <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
            Thêm ảnh chứng từ
          </Button>
        </>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
    </div>
  )
}
