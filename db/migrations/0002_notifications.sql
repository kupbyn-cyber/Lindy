-- 0002 — Thông báo: outbox, trung tâm thông báo, đăng ký Web Push, hàng đợi gửi.
-- Kế hoạch 7.2, bước 0.16–0.17. Sự kiện ghi trong cùng giao dịch nghiệp vụ; push gửi nền.

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  type text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  actor_user_id uuid references users(id),
  entity_type text,
  entity_id uuid,
  dedupe_key text unique,                                  -- "báo một lần" không gửi trùng [P22]
  push_title text not null check (char_length(push_title) <= 60),
  push_body text not null check (char_length(push_body) <= 160), -- màn khoá: không tên khách, SĐT, ghi chú
  url text not null check (url ~ '^/[^/\\]' or url = '/'),  -- chỉ đường dẫn cùng origin [P19]
  created_at timestamptz not null default now()
);

create table notification_recipients (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references notification_events(id),
  user_id uuid not null references users(id),
  branch_id uuid not null references branches(id),
  type text not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  url text not null check (url ~ '^/[^/\\]' or url = '/'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index notification_recipients_user_idx on notification_recipients(user_id, created_at desc);

create table notification_preferences (
  user_id uuid not null references users(id),
  type text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

-- Endpoint chỉ nhận https và host dịch vụ push thật, chống SSRF [P6]
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  session_id uuid references sessions(id),
  endpoint text not null check (
    char_length(endpoint) <= 1000 and
    endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/'
  ),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text
);
create unique index push_subscriptions_endpoint_active_uq on push_subscriptions(endpoint) where disabled_at is null;
create index push_subscriptions_user_idx on push_subscriptions(user_id) where disabled_at is null;

create table notification_deliveries (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references notification_recipients(id),
  subscription_id uuid not null references push_subscriptions(id),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_deliveries_due_idx on notification_deliveries(next_attempt_at) where status = 'pending';

-- ---------------------------------------------------------------- Phát sự kiện

-- Hàm lõi: không cấp cho ai, chỉ gọi qua hai hàm bọc bên dưới.
create function app._emit(
  p_branch uuid, p_type text, p_actor uuid, p_entity_type text, p_entity_id uuid, p_dedupe text,
  p_audience_perm text, p_title text, p_body text, p_push_title text, p_push_body text, p_url text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_event uuid;
  v_users uuid[];
begin
  insert into notification_events (branch_id, type, actor_user_id, entity_type, entity_id, dedupe_key,
                                   push_title, push_body, url)
  values (p_branch, p_type, p_actor, p_entity_type, p_entity_id, p_dedupe, p_push_title, p_push_body, p_url)
  on conflict (dedupe_key) do nothing
  returning id into v_event;

  if v_event is null then
    return null; -- đã phát rồi
  end if;

  -- Người nhận: còn hoạt động, còn quyền ở cơ sở, có quyền nhận loại này, không tắt nhóm, không phải người thao tác.
  with recipients as (
    select distinct u.id
    from users u
    join user_branch_roles ubr on ubr.user_id = u.id and ubr.branch_id = p_branch and ubr.revoked_at is null
    join role_permissions rp on rp.role_id = ubr.role_id and rp.permission_code = p_audience_perm
    where u.is_active
      and u.id is distinct from p_actor
      and coalesce((select np.enabled from notification_preferences np
                    where np.user_id = u.id and np.type = p_type), true)
  ), ins as (
    insert into notification_recipients (event_id, user_id, branch_id, type, title, body, url)
    select v_event, r.id, p_branch, p_type, p_title, p_body, p_url from recipients r
    returning id, user_id
  ), dl as (
    insert into notification_deliveries (recipient_id, subscription_id)
    select ins.id, ps.id from ins
    join push_subscriptions ps on ps.user_id = ins.user_id and ps.disabled_at is null
  )
  select array_agg(ins.user_id) into v_users from ins;

  -- pg_notify chỉ phát khi giao dịch commit.
  perform pg_notify('lindy_events', json_build_object(
    'kind', 'notifications', 'branchId', p_branch, 'userIds', coalesce(v_users, '{}'::uuid[]))::text);
  perform pg_notify('lindy_push', '');
  return v_event;
end $$;

-- Người dùng phát sự kiện: phải có quyền ở cơ sở; người thao tác là chính mình.
create function app.emit_event(
  p_branch uuid, p_type text, p_entity_type text, p_entity_id uuid, p_dedupe text,
  p_audience_perm text, p_title text, p_body text, p_push_title text, p_push_body text, p_url text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if app.uid() is null or not app.has_branch(p_branch) then
    raise exception 'Không có quyền ở cơ sở này.' using errcode = '42501';
  end if;
  return app._emit(p_branch, p_type, app.uid(), p_entity_type, p_entity_id, p_dedupe,
                   p_audience_perm, p_title, p_body, p_push_title, p_push_body, p_url);
end $$;

-- Việc nền (lịch quá giờ…) phát sự kiện không có người thao tác.
create function app.emit_system_event(
  p_branch uuid, p_type text, p_entity_type text, p_entity_id uuid, p_dedupe text,
  p_audience_perm text, p_title text, p_body text, p_push_title text, p_push_body text, p_url text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  return app._emit(p_branch, p_type, null, p_entity_type, p_entity_id, p_dedupe,
                   p_audience_perm, p_title, p_body, p_push_title, p_push_body, p_url);
end $$;

grant execute on function app.emit_event(uuid, text, text, uuid, text, text, text, text, text, text, text) to app_user;
grant execute on function app.emit_system_event(uuid, text, text, uuid, text, text, text, text, text, text, text) to app_worker;

-- ---------------------------------------------------------------- Đăng ký push

-- Đăng ký máy này cho người đang đăng nhập. Tối đa 5 máy mỗi người [P6].
create function app.register_push(p_session uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
begin
  if v_uid is null or not exists (
    select 1 from sessions s where s.id = p_session and s.user_id = v_uid and s.revoked_at is null
  ) then
    raise exception 'Phiên không hợp lệ.' using errcode = '42501';
  end if;

  -- Cùng endpoint (máy này đăng ký lại, hoặc người trước đã dùng máy này) → tắt bản cũ.
  update push_subscriptions set disabled_at = now(), disabled_reason = 'replaced'
  where endpoint = p_endpoint and disabled_at is null;

  if (select count(*) from push_subscriptions where user_id = v_uid and disabled_at is null) >= 5 then
    raise exception 'Đã có 5 máy nhận thông báo. Tắt bớt một máy trước.' using errcode = 'P0001', hint = 'limit';
  end if;

  insert into push_subscriptions (user_id, session_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_session, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end $$;

-- Tắt đăng ký của chính mình; của người khác thì không thấy [P12].
create function app.disable_push(p_id uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update push_subscriptions set disabled_at = now(), disabled_reason = 'user'
  where id = p_id and user_id = app.uid() and disabled_at is null;
  return found;
end $$;

grant execute on function app.register_push(uuid, text, text, text, text) to app_user;
grant execute on function app.disable_push(uuid) to app_user;

-- ---------------------------------------------------------------- Quyền bảng và RLS [P12]

alter table notification_events enable row level security;
alter table notification_recipients enable row level security;
alter table notification_preferences enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_deliveries enable row level security;

grant select on notification_events to app_worker;
create policy events_worker on notification_events for select to app_worker using (true);

grant select on notification_recipients to app_user, app_worker;
grant update (read_at) on notification_recipients to app_user;
create policy recipients_user_read on notification_recipients for select to app_user
  using (user_id = app.uid() and app.has_branch(branch_id));
create policy recipients_user_mark on notification_recipients for update to app_user
  using (user_id = app.uid()) with check (user_id = app.uid());
create policy recipients_worker on notification_recipients for select to app_worker using (true);

grant select, insert, update on notification_preferences to app_user;
create policy prefs_user on notification_preferences for all to app_user
  using (user_id = app.uid()) with check (user_id = app.uid());

grant select (id, user_id, session_id, user_agent, created_at, last_success_at, disabled_at) on push_subscriptions to app_user;
grant select, update on push_subscriptions to app_worker;
create policy push_user_read on push_subscriptions for select to app_user using (user_id = app.uid());
create policy push_worker on push_subscriptions for all to app_worker using (true) with check (true);

grant select, update on notification_deliveries to app_worker;
create policy deliveries_worker on notification_deliveries for all to app_worker using (true) with check (true);
