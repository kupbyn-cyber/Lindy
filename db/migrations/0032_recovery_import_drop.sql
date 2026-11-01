-- 0032 — Gỡ công cụ nhập lại dữ liệu (0031): đã dùng xong ngày 01/11/2026, audit recovery.imported ghi lại lần chạy.
drop function app.recovery_import(uuid, text, boolean);
drop function app._recovery_copy(text, jsonb, text, boolean);
