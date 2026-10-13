// Ghi XLSX tối thiểu, không thư viện (Đợt 5A, bước 5.4): gói ZIP không nén chứa workbook OOXML, mỗi trang một bảng;
// chữ dạng inlineStr (không bao giờ thành công thức), số dạng số. Dòng đầu mỗi trang in đậm.
import type { Cell, Table } from './csv'

export type Sheet = Table & { name: string }

// ---------------------------------------------------------------- ZIP (phương thức "stored")

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Ngày giờ kiểu DOS (cố định, file xuất không cần giờ chính xác trong zip) */
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

export function zipStored(files: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true) // phiên bản cần để giải nén
    v.setUint16(6, 0x0800, true) // tên file UTF-8
    v.setUint16(8, 0, true) // stored
    v.setUint16(10, DOS_TIME, true)
    v.setUint16(12, DOS_DATE, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, f.data.length, true)
    v.setUint32(22, f.data.length, true)
    v.setUint16(26, name.length, true)
    v.setUint16(28, 0, true)
    local.set(name, 30)
    parts.push(local, f.data)

    const cd = new Uint8Array(46 + name.length)
    const w = new DataView(cd.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true)
    w.setUint16(6, 20, true)
    w.setUint16(8, 0x0800, true)
    w.setUint16(10, 0, true)
    w.setUint16(12, DOS_TIME, true)
    w.setUint16(14, DOS_DATE, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, f.data.length, true)
    w.setUint32(24, f.data.length, true)
    w.setUint16(28, name.length, true)
    w.setUint32(42, offset, true)
    cd.set(name, 46)
    central.push(cd)
    offset += local.length + f.data.length
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0)
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(12, cdSize, true)
  e.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const x of [...parts, ...central, end]) {
    out.set(x, p)
    p += x.length
  }
  return out
}

// ---------------------------------------------------------------- OOXML

const xml = (s: string) =>
  s
    // Ký tự điều khiển không hợp lệ trong XML 1.0
    // biome-ignore lint/suspicious/noControlCharactersInRegex: loại ký tự điều khiển khỏi ô
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

function colName(i: number) {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function cellXml(c: Cell, ref: string, bold: boolean) {
  const style = bold ? ' s="1"' : ''
  if (c == null || c === '') return ''
  if (typeof c === 'number') return Number.isFinite(c) ? `<c r="${ref}"${style}><v>${c}</v></c>` : ''
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`
}

function sheetXml(s: Sheet) {
  const rows = [s.headers, ...s.rows]
    .map(
      (r, i) =>
        `<row r="${i + 1}">${r.map((c, j) => cellXml(c, `${colName(j)}${i + 1}`, i === 0)).join('')}</row>`,
    )
    .join('')
  const widths = s.headers
    .map((h, j) => {
      const len = Math.max(h.length, ...s.rows.slice(0, 200).map((r) => String(r[j] ?? '').length))
      return `<col min="${j + 1}" max="${j + 1}" width="${Math.min(Math.max(len + 2, 8), 60)}" customWidth="1"/>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`
}

/** Tên trang: ≤ 31 ký tự, không có : \ / ? * [ ] */
function sheetName(s: string, used: Set<string>) {
  let base =
    s
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Trang'
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`
  used.add(name.toLowerCase())
  base = name
  return base
}

export function toXlsx(sheets: Sheet[]) {
  const enc = new TextEncoder()
  const used = new Set<string>()
  const names = sheets.map((s) => sheetName(s.name, used))
  const files: { name: string; data: Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    {
      name: 'xl/styles.xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
  ]
  return zipStored(files)
}
