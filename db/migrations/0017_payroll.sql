-- 0017 — Lương (Đợt 4B, kế hoạch Đợt 4 mục 7.2; PRD §6.1 (D04), §6.3 (Q34), §9; K20–K22; invariant 7, 8, 18).
-- - Sổ doanh thu tính lương (chỉ thêm): đơn Đã xác nhận, phiếu hoàn sinh dòng cơ sở hoa hồng từng thợ và doanh thu quán
--   (KPI). Sửa, huỷ đơn: dòng đảo + dòng mới. Tháng tự nhiên đã khoá → dòng vào tháng hiện tại (D04, Q34).
-- - Công thức §9.1 trong một hàm SQL dùng chung cho lương tạm tính, bảng lương, khoá. Khoá chụp lại đủ tham số.
-- - Tạm ứng (A05, K21): tổng trong tháng ≤ lương cứng; chỉ Linh duyệt; Nhung, Linh chi → bút toán "advance".
-- - Khoá lần lượt từng tháng, từ ngày nháp (ngày 5 tháng sau), khi mọi ngày công đã duyệt (K20); tạm ứng vượt lương
--   chuyển thành khoản trừ tháng sau (K22). Trả lương (Linh) → bút toán "payroll".

-- ---------------------------------------------------------------- Sổ tiền: loại bút toán mới

alter table money_ledger_entries drop constraint money_ledger_entry_type_check;
alter table money_ledger_entries add constraint money_ledger_entry_type_check check (entry_type in (
  'opening', 'payment', 'payment_void', 'deposit_in', 'deposit_in_void', 'deposit_refund', 'tip_in', 'tip_in_void',
  'tip_payout', 'expense', 'other_income', 'capital_in', 'capital_out', 'transfer_out', 'transfer_in', 'refund',
  'cash_count_diff', 'adjustment',
  'advance',                                     -- chi tạm ứng (khoản nhân viên nợ quán, không phải chi phí)
  'payroll'));                                   -- trả lương theo bảng lương đã khoá
alter table money_ledger_entries drop constraint money_ledger_entries_source_type_check;
alter table money_ledger_entries add constraint money_ledger_entries_source_type_check check (source_type in (
  'book', 'payment', 'deposit', 'expense', 'voucher', 'transfer', 'tip', 'tip_payout', 'refund', 'day_close',
  'advance', 'payroll_payout'));

-- ---------------------------------------------------------------- Kỳ lương: hàm phụ

create function app.payroll_month_locked(p_branch uuid, p_date date) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from payroll_periods where branch_id = p_branch and month = date_trunc('month', p_date)::date)
$$;

-- Tháng nhận một khoản phát sinh: tháng của nó nếu chưa khoá, ngược lại tháng hiện tại (luôn đang mở)
create function app.payroll_target_month(p_branch uuid, p_date date) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
  select case when app.payroll_month_locked(p_branch, p_date)
              then date_trunc('month', app.branch_today(p_branch))::date
              else date_trunc('month', p_date)::date end
$$;

-- Ghi vào kỳ lương lấy khoá chia sẻ; khoá bảng lương lấy khoá loại trừ → không dòng nào lọt vào tháng đang khoá [P67]
create function app._payroll_share_lock(p_branch uuid) returns void
language sql security definer set search_path = pg_catalog, public as $$
  select pg_advisory_xact_lock_shared(hashtextextended('payroll:' || p_branch::text, 0))
$$;

create function app._vnd(p bigint) returns text
language sql immutable as $$
  select case when p < 0 then '-' else '' end || replace(to_char(abs(p), 'FM999,999,999,999,990'), ',', '.') || 'đ'
$$;

-- Lương cứng có hiệu lực của tháng (hạn mức tạm ứng, A05)
create function app._base_salary(p_branch uuid, p_user uuid, p_month date) returns bigint
language sql stable security definer set search_path = pg_catalog, public as $$
  select base_salary from staff_policy_versions
  where branch_id = p_branch and user_id = p_user and effective_month <= p_month
  order by effective_month desc limit 1
$$;

-- ---------------------------------------------------------------- Sổ doanh thu tính lương

create table payroll_revenue_entries (
  id bigint generated always as identity primary key,
  branch_id uuid not null references branches(id),
  order_id uuid not null references orders(id),
  source_type text not null check (source_type in ('order', 'refund')),
  source_id uuid not null,
  staff_user_id uuid references users(id),            -- null = dòng doanh thu quán (KPI quản lý)
  natural_month date not null check (extract(day from natural_month) = 1),   -- tháng làm dịch vụ / tháng ghi hoàn
  payroll_month date not null check (extract(day from payroll_month) = 1),   -- tháng lương nhận dòng này
  commission_base bigint not null,
  shop_revenue bigint not null,
  reverses_id bigint references payroll_revenue_entries(id),
  created_at timestamptz not null default now(),
  check (staff_user_id is not null or commission_base = 0),
  check (staff_user_id is null or shop_revenue = 0)
);
create unique index payroll_rev_reverses_uq on payroll_revenue_entries(reverses_id) where reverses_id is not null;
create index payroll_rev_month_idx on payroll_revenue_entries(branch_id, payroll_month, staff_user_id);
create index payroll_rev_order_idx on payroll_revenue_entries(order_id);
create trigger payroll_rev_append_only before update or delete on payroll_revenue_entries
  for each row execute function app.forbid_mutation();
create trigger payroll_rev_no_truncate before truncate on payroll_revenue_entries
  for each statement execute function app.forbid_mutation();

-- Dòng đúng của một đơn lúc này: đơn Đã xác nhận → phần mỗi thợ (Σ cơ sở hoa hồng, invariant 12) + doanh thu quán
-- (tiền thuần: sau giảm giá, gồm phụ thu, không tip, không cọc bỏ hẹn — Q11, Q33, C04); mỗi phiếu hoàn → trừ phần thợ,
-- trừ doanh thu quán. Đơn không còn Đã xác nhận → không dòng nào.
create function app._payroll_target(p_order uuid)
returns table (source_type text, source_id uuid, staff_user_id uuid, natural_month date, commission_base bigint,
               shop_revenue bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  with o as (select * from orders where id = p_order and status = 'confirmed')
  select * from (
    select 'order'::text, o.id, a.staff_user_id, date_trunc('month', o.service_date)::date,
           sum(a.commission_base_amount)::bigint, 0::bigint
    from o join order_staff_allocations a on a.order_id = o.id and a.rev = o.content_rev
    group by o.id, o.service_date, a.staff_user_id
    union all
    select 'order', o.id, null, date_trunc('month', o.service_date)::date, 0, o.net_amount from o
    union all
    select 'refund', r.id, ra.staff_user_id, date_trunc('month', r.revenue_date)::date, -ra.amount, 0
    from o join order_refunds r on r.order_id = o.id join order_refund_allocations ra on ra.refund_id = r.id
    union all
    select 'refund', r.id, null, date_trunc('month', r.revenue_date)::date, 0, -r.amount
    from o join order_refunds r on r.order_id = o.id
  ) t (source_type, source_id, staff_user_id, natural_month, commission_base, shop_revenue)
  where commission_base <> 0 or shop_revenue <> 0
$$;

-- Đưa sổ của một đơn về đúng: đảo dòng đang hiệu lực mà không còn đúng (vào tháng của dòng đó nếu chưa khoá), ghi dòng
-- đúng còn thiếu (vào tháng tự nhiên nếu chưa khoá). Chạy lại không đổi gì.
create function app._payroll_sync_order(p_order uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_branch uuid;
  v_now date;
begin
  select branch_id into v_branch from orders where id = p_order;
  if v_branch is null then return; end if;
  perform app._payroll_share_lock(v_branch);
  perform pg_advisory_xact_lock(hashtextextended('payroll-order:' || p_order::text, 0));
  v_now := date_trunc('month', app.branch_today(v_branch))::date;

  insert into payroll_revenue_entries (branch_id, order_id, source_type, source_id, staff_user_id, natural_month,
                                       payroll_month, commission_base, shop_revenue, reverses_id)
  select l.branch_id, l.order_id, l.source_type, l.source_id, l.staff_user_id, l.natural_month,
         case when app.payroll_month_locked(v_branch, l.payroll_month) then v_now else l.payroll_month end,
         -l.commission_base, -l.shop_revenue, l.id
  from payroll_revenue_entries l
  where l.order_id = p_order and l.reverses_id is null
    and not exists (select 1 from payroll_revenue_entries x where x.reverses_id = l.id)
    and not exists (select 1 from app._payroll_target(p_order) t
                    where t.source_type = l.source_type and t.source_id = l.source_id
                      and t.staff_user_id is not distinct from l.staff_user_id and t.natural_month = l.natural_month
                      and t.commission_base = l.commission_base and t.shop_revenue = l.shop_revenue);

  insert into payroll_revenue_entries (branch_id, order_id, source_type, source_id, staff_user_id, natural_month,
                                       payroll_month, commission_base, shop_revenue)
  select v_branch, p_order, t.source_type, t.source_id, t.staff_user_id, t.natural_month,
         case when app.payroll_month_locked(v_branch, t.natural_month) then v_now else t.natural_month end,
         t.commission_base, t.shop_revenue
  from app._payroll_target(p_order) t
  where not exists (select 1 from payroll_revenue_entries l
                    where l.order_id = p_order and l.reverses_id is null
                      and not exists (select 1 from payroll_revenue_entries x where x.reverses_id = l.id)
                      and t.source_type = l.source_type and t.source_id = l.source_id
                      and t.staff_user_id is not distinct from l.staff_user_id and t.natural_month = l.natural_month
                      and t.commission_base = l.commission_base and t.shop_revenue = l.shop_revenue);
end $$;

create function app.orders_payroll_sync() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._payroll_sync_order(new.id);
  return null;
end $$;

create function app.refunds_payroll_sync() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._payroll_sync_order(new.order_id);
  return null;
end $$;

-- Chạy khi commit, sau khi bộ dòng, phần chia của lần sửa đã ghi xong
create constraint trigger orders_payroll_sync after update on orders
  deferrable initially deferred for each row
  when (old.status is distinct from new.status or old.content_rev is distinct from new.content_rev
        or old.service_date is distinct from new.service_date or old.net_amount is distinct from new.net_amount)
  execute function app.orders_payroll_sync();
create constraint trigger refunds_payroll_sync after insert on order_refunds
  deferrable initially deferred for each row execute function app.refunds_payroll_sync();

-- Ghi bù cho đơn đã xác nhận (chưa có tháng nào khoá → tháng tự nhiên)
do $$
declare
  r record;
begin
  for r in select id from orders where status = 'confirmed' loop
    perform app._payroll_sync_order(r.id);
  end loop;
end $$;

-- Q34: phiếu hoàn sau khi tháng làm dịch vụ đã khoá lương → doanh thu, hoa hồng, KPI giảm ở tháng hoàn; tháng cũ giữ
-- nguyên. Lấy khoá chia sẻ kỳ lương để không chen giữa lúc Linh khoá tháng.
create or replace function app.refund_order(p_order uuid, p_amount bigint, p_method text, p_reason text, p_key uuid)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  o orders;
  v_id uuid;
  v_acc uuid;
  v_alloc bigint;
  v_target bigint;
  v_floors bigint;
  v_first boolean := true;
  r record;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null or v_uid is null or not app.order_visible(p_order) then
    raise exception 'Không tìm thấy đơn.' using errcode = '22P02';
  end if;
  if not app.has_perm(o.branch_id, 'order.refund') then
    raise exception 'Chỉ Nhung, Linh hoàn tiền.' using errcode = '42501';
  end if;
  select id into v_id from order_refunds where idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  if o.status <> 'confirmed' then
    raise exception 'Chỉ hoàn tiền đơn đã xác nhận.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cần ghi lý do hoàn tiền.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số hoàn phải lớn hơn 0.' using errcode = 'P0001';
  end if;
  if p_amount > app.order_net_collected(o.id) then
    raise exception 'Số hoàn lớn hơn số đã thu còn lại (%).', app._vnd(app.order_net_collected(o.id))
      using errcode = 'P0001';
  end if;
  select id into v_acc from money_accounts
  where branch_id = o.branch_id and is_active and type = case p_method when 'cash' then 'cash' else 'bank' end
  order by code limit 1;
  if v_acc is null then
    raise exception 'Chưa có tài khoản cho hình thức này.' using errcode = 'P0001';
  end if;
  perform app._payroll_share_lock(o.branch_id);
  insert into order_refunds (order_id, branch_id, amount, method, money_account_id, reason, revenue_date, refunded_by,
                             needs_owner_review, idempotency_key)
  values (o.id, o.branch_id, p_amount, p_method, v_acc, btrim(p_reason),
          case when app.payroll_month_locked(o.branch_id, o.service_date) then app.branch_today(o.branch_id)
               else o.service_date end,
          v_uid, not app.has_perm(o.branch_id, 'review_queue.read'), p_key)
  returning id into v_id;

  -- Chia phần trừ theo tỷ lệ phần của từng thợ trên tiền thuần đơn; phần lẻ do làm tròn dồn vào người có phần lớn
  -- nhất. Đơn có dòng không chia cho thợ thì phần tương ứng của số hoàn cũng không chia.
  select coalesce(sum(allocated_net_amount), 0) into v_alloc
  from order_staff_allocations where order_id = o.id and rev = o.content_rev;
  v_target := floor(p_amount::numeric * v_alloc / o.net_amount)::bigint;
  select coalesce(sum(floor(p_amount::numeric * x.a / o.net_amount)), 0)::bigint into v_floors
  from (select sum(allocated_net_amount) a from order_staff_allocations
        where order_id = o.id and rev = o.content_rev group by staff_user_id) x;
  for r in select staff_user_id, sum(allocated_net_amount) a from order_staff_allocations
           where order_id = o.id and rev = o.content_rev
           group by staff_user_id order by sum(allocated_net_amount) desc, staff_user_id
  loop
    insert into order_refund_allocations (refund_id, order_id, staff_user_id, amount)
    values (v_id, o.id, r.staff_user_id,
            floor(p_amount::numeric * r.a / o.net_amount)::bigint + case when v_first then v_target - v_floors else 0 end);
    v_first := false;
  end loop;

  perform app._ledger_post(o.branch_id, v_acc, 'refund', -p_amount, 'refund', v_id, v_uid,
                           'Hoàn tiền đơn #' || lpad(o.code::text, 4, '0') || ': ' || btrim(p_reason));
  insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json, reason)
  values (o.id, o.branch_id, v_uid, 'refunded',
          jsonb_build_object('refundId', v_id, 'amount', p_amount, 'method', p_method), btrim(p_reason));
  perform pg_notify('lindy_events', json_build_object(
    'kind', 'orders', 'branchId', o.branch_id, 'dates', array[o.service_date::text])::text);
  return v_id;
end $$;

-- ---------------------------------------------------------------- Tạm ứng (Q37, Q38, A05, K21)

create table employee_advances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  user_id uuid not null references users(id),
  amount bigint not null check (amount between 1 and 1000000000),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'paid', 'cancelled')),
  request_month date not null check (extract(day from request_month) = 1),   -- DB đặt: tháng xin ứng
  payroll_month date check (payroll_month is null or extract(day from payroll_month) = 1),   -- tháng trừ lương
  requested_at timestamptz not null default now(),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decide_note text check (char_length(decide_note) <= 300),
  paid_by uuid references users(id),
  paid_at timestamptz,
  paid_account_id uuid references money_accounts(id),
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  create_request_id uuid not null,
  version int not null default 1,
  unique (user_id, create_request_id),
  check (status <> 'paid' or (paid_account_id is not null and payroll_month is not null and decided_by is not null)),
  check (status <> 'rejected' or char_length(btrim(coalesce(decide_note, ''))) > 0)
);
create index employee_advances_branch_idx on employee_advances(branch_id, status, requested_at desc);
create index employee_advances_user_idx on employee_advances(branch_id, user_id, request_month);
create trigger employee_advances_no_delete before delete on employee_advances
  for each row execute function app.forbid_mutation();
create trigger employee_advances_no_truncate before truncate on employee_advances
  for each statement execute function app.forbid_mutation();

create function app.advances_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  v_base bigint;
  v_used bigint;
  v_approver boolean;
  v_manage boolean;
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- Gửi lại cùng mã (bấm hai lần): để ON CONFLICT bỏ qua
    if exists (select 1 from employee_advances where user_id = new.user_id and create_request_id = new.create_request_id) then
      return new;
    end if;
    if not v_priv and (new.user_id is distinct from v_uid or not app.has_perm(new.branch_id, 'advance.request')) then
      raise exception 'Không có quyền đề nghị tạm ứng.' using errcode = '42501';
    end if;
    new.request_month := date_trunc('month', app.branch_today(new.branch_id))::date;
    -- Hai đề nghị song song cùng người phải chờ nhau để cộng hạn mức [P70]
    perform pg_advisory_xact_lock(hashtextextended('advance:' || new.branch_id::text || new.user_id::text, 0));
    v_base := app._base_salary(new.branch_id, new.user_id, new.request_month);
    if v_base is null then
      raise exception 'Chưa có lương cứng tháng này. Báo Linh nhập chính sách lương.' using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into v_used from employee_advances
    where branch_id = new.branch_id and user_id = new.user_id and request_month = new.request_month
      and status in ('requested', 'approved', 'paid');
    if v_used + new.amount > v_base then
      raise exception 'Tạm ứng tối đa bằng lương cứng % mỗi tháng. Tháng này đã ứng %, còn ứng được %.',
        app._vnd(v_base), app._vnd(v_used), app._vnd(greatest(v_base - v_used, 0)) using errcode = 'P0001';
    end if;
    new.status := 'requested';
    new.requested_at := now();
    new.payroll_month := null;
    new.decided_by := null; new.decided_at := null; new.decide_note := null;
    new.paid_by := null; new.paid_at := null; new.paid_account_id := null;
    new.cancelled_by := null; new.cancelled_at := null;
    new.version := 1;
    -- Linh tự đề nghị → duyệt luôn
    if not v_priv and app.has_perm(new.branch_id, 'advance.approve') then
      new.status := 'approved';
      new.decided_by := v_uid;
      new.decided_at := now();
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------
  if new.id <> old.id or new.branch_id <> old.branch_id or new.user_id <> old.user_id or new.amount <> old.amount
     or new.reason <> old.reason or new.request_month <> old.request_month or new.requested_at <> old.requested_at
     or new.create_request_id <> old.create_request_id then
    raise exception 'Đề nghị tạm ứng không sửa được; huỷ rồi lập lại.' using errcode = '42501';
  end if;
  new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  new.paid_by := old.paid_by; new.paid_at := old.paid_at; new.payroll_month := old.payroll_month;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  if new.status = old.status then
    new.decide_note := old.decide_note;
    new.paid_account_id := old.paid_account_id;
    new.version := old.version;
    return new;
  end if;
  v_approver := v_priv or app.has_perm(old.branch_id, 'advance.approve');
  v_manage := v_priv or app.has_perm(old.branch_id, 'cashbook.manage');

  if old.status = 'requested' and new.status in ('approved', 'rejected') then
    if not v_approver then
      raise exception 'Chỉ Linh duyệt tạm ứng.' using errcode = '42501';
    end if;
    if new.status = 'rejected' and char_length(btrim(coalesce(new.decide_note, ''))) = 0 then
      raise exception 'Cần ghi lý do từ chối.' using errcode = 'P0001';
    end if;
    new.decided_by := coalesce(v_uid, new.decided_by);
    new.decided_at := now();
    new.paid_account_id := null;

  elsif old.status in ('requested', 'approved') and new.status = 'cancelled' then
    if not (v_approver or v_manage or (old.status = 'requested' and old.user_id = v_uid)) then
      raise exception 'Chỉ người đề nghị (khi chưa duyệt) hoặc Nhung, Linh huỷ được.' using errcode = '42501';
    end if;
    if old.status = 'approved' and char_length(btrim(coalesce(new.decide_note, ''))) = 0 then
      raise exception 'Tạm ứng đã duyệt: cần ghi lý do huỷ.' using errcode = 'P0001';
    end if;
    new.cancelled_by := coalesce(v_uid, new.cancelled_by);
    new.cancelled_at := now();
    new.paid_account_id := null;

  elsif old.status = 'approved' and new.status = 'paid' then
    if not v_manage then
      raise exception 'Chỉ Nhung, Linh ghi "Đã chi" tạm ứng.' using errcode = '42501';
    end if;
    if not exists (select 1 from money_accounts m where m.id = new.paid_account_id and m.branch_id = old.branch_id
                   and m.is_active) then
      raise exception 'Chọn tài khoản chi tiền.' using errcode = 'P0001';
    end if;
    perform app._payroll_share_lock(old.branch_id);
    new.payroll_month := app.payroll_target_month(old.branch_id, old.request_month);
    new.paid_by := coalesce(v_uid, new.paid_by);
    new.paid_at := now();

  else
    raise exception 'Không đổi được trạng thái tạm ứng như vậy.' using errcode = 'P0001';
  end if;

  new.version := old.version + 1;
  return new;
end $$;

create trigger advances_guard before insert or update on employee_advances
  for each row execute function app.advances_guard();

-- Tiền ra khi "Đã chi" (một lần); tạm ứng không phải chi phí (PRD §7.3, invariant 18)
create function app.advances_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'paid' then
    perform app._ledger_post(new.branch_id, new.paid_account_id, 'advance', -new.amount, 'advance', new.id, new.paid_by,
                             'Tạm ứng: ' || coalesce((select display_name from users where id = new.user_id), '') || ' · '
                             || new.reason);
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'rejected', 'paid', 'cancelled') then
    insert into audit_logs (actor_user_id, actor_label, branch_id, action, entity_type, entity_id, details)
    values (app.uid(), case when app.uid() is null then 'system' end, new.branch_id, 'advance.' || new.status,
            'employee_advance', new.id::text,
            jsonb_build_object('user', new.user_id, 'amount', new.amount, 'note', new.decide_note));
  end if;
  perform pg_notify('lindy_events', json_build_object('kind', 'money', 'branchId', new.branch_id)::text);
  return null;
end $$;

create trigger advances_after after insert or update on employee_advances
  for each row execute function app.advances_after();

-- ---------------------------------------------------------------- Thưởng thêm, khấu trừ, chuyển từ tháng trước

create table payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  user_id uuid not null references users(id),
  payroll_month date not null check (extract(day from payroll_month) = 1),
  kind text not null check (kind in ('bonus', 'deduction', 'carry')),   -- carry: tạm ứng vượt lương tháng trước (K22)
  amount bigint not null check (amount between 1 and 1000000000),       -- luôn dương; dấu theo loại
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  source_month date check (source_month is null or extract(day from source_month) = 1),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references users(id),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 300),
  check ((kind = 'carry') = (source_month is not null)),
  check ((voided_at is null) = (voided_by is null))
);
create index payroll_adjustments_month_idx on payroll_adjustments(branch_id, payroll_month, user_id);
create trigger payroll_adjustments_no_delete before delete on payroll_adjustments
  for each row execute function app.forbid_mutation();

create function app.payroll_adjustment_add(
  p_branch uuid, p_user uuid, p_month date, p_kind text, p_amount bigint, p_reason text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.edit') then
    raise exception 'Chỉ chủ quán thêm thưởng, khấu trừ.' using errcode = '42501';
  end if;
  if p_kind not in ('bonus', 'deduction') then
    raise exception 'Chọn thưởng thêm hoặc khấu trừ.' using errcode = 'P0001';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Chọn tháng lương.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cần ghi lý do.' using errcode = 'P0001';
  end if;
  if not app._staff_of_branch(p_branch, p_user) then
    raise exception 'Người này không thuộc cơ sở.' using errcode = '22P02';
  end if;
  perform app._payroll_share_lock(p_branch);
  if app.payroll_month_locked(p_branch, p_month) then
    raise exception 'Bảng lương tháng này đã khoá; ghi điều chỉnh vào tháng đang mở.' using errcode = 'P0001';
  end if;
  insert into payroll_adjustments (branch_id, user_id, payroll_month, kind, amount, reason, created_by)
  values (p_branch, p_user, p_month, p_kind, p_amount, btrim(p_reason), v_uid)
  returning id into v_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'payroll.adjustment_added', 'user', p_user::text,
          jsonb_build_object('id', v_id, 'month', p_month, 'kind', p_kind, 'amount', p_amount, 'reason', p_reason));
  return v_id;
end $$;

create function app.payroll_adjustment_void(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  a payroll_adjustments;
begin
  select * into a from payroll_adjustments where id = p_id for update;
  if not found or v_uid is null or not app.has_branch(a.branch_id) then
    raise exception 'Không tìm thấy khoản điều chỉnh.' using errcode = '22P02';
  end if;
  if not app.has_perm(a.branch_id, 'payroll.edit') then
    raise exception 'Chỉ chủ quán huỷ thưởng, khấu trừ.' using errcode = '42501';
  end if;
  if a.kind = 'carry' then
    raise exception 'Khoản chuyển từ tháng trước do app ghi khi khoá lương, không huỷ được.' using errcode = 'P0001';
  end if;
  if a.voided_at is not null then return; end if;
  perform app._payroll_share_lock(a.branch_id);
  if app.payroll_month_locked(a.branch_id, a.payroll_month) then
    raise exception 'Bảng lương tháng này đã khoá.' using errcode = 'P0001';
  end if;
  update payroll_adjustments set voided_by = v_uid, voided_at = now(), void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, a.branch_id, 'payroll.adjustment_voided', 'user', a.user_id::text,
          jsonb_build_object('id', p_id, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------- Công thức lương (PRD §9.1)

-- Mỗi người có hồ sơ trong tháng và có chính sách hiệu lực. Ngày vắng = có phép + không phép + ngoài thời gian làm
-- (Q28, Q35); ngày đóng cửa không vắng (Q29); ngày chưa duyệt, chưa tới không vắng (test 23, K20). Làm tròn từng khoản
-- đến đồng.
create function app._payroll_rows(p_branch uuid, p_month date)
returns table (
  user_id uuid, pay_method text, days_in_month int, leave_allowance int, standard_days int, absent_days int,
  pending_days int, closed_days int, base_salary bigint, attendance_adjustment bigint, commission_bps int,
  commission_base bigint, commission bigint, manager_kpi boolean, shop_revenue bigint, kpi_bps int, kpi_bonus bigint,
  bonus bigint, deduction bigint, carry_in bigint, gross_pay bigint, advances bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  with m as (
    select p_month as first, (p_month + interval '1 month' - interval '1 day')::date as last,
           extract(day from (p_month + interval '1 month' - interval '1 day'))::int as dim),
  people as (
    select sp.user_id, sp.pay_method, pol.base_salary, pol.commission_bps, pol.leave_days, pol.manager_kpi
    from staff_profiles sp
    cross join m
    join lateral (select v.* from staff_policy_versions v
                  where v.user_id = sp.user_id and v.branch_id = p_branch and v.effective_month <= p_month
                  order by v.effective_month desc limit 1) pol on true
    where sp.branch_id = p_branch and sp.start_date <= m.last and (sp.end_date is null or sp.end_date >= m.first)),
  days as (
    select g.user_id,
           count(*) filter (where g.status in ('out', 'leave', 'unexcused'))::int as absent,
           count(*) filter (where g.status = 'pending')::int as pending,
           count(*) filter (where g.status = 'closed')::int as closed
    from m cross join lateral app.attendance_grid(p_branch, m.first, m.last) g
    group by g.user_id),
  rev as (
    select staff_user_id, sum(commission_base)::bigint as base from payroll_revenue_entries
    where branch_id = p_branch and payroll_month = p_month and staff_user_id is not null
    group by staff_user_id),
  shop as (
    select coalesce(sum(shop_revenue), 0)::bigint as rev from payroll_revenue_entries
    where branch_id = p_branch and payroll_month = p_month and staff_user_id is null),
  kpi as (
    select * from kpi_policy_versions where branch_id = p_branch and effective_month <= p_month
    order by effective_month desc limit 1),
  adj as (
    select a.user_id,
           coalesce(sum(a.amount) filter (where a.kind = 'bonus'), 0)::bigint as bonus,
           coalesce(sum(a.amount) filter (where a.kind = 'deduction'), 0)::bigint as deduction,
           coalesce(sum(a.amount) filter (where a.kind = 'carry'), 0)::bigint as carry
    from payroll_adjustments a
    where a.branch_id = p_branch and a.payroll_month = p_month and a.voided_at is null
    group by a.user_id),
  adv as (
    select e.user_id, sum(e.amount)::bigint as amount from employee_advances e
    where e.branch_id = p_branch and e.payroll_month = p_month and e.status = 'paid'
    group by e.user_id),
  c as (
    select p.user_id, p.pay_method, m.dim, p.leave_days, m.dim - p.leave_days as std,
           coalesce(d.absent, 0) as absent, coalesce(d.pending, 0) as pending, coalesce(d.closed, 0) as closed,
           p.base_salary, p.commission_bps, coalesce(r.base, 0) as cbase, p.manager_kpi,
           (select rev from shop) as shop,
           case when not p.manager_kpi or k.branch_id is null then 0
                when (select rev from shop) >= k.tier2_min then k.tier2_bps
                when (select rev from shop) >= k.tier1_min then k.tier1_bps
                else 0 end as kbps,
           coalesce(a.bonus, 0) as bonus, coalesce(a.deduction, 0) as deduction, coalesce(a.carry, 0) as carry,
           coalesce(v.amount, 0) as adv
    from people p cross join m
    left join days d on d.user_id = p.user_id
    left join rev r on r.staff_user_id = p.user_id
    left join kpi k on true
    left join adj a on a.user_id = p.user_id
    left join adv v on v.user_id = p.user_id),
  money as (
    select c.*,
           round((c.leave_days - c.absent)::numeric * c.base_salary / c.std)::bigint as att,
           round(c.cbase::numeric * c.commission_bps / 10000)::bigint as comm,
           round(c.shop::numeric * c.kbps / 10000)::bigint as kpi
    from c)
  select user_id, pay_method, dim, leave_days, std, absent, pending, closed, base_salary, att, commission_bps, cbase,
         comm, manager_kpi, shop, kbps, kpi, bonus, deduction, carry,
         base_salary + att + comm + kpi + bonus - deduction - carry, adv
  from money
$$;

-- ---------------------------------------------------------------- Bảng lương đã khoá, trả lương

create table payroll_lines (
  branch_id uuid not null references branches(id),
  month date not null,
  user_id uuid not null references users(id),
  pay_method text not null,
  days_in_month int not null,
  leave_allowance int not null,
  standard_days int not null,
  absent_days int not null,
  closed_days int not null,
  base_salary bigint not null,
  attendance_adjustment bigint not null,
  commission_bps int not null,
  commission_base bigint not null,
  commission bigint not null,
  manager_kpi boolean not null,
  shop_revenue bigint not null,
  kpi_bps int not null,
  kpi_bonus bigint not null,
  bonus bigint not null,
  deduction bigint not null,
  carry_in bigint not null,
  gross_pay bigint not null,
  advances bigint not null,
  carried_out bigint not null,                       -- K22: phần tạm ứng vượt lương chuyển sang tháng sau
  payable bigint not null check (payable >= 0),      -- phải trả sau tạm ứng
  created_at timestamptz not null default now(),
  primary key (branch_id, month, user_id),
  foreign key (branch_id, month) references payroll_periods(branch_id, month) deferrable initially deferred
);
create trigger payroll_lines_append_only before update or delete on payroll_lines
  for each row execute function app.forbid_mutation();
create trigger payroll_lines_no_truncate before truncate on payroll_lines
  for each statement execute function app.forbid_mutation();

create table payroll_payouts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  user_id uuid not null references users(id),
  payroll_month date not null,
  amount bigint not null check (amount between 1 and 1000000000),
  money_account_id uuid not null references money_accounts(id),
  paid_by uuid not null references users(id),
  paid_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  foreign key (branch_id, payroll_month, user_id) references payroll_lines(branch_id, month, user_id)
);
create trigger payroll_payouts_append_only before update or delete on payroll_payouts
  for each row execute function app.forbid_mutation();
create trigger payroll_payouts_no_truncate before truncate on payroll_payouts
  for each statement execute function app.forbid_mutation();

-- Ngày được khoá bảng lương tháng p_month: ngày nháp (mặc định 05) của tháng sau
create function app.payroll_draft_date(p_branch uuid, p_month date) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
  select (p_month + interval '1 month')::date + (coalesce((select draft_day from payroll_settings where branch_id = p_branch), 5) - 1)
$$;

-- Linh (payroll.approve_lock): khoá lần lượt từng tháng từ tháng bắt đầu, từ ngày nháp, khi mọi ngày công đã duyệt (K20).
-- Chụp phiếu lương; tạm ứng vượt lương chuyển thành khoản trừ tháng sau (K22). Không mở lại được (test 14).
create function app.payroll_lock(p_branch uuid, p_month date) returns int
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_start date;
  v_pending int;
  v_n int;
  v_next date := (p_month + interval '1 month')::date;
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.approve_lock') then
    raise exception 'Chỉ chủ quán khoá bảng lương.' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Chọn tháng lương.' using errcode = 'P0001';
  end if;
  select start_month into v_start from payroll_settings where branch_id = p_branch;
  if v_start is null then
    raise exception 'Chưa chọn tháng bắt đầu tính lương (Thêm → Nhân viên).' using errcode = 'P0001';
  end if;
  if p_month < v_start then
    raise exception 'Tháng trước tháng bắt đầu tính lương làm trên Sheets, không khoá trên app.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll:' || p_branch::text, 0));
  if app.payroll_month_locked(p_branch, p_month) then
    raise exception 'Bảng lương tháng %/% đã khoá.', to_char(p_month, 'MM'), to_char(p_month, 'YYYY')
      using errcode = 'P0001';
  end if;
  if p_month > v_start and not app.payroll_month_locked(p_branch, (p_month - interval '1 month')::date) then
    raise exception 'Khoá bảng lương tháng trước trước.' using errcode = 'P0001';
  end if;
  if app.branch_today(p_branch) < app.payroll_draft_date(p_branch, p_month) then
    raise exception 'Từ ngày % mới khoá được bảng lương tháng %/%.',
      to_char(app.payroll_draft_date(p_branch, p_month), 'DD/MM/YYYY'), to_char(p_month, 'MM'), to_char(p_month, 'YYYY')
      using errcode = 'P0001';
  end if;
  select coalesce(sum(pending_days), 0) into v_pending from app._payroll_rows(p_branch, p_month);
  if v_pending > 0 then
    raise exception 'Còn % ngày công chưa duyệt. Duyệt hết công của tháng rồi mới khoá.', v_pending
      using errcode = 'P0001';
  end if;

  insert into payroll_periods (branch_id, month, locked_by) values (p_branch, p_month, v_uid);
  insert into payroll_lines (branch_id, month, user_id, pay_method, days_in_month, leave_allowance, standard_days,
                             absent_days, closed_days, base_salary, attendance_adjustment, commission_bps,
                             commission_base, commission, manager_kpi, shop_revenue, kpi_bps, kpi_bonus, bonus,
                             deduction, carry_in, gross_pay, advances, carried_out, payable)
  select p_branch, p_month, r.user_id, r.pay_method, r.days_in_month, r.leave_allowance, r.standard_days,
         r.absent_days, r.closed_days, r.base_salary, r.attendance_adjustment, r.commission_bps, r.commission_base,
         r.commission, r.manager_kpi, r.shop_revenue, r.kpi_bps, r.kpi_bonus, r.bonus, r.deduction, r.carry_in,
         r.gross_pay, r.advances, greatest(r.advances - r.gross_pay, 0), greatest(r.gross_pay - r.advances, 0)
  from app._payroll_rows(p_branch, p_month) r;
  get diagnostics v_n = row_count;

  insert into payroll_adjustments (branch_id, user_id, payroll_month, kind, amount, reason, source_month, created_by)
  select p_branch, l.user_id, v_next, 'carry', l.carried_out,
         'Tạm ứng vượt lương tháng ' || to_char(p_month, 'MM/YYYY'), p_month, v_uid
  from payroll_lines l where l.branch_id = p_branch and l.month = p_month and l.carried_out > 0;

  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  select v_uid, p_branch, 'payroll.locked', 'branch', p_branch::text,
         jsonb_build_object('month', p_month, 'people', count(*), 'gross', coalesce(sum(gross_pay), 0),
                            'advances', coalesce(sum(advances), 0), 'payable', coalesce(sum(payable), 0))
  from payroll_lines where branch_id = p_branch and month = p_month;
  return v_n;
end $$;

-- Linh (payroll.pay): trả lương theo phiếu đã khoá; trả nhiều lần, tổng không quá phải trả. Gửi lại cùng mã → một lần.
create function app.payroll_pay(
  p_branch uuid, p_user uuid, p_month date, p_amount bigint, p_method text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  l payroll_lines;
  v_id uuid;
  v_paid bigint;
  v_acc uuid;
begin
  if v_uid is null or not app.has_perm(p_branch, 'payroll.pay') then
    raise exception 'Chỉ chủ quán trả lương.' using errcode = '42501';
  end if;
  select id into v_id from payroll_payouts where idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  select * into l from payroll_lines where branch_id = p_branch and month = p_month and user_id = p_user for update;
  if not found then
    raise exception 'Bảng lương tháng này chưa khoá hoặc không có người này.' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_paid from payroll_payouts
  where branch_id = p_branch and payroll_month = p_month and user_id = p_user;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền trả phải lớn hơn 0.' using errcode = 'P0001';
  end if;
  if p_amount > l.payable - v_paid then
    raise exception 'Số trả lớn hơn số lương còn lại (%).', app._vnd(l.payable - v_paid) using errcode = 'P0001';
  end if;
  select id into v_acc from money_accounts
  where branch_id = p_branch and is_active and type = case p_method when 'cash' then 'cash' else 'bank' end
  order by code limit 1;
  if v_acc is null then
    raise exception 'Chưa có tài khoản cho hình thức này.' using errcode = 'P0001';
  end if;
  insert into payroll_payouts (branch_id, user_id, payroll_month, amount, money_account_id, paid_by, idempotency_key)
  values (p_branch, p_user, p_month, p_amount, v_acc, v_uid, p_key)
  returning id into v_id;
  perform app._ledger_post(p_branch, v_acc, 'payroll', -p_amount, 'payroll_payout', v_id, v_uid,
                           'Lương tháng ' || to_char(p_month, 'MM/YYYY') || ': '
                           || coalesce((select display_name from users where id = p_user), ''));
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'payroll.paid', 'user', p_user::text,
          jsonb_build_object('month', p_month, 'amount', p_amount, 'method', p_method, 'payoutId', v_id));
  return v_id;
end $$;

-- Bảng lương một tháng cho người xem: Linh, Nhung (payroll.read_all_branch) mọi người; người khác chỉ mình
-- (invariant 8). Tháng đã khoá → phiếu đã chụp; chưa khoá → tính tạm. Kèm số đã trả.
create function app.payroll_view(p_branch uuid, p_month date)
returns table (
  user_id uuid, locked boolean, pay_method text, days_in_month int, leave_allowance int, standard_days int,
  absent_days int, pending_days int, closed_days int, base_salary bigint, attendance_adjustment bigint,
  commission_bps int, commission_base bigint, commission bigint, manager_kpi boolean, shop_revenue bigint,
  kpi_bps int, kpi_bonus bigint, bonus bigint, deduction bigint, carry_in bigint, gross_pay bigint, advances bigint,
  carried_out bigint, payable bigint, paid bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_all boolean;
begin
  if v_uid is null or not app.has_branch(p_branch) then
    raise exception 'Không tìm thấy cơ sở.' using errcode = '22P02';
  end if;
  v_all := app.has_perm(p_branch, 'payroll.read_all_branch');
  if not v_all and not app.has_perm(p_branch, 'payroll.read_own') then
    raise exception 'Không có quyền xem lương.' using errcode = '42501';
  end if;
  if app.payroll_month_locked(p_branch, p_month) then
    return query
      select l.user_id, true, l.pay_method, l.days_in_month, l.leave_allowance, l.standard_days, l.absent_days, 0,
             l.closed_days, l.base_salary, l.attendance_adjustment, l.commission_bps, l.commission_base, l.commission,
             l.manager_kpi, l.shop_revenue, l.kpi_bps, l.kpi_bonus, l.bonus, l.deduction, l.carry_in, l.gross_pay,
             l.advances, l.carried_out, l.payable,
             coalesce((select sum(p.amount) from payroll_payouts p where p.branch_id = p_branch
                       and p.payroll_month = p_month and p.user_id = l.user_id), 0)::bigint
      from payroll_lines l
      where l.branch_id = p_branch and l.month = p_month and (v_all or l.user_id = v_uid);
  else
    return query
      select r.user_id, false, r.pay_method, r.days_in_month, r.leave_allowance, r.standard_days, r.absent_days,
             r.pending_days, r.closed_days, r.base_salary, r.attendance_adjustment, r.commission_bps,
             r.commission_base, r.commission, r.manager_kpi, r.shop_revenue, r.kpi_bps, r.kpi_bonus, r.bonus,
             r.deduction, r.carry_in, r.gross_pay, r.advances, greatest(r.advances - r.gross_pay, 0),
             greatest(r.gross_pay - r.advances, 0), 0::bigint
      from app._payroll_rows(p_branch, p_month) r
      where v_all or r.user_id = v_uid;
  end if;
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table payroll_revenue_entries enable row level security;
alter table employee_advances enable row level security;
alter table payroll_adjustments enable row level security;
alter table payroll_lines enable row level security;
alter table payroll_payouts enable row level security;

-- Lương người khác: chỉ người có payroll.read_all_branch (invariant 8)
create function app.payroll_reader(p_branch uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select app.has_branch(p_branch)
         and ((p_user = app.uid() and app.has_perm(p_branch, 'payroll.read_own'))
              or app.has_perm(p_branch, 'payroll.read_all_branch'))
$$;

grant select on payroll_revenue_entries, payroll_adjustments, payroll_lines, payroll_payouts to app_user;
create policy payroll_rev_read on payroll_revenue_entries for select to app_user
  using (app.payroll_reader(branch_id, staff_user_id)
         or (staff_user_id is null and app.has_perm(branch_id, 'payroll.read_all_branch')));
create policy payroll_adjustments_read on payroll_adjustments for select to app_user
  using (app.payroll_reader(branch_id, user_id));
create policy payroll_lines_read on payroll_lines for select to app_user using (app.payroll_reader(branch_id, user_id));
create policy payroll_payouts_read on payroll_payouts for select to app_user
  using (app.payroll_reader(branch_id, user_id));

-- Tạm ứng: của mình; Linh (duyệt), Nhung, Linh (chi), người xem lương toàn quán thấy cả cơ sở
create function app.advance_reader(p_branch uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select app.has_perm(p_branch, 'advance.approve') or app.has_perm(p_branch, 'cashbook.manage')
         or app.has_perm(p_branch, 'payroll.read_all_branch')
$$;

grant select, insert, update on employee_advances to app_user;
create policy advances_read on employee_advances for select to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.advance_reader(branch_id)));
create policy advances_insert on employee_advances for insert to app_user
  with check (app.has_perm(branch_id, 'advance.request') and user_id = app.uid());
create policy advances_update on employee_advances for update to app_user
  using (app.has_branch(branch_id) and (user_id = app.uid() or app.advance_reader(branch_id)))
  with check (app.has_branch(branch_id));

grant execute on function app.payroll_month_locked(uuid, date) to app_user;
grant execute on function app.payroll_target_month(uuid, date) to app_user;
grant execute on function app._payroll_share_lock(uuid) to app_user;
grant execute on function app._vnd(bigint) to app_user;
grant execute on function app._base_salary(uuid, uuid, date) to app_user;
grant execute on function app.payroll_draft_date(uuid, date) to app_user;
grant execute on function app.payroll_reader(uuid, uuid) to app_user;
grant execute on function app.advance_reader(uuid) to app_user;
grant execute on function app.payroll_adjustment_add(uuid, uuid, date, text, bigint, text) to app_user;
grant execute on function app.payroll_adjustment_void(uuid, text) to app_user;
grant execute on function app.payroll_lock(uuid, date) to app_user;
grant execute on function app.payroll_pay(uuid, uuid, date, bigint, text, uuid) to app_user;
grant execute on function app.payroll_view(uuid, date) to app_user;
