-- 0023 — Dữ liệu dùng thử (S12, S17, Đợt 6F).
-- - demo_state: một dòng cho cả hệ thống: empty (chưa nạp) → loaded (đã nạp gói thử) → live (đã xoá, dùng thật).
--   Đã sang live thì không nạp, không xoá được nữa.
-- - app.demo_people: người trong cơ sở kèm quyền, để bộ nạp thao tác đúng tên từng người (chỉ Chủ gọi).
-- - app.demo_golive_wipe: Chủ bấm "Xoá, bắt đầu dùng thật". Xoá sạch dữ liệu nghiệp vụ; giữ tài khoản, danh mục, cài
--   đặt, nhật ký thao tác. Đây là ngoại lệ có chủ đích của quy tắc không xoá (S12), chỉ chạy được một lần.

create table demo_state (
  id int primary key default 1 check (id = 1),
  state text not null default 'empty' check (state in ('empty', 'loaded', 'live')),
  loaded_at timestamptz,
  loaded_by uuid references users(id),
  live_at timestamptz,
  live_by uuid references users(id)
);
insert into demo_state (id, state) values (1, 'empty');
alter table demo_state enable row level security;
grant select on demo_state to app_user;
create policy demo_state_read on demo_state for select to app_user using (true);

create function app.demo_people(p_branch uuid)
returns table (user_id uuid, display_name text, perms text[])
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  perform app._require_users_manage(p_branch);
  return query
    select u.id, u.display_name, array_agg(distinct rp.permission_code order by rp.permission_code)
    from users u
    join user_branch_roles ubr on ubr.user_id = u.id and ubr.branch_id = p_branch and ubr.revoked_at is null
    join role_permissions rp on rp.role_id = ubr.role_id
    where u.is_active and u.deleted_at is null
    group by u.id, u.display_name
    order by u.display_name;
end $$;
grant execute on function app.demo_people(uuid) to app_user;

-- Bộ nạp đánh dấu đã nạp (sau khi tạo xong dữ liệu)
create function app.demo_mark_loaded(p_branch uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._require_users_manage(p_branch);
  update demo_state set state = 'loaded', loaded_at = now(), loaded_by = app.uid() where id = 1 and state = 'empty';
  if not found then
    raise exception 'Gói dữ liệu thử đã nạp hoặc app đã dùng thật.' using errcode = 'P0001';
  end if;
  perform app._audit(p_branch, 'demo.loaded', app.uid(), null);
end $$;
grant execute on function app.demo_mark_loaded(uuid) to app_user;

-- Bảng xoá khi bắt đầu dùng thật. Không bảng nào được giữ lại trỏ khoá ngoại tới các bảng này.
create function app.demo_wipe_tables() returns text[]
language sql immutable as $$
  select array[
    'notification_deliveries', 'notification_recipients', 'notification_events',
    'month_report_snapshots', 'payroll_payouts', 'payroll_lines', 'payroll_periods', 'payroll_revenue_entries',
    'payroll_adjustments', 'payroll_settings', 'employee_advances', 'staff_policy_versions', 'staff_profiles',
    'attendance_days', 'leave_requests', 'attachments',
    'cash_day_closes', 'cash_transfers', 'cash_vouchers', 'expense_requests', 'money_ledger_reconciliations',
    'money_ledger_entries', 'money_books',
    'tip_holdings', 'tip_payouts', 'order_refund_allocations', 'order_refunds', 'payments',
    'order_discounts', 'order_service_tickets', 'order_items', 'order_staff_allocations', 'order_audit_events',
    'orders', 'order_counters',
    'appointment_deposits', 'appointment_audit_events', 'appointments', 'deposit_seasons',
    'legacy_sales', 'legacy_imports', 'customer_audit_events', 'customers'
  ]
$$;

create function app.demo_golive_wipe(p_branch uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t text;
  v_state text;
begin
  perform app._require_users_manage(p_branch);
  select state into v_state from demo_state where id = 1 for update;
  if v_state = 'live' then
    raise exception 'App đã bắt đầu dùng thật, không xoá được nữa.' using errcode = 'P0001';
  end if;
  -- Tạm tắt trigger chặn xoá (chỉ thêm) trong chính giao dịch này, xoá, rồi bật lại
  foreach t in array app.demo_wipe_tables() loop
    execute format('alter table %I disable trigger user', t);
  end loop;
  execute 'truncate table ' || (select string_agg(quote_ident(x), ', ') from unnest(app.demo_wipe_tables()) x)
    || ' restart identity';
  foreach t in array app.demo_wipe_tables() loop
    execute format('alter table %I enable trigger user', t);
  end loop;
  update demo_state set state = 'live', live_at = now(), live_by = app.uid() where id = 1;
  perform app._audit(p_branch, 'demo.golive_wiped', app.uid(), jsonb_build_object('tables', app.demo_wipe_tables()));
end $$;
grant execute on function app.demo_golive_wipe(uuid) to app_user;
