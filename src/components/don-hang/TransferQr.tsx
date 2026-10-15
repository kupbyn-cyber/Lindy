// QR chuyển khoản trong hộp ghi tiền thu của đơn (S23–S26): VietQR có sẵn số tiền đang nhập (không gộp tip) và nội
// dung "LINDY + mã đơn". Xoay máy cho khách quét; thấy tiền về thì bấm ghi như cũ. QR nền trắng ô đen cố định, kể cả
// giao diện tối, để app ngân hàng quét được.
import { Money, Note } from '~/components/ui'
import type { OrderDetail } from '~/lib/orders'
import { bankName, qrMatrix, transferNote, vietQrPayload } from '~/lib/vietqr'

const QUIET = 4 // lề trắng 4 ô theo chuẩn QR

export function TransferQr(props: { order: OrderDetail; amount: number | null }) {
  const bank = props.order.transferQr
  if (!bank) {
    return <Note>Chưa có tài khoản nhận chuyển khoản để hiện QR. Linh nhập ở Thêm → Sổ tiền.</Note>
  }
  const amount = props.amount ?? 0
  if (amount <= 0) return <p className="caption m-0 text-ink-muted">Nhập số tiền để hiện QR chuyển khoản.</p>

  const note = transferNote(props.order.codeLabel)
  const cells = qrMatrix(vietQrPayload({ bin: bank.bankBin, accountNo: bank.accountNo, amount, note }))
  const size = cells.length + QUIET * 2
  let d = ''
  cells.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`
    })
  })

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={208}
        height={208}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR chuyển khoản ${amount} đồng vào ${bankName(bank.bankBin)} ${bank.accountNo}`}
        className="block rounded-[var(--radius-md)]"
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <div className="flex w-full flex-col gap-0.5 text-center">
        <span className="body-strong">
          {bankName(bank.bankBin)} · {bank.accountNo}
        </span>
        <span className="caption text-ink-muted">{bank.accountName}</span>
        <span className="caption text-ink-muted">
          <Money value={amount} size="sm" /> · Nội dung: {note}
        </span>
      </div>
    </div>
  )
}
