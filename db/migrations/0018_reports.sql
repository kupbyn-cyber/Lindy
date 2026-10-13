-- 0018 — Báo cáo đã chốt, sao lưu (Đợt 5A, kế hoạch Đợt 5 mục 7.1; PRD §11, §15, test 19; K24, K25).
-- - Khoá bảng lương tháng → chụp số báo cáo tháng (doanh thu, theo thợ, cọc bỏ hẹn, số đơn) trong cùng giao dịch.
--   Báo cáo tháng đó hiện số đã chốt, phần khác đi sau đó là "phát sinh sau khi chốt" (K24).
-- - Bản sao lưu dữ liệu nghiệp vụ (Linh, quyền data.export): JSON từng bảng, không gồm mật khẩu, phiên, đăng ký push.

-- ---------------------------------------------------------------- Bản chụp báo cáo tháng

create table month_report_snapshots (
  branch_id uuid not null,
  month date not null,
  figures jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (branch_id, month),
  foreign key (branch_id, month) references payroll_periods(branch_id, month)
);
create trigger month_report_snapshots_append_only before update or delete on month_report_snapshots
  for each row execute function app.forbid_mutation();
create trigger month_report_snapshots_no_truncate before truncate on month_report_snapshots
  for each statement execute function app.forbid_mutation();

-- Số báo cáo tháng, cùng cách tính với báo cáo (Q01, Q02, Q34, C04): đơn đã xác nhận theo ngày làm dịch vụ, trừ phiếu
-- hoàn theo ngày ghi hoàn; doanh thu theo thợ; doanh thu cọc khách bỏ hẹn theo ngày hẹn.
create function app._month_figures(p_branch uuid, p_month date) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  with m as (select p_month as first, (p_month + interval '1 month' - interval '1 day')::date as last),
  o as (
    select o.* from orders o, m
    where o.branch_id = p_branch and o.status = 'confirmed' and o.service_date between m.first and m.last),
  rf as (
    select r.* from order_refunds r join orders o2 on o2.id = r.order_id, m
    where r.branch_id = p_branch and o2.status = 'confirmed' and r.revenue_date between m.first and m.last),
  st as (
    select x.staff_user_id, sum(x.amount)::bigint as amount
    from (
      select a.staff_user_id, a.allocated_net_amount as amount
      from o join order_staff_allocations a on a.order_id = o.id and a.rev = o.content_rev
      union all
      select ra.staff_user_id, -ra.amount from rf join order_refund_allocations ra on ra.refund_id = rf.id
    ) x
    group by x.staff_user_id)
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'gross', (select coalesce(sum(gross_amount), 0) from o),
    'discount', (select coalesce(sum(discount_amount), 0) from o),
    'refunded', (select coalesce(sum(amount), 0) from rf),
    'net', (select coalesce(sum(net_amount), 0) from o) - (select coalesce(sum(amount), 0) from rf),
    'forfeited', (select coalesce(sum(d.resolved_amount), 0) from appointment_deposits d, m
                  where d.branch_id = p_branch and d.status = 'forfeited' and d.revenue_date between m.first and m.last),
    'byStaff', coalesce((select jsonb_agg(jsonb_build_object('userId', staff_user_id, 'amount', amount)
                                          order by amount desc)
                         from st), '[]'::jsonb))
$$;

-- Ghi bản chụp khi khoá (dòng kỳ lương chỉ do app.payroll_lock thêm)
create function app.payroll_periods_snapshot() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into month_report_snapshots (branch_id, month, figures, created_by)
  values (new.branch_id, new.month, app._month_figures(new.branch_id, new.month), new.locked_by);
  return null;
end $$;

create trigger payroll_periods_snapshot after insert on payroll_periods
  for each row execute function app.payroll_periods_snapshot();

-- ---------------------------------------------------------------- Sao lưu dữ liệu nghiệp vụ (test 19, K25)

-- Linh (data.export) hoặc chủ DB chạy script. Bỏ mật khẩu, phiên, lần đăng nhập, đăng ký push và hàng đợi gửi push.
-- Kèm tóm tắt (số dòng từng bảng, số dư từng tài khoản, doanh thu đơn đã xác nhận theo tháng) để kiểm khi khôi phục.
create function app.backup_dump() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_version text;
  r record;
begin
  if v_uid is not null then
    if not exists (select 1 from user_branch_roles ubr join users u on u.id = ubr.user_id
                   join role_permissions rp on rp.role_id = ubr.role_id
                   where ubr.user_id = v_uid and ubr.revoked_at is null and u.is_active
                     and rp.permission_code = 'data.export') then
      raise exception 'Chỉ chủ quán tải bản sao lưu.' using errcode = '42501';
    end if;
  elsif session_user = 'lindy_app' then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('user_credentials', 'sessions', 'login_attempts', 'push_subscriptions',
                            'notification_deliveries', 'schema_migrations')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', r.relname) into v_rows;
    v_tables := v_tables || jsonb_build_object(r.relname, v_rows);
    v_counts := v_counts || jsonb_build_object(r.relname, jsonb_array_length(v_rows));
  end loop;
  select max(version) into v_version from schema_migrations;

  insert into audit_logs (actor_user_id, actor_label, action, entity_type, details)
  values (v_uid, case when v_uid is null then 'script' end, 'backup.downloaded', 'organization',
          jsonb_build_object('migration', v_version, 'tables', (select count(*) from jsonb_object_keys(v_counts))));

  return jsonb_build_object(
    'format', 'lindy-backup-1',
    'migration', v_version,
    'exportedAt', now(),
    'summary', jsonb_build_object(
      'counts', v_counts,
      'balances', coalesce((select jsonb_object_agg(money_account_id, s) from (
                    select money_account_id, sum(amount) as s from money_ledger_entries group by money_account_id) b),
                  '{}'::jsonb),
      'revenueByMonth', coalesce((select jsonb_object_agg(m, s) from (
                    select to_char(service_date, 'YYYY-MM') as m, sum(net_amount) as s from orders
                    where status = 'confirmed' group by 1) x), '{}'::jsonb)),
    'tables', v_tables);
end $$;

-- ---------------------------------------------------------------- Quyền bảng

alter table month_report_snapshots enable row level security;
grant select on month_report_snapshots to app_user;
create policy month_report_snapshots_read on month_report_snapshots for select to app_user
  using (app.has_perm(branch_id, 'revenue.read_branch'));

grant execute on function app.backup_dump() to app_user;
