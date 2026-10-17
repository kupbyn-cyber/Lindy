-- 0027 — Người nghỉ trong ngày trên màn Lịch (S32): ai xem được lịch cơ sở thì thấy TÊN người nghỉ ngày đó (đã duyệt
-- hoặc đang chờ duyệt) để chủ động sắp lịch. RLS leave_requests vẫn giữ nguyên (thợ chỉ đọc đơn của mình); hàm này chỉ
-- trả tên và trạng thái, không trả lý do, ghi chú, người duyệt. Đơn bị từ chối, đã huỷ không hiện.

create function app.staff_off_on(p_branch uuid, p_date date)
returns table (user_id uuid, display_name text, status text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if app.uid() is null or not app.has_perm(p_branch, 'appointments.read_branch') then
    raise exception 'Không có quyền xem lịch của cơ sở này.' using errcode = '42501';
  end if;
  return query
    select distinct on (l.user_id) l.user_id, u.display_name, l.status
    from leave_requests l
    join users u on u.id = l.user_id
    where l.branch_id = p_branch
      and l.status in ('approved', 'requested')
      and p_date between l.from_date and l.to_date
      -- Người còn làm ở cơ sở (tài khoản đã xoá, đã nghỉ việc thì thôi)
      and exists (select 1 from user_branch_roles r
                  where r.user_id = l.user_id and r.branch_id = p_branch and r.revoked_at is null)
    -- Một người có cả đơn đã duyệt lẫn chờ duyệt trùng ngày: lấy đã duyệt
    order by l.user_id, (l.status = 'approved') desc;
end $$;
grant execute on function app.staff_off_on(uuid, date) to app_user;
