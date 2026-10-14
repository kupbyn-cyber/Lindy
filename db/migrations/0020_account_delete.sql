-- 0020 — Xoá tài khoản (S01, Đợt 6D). Chỉ Chủ (users.manage), không xoá chính mình.
-- Tài khoản chưa phát sinh dữ liệu: xoá hẳn. Đã có dữ liệu (khoá ngoại chặn): xoá thông tin đăng nhập, khoá,
-- đánh dấu đã xoá và ẩn khỏi danh sách; tên vẫn hiện trong đơn, lương, lịch sử. SĐT dùng lại được.

alter table users add column deleted_at timestamptz;

create function app.admin_delete_user(p_branch uuid, p_user uuid) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_name text;
begin
  perform app._require_users_manage(p_branch);
  perform app._require_target(p_branch, p_user);
  select display_name into v_name from users where id = p_user and deleted_at is null for update;
  if v_name is null then
    raise exception 'Không tìm thấy tài khoản.' using errcode = '22P02';
  end if;
  perform app._revoke_user_access(p_user, 'deleted');

  -- Thử xoá hẳn. Phần đăng nhập, quyền, thông báo của chính người này xoá theo; còn dòng nghiệp vụ nào trỏ tới
  -- (đơn, lịch, chấm công, lương, audit do người này làm…) thì khoá ngoại chặn và khối này huỷ toàn bộ.
  begin
    delete from notification_deliveries
    where recipient_id in (select id from notification_recipients where user_id = p_user)
       or subscription_id in (select id from push_subscriptions where user_id = p_user);
    delete from notification_recipients where user_id = p_user;
    delete from notification_preferences where user_id = p_user;
    delete from push_subscriptions where user_id = p_user;
    delete from sessions where user_id = p_user;
    delete from user_credentials where user_id = p_user;
    delete from user_branch_roles where user_id = p_user;
    delete from users where id = p_user;
    perform app._audit(p_branch, 'admin.user_deleted', p_user, jsonb_build_object('name', v_name, 'mode', 'deleted'));
    return 'deleted';
  exception when foreign_key_violation then
    null;
  end;

  -- Đã có dữ liệu: bỏ thông tin đăng nhập, khoá, thu quyền, ẩn.
  update users
  set phone = null, email = 'da-xoa-' || id::text || '@lindy.invalid', is_active = false,
      deleted_at = now(), updated_at = now()
  where id = p_user;
  update user_credentials set password_hash = 'deleted', must_change_password = true, password_changed_at = now()
  where user_id = p_user;
  update user_branch_roles set revoked_at = now(), revoked_by_label = 'user:' || app.uid()::text
  where user_id = p_user and revoked_at is null;
  perform app._audit(p_branch, 'admin.user_deleted', p_user, jsonb_build_object('name', v_name, 'mode', 'hidden'));
  return 'hidden';
end $$;
grant execute on function app.admin_delete_user(uuid, uuid) to app_user;

-- Danh sách tài khoản, nhân viên: ẩn người đã xoá.
create or replace function app.admin_list_users(p_branch uuid)
returns table (
  id uuid, display_name text, phone text, email text, is_active boolean, must_change_password boolean,
  role_code text, role_name text, last_login_at timestamptz, is_me boolean
)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  perform app._require_users_manage(p_branch);
  return query
    select u.id, u.display_name, u.phone, u.email, u.is_active, c.must_change_password,
           r.code, r.name,
           (select max(s.created_at) from sessions s where s.user_id = u.id),
           u.id = app.uid()
    from users u
    join user_credentials c on c.user_id = u.id
    left join lateral (
      select ubr.role_id from user_branch_roles ubr
      where ubr.user_id = u.id and ubr.branch_id = p_branch and ubr.revoked_at is null
      order by ubr.granted_at desc limit 1
    ) cur on true
    left join roles r on r.id = cur.role_id
    where u.deleted_at is null
      and exists (select 1 from user_branch_roles x where x.user_id = u.id and x.branch_id = p_branch)
    order by u.is_active desc, (r.code is null), u.display_name;
end $$;

create or replace function app.staff_people(p_branch uuid)
returns table (user_id uuid, display_name text, is_active boolean, role_code text, role_name text)
language sql stable security definer set search_path = pg_catalog, public as $$
  select u.id, u.display_name, u.is_active and r.code is not null, r.code, r.name
  from users u
  left join lateral (select ro.code, ro.name from user_branch_roles ubr join roles ro on ro.id = ubr.role_id
                     where ubr.user_id = u.id and ubr.branch_id = p_branch and ubr.revoked_at is null
                     order by ubr.granted_at desc limit 1) r on true
  where app.has_branch(p_branch)
    and u.deleted_at is null
    and exists (select 1 from user_branch_roles x where x.user_id = u.id and x.branch_id = p_branch)
    and (u.id = app.uid() or app.has_perm(p_branch, 'payroll.read_all_branch')
         or app.has_perm(p_branch, 'attendance.approve'))
  order by u.display_name
$$;
