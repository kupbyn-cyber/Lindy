-- 0003 — Gửi thông báo thử cho chính mình, để kiểm Web Push trên từng máy (màn hướng dẫn bật thông báo).

create function app.emit_self_test(p_branch uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_event uuid;
  v_recipient uuid;
begin
  if v_uid is null or not app.has_branch(p_branch) then
    raise exception 'Không có quyền ở cơ sở này.' using errcode = '42501';
  end if;

  insert into notification_events (branch_id, type, actor_user_id, push_title, push_body, url)
  values (p_branch, 'system.test', v_uid, 'LINDY OS', 'Thông báo thử. Máy này đã nhận được thông báo.', '/thong-bao')
  returning id into v_event;

  insert into notification_recipients (event_id, user_id, branch_id, type, title, body, url)
  values (v_event, v_uid, p_branch, 'system.test', 'Thông báo thử', 'Máy này đã nhận được thông báo.', '/thong-bao')
  returning id into v_recipient;

  insert into notification_deliveries (recipient_id, subscription_id)
  select v_recipient, ps.id from push_subscriptions ps where ps.user_id = v_uid and ps.disabled_at is null;

  perform pg_notify('lindy_events', json_build_object('kind', 'notifications', 'branchId', p_branch,
                                                      'userIds', array[v_uid])::text);
  perform pg_notify('lindy_push', '');
  return v_event;
end $$;

grant execute on function app.emit_self_test(uuid) to app_user;
