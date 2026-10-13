-- 0005 — Quản lý tài khoản trên app (hosting không có dòng lệnh để chạy CLI quản trị).
-- Mọi hàm kiểm quyền users.manage ở DB; không thao tác lên chính mình (tránh tự khoá); có audit.
-- Thay đổi vai trò, mật khẩu, khoá, thu quyền → thu hồi mọi phiên và push của người đó [P1].

insert into permissions (code, description)
values ('users.manage', 'Quản lý tài khoản: tạo, đặt lại mật khẩu, đổi vai trò, khoá')
on conflict (code) do nothing;
insert into role_permissions (role_id, permission_code)
select id, 'users.manage' from roles where code = 'owner'
on conflict do nothing;

create function app._require_users_manage(p_branch uuid) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if app.uid() is null or not app.has_perm(p_branch, 'users.manage') then
    raise exception 'Chỉ chủ quán quản lý được tài khoản.' using errcode = '42501';
  end if;
end $$;

create function app._require_target(p_branch uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_user = app.uid() then
    raise exception 'Không thao tác được trên tài khoản của chính mình. Dùng Đổi mật khẩu.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from user_branch_roles where user_id = p_user and branch_id = p_branch) then
    raise exception 'Không tìm thấy tài khoản.' using errcode = '22P02';
  end if;
end $$;

-- Thu hồi phiên, tắt push, báo SSE đóng kết nối.
create function app._revoke_user_access(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_sessions uuid[];
begin
  with s as (
    update sessions set revoked_at = now(), revoke_reason = p_reason
    where user_id = p_user and revoked_at is null returning id
  ) select coalesce(array_agg(id), '{}') into v_sessions from s;
  update push_subscriptions set disabled_at = now(), disabled_reason = p_reason
  where user_id = p_user and disabled_at is null;
  perform pg_notify('lindy_events', json_build_object(
    'kind', 'sessions_revoked', 'sessionIds', v_sessions, 'userIds', array[p_user])::text);
end $$;

create function app._audit(p_branch uuid, p_action text, p_user uuid, p_details jsonb) returns void
language sql security definer set search_path = pg_catalog, public as $$
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (app.uid(), p_branch, p_action, 'user', p_user::text, coalesce(p_details, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------- Đọc

create function app.admin_list_users(p_branch uuid)
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
    where exists (select 1 from user_branch_roles x where x.user_id = u.id and x.branch_id = p_branch)
    order by u.is_active desc, (r.code is null), u.display_name;
end $$;

-- ---------------------------------------------------------------- Ghi

create function app.admin_create_user(
  p_branch uuid, p_name text, p_phone text, p_email text, p_role text, p_hash text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_org uuid;
  v_role uuid;
  v_id uuid;
begin
  perform app._require_users_manage(p_branch);
  select organization_id into v_org from branches where id = p_branch;
  select id into v_role from roles where organization_id = v_org and code = p_role;
  if v_role is null then
    raise exception 'Vai trò không hợp lệ.' using errcode = 'P0001';
  end if;
  if exists (select 1 from users where (p_phone is not null and phone = p_phone)
                                    or (p_email is not null and email = p_email)) then
    raise exception 'SĐT hoặc email này đã có tài khoản.' using errcode = 'P0001';
  end if;
  insert into users (organization_id, display_name, phone, email)
  values (v_org, p_name, p_phone, p_email) returning id into v_id;
  insert into user_credentials (user_id, password_hash, must_change_password) values (v_id, p_hash, true);
  insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
  values (v_id, p_branch, v_role, 'user:' || app.uid()::text);
  perform app._audit(p_branch, 'admin.user_created', v_id, jsonb_build_object('role', p_role));
  return v_id;
end $$;

create function app.admin_reset_password(p_branch uuid, p_user uuid, p_hash text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._require_users_manage(p_branch);
  perform app._require_target(p_branch, p_user);
  update user_credentials set password_hash = p_hash, must_change_password = true, password_changed_at = now()
  where user_id = p_user;
  perform app._revoke_user_access(p_user, 'password_reset');
  perform app._audit(p_branch, 'admin.password_reset', p_user, null);
end $$;

create function app.admin_set_role(p_branch uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_role uuid;
begin
  perform app._require_users_manage(p_branch);
  perform app._require_target(p_branch, p_user);
  select r.id into v_role from roles r join branches b on b.organization_id = r.organization_id
  where b.id = p_branch and r.code = p_role;
  if v_role is null then
    raise exception 'Vai trò không hợp lệ.' using errcode = 'P0001';
  end if;
  update user_branch_roles set revoked_at = now(), revoked_by_label = 'user:' || app.uid()::text
  where user_id = p_user and branch_id = p_branch and revoked_at is null;
  insert into user_branch_roles (user_id, branch_id, role_id, granted_by_label)
  values (p_user, p_branch, v_role, 'user:' || app.uid()::text);
  perform app._revoke_user_access(p_user, 'role_changed');
  perform app._audit(p_branch, 'admin.role_set', p_user, jsonb_build_object('role', p_role));
end $$;

create function app.admin_revoke_access(p_branch uuid, p_user uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._require_users_manage(p_branch);
  perform app._require_target(p_branch, p_user);
  update user_branch_roles set revoked_at = now(), revoked_by_label = 'user:' || app.uid()::text
  where user_id = p_user and branch_id = p_branch and revoked_at is null;
  perform app._revoke_user_access(p_user, 'access_revoked');
  perform app._audit(p_branch, 'admin.branch_revoked', p_user, null);
end $$;

create function app.admin_set_active(p_branch uuid, p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._require_users_manage(p_branch);
  perform app._require_target(p_branch, p_user);
  update users set is_active = p_active, updated_at = now() where id = p_user;
  if not p_active then
    perform app._revoke_user_access(p_user, 'locked');
  end if;
  perform app._audit(p_branch, case when p_active then 'admin.user_unlocked' else 'admin.user_locked' end, p_user, null);
end $$;

grant execute on function app.admin_list_users(uuid) to app_user;
grant execute on function app.admin_create_user(uuid, text, text, text, text, text) to app_user;
grant execute on function app.admin_reset_password(uuid, uuid, text) to app_user;
grant execute on function app.admin_set_role(uuid, uuid, text) to app_user;
grant execute on function app.admin_revoke_access(uuid, uuid) to app_user;
grant execute on function app.admin_set_active(uuid, uuid, boolean) to app_user;
