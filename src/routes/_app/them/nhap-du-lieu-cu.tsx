// Nhập dữ liệu cũ từ Google Sheets (Đợt 5B, bước 5.9; PRD §16, D14, Q42; test 16, 29). Chỉ Linh (legacy.import).
// Tải CSV một tab tháng → ghép cột (app gợi ý) → Kiểm tra (lỗi, cảnh báo, tổng theo thợ) → Nhập. Dữ liệu vào bảng riêng:
// không thành đơn, không vào sổ tiền, không vào lương; nhãn "không rõ dịch vụ / chưa biết đã thu tiền".
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ChangeEvent, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Money,
  Note,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from '~/components/ui'
import { api, errorText } from '~/lib/api'
import { useCan } from '~/lib/me'
import { formatVND } from '~/lib/money'
import { formatDateTimeShort, formatIsoDate } from '~/lib/time'
import type { Mapping } from '~/server/legacy/schema'
import type { analyzeLegacy, listImports } from '~/server/legacy/service'

export const Route = createFileRoute('/_app/them/nhap-du-lieu-cu')({
  head: () => ({ meta: [{ title: 'Nhập dữ liệu cũ · LINDY OS' }] }),
  component: Page,
})

type Analyze = Awaited<ReturnType<typeof analyzeLegacy>>
type Preview = Extract<Analyze, { kind: 'preview' }>
type Check = Extract<Analyze, { kind: 'check' }>
type Imports = Awaited<ReturnType<typeof listImports>>

const NONE = '-1'
const OTHER = 'other' // thợ không có tài khoản

function Page() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({
    queryKey: ['legacy', 'imports'],
    queryFn: () => api<Imports>('/api/legacy'),
    enabled: can('legacy.import'),
  })
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [label, setLabel] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  if (!can('legacy.import')) {
    return (
      <div className="px-4 pt-2">
        <Note tone="warning">Chỉ chủ quán nhập dữ liệu cũ.</Note>
      </div>
    )
  }

  async function analyze(text: string, name: string, headerRow?: number) {
    setBusy('preview')
    setError(null)
    setCheck(null)
    try {
      const p = await api<Analyze>('/api/legacy/analyze', { body: { fileName: name, text, headerRow } })
      if (p.kind === 'preview') {
        setPreview(p)
        setMapping((m) => ({ ...p.suggested, month: m?.month ?? null }))
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 2_000_000) {
      setError('File quá lớn (tối đa 2MB). Xuất từng tab tháng.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setFile({ name: f.name, text })
      setLabel(f.name.replace(/\.csv$/i, ''))
      setMapping(null)
      void analyze(text, f.name)
    }
    reader.onerror = () => setError('Không đọc được file.')
    reader.readAsText(f, 'utf-8')
  }

  async function runCheck() {
    if (!file || !mapping) return
    setBusy('check')
    setError(null)
    try {
      const c = await api<Analyze>('/api/legacy/analyze', {
        body: { fileName: file.name, text: file.text, mapping },
      })
      if (c.kind === 'check') setCheck(c)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function runImport() {
    if (!file || !mapping) return
    setBusy('import')
    setError(null)
    try {
      const r = await api<{ inserted: number; total: number; duplicates: number }>('/api/legacy', {
        body: { fileName: file.name, label: label.trim() || null, text: file.text, mapping },
      })
      toast(`Đã nhập ${r.inserted} khoản, tổng ${formatVND(r.total)}.`)
      setConfirm(false)
      setFile(null)
      setPreview(null)
      setMapping(null)
      setCheck(null)
      void qc.invalidateQueries({ queryKey: ['legacy'] })
      void qc.invalidateQueries({ queryKey: ['orders', 'report'] })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const set = <K extends keyof Mapping>(k: K, v: Mapping[K]) => {
    setCheck(null)
    setMapping((m) => {
      if (!m) return m
      const next = { ...m, [k]: v }
      // Cột đã chọn làm ngày, khách, SĐT, ghi chú, tổng thì không còn là cột tiền thợ
      const fixed = new Set([next.date, next.customer, next.phone, next.note, next.total])
      return { ...next, staff: next.staff.filter((s) => !fixed.has(s.col)) }
    })
  }
  const headers = preview?.headers ?? []
  const colOptions = headers.map((h, i) => ({ value: String(i), label: h || `Cột ${i + 1}` }))
  const fixed = mapping
    ? new Set([mapping.date, mapping.customer, mapping.phone, mapping.note, mapping.total])
    : new Set()

  return (
    <section className="flex flex-col gap-3 px-4 pt-1 pb-4">
      <div className="flex flex-col gap-1">
        <Link to="/them" className="label text-accent">
          ← Thêm
        </Link>
        <h1 className="screen-title m-0">Nhập dữ liệu cũ</h1>
        <p className="caption m-0 text-ink-muted">
          Doanh thu cũ trên Google Sheets để tra cứu. Không thành đơn, không vào sổ tiền, không vào lương; ghi
          nhãn "không rõ dịch vụ / chưa biết đã thu tiền". Mỗi lần nhập một tab tháng: Google Sheets → Tệp →
          Tải xuống → CSV.
        </p>
      </div>

      <div className="lo-field">
        <label className="lo-field-label label" htmlFor="legacy-file">
          File CSV
        </label>
        <input id="legacy-file" type="file" accept=".csv,text/csv" className="body" onChange={onFile} />
      </div>
      {busy === 'preview' ? <p className="body m-0 text-ink-muted">Đang đọc file…</p> : null}
      {error ? <Note tone="danger">{error}</Note> : null}

      {preview && mapping && file ? (
        <>
          <TextField
            label="Tên lần nhập (tab)"
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Dòng tiêu đề"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={String(mapping.headerRow)}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 1 && v <= 50) void analyze(file.text, file.name, v)
              }}
            />
            <TextField
              label="Tháng của tab"
              type="month"
              value={mapping.month ?? ''}
              onChange={(e) => set('month', e.target.value || null)}
            />
          </div>
          <p className="caption m-0 text-ink-muted">
            {preview.dataRows} dòng dưới dòng tiêu đề. Chọn tháng của tab nếu cột ngày chỉ có số ngày; app báo
            ngày ngoài tháng.
          </p>
          <div className="-mx-4 overflow-x-auto border-y border-line">
            <table className="caption w-max border-collapse">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cột cố định theo file
                    <th key={i} className="border-r border-line px-2 py-1 text-left">
                      {i + 1}. {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((r, ri) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: dòng xem trước cố định
                  <tr key={ri} className="border-t border-line">
                    {headers.map((_, ci) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: ô cố định
                      <td key={ci} className="border-r border-line px-2 py-1 text-ink-muted">
                        {r[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="overline m-0 text-ink-muted">Ghép cột</h2>
            <ColSelect
              label="Cột ngày (bắt buộc)"
              value={mapping.date}
              options={colOptions}
              required
              onChange={(v) => set('date', v ?? 0)}
            />
            <ColSelect
              label="Cột tên khách"
              value={mapping.customer}
              options={colOptions}
              onChange={(v) => set('customer', v)}
            />
            <ColSelect
              label="Cột SĐT"
              value={mapping.phone}
              options={colOptions}
              onChange={(v) => set('phone', v)}
            />
            <ColSelect
              label="Cột dịch vụ / ghi chú"
              value={mapping.note}
              options={colOptions}
              onChange={(v) => set('note', v)}
            />
            <ColSelect
              label="Cột tổng tiền"
              value={mapping.total}
              options={colOptions}
              onChange={(v) => set('total', v)}
            />
            <span className="label mt-1">Cột tiền của từng thợ</span>
            {headers.map((h, col) =>
              fixed.has(col) ? null : (
                // biome-ignore lint/suspicious/noArrayIndexKey: cột cố định theo file
                <div key={`${col}-${h}`} className="flex items-center gap-2">
                  <span className="body min-w-0 flex-1 truncate">
                    {col + 1}. {h || `Cột ${col + 1}`}
                  </span>
                  <select
                    aria-label={`Cột ${h || col + 1} là tiền của`}
                    className="lo-input input-text w-44"
                    value={(() => {
                      const s = mapping.staff.find((x) => x.col === col)
                      return s ? (s.userId ?? OTHER) : NONE
                    })()}
                    onChange={(e) => {
                      const v = e.target.value
                      setCheck(null)
                      setMapping((m) =>
                        m
                          ? {
                              ...m,
                              staff: [
                                ...m.staff.filter((x) => x.col !== col),
                                ...(v === NONE ? [] : [{ col, userId: v === OTHER ? null : v }]),
                              ].sort((a, b) => a.col - b.col),
                            }
                          : m,
                      )
                    }}
                  >
                    <option value={NONE}>Không phải tiền thợ</option>
                    {preview.staff.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        Tiền của {s.name}
                      </option>
                    ))}
                    <option value={OTHER}>Thợ không có tài khoản</option>
                  </select>
                </div>
              ),
            )}
            <p className="caption m-0 text-ink-muted">
              Có cột tổng và cột thợ: app so tổng từng dòng. Chỉ có cột tổng: ghi doanh thu không rõ thợ.
            </p>
            <Button block loading={busy === 'check'} onClick={() => void runCheck()}>
              Kiểm tra
            </Button>
          </section>
        </>
      ) : null}

      {check ? (
        <section className="flex flex-col gap-2">
          <h2 className="overline m-0 text-ink-muted">Kết quả kiểm</h2>
          <div className="lo-card flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="body-strong">
                {check.sourceRows} dòng hợp lệ · {check.rows} khoản nhập được
              </span>
              <Money value={check.total} />
            </div>
            <span className="caption text-ink-muted">
              {check.firstDate && check.lastDate
                ? `${formatIsoDate(check.firstDate)}–${formatIsoDate(check.lastDate)} · `
                : ''}
              {check.linkedRows} dòng khớp khách có sẵn (SĐT) · {check.newCustomers} khách mới theo SĐT
              {check.duplicates ? ` · ${check.duplicates} khoản đã nhập lần trước (bỏ qua)` : ''}
            </span>
            {check.byStaff.map((s) => (
              <div key={s.name} className="flex items-baseline justify-between gap-2">
                <span className="body text-ink-muted">{s.name}</span>
                <Money value={s.amount} size="sm" />
              </div>
            ))}
          </div>
          {check.errorCount ? (
            <Note tone="danger">
              {check.errorCount} dòng lỗi, sẽ không nhập. Sửa trên Google Sheets rồi tải lại nếu cần.
            </Note>
          ) : null}
          <IssueList title="Lỗi" items={check.errors} />
          <IssueList title={`Cảnh báo (${check.warningCount})`} items={check.warnings} />
          <Button block variant="primary" disabled={check.rows === 0} onClick={() => setConfirm(true)}>
            Nhập {check.rows} khoản
          </Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title={`Nhập ${check?.rows ?? 0} khoản từ ${file?.name ?? ''}?`}
        confirmLabel="Nhập"
        busy={busy === 'import'}
        onConfirm={() => void runImport()}
        onCancel={() => setConfirm(false)}
      >
        <p className="body m-0 text-ink-muted">
          Tổng {formatVND(check?.total ?? 0)}. Chỉ để tra cứu: không vào doanh thu của app, sổ tiền, lương.
          Huỷ được cả lần nhập nếu nhầm.
        </p>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>

      <ImportList data={list.data} />
    </section>
  )
}

function ColSelect(props: {
  label: string
  value: number | null
  options: { value: string; label: string }[]
  required?: boolean
  onChange: (v: number | null) => void
}) {
  const id = `col-${props.label}`
  return (
    <div className="lo-field">
      <label className="lo-field-label label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="lo-input input-text"
        value={props.value == null ? NONE : String(props.value)}
        onChange={(e) => props.onChange(e.target.value === NONE ? null : Number(e.target.value))}
      >
        {props.required ? null : <option value={NONE}>— Không có —</option>}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {Number(o.value) + 1}. {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function IssueList(props: { title: string; items: { rowNo: number | null; message: string }[] }) {
  if (props.items.length === 0) return null
  return (
    <details className="lo-card">
      <summary className="body-strong">{props.title}</summary>
      <ul className="m-0 flex flex-col gap-1 pl-4 pt-1">
        {props.items.map((x, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: danh sách tĩnh của một lần kiểm
          <li key={i} className="caption">
            {x.rowNo ? `Dòng ${x.rowNo}: ` : ''}
            {x.message}
          </li>
        ))}
      </ul>
    </details>
  )
}

function ImportList(props: { data: Imports | undefined }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [cancel, setCancel] = useState<Imports[number] | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!props.data?.length) return null

  async function run() {
    if (!cancel) return
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(
        ['legacy', 'imports'],
        await api<Imports>(`/api/legacy/${cancel.id}/cancel`, { body: { reason } }),
      )
      void qc.invalidateQueries({ queryKey: ['orders', 'report'] })
      toast('Đã huỷ lần nhập.')
      setCancel(null)
      setReason('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col">
      <h2 className="overline m-0 text-ink-muted">Các lần đã nhập</h2>
      {props.data.map((i) => (
        <div key={i.id} className="flex items-center gap-2 border-t border-line py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="body-strong">{i.label ?? i.fileName}</span>
            <span className="caption text-ink-muted">
              {i.firstDate && i.lastDate
                ? `${formatIsoDate(i.firstDate)}–${formatIsoDate(i.lastDate)} · `
                : ''}
              {i.rowCount} khoản · {formatVND(i.totalAmount)}
              {i.skippedCount ? ` · bỏ qua ${i.skippedCount}` : ''} · {i.createdByName}{' '}
              {formatDateTimeShort(i.createdAt)}
            </span>
            {i.cancelledAt ? <span className="caption text-ink-muted">Đã huỷ: {i.cancelReason}</span> : null}
          </span>
          {i.cancelledAt ? (
            <StatusChip tone="neutral">Đã huỷ</StatusChip>
          ) : (
            <Button variant="quiet" onClick={() => setCancel(i)}>
              Huỷ
            </Button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={!!cancel}
        title="Huỷ lần nhập này?"
        confirmLabel="Huỷ lần nhập"
        danger
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setCancel(null)}
      >
        <p className="body m-0 text-ink-muted">
          {cancel?.label ?? cancel?.fileName} · {cancel?.rowCount} khoản. Các dòng bị bỏ khỏi báo cáo, lịch sử
          khách; hồ sơ khách đã tạo giữ nguyên.
        </p>
        <TextArea
          label="Lý do (bắt buộc)"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <Note tone="danger">{error}</Note> : null}
      </ConfirmDialog>
    </section>
  )
}
