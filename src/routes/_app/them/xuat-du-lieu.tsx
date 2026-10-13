// Xuất dữ liệu (Đợt 5A, bước 5.5–5.6; PRD §11, §15, test 19; K25). Chỉ Linh (data.export): tải báo cáo tháng, đơn hàng,
// sổ tiền, thu chi, bảng lương, khách hàng (CSV hoặc XLSX) và bản sao lưu dữ liệu. Mỗi lần tải có audit.
import { createFileRoute, Link } from '@tanstack/react-router'
import { Note, TextField } from '~/components/ui'
import { useCan } from '~/lib/me'
import { isYearMonth, toLocalDate } from '~/lib/time'

type Search = { m?: string }

export const Route = createFileRoute('/_app/them/xuat-du-lieu')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    m: typeof s.m === 'string' && isYearMonth(s.m) ? s.m : undefined,
  }),
  head: () => ({ meta: [{ title: 'Xuất dữ liệu · LINDY OS' }] }),
  component: Page,
})

// Khớp EXPORT_KINDS ở server
const KINDS: { kind: string; label: string; hint: string; formats: ('csv' | 'xlsx')[]; monthly: boolean }[] =
  [
    {
      kind: 'bao-cao-thang',
      label: 'Báo cáo tháng',
      hint: 'Tổng hợp, theo ngày, thợ, dịch vụ, dòng tiền, lương, lợi nhuận (nhiều trang)',
      formats: ['xlsx'],
      monthly: true,
    },
    {
      kind: 'don-hang',
      label: 'Đơn hàng tháng',
      hint: 'Mỗi đơn một dòng: ngày làm, khách, thợ, tiền, đã thu, đã hoàn — dùng kê khai doanh thu',
      formats: ['csv', 'xlsx'],
      monthly: true,
    },
    {
      kind: 'so-tien',
      label: 'Sổ tiền tháng',
      hint: 'Từng khoản vào, ra của hai tài khoản',
      formats: ['csv', 'xlsx'],
      monthly: true,
    },
    {
      kind: 'thu-chi',
      label: 'Thu chi tháng',
      hint: 'Phiếu chi đề nghị hoặc đã chi trong tháng',
      formats: ['csv', 'xlsx'],
      monthly: true,
    },
    {
      kind: 'bang-luong',
      label: 'Bảng lương tháng',
      hint: 'Đủ tham số từng người (tạm tính hoặc đã khoá)',
      formats: ['csv', 'xlsx'],
      monthly: true,
    },
    {
      kind: 'khach-hang',
      label: 'Khách hàng',
      hint: 'Tên, SĐT, số đơn, lần làm gần nhất',
      formats: ['csv', 'xlsx'],
      monthly: false,
    },
  ]

function Page() {
  const can = useCan()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const today = toLocalDate(new Date())
  const month = search.m ?? today.slice(0, 7)

  if (!can('data.export')) {
    return (
      <div className="px-4 pt-2">
        <Note tone="warning">Chỉ chủ quán tải file và bản sao lưu.</Note>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 px-4 pt-1 pb-4">
      <div className="flex flex-col gap-1">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Xuất dữ liệu</h1>
        <p className="caption m-0 text-ink-muted">
          File CSV, XLSX mở bằng Excel, Numbers, Google Sheets. Muốn PDF: mở Báo cáo hoặc phiếu lương → In /
          PDF.
        </p>
      </div>
      <TextField
        label="Tháng"
        type="month"
        max={today.slice(0, 7)}
        value={month}
        onChange={(e) => e.target.value && void navigate({ search: { m: e.target.value }, replace: true })}
      />
      <div className="-mx-4 border-t border-line">
        {KINDS.map((k) => (
          <div key={k.kind} className="flex items-center gap-2 border-b border-line px-4 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="body-strong">
                {k.label}
                {k.monthly ? ` ${month.slice(5, 7)}/${month.slice(0, 4)}` : ''}
              </span>
              <span className="caption text-ink-muted">{k.hint}</span>
            </span>
            <span className="flex gap-1">
              {k.formats.map((f) => (
                <a
                  key={f}
                  className="lo-btn lo-btn-secondary button-label no-underline"
                  href={`/api/export/${k.kind}?format=${f}${k.monthly ? `&month=${month}` : ''}`}
                  download
                >
                  {f.toUpperCase()}
                </a>
              ))}
            </span>
          </div>
        ))}
      </div>
      <section className="lo-card flex flex-col gap-2">
        <span className="overline text-ink-muted">Sao lưu</span>
        <span className="body">
          Bản sao lưu toàn bộ dữ liệu (đơn, khách, lịch, sổ tiền, công, lương, ảnh chứng từ). Không gồm mật
          khẩu. Giữ ở nơi an toàn.
        </span>
        <a className="lo-btn lo-btn-primary button-label no-underline" href="/api/backup" download>
          Tải bản sao lưu
        </a>
        <span className="caption text-ink-muted">
          Sao lưu tự động hằng ngày do Vibe Host làm. Bản này để giữ thêm ở máy và để kiểm khôi phục được.
        </span>
      </section>
    </section>
  )
}
