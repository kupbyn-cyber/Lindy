// Kiểu cho test (chương trình trạm in viết bằng JavaScript thuần để chạy thẳng bằng Node trên MacBook).
import type { BillData } from '../../src/lib/bill'

export type Raster = { width: number; height: number; pixels: Uint8Array }
export type Printer =
  | { type: 'tcp'; host: string; port: number }
  | { type: 'cups'; queue: string }
  | { type: 'file'; path: string }

export function billSvg(bill: BillData, width?: number): string
export function toEscPos(img: Raster): Buffer
export function renderBill(bill: BillData, width?: number, fontDir?: string): Promise<Raster>
export function parsePrinter(url: string): Printer
export function sendToPrinter(printer: string | Printer, buf: Buffer, timeoutMs?: number): Promise<void>
export function pollOnce(
  cfg: { server: string; token: string; printer: string },
  f?: typeof fetch,
): Promise<{ id: string; ok: boolean; error: string | null } | null>
