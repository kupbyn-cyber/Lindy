-- 0014 — Tip giữ hộ, hoàn tiền, huỷ đơn đã xác nhận (Đợt 3B-2, bước 3.15–3.16; PRD §6.3, §6.6, §7.3; Q14, Q15, Q34;
-- K18; kế hoạch Đợt 3 mục 7.4, 16.3).
-- - Tip: chỉ ghi khi khách chuyển vào tài khoản quán; là tiền giữ hộ thợ, không doanh thu, không hoa hồng. Cuối ngày
--   Nhung trả tiền mặt cho thợ (bút toán tiền ra). Bill nhiều thợ chia theo phần tiền, trừ khi khách chỉ định.
-- - Phiếu hoàn: ≤ đã thu − đã hoàn; giảm doanh thu thuần của đơn theo ngày ghi (Đợt 3: ngày làm dịch vụ; Đợt 4 thêm Q34)
--   và phần từng thợ theo tỷ lệ chia. Nhung lập → Cần xem lại của Linh (K18).
-- - Huỷ đơn đã xác nhận: Nhung, Linh, có lý do, khi tiền đã thu trừ đã hoàn bằng 0. Nhung huỷ → Cần xem lại.

-- ---------------------------------------------------------------- Tip giữ hộ (Q14, Q15)

create table tip_payouts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  staff_user_id uuid not null references users(id),
  amount bigint not null check (amount between 1 and 100000000),
  money_account_id uuid not null references money_accounts(id),
  paid_by uuid not null references users(id),
  paid_at timestamptz not null default now(),
  idempotency_key uuid not null unique
);

create table tip_holdings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  order_id uuid not null references orders(id),
  staff_user_id uuid not null references users(id),
  amount bigint not null check (amount between 1 and 10000000),
  money_account_id uuid not null references money_accounts(id),
  tip_group uuid not null,                     -- một lần ghi (chia nhiều thợ); trùng mã → không ghi lại
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  payout_id uuid references tip_payouts(id),
  voided_by uuid references users(id),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  unique (tip_group, staff_user_id),
  check (voided_at is null or char_length(btrim(coalesce(void_reason, ''))) > 0),
  check (voided_at is null or payout_id is null)
);
create index tip_holdings_unpaid_idx on tip_holdings(branch_id, staff_user_id) where payout_id is null and voided_at is null;
create index tip_holdings_order_idx on tip_holdings(order_id);

create trigger tip_holdings_no_delete before delete on tip_holdings
  for each row execute function app.forbid_mutation();
create trigger tip_holdings_no_truncate before truncate on tip_holdings
  for each statement execute function app.forbid_mutation();
create trigger tip_payouts_append_only before update or delete on tip_payouts
  for each row execute function app.forbid_mutation();
create trigger tip_payouts_no_truncate before truncate on tip_payouts
  for each statement execute function app.forbid_mutation();

-- Nhung, Linh ghi tip khách chuyển vào Tài khoản cs … cho một đơn, chia cho một hay nhiều thợ trong cơ sở.
create function app.record_tip(p_order uuid, p_staff uuid[], p_amounts bigint[], p_key uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  o orders;
  v_bank uuid;
  v_n int := coalesce(array_length(p_staff, 1), 0);
  v_id uuid;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null or v_uid is null or not app.order_visible(p_order) then
    raise exception 'Không tìm thấy đơn.' using errcode = '22P02';
  end if;
  if not app.has_perm(o.branch_id, 'cashbook.manage') then
    raise exception 'Chỉ Nhung, Linh ghi tip.' using errcode = '42501';
  end if;
  if exists (select 1 from tip_holdings where tip_group = p_key) then
    return p_key;   -- bấm hai lần
  end if;
  if o.status not in ('awaiting_confirmation', 'confirmed') then
    raise exception 'Chỉ ghi tip cho đơn đã bấm Làm xong.' using errcode = 'P0001';
  end if;
  if v_n = 0 or v_n <> coalesce(array_length(p_amounts, 1), 0) or v_n > 4
     or (select count(distinct s) from unnest(p_staff) s) <> v_n then
    raise exception 'Chia tip không hợp lệ.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_amounts) a where a is null or a <= 0 or a > 10000000) then
    raise exception 'Số tip mỗi thợ phải lớn hơn 0.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_staff) s(id)
             where not exists (select 1 from app.branch_staff(o.branch_id) b where b.id = s.id)) then
    raise exception 'Thợ nhận tip không thuộc cơ sở này.' using errcode = 'P0001';
  end if;
  select id into v_bank from money_accounts where branch_id = o.branch_id and type = 'bank' and is_active
  order by code limit 1;
  if v_bank is null then
    raise exception 'Chưa có tài khoản ngân hàng nhận tip.' using errcode = 'P0001';
  end if;
  for i in 1..v_n loop
    insert into tip_holdings (branch_id, order_id, staff_user_id, amount, money_account_id, tip_group, recorded_by)
    values (o.branch_id, o.id, p_staff[i], p_amounts[i], v_bank, p_key, v_uid)
    returning id into v_id;
    perform app._ledger_post(o.branch_id, v_bank, 'tip_in', p_amounts[i], 'tip', v_id, v_uid,
                             'Tip giữ hộ đơn #' || lpad(o.code::text, 4, '0'));
  end loop;
  insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json)
  values (o.id, o.branch_id, v_uid, 'tip_recorded',
          jsonb_build_object('group', p_key, 'staff', to_jsonb(p_staff), 'amounts', to_jsonb(p_amounts)));
  return p_key;
end $$;

-- Huỷ tip ghi nhầm: chưa trả thợ, chưa đối soát
create function app.void_tip(p_tip uuid, p_reason text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  t tip_holdings;
begin
  select * into t from tip_holdings where id = p_tip for update;
  if t.id is null or v_uid is null or not app.has_perm(t.branch_id, 'cashbook.manage') then
    raise exception 'Chỉ Nhung, Linh huỷ được tip.' using errcode = '42501';
  end if;
  if t.voided_at is not null then
    raise exception 'Khoản tip này đã huỷ.' using errcode = 'P0001';
  end if;
  if t.payout_id is not null then
    raise exception 'Tip đã trả cho thợ, không huỷ được.' using errcode = 'P0001';
  end if;
  if app.source_reconciled('tip', t.id) then
    raise exception 'Tip đã đối soát với sao kê, không huỷ được.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cần ghi lý do huỷ tip.' using errcode = 'P0001';
  end if;
  update tip_holdings set voided_by = v_uid, voided_at = now(), void_reason = btrim(p_reason) where id = p_tip;
  perform app._ledger_post(t.branch_id, t.money_account_id, 'tip_in_void', -t.amount, 'tip', t.id, v_uid,
                           btrim(p_reason), app._ledger_entry_of('tip', t.id, 'tip_in'));
end $$;

-- Cuối ngày Nhung trả tiền mặt cho thợ toàn bộ tip đang giữ của thợ đó (Q15); một bút toán tiền ra
create function app.pay_tips(p_branch uuid, p_staff uuid, p_key uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
  v_sum bigint;
  v_cash uuid;
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.manage') then
    raise exception 'Chỉ Nhung, Linh trả tip.' using errcode = '42501';
  end if;
  select id into v_id from tip_payouts where idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  perform 1 from tip_holdings where branch_id = p_branch and staff_user_id = p_staff and payout_id is null
    and voided_at is null for update;
  select coalesce(sum(amount), 0) into v_sum from tip_holdings
  where branch_id = p_branch and staff_user_id = p_staff and payout_id is null and voided_at is null;
  if v_sum <= 0 then
    raise exception 'Thợ này không còn tip chờ trả.' using errcode = 'P0001';
  end if;
  v_cash := app.cash_account_of(p_branch);
  insert into tip_payouts (branch_id, staff_user_id, amount, money_account_id, paid_by, idempotency_key)
  values (p_branch, p_staff, v_sum, v_cash, v_uid, p_key)
  returning id into v_id;
  update tip_holdings set payout_id = v_id
  where branch_id = p_branch and staff_user_id = p_staff and payout_id is null and voided_at is null;
  perform app._ledger_post(p_branch, v_cash, 'tip_payout', -v_sum, 'tip_payout', v_id, v_uid,
                           'Trả tip cho ' || (select display_name from users where id = p_staff));
  return v_id;
end $$;

-- ---------------------------------------------------------------- Hoàn tiền đơn (K18, PRD §6.3, test 5)

create table order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  branch_id uuid not null references branches(id),
  amount bigint not null check (amount between 1 and 100000000),
  method text not null check (method in ('cash', 'transfer')),
  money_account_id uuid not null references money_accounts(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  revenue_date date not null,               -- giảm doanh thu của ngày này (Đợt 3: ngày làm dịch vụ; Đợt 4: Q34)
  refunded_by uuid not null references users(id),
  refunded_at timestamptz not null default now(),
  needs_owner_review boolean not null default false,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  idempotency_key uuid not null unique
);
create index order_refunds_order_idx on order_refunds(order_id);
create index order_refunds_date_idx on order_refunds(branch_id, revenue_date);
create index order_refunds_review_idx on order_refunds(branch_id) where needs_owner_review and reviewed_at is null;

-- Phần trừ từng thợ theo tỷ lệ phần chia của bộ dòng hiện tại (cơ sở hoa hồng giảm cùng số, Đợt 4 dùng)
create table order_refund_allocations (
  refund_id uuid not null references order_refunds(id),
  order_id uuid not null references orders(id),
  staff_user_id uuid not null references users(id),
  amount bigint not null check (amount >= 0),
  primary key (refund_id, staff_user_id)
);

-- Chỉ Linh đánh dấu đã xem; mọi cột khác không đổi
create function app.refunds_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Phiếu hoàn không xoá được.' using errcode = '42501';
  end if;
  if row(new.id, new.order_id, new.branch_id, new.amount, new.method, new.money_account_id, new.reason, new.revenue_date,
         new.refunded_by, new.refunded_at, new.needs_owner_review, new.idempotency_key)
     is distinct from
     row(old.id, old.order_id, old.branch_id, old.amount, old.method, old.money_account_id, old.reason, old.revenue_date,
         old.refunded_by, old.refunded_at, old.needs_owner_review, old.idempotency_key)
     or not old.needs_owner_review or old.reviewed_by is not null
     or not (current_user <> 'app_user' or app.has_perm(old.branch_id, 'review_queue.read')) then
    raise exception 'Phiếu hoàn không sửa được.' using errcode = '42501';
  end if;
  new.reviewed_by := coalesce(app.uid(), new.reviewed_by);
  new.reviewed_at := now();
  return new;
end $$;

create trigger refunds_guard before update or delete on order_refunds
  for each row execute function app.refunds_guard();
create trigger refunds_no_truncate before truncate on order_refunds
  for each statement execute function app.forbid_mutation();
create trigger refund_alloc_append_only before update or delete on order_refund_allocations
  for each row execute function app.forbid_mutation();
create trigger refund_alloc_no_truncate before truncate on order_refund_allocations
  for each statement execute function app.forbid_mutation();

-- Tiền đã thu (kể cả trừ cọc) trừ đã hoàn. Người dùng app chỉ hỏi được đơn mình xem được (K09); không có người
-- thao tác (hệ thống, chủ DB) thì luôn trả.
create function app.order_net_collected(p_order uuid) returns bigint
language sql stable security definer set search_path = pg_catalog, public as $$
  select case when app.uid() is null or app.order_visible(p_order) then
    (select coalesce(sum(amount), 0) from payments where order_id = p_order and voided_at is null)
    - (select coalesce(sum(amount), 0) from order_refunds where order_id = p_order)
  end
$$;

-- Ghi sổ chờ lần chốt quỹ đang chạy của cơ sở (close_day khoá dòng cơ sở) rồi mới tính ngày, để khoản ghi đúng lúc chốt
-- không rơi vào ngày vừa chốt [P54]
create or replace function app._ledger_post(
  p_branch uuid, p_account uuid, p_type text, p_amount bigint, p_source_type text, p_source_id uuid,
  p_actor uuid, p_note text default null, p_reverses bigint default null, p_group uuid default null,
  p_business_date date default null
) returns bigint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from money_accounts m where m.id = p_account and m.branch_id = p_branch) then
    raise exception 'Tài khoản tiền không thuộc cơ sở này.' using errcode = 'P0001';
  end if;
  perform 1 from branches where id = p_branch for share;
  insert into money_ledger_entries (branch_id, money_account_id, entry_type, amount, business_date, source_type,
                                    source_id, reverses_entry_id, transfer_group, note, created_by)
  values (p_branch, p_account, p_type, p_amount, coalesce(p_business_date, app.ledger_business_date(p_branch)),
          p_source_type, p_source_id, p_reverses, p_group, left(p_note, 500), p_actor)
  on conflict (source_type, source_id, entry_type) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from money_ledger_entries
    where source_type = p_source_type and source_id = p_source_id and entry_type = p_type;
  end if;
  return v_id;
end $$;

create function app.refund_order(p_order uuid, p_amount bigint, p_method text, p_reason text, p_key uuid)
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
    raise exception 'Số hoàn lớn hơn số đã thu còn lại (%đ).',
      to_char(app.order_net_collected(o.id), 'FM999G999G999G999') using errcode = 'P0001';
  end if;
  select id into v_acc from money_accounts
  where branch_id = o.branch_id and is_active and type = case p_method when 'cash' then 'cash' else 'bank' end
  order by code limit 1;
  if v_acc is null then
    raise exception 'Chưa có tài khoản cho hình thức này.' using errcode = 'P0001';
  end if;
  insert into order_refunds (order_id, branch_id, amount, method, money_account_id, reason, revenue_date, refunded_by,
                             needs_owner_review, idempotency_key)
  values (o.id, o.branch_id, p_amount, p_method, v_acc, btrim(p_reason), o.service_date, v_uid,
          not app.has_perm(o.branch_id, 'review_queue.read'), p_key)
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

-- ---------------------------------------------------------------- orders_guard: huỷ đơn đã xác nhận (K18)

create or replace function app.orders_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  v_today date;
  v_level text;
  v_content_changed boolean;
  v_adjust boolean := false;
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;
  if v_priv then v_uid := coalesce(v_uid, new.updated_by); end if;
  v_today := (now() at time zone app.branch_tz(new.branch_id))::date;

  if tg_op = 'INSERT' then
    if not v_priv then
      if new.created_by is distinct from v_uid then
        raise exception 'Người tạo phải là người đang đăng nhập.' using errcode = '42501';
      end if;
      if not app.has_perm(new.branch_id, 'order.create_draft') then
        raise exception 'Không có quyền tạo đơn.' using errcode = '42501';
      end if;
    end if;
    if new.status <> 'in_progress' then
      raise exception 'Đơn mới ở trạng thái Đang làm.' using errcode = 'P0001';
    end if;
    if new.appointment_id is not null
       and not exists (select 1 from appointments a where a.id = new.appointment_id and a.branch_id = new.branch_id) then
      raise exception 'Lịch hẹn không thuộc cơ sở này.' using errcode = 'P0001';
    end if;
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    new.content_rev := 1;
    new.content_tx := txid_current();
    new.done_by := null; new.done_at := null;
    new.confirmed_by := null; new.confirmed_at := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    new.needs_owner_review := false; new.reviewed_by := null; new.reviewed_at := null;
    new.warranty_until := null;
    new.adjusted_by := null; new.adjusted_at := null; new.adjust_reason := null;
  else
    -- UPDATE ------------------------------------------------------
    if new.id <> old.id or new.branch_id <> old.branch_id or new.code <> old.code or new.created_by <> old.created_by
       or new.created_at <> old.created_at or new.create_request_id <> old.create_request_id
       or new.create_request_hash <> old.create_request_hash
       or new.appointment_id is distinct from old.appointment_id then
      raise exception 'Không được đổi cơ sở, mã đơn, người tạo hoặc lịch hẹn của đơn.' using errcode = '42501';
    end if;

    v_content_changed := new.content_rev <> old.content_rev;
    if not v_content_changed and (
         new.customer_id is distinct from old.customer_id or new.service_date <> old.service_date
         or new.gross_amount <> old.gross_amount or new.discount_amount <> old.discount_amount
         or new.net_amount <> old.net_amount or new.has_hardening <> old.has_hardening
         or new.required_level <> old.required_level or new.pricing_hash <> old.pricing_hash) then
      raise exception 'Nội dung đơn chỉ đổi khi lưu cả đơn.' using errcode = 'P0001';
    end if;

    if v_content_changed then
      if new.content_rev <> old.content_rev + 1 then
        raise exception 'Phiên bản nội dung đơn không hợp lệ.' using errcode = 'P0001';
      end if;
      case old.status
        when 'in_progress' then
          -- K14: người tạo đơn và Nhung, Linh; thợ được chia phần chỉ xem [P39]
          if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')
                  or (old.created_by = v_uid and app.has_perm(old.branch_id, 'order.create_draft'))) then
            raise exception 'Chỉ người tạo đơn hoặc Nhung, Linh sửa được đơn.' using errcode = '42501';
          end if;
        when 'awaiting_confirmation' then
          -- K10: sau Làm xong chỉ Nhung, Linh sửa
          if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')) then
            raise exception 'Đơn đã bấm Làm xong, chỉ Nhung, Linh sửa được.' using errcode = '42501';
          end if;
        when 'confirmed' then
          -- D04: kỳ còn mở thì sửa được. Nhung, Linh; lý do bắt buộc; lưu trước/sau.
          if new.status <> 'confirmed' then
            raise exception 'Không đổi trạng thái khi sửa đơn đã xác nhận.' using errcode = 'P0001';
          end if;
          if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')) then
            raise exception 'Chỉ Nhung, Linh sửa được đơn đã xác nhận.' using errcode = '42501';
          end if;
          if char_length(btrim(coalesce(new.adjust_reason, ''))) = 0 then
            raise exception 'Cần ghi lý do sửa đơn đã xác nhận.' using errcode = 'P0001';
          end if;
        else
          raise exception 'Đơn đã huỷ, không sửa được.' using errcode = 'P0001';
      end case;
      new.content_tx := txid_current();
    else
      new.content_tx := old.content_tx;
    end if;
    v_adjust := v_content_changed and old.status = 'confirmed';

    -- Cột do server đặt: giữ giá trị cũ trừ khi đúng chuyển trạng thái bên dưới
    new.done_by := old.done_by; new.done_at := old.done_at;
    new.confirmed_by := old.confirmed_by; new.confirmed_at := old.confirmed_at;
    new.warranty_until := old.warranty_until;
    new.adjusted_by := old.adjusted_by; new.adjusted_at := old.adjusted_at;
    if v_adjust then
      new.adjusted_by := v_uid; new.adjusted_at := now();
      new.warranty_until := new.service_date + (case when new.has_hardening then 7 else 3 end);
    else
      new.adjust_reason := old.adjust_reason;
    end if;
    if new.status = old.status then
      new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at; new.cancel_reason := old.cancel_reason;
      if v_adjust and new.needs_owner_review and new.reviewed_by is null and new.reviewed_at is null then
        -- P31: người sửa có phần trong đơn đã xác nhận → vào lại Cần xem lại (constraint trigger kiểm khi commit)
        null;
      else
        new.needs_owner_review := old.needs_owner_review;
        -- Cần xem lại (Q04): chỉ người có review_queue.read đánh dấu đã xem
        if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
          if old.reviewed_by is not null or not old.needs_owner_review
             or not (v_priv or app.has_perm(old.branch_id, 'review_queue.read')) then
            raise exception 'Chỉ chủ quán đánh dấu đã xem lại.' using errcode = '42501';
          end if;
          new.reviewed_by := v_uid; new.reviewed_at := now();
        end if;
      end if;
    else
      new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
      new.needs_owner_review := old.needs_owner_review;
    end if;

    if new.status <> old.status then
      if old.status = 'cancelled' then
        raise exception 'Đơn đã huỷ, không đổi trạng thái được.' using errcode = 'P0001';
      end if;
      if old.status = 'confirmed' then
        -- K18: huỷ đơn đã xác nhận — Nhung, Linh, có lý do, khi đã hoàn hết tiền thu; Nhung huỷ → Cần xem lại
        if new.status <> 'cancelled' then
          raise exception 'Đơn đã xác nhận, không đổi trạng thái được.' using errcode = 'P0001';
        end if;
        if not (v_priv or app.has_perm(old.branch_id, 'order.refund')) then
          raise exception 'Chỉ Nhung, Linh huỷ được đơn đã xác nhận.' using errcode = '42501';
        end if;
        if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
          raise exception 'Cần ghi lý do huỷ đơn.' using errcode = 'P0001';
        end if;
        if app.order_net_collected(old.id) <> 0 then
          raise exception 'Đơn còn tiền đã thu chưa hoàn. Hoàn tiền (hoặc huỷ khoản trừ cọc) trước khi huỷ đơn.'
            using errcode = 'P0001';
        end if;
        new.cancelled_by := v_uid; new.cancelled_at := now();
        if not v_priv and not app.has_perm(old.branch_id, 'review_queue.read') then
          new.needs_owner_review := true;
          new.reviewed_by := null; new.reviewed_at := null;
        end if;
      else
        case new.status
          when 'awaiting_confirmation' then
            if old.status <> 'in_progress' then
              raise exception 'Chỉ bấm Làm xong được đơn Đang làm.' using errcode = 'P0001';
            end if;
            if not (v_priv or app.has_perm(old.branch_id, 'order.create_draft')) then
              raise exception 'Không có quyền bấm Làm xong.' using errcode = '42501';
            end if;
            new.done_by := v_uid; new.done_at := now();
          when 'confirmed' then
            if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')) then
              raise exception 'Chỉ Nhung, Linh xác nhận được bill.' using errcode = '42501';
            end if;
            if old.status = 'in_progress' then
              new.done_by := v_uid; new.done_at := now();
            end if;
            new.confirmed_by := v_uid; new.confirmed_at := now();
            new.warranty_until := new.service_date + case when new.has_hardening then 7 else 3 end;
            -- Q04: người xác nhận có phần trong đơn mà không phải chủ → vào Cần xem lại của Linh
            new.needs_owner_review := app.order_has_staff(new.id, new.content_rev)
                                      and not app.has_perm(old.branch_id, 'review_queue.read');
          when 'cancelled' then
            if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')
                    or (old.status = 'in_progress' and old.created_by = v_uid
                        and app.has_perm(old.branch_id, 'order.create_draft'))) then
              raise exception 'Không huỷ được đơn này. Báo Nhung hoặc Linh.' using errcode = '42501';
            end if;
            if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
              raise exception 'Cần ghi lý do huỷ đơn.' using errcode = 'P0001';
            end if;
            if exists (select 1 from payments p where p.order_id = old.id and p.voided_at is null) then
              raise exception 'Đơn đã có khoản thu. Huỷ khoản thu trước khi huỷ đơn.' using errcode = 'P0001';
            end if;
            new.cancelled_by := v_uid; new.cancelled_at := now();
          else
            raise exception 'Không đổi được sang trạng thái này.' using errcode = 'P0001';
        end case;
      end if;
    end if;
  end if;

  -- Ngày làm dịch vụ: không ở tương lai; người không có quyền xác nhận chỉ chọn hôm nay hoặc hôm qua [P32]
  if tg_op = 'INSERT' or new.service_date <> old.service_date then
    if new.service_date > v_today then
      raise exception 'Ngày làm dịch vụ không được sau hôm nay.' using errcode = 'P0001';
    end if;
    if not v_priv and new.service_date < v_today - 1 and not app.has_perm(new.branch_id, 'order.confirm') then
      raise exception 'Chỉ chọn được ngày làm dịch vụ hôm nay hoặc hôm qua.' using errcode = 'P0001';
    end if;
  end if;

  -- Duyệt giảm giá: chỉ người có quyền, đúng mức của mình, gắn với nội dung hiện tại [P29]
  if tg_op = 'INSERT' and new.discount_approved_by is null then
    new.discount_approved_at := null; new.discount_approved_level := null; new.discount_approval_hash := null;
  elsif tg_op = 'INSERT' or new.discount_approved_by is distinct from old.discount_approved_by
     or new.discount_approval_hash is distinct from old.discount_approval_hash
     or new.discount_approved_level is distinct from old.discount_approved_level
     or new.discount_approved_at is distinct from old.discount_approved_at then
    if new.discount_approved_by is null then
      new.discount_approved_at := null; new.discount_approved_level := null; new.discount_approval_hash := null;
    else
      v_level := case when v_priv then coalesce(new.discount_approved_level, 'owner') else app.discount_level(new.branch_id) end;
      if new.discount_approved_by is distinct from v_uid or app.level_rank(v_level) < 2 then
        raise exception 'Không có quyền duyệt giảm giá.' using errcode = '42501';
      end if;
      new.discount_approved_level := v_level;
      new.discount_approved_at := now();
      new.discount_approval_hash := new.pricing_hash;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_by := v_uid;
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- _order_check: tính cả phần đã hoàn

create or replace function app._order_check(p_order uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  o orders;
  v_n int;
  v_gross bigint;
  v_disc bigint;
  v_net bigint;
  v_hard boolean;
  v_paid bigint;
  v_refunded bigint;
  v_level text;
begin
  select * into o from orders where id = p_order;
  if not found then return; end if;

  select count(*), coalesce(sum(gross_amount), 0), coalesce(sum(discount_amount), 0), coalesce(sum(net_amount), 0),
         coalesce(bool_or(has_hardening), false)
    into v_n, v_gross, v_disc, v_net, v_hard
  from order_items where order_id = o.id and rev = o.content_rev;
  if v_gross <> o.gross_amount or v_disc <> o.discount_amount or v_net <> o.net_amount or v_hard <> o.has_hardening then
    raise exception 'Tổng tiền đơn không khớp các dòng.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from order_items i
    where i.order_id = o.id and i.rev = o.content_rev
      and (i.line_discount_amount <> coalesce((select sum(d.amount) from order_discounts d
                                               where d.order_id = o.id and d.rev = o.content_rev
                                                 and d.scope_position = i.position), 0)
        or i.below_amount <> coalesce((select sum(d.amount) from order_discounts d
                                       where d.order_id = o.id and d.rev = o.content_rev
                                         and d.scope_position = i.position and d.kind = 'below_list'), 0))
  ) or exists (
    select 1 from order_discounts d
    where d.order_id = o.id and d.rev = o.content_rev and d.scope_position is not null
      and not exists (select 1 from order_items i where i.order_id = o.id and i.rev = o.content_rev
                      and i.position = d.scope_position)
  ) or (select coalesce(sum(order_discount_amount), 0) from order_items where order_id = o.id and rev = o.content_rev)
       <> (select coalesce(sum(amount), 0) from order_discounts
           where order_id = o.id and rev = o.content_rev and scope_position is null)
    or (select coalesce(sum(shop_borne_amount), 0) from order_items where order_id = o.id and rev = o.content_rev)
       <> (select coalesce(sum(amount), 0) from order_discounts
           where order_id = o.id and rev = o.content_rev and shop_borne) then
    raise exception 'Khoản giảm không khớp các dòng.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from order_items i
    join (select item_position, sum(allocated_net_amount) as alloc, sum(commission_base_amount) as base
          from order_staff_allocations where order_id = o.id and rev = o.content_rev group by item_position) a
      on a.item_position = i.position
    where i.order_id = o.id and i.rev = o.content_rev
      and (a.alloc <> i.net_amount or a.base <> i.net_amount + i.shop_borne_amount)
  ) or exists (
    select 1 from order_staff_allocations a
    where a.order_id = o.id and a.rev = o.content_rev
      and not exists (select 1 from order_items i where i.order_id = o.id and i.rev = o.content_rev
                      and i.position = a.item_position)
  ) then
    raise exception 'Tiền chia cho thợ không khớp tiền thuần của dòng.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from order_staff_allocations a
    where a.order_id = o.id and a.rev = o.content_rev
      and not exists (select 1 from user_branch_roles ubr where ubr.user_id = a.staff_user_id
                      and ubr.branch_id = o.branch_id and ubr.revoked_at is null)
  ) then
    raise exception 'Thợ được chia tiền không thuộc cơ sở này.' using errcode = 'P0001';
  end if;

  if o.status in ('awaiting_confirmation', 'confirmed') then
    if v_n = 0 then
      raise exception 'Đơn chưa có dịch vụ nào.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from order_items i
      where i.order_id = o.id and i.rev = o.content_rev and i.unallocated_reason is null
        and not exists (select 1 from order_staff_allocations a where a.order_id = o.id and a.rev = o.content_rev
                        and a.item_position = i.position)
    ) then
      raise exception 'Còn dòng chưa chọn thợ.' using errcode = 'P0001';
    end if;
  end if;

  -- Thu tiền không vượt số phải thu; hoàn không vượt số đã thu (invariant 2) [P30]
  select coalesce(sum(amount), 0) into v_paid from payments where order_id = o.id and voided_at is null;
  select coalesce(sum(amount), 0) into v_refunded from order_refunds where order_id = o.id;
  if v_paid > o.net_amount then
    raise exception 'Số đã thu lớn hơn số phải thu.' using errcode = 'P0001';
  end if;
  if v_refunded > v_paid then
    raise exception 'Số đã hoàn lớn hơn số đã thu.' using errcode = 'P0001';
  end if;
  if v_paid - v_refunded > 0 and o.status not in ('awaiting_confirmation', 'confirmed') then
    raise exception 'Chỉ ghi tiền thu cho đơn đã bấm Làm xong.' using errcode = 'P0001';
  end if;

  v_level := app.order_required_level(o.id, o.content_rev);
  if v_level <> o.required_level then
    raise exception 'Mức duyệt giảm giá của đơn không khớp.' using errcode = 'P0001';
  end if;
  if o.status = 'confirmed' then
    if app.level_rank(v_level) >= 2 and not (
         o.discount_approval_hash = o.pricing_hash
         and app.level_rank(o.discount_approved_level) >= app.level_rank(v_level)) then
      raise exception 'Giảm giá chưa được duyệt đúng cấp.' using errcode = '42501';
    end if;
    if o.warranty_until is distinct from (o.service_date + (case when o.has_hardening then 7 else 3 end)) then
      raise exception 'Hạn bảo hành không đúng.' using errcode = 'P0001';
    end if;
    if o.adjusted_by is not null
       and exists (select 1 from order_staff_allocations a where a.order_id = o.id and a.rev = o.content_rev
                   and a.staff_user_id = o.adjusted_by)
       and not exists (select 1 from user_branch_roles ubr join role_permissions rp on rp.role_id = ubr.role_id
                       where ubr.user_id = o.adjusted_by and ubr.branch_id = o.branch_id and ubr.revoked_at is null
                         and rp.permission_code = 'review_queue.read')
       and not (o.needs_owner_review and (o.reviewed_at is null or o.reviewed_at > o.adjusted_at)) then
      raise exception 'Đơn có phần của người sửa phải vào danh sách Cần xem lại.' using errcode = 'P0001';
    end if;
  end if;

  if o.status <> 'cancelled' then
    perform 1 from order_service_tickets t
    where t.id in (select d.ticket_id from order_discounts d where d.order_id = o.id and d.rev = o.content_rev
                   and d.ticket_id is not null)
    for update;
    if exists (
      select 1 from order_discounts d
      join order_service_tickets t on t.id = d.ticket_id
      where d.order_id = o.id and d.rev = o.content_rev
        and (t.voided_at is not null or t.outcome <> 'compensation' or t.compensation_percent is distinct from d.percent
             or t.customer_id is distinct from o.customer_id or t.branch_id <> o.branch_id
             or exists (select 1 from orders o2 join order_discounts d2 on d2.order_id = o2.id and d2.rev = o2.content_rev
                        where d2.ticket_id = t.id and o2.id <> o.id and o2.status <> 'cancelled'))
    ) then
      raise exception 'Ưu đãi bù khiếu nại không hợp lệ hoặc đã dùng cho đơn khác.' using errcode = 'P0001';
    end if;
  end if;
end $$;

create constraint trigger refunds_invariants after insert on order_refunds
  deferrable initially deferred for each row execute function app.orders_check();

-- ---------------------------------------------------------------- Việc còn treo khi chốt quỹ: thêm tip chưa trả

create or replace function app.day_close_warnings(p_branch uuid, p_date date) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select case when app.has_perm(p_branch, 'money_accounts.read_balance') then jsonb_build_object(
    'awaitingOrders', (select count(*) from orders where branch_id = p_branch and status = 'awaiting_confirmation'
                       and service_date <= p_date),
    'inProgressOrders', (select count(*) from orders where branch_id = p_branch and status = 'in_progress'
                         and service_date <= p_date),
    'unpaidOrders', (select count(*) from orders o where o.branch_id = p_branch and o.status = 'confirmed'
                     and o.service_date <= p_date
                     and o.net_amount > coalesce((select sum(amount) from payments p
                                                  where p.order_id = o.id and p.voided_at is null), 0)),
    'pendingDeposits', (select count(*) from appointment_deposits where branch_id = p_branch and status = 'recorded'),
    'unpaidTips', (select count(*) from tip_holdings where branch_id = p_branch and payout_id is null
                   and voided_at is null),
    'unreconciled', (select count(*) from money_ledger_entries e join money_accounts m on m.id = e.money_account_id
                     where e.branch_id = p_branch and m.type = 'bank' and e.business_date <= p_date
                       and e.entry_type <> 'opening'
                       and not exists (select 1 from money_ledger_reconciliations r where r.entry_id = e.id)))
  end
$$;

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table tip_holdings enable row level security;
alter table tip_payouts enable row level security;
alter table order_refunds enable row level security;
alter table order_refund_allocations enable row level security;

-- Tip: Nhung, Linh thấy mọi khoản; thợ thấy tip của mình
grant select on tip_holdings, tip_payouts to app_user;
create policy tips_read on tip_holdings for select to app_user
  using (app.has_branch(branch_id) and (app.has_perm(branch_id, 'cashbook.manage')
                                        or app.has_perm(branch_id, 'money_accounts.read_balance')
                                        or staff_user_id = app.uid()));
create policy tip_payouts_read on tip_payouts for select to app_user
  using (app.has_branch(branch_id) and (app.has_perm(branch_id, 'cashbook.manage')
                                        or app.has_perm(branch_id, 'money_accounts.read_balance')
                                        or staff_user_id = app.uid()));

-- Phiếu hoàn: ai xem được đơn thì xem được phiếu hoàn của đơn (K09); chỉ Linh đánh dấu đã xem
grant select on order_refunds, order_refund_allocations to app_user;
grant update (reviewed_by, reviewed_at) on order_refunds to app_user;
create policy refunds_read on order_refunds for select to app_user using (app.order_visible(order_id));
create policy refunds_review on order_refunds for update to app_user
  using (app.has_perm(branch_id, 'review_queue.read')) with check (app.has_perm(branch_id, 'review_queue.read'));
create policy refund_alloc_read on order_refund_allocations for select to app_user using (app.order_visible(order_id));

grant execute on function app.record_tip(uuid, uuid[], bigint[], uuid) to app_user;
grant execute on function app.void_tip(uuid, text) to app_user;
grant execute on function app.pay_tips(uuid, uuid, uuid) to app_user;
grant execute on function app.refund_order(uuid, bigint, text, text, uuid) to app_user;
grant execute on function app.order_net_collected(uuid) to app_user;
