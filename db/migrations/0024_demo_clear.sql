-- 0024 — Xoá dữ liệu hiện có rồi nạp gói thử (S12, Đợt 6F). App trên hosting đang có dữ liệu thử cũ (Phiếu 4, câu 18):
-- Chủ cần dọn trước khi nạp gói thử, mà không chuyển sang "dùng thật". Chỉ làm được khi chưa từng nạp gói thử.

-- Phần xoá dùng chung: tạm tắt trigger chặn xoá trong giao dịch này, xoá các bảng nghiệp vụ, bật lại
create function app._demo_truncate() returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t text;
begin
  foreach t in array app.demo_wipe_tables() loop
    execute format('alter table %I disable trigger user', t);
  end loop;
  execute 'truncate table ' || (select string_agg(quote_ident(x), ', ') from unnest(app.demo_wipe_tables()) x)
    || ' restart identity';
  foreach t in array app.demo_wipe_tables() loop
    execute format('alter table %I enable trigger user', t);
  end loop;
end $$;

create or replace function app.demo_golive_wipe(p_branch uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_state text;
begin
  perform app._require_users_manage(p_branch);
  select state into v_state from demo_state where id = 1 for update;
  if v_state = 'live' then
    raise exception 'App đã bắt đầu dùng thật, không xoá được nữa.' using errcode = 'P0001';
  end if;
  perform app._demo_truncate();
  update demo_state set state = 'live', live_at = now(), live_by = app.uid() where id = 1;
  perform app._audit(p_branch, 'demo.golive_wiped', app.uid(), jsonb_build_object('tables', app.demo_wipe_tables()));
end $$;

-- Dọn dữ liệu cũ để nạp gói thử: chỉ khi chưa nạp lần nào và chưa dùng thật
create function app.demo_clear_existing(p_branch uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_state text;
begin
  perform app._require_users_manage(p_branch);
  select state into v_state from demo_state where id = 1 for update;
  if v_state <> 'empty' then
    raise exception 'Chỉ dọn được trước khi nạp gói thử lần đầu.' using errcode = 'P0001';
  end if;
  perform app._demo_truncate();
  perform app._audit(p_branch, 'demo.existing_cleared', app.uid(), null);
end $$;
grant execute on function app.demo_clear_existing(uuid) to app_user;
