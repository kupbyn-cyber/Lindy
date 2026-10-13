-- 0008 — Sửa quyền gọi hàm trong schema app (phát hiện khi làm Đợt 2, 13/10/2026).
-- Lệnh "alter default privileges in schema app revoke execute on functions from public" ở 0001 không có tác dụng:
-- quyền mặc định theo schema chỉ cộng thêm vào quyền mặc định toàn cục, không thu được EXECUTE mà PUBLIC có sẵn.
-- Hệ quả: app_user, app_worker gọi được cả hàm nội bộ (_emit, _revoke_user_access, _audit, emit_system_event…).
-- Sửa: thu EXECUTE của PUBLIC trên mọi hàm hiện có; đặt mặc định toàn cục cho role chạy migration để hàm tạo sau
-- cũng không tự cấp; cấp lại đúng hàm cần. Các hàm đã cấp riêng cho app_user/app_worker ở migration trước giữ nguyên.
-- Hàm trigger không cần EXECUTE lúc chạy; hàm do trigger chạy dưới quyền người thao tác (invoker) gọi thì cần.

revoke execute on all functions in schema app from public;
alter default privileges revoke execute on functions from public;

-- appointments_guard (invoker) gọi branch_tz dưới quyền app_user
grant execute on function app.branch_tz(uuid) to app_user;
