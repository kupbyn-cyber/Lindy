# Demo giao diện

- `lindy-huong-b.html`: demo hướng B (Bước 3 của `docs/plans/2026-10-31-lam-moi-giao-dien.md`). Dựng lại từ màn thật, dữ liệu giả, không nối API. File là **nội dung trang** (không có `<!doctype>`, `<html>`, `<body>`) để xuất bản thành Artifact trên claude.ai; trang Artifact tự bọc khung.
- Mở trực tiếp trên máy: dùng bản đã bọc `lindy-huong-b.local.html` (sinh từ file trên bằng lệnh dưới, đừng sửa tay).

```bash
node design/demo/bao-local.mjs
```

- Bản Artifact riêng tư: https://claude.ai/artifact/C3MLn3dxVm9QEpQG9HrktW (xuất bản 31/10/2026).

Trong demo có thanh "Demo hướng B" (Tự động · Sáng · Tối · Phiếu) và nút "Đo tương phản" ở cuối trang: chỉ dùng trong demo, không có trong app.
