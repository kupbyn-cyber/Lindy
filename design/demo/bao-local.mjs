// Bọc lindy-huong-b.html (nội dung trang cho Artifact) thành file mở trực tiếp được: node design/demo/bao-local.mjs
import { readFileSync, writeFileSync } from 'node:fs'
const src = new URL('./lindy-huong-b.html', import.meta.url)
const out = new URL('./lindy-huong-b.local.html', import.meta.url)
const head =
  '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>html{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>'
writeFileSync(out, head + readFileSync(src, 'utf8') + '</body></html>')
console.log('Đã sinh design/demo/lindy-huong-b.local.html')
