-- 0026 — Bỏ tip trên app (S27): khách tip chuyển riêng cho nhân viên, app không ghi tip mới, không huỷ tip.
-- Chặn ở database: app_user không gọi được hàm ghi tip, huỷ tip. Bảng, bút toán tip đã có giữ nguyên (không xoá dữ liệu);
-- tip đã ghi mà chưa trả thì Nhung, Linh vẫn trả nốt cho thợ qua app.pay_tips (giữ quyền).

revoke execute on function app.record_tip(uuid, uuid[], bigint[], uuid) from app_user;
revoke execute on function app.void_tip(uuid, text) from app_user;
