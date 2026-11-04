// Màn chụp vào ca (S59): camera ngay trong app, đồng hồ giờ máy chủ chạy từng giây trên khung hình (kiểu Timemark).
// Chụp → xem lại → Vào ca: ảnh đóng dấu giờ, nén ≤ 150KB rồi gửi; DB ghi giờ và tự duyệt Đi làm. Không có lối chọn ảnh
// có sẵn. Không mở được camera hoặc gửi ảnh lỗi thì còn nút Vào ca không ảnh (chờ Nhung, Linh duyệt như cũ).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Note, Sheet } from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { clockOffset, drawCheckIn, type StampLines, stampLines, toCheckInJpeg } from '~/lib/checkin-photo'
import type { MyToday } from '~/server/attendance/service'

type Phase = 'starting' | 'live' | 'review' | 'sending' | 'camera-error' | 'send-error'

function cameraErrorText(e: unknown) {
  const name = e instanceof Error ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Chưa cho app dùng camera. Vào Cài đặt → Safari → Camera → Cho phép rồi mở lại, hoặc vào ca không ảnh.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Máy không có camera dùng được.'
  return 'Không mở được camera. Thử lại, hoặc vào ca không ảnh.'
}

export function CheckInCamera(props: { onDone: (next: MyToday) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  // Giờ máy chủ = giờ điện thoại + offset; tên in trên ảnh
  const [clock, setClock] = useState<{ offset: number; name: string; tz: string } | null>(null)
  const [lines, setLines] = useState<StampLines | null>(null)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)

  // Lấy giờ máy chủ mỗi lần mở màn chụp (đồng hồ điện thoại có thể sai)
  useEffect(() => {
    let alive = true
    const sentAt = Date.now()
    api<MyToday>('/api/attendance?view=today').then(
      (t) => {
        if (alive)
          setClock({ offset: clockOffset(t.serverNow, sentAt, Date.now()), name: t.name, tz: t.timezone })
      },
      (e) => {
        if (!alive) return
        setError(errorText(e))
        setPhase('send-error')
      },
    )
    return () => {
      alive = false
    }
  }, [])

  // Đồng hồ trên khung hình
  useEffect(() => {
    if (!clock) return
    const tick = () => setLines(stampLines(Date.now() + clock.offset, clock.name, clock.tz))
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [clock])

  // Mở camera; đổi camera thì mở lại. Đóng màn thì tắt camera.
  useEffect(() => {
    let alive = true
    // Chỉ đổi giữa Đang mở camera và đang quay; không che trạng thái xem lại hay lỗi
    async function start() {
      setPhase((p) => (p === 'live' ? 'starting' : p))
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Máy không mở được camera trong app.')
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
        if (!alive) {
          for (const t of s.getTracks()) t.stop()
          return
        }
        stream.current = s
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => {})
        }
        setPhase((p) => (p === 'starting' ? 'live' : p))
      } catch (e) {
        if (!alive) return
        setError(cameraErrorText(e))
        setPhase('camera-error')
      }
    }
    void start()
    return () => {
      alive = false
      for (const t of stream.current?.getTracks() ?? []) t.stop()
      stream.current = null
    }
  }, [facing])

  // Đồng hồ vẽ lại 4 lần mỗi giây: giữ hàm đóng cố định để bảng không gắn lại sự kiện mỗi lần; đang gửi thì không đóng
  const { onClose } = props
  const sending = phase === 'sending'
  const close = useCallback(() => {
    if (!sending) onClose()
  }, [sending, onClose])

  // Bỏ ảnh xem trước khi chụp lại hoặc đóng
  useEffect(() => () => (shot ? URL.revokeObjectURL(shot.url) : undefined), [shot])

  async function capture() {
    const v = video.current
    if (!v || !clock || !v.videoWidth) return
    setError(null)
    try {
      const now = stampLines(Date.now() + clock.offset, clock.name, clock.tz)
      const canvas = drawCheckIn(v, v.videoWidth, v.videoHeight, now, { mirror: facing === 'user' })
      const blob = await toCheckInJpeg(canvas)
      setShot({ blob, url: URL.createObjectURL(blob) })
      setPhase('review')
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function send() {
    if (!shot) return
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch('/api/attendance/check-in-photo', {
        method: 'POST',
        body: shot.blob,
        headers: { 'content-type': 'image/jpeg' },
        credentials: 'same-origin',
      }).catch(() => {
        throw new Error('Mất kết nối mạng. Kiểm tra mạng rồi thử lại.')
      })
      const data = (await res.json().catch(() => null)) as ({ error?: string } & Partial<MyToday>) | null
      if (!res.ok) throw new Error(data?.error ?? 'Không gửi được ảnh.')
      props.onDone(data as MyToday)
    } catch (e) {
      setError(errorText(e))
      setPhase('send-error')
    }
  }

  async function withoutPhoto() {
    setPhase('sending')
    setError(null)
    try {
      props.onDone(await api<MyToday>('/api/attendance/check-in', { body: {} }))
    } catch (e) {
      setError(errorText(e))
      setPhase('send-error')
    }
  }

  const reviewing = !!shot && phase !== 'live' && phase !== 'starting' && phase !== 'camera-error'
  const fallback = phase === 'camera-error' || phase === 'send-error'

  return (
    <Sheet
      open
      title="Vào ca"
      onClose={close}
      footer={
        fallback ? (
          <>
            {shot ? (
              <Button block onClick={() => void send()}>
                Gửi lại
              </Button>
            ) : null}
            <Button block variant="primary" onClick={() => void withoutPhoto()}>
              Vào ca không ảnh
            </Button>
          </>
        ) : reviewing ? (
          <>
            <Button
              block
              disabled={phase === 'sending'}
              onClick={() => {
                setShot(null)
                setPhase('live')
              }}
            >
              Chụp lại
            </Button>
            <Button
              block
              variant="primary"
              loading={phase === 'sending'}
              loadingText="Đang gửi…"
              onClick={() => void send()}
            >
              Vào ca
            </Button>
          </>
        ) : (
          <Button
            block
            variant="primary"
            disabled={phase !== 'live' || !lines}
            onClick={() => void capture()}
          >
            Chụp
          </Button>
        )
      }
    >
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[calc(56dvh*0.75)] overflow-hidden rounded-[var(--radius-md)] bg-black">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''} ${reviewing ? 'invisible' : ''}`}
        />
        {reviewing && shot ? (
          <img src={shot.url} alt="Ảnh vào ca" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {!reviewing && lines ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-2 pt-10 text-white">
            <span className="text-[2.25rem] font-bold leading-tight tabular-nums">{lines.time}</span>
            <span className="caption">{lines.date}</span>
            <span className="caption">{lines.who}</span>
          </div>
        ) : null}
        {phase === 'starting' ? (
          <span className="body absolute inset-0 grid place-items-center text-white">Đang mở camera…</span>
        ) : null}
      </div>
      {phase === 'live' ? (
        <Button
          variant="quiet"
          block
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
        >
          Đổi camera
        </Button>
      ) : null}
      {error ? <Note tone={fallback ? 'warning' : 'danger'}>{error}</Note> : null}
    </Sheet>
  )
}
