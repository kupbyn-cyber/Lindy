-- 0012 — Tiền cọc mùa Tết (module lịch §6, §11; PRD §6.6; B01, A02, A03, C01–C04, K05, K16; kế hoạch Đợt 3 mục 7.2,
-- bước 3.4–3.8).
-- - Mùa cọc do Linh nhập (dương lịch). Lịch được TẠO trong mùa thì cần cọc (C01); cờ tính một lần lúc tạo, không đổi.
-- - Cọc: Ghi (mọi người, chờ xác nhận) → Nhung, Linh xác nhận (tiền vào sổ) → trừ vào bill / hoàn / giữ.
--   Chưa xác nhận thì chưa phải tiền đã vào. Cọc đang giữ không phải doanh thu (invariant 16).
-- - Cọc bị giữ = doanh thu "cọc khách bỏ hẹn", phần của người nhận (Linh), ngoài hoa hồng và KPI (A03, C04, invariant 17).
-- - Trừ cọc vào bill: khoản thu loại 'deposit' do hàm app.apply_deposits ghi; không có bút toán (tiền đã vào sổ lúc
--   xác nhận cọc).

-- ---------------------------------------------------------------- Mùa cọc

create table deposit_seasons (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  start_date date not null,
  end_date date not null,
  amount_per_guest bigint not null default 100000 check (amount_per_guest between 1000 and 10000000),   -- A02
  refund_notice_hours int not null default 12 check (refund_notice_hours between 1 and 168),            -- C03
  forfeit_owner_user_id uuid not null references users(id),                                            -- A03
  is_active boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 30)                                        -- P57
);
create index deposit_seasons_branch_idx on deposit_seasons(branch_id, start_date);

-- ---------------------------------------------------------------- Lịch hẹn: cần cọc hay không

alter table appointments
  add column deposit_season_id uuid references deposit_seasons(id),
  add column deposit_required boolean not null default false,
  add column deposit_per_guest bigint check (deposit_per_guest > 0);

-- ---------------------------------------------------------------- Khoản cọc

create table appointment_deposits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  branch_id uuid not null references branches(id),
  amount bigint not null check (amount > 0 and amount <= 10000000),
  method text not null check (method in ('cash', 'transfer')),
  money_account_id uuid not null references money_accounts(id),
  note text check (char_length(note) <= 300),
  status text not null default 'recorded'
    check (status in ('recorded', 'confirmed', 'refunded', 'forfeited', 'voided')),
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  voided_by uuid references users(id),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  resolve_reason text check (char_length(resolve_reason) <= 500),
  resolved_amount bigint check (resolved_amount > 0),
  resolve_account_id uuid references money_accounts(id),       -- hoàn cọc: tài khoản chi
  suggested_action text check (suggested_action in ('refund', 'forfeit')),
  revenue_date date,                                            -- giữ cọc: ngày ghi doanh thu (ngày hẹn)
  forfeit_owner_user_id uuid references users(id),              -- giữ cọc: phần của ai (A03)
  needs_owner_review boolean not null default false,            -- xử lý trái gợi ý → Cần xem lại của Linh [P49]
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  idempotency_key uuid not null unique,
  version int not null default 1,
  check (status <> 'voided' or char_length(btrim(coalesce(void_reason, ''))) > 0),
  check (status not in ('refunded', 'forfeited') or (resolved_amount is not null
         and char_length(btrim(coalesce(resolve_reason, ''))) > 0)),
  check (status <> 'refunded' or resolve_account_id is not null),
  check (status <> 'forfeited' or (revenue_date is not null and forfeit_owner_user_id is not null))
);
create index appointment_deposits_appt_idx on appointment_deposits(appointment_id);
create index appointment_deposits_open_idx on appointment_deposits(branch_id, status) where status in ('recorded', 'confirmed');
create index appointment_deposits_forfeit_idx on appointment_deposits(branch_id, revenue_date) where status = 'forfeited';
create index appointment_deposits_review_idx on appointment_deposits(branch_id) where needs_owner_review and reviewed_at is null;

create trigger appointment_deposits_no_delete before delete on appointment_deposits
  for each row execute function app.forbid_mutation();
create trigger appointment_deposits_no_truncate before truncate on appointment_deposits
  for each statement execute function app.forbid_mutation();
create trigger deposit_seasons_no_delete before delete on deposit_seasons
  for each row execute function app.forbid_mutation();
create trigger deposit_seasons_no_truncate before truncate on deposit_seasons
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------- Khoản thu loại "cọc" (trừ cọc vào bill)

alter table payments drop constraint payments_method_check;
alter table payments add constraint payments_method_check check (method in ('cash', 'transfer', 'deposit'));
alter table payments alter column money_account_id drop not null;
alter table payments add column deposit_id uuid references appointment_deposits(id);
alter table payments add constraint payments_deposit_shape check (
  (method = 'deposit') = (deposit_id is not null) and (method = 'deposit') = (money_account_id is null));
create index payments_deposit_idx on payments(deposit_id) where deposit_id is not null;

-- ---------------------------------------------------------------- Hàm phụ

-- Mùa cọc đang bật của cơ sở chứa ngày p_date (giờ của cơ sở)
create function app.deposit_season_on(p_branch uuid, p_date date) returns deposit_seasons
language sql stable security definer set search_path = pg_catalog, public as $$
  select s.* from deposit_seasons s
  where s.branch_id = p_branch and s.is_active and p_date between s.start_date and s.end_date
  order by s.start_date desc limit 1
$$;

-- Phần cọc đã trừ vào bill (khoản thu loại cọc chưa huỷ)
create function app.deposit_applied(p_deposit uuid) returns bigint
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(sum(amount), 0)::bigint from payments where deposit_id = p_deposit and voided_at is null
$$;

-- Gợi ý hoàn hay giữ (C03): không đến → giữ; đã làm xong (cọc dư) → hoàn; huỷ → báo trước ≥ N giờ thì hoàn.
-- Mốc báo huỷ do DB ghi (customer_cancel_reported_at / cancelled_at = now()), không nhận từ máy [P50].
create function app.deposit_suggestion(p_appt uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select case
    when a.status = 'no_show' then 'forfeit'
    when a.status = 'completed' then 'refund'
    when a.status = 'cancelled' then
      case when a.start_at - coalesce(a.customer_cancel_reported_at, a.cancelled_at)
                >= make_interval(hours => coalesce(s.refund_notice_hours, 12)) then 'refund' else 'forfeit' end
    else null end
  from appointments a left join deposit_seasons s on s.id = a.deposit_season_id
  where a.id = p_appt
$$;

-- ---------------------------------------------------------------- Lịch hẹn: cờ cần cọc; thợ không tự huỷ lịch có cọc

-- Chạy trước appointments_guard (tên xếp trước). Cờ cọc do DB tính lúc tạo (C01) và không đổi về sau.
create function app.appointments_deposit_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  s deposit_seasons;
begin
  if tg_op = 'INSERT' then
    s := app.deposit_season_on(new.branch_id, (now() at time zone app.branch_tz(new.branch_id))::date);
    new.deposit_season_id := s.id;
    new.deposit_required := s.id is not null;
    new.deposit_per_guest := s.amount_per_guest;
    return new;
  end if;
  new.deposit_season_id := old.deposit_season_id;
  new.deposit_required := old.deposit_required;
  new.deposit_per_guest := old.deposit_per_guest;
  -- Test 36: lịch có cọc đã xác nhận (còn giữ) chỉ Linh, Nhung, Chin huỷ được (module §6.3)
  if new.status = 'cancelled' and old.status <> 'cancelled' and current_user = 'app_user'
     and not app.has_perm(old.branch_id, 'appointments.cancel_all')
     and exists (select 1 from appointment_deposits d where d.appointment_id = old.id and d.status = 'confirmed') then
    raise exception 'Lịch đã có cọc được xác nhận. Báo Linh, Nhung hoặc Chin huỷ lịch.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger appointments_deposit_guard before insert or update on appointments
  for each row execute function app.appointments_deposit_guard();

-- ---------------------------------------------------------------- deposits_guard: quyền theo cột và chuyển trạng thái

create function app.deposits_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  a record;
  s deposit_seasons;
  v_applied bigint;
  v_action text;
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;
  select id, branch_id, status, start_at, deposit_required, deposit_season_id into a
  from appointments where id = new.appointment_id;

  if tg_op = 'INSERT' then
    if v_priv then v_uid := coalesce(v_uid, new.recorded_by); end if;
    if a.id is null or a.branch_id <> new.branch_id then
      raise exception 'Không tìm thấy lịch.' using errcode = '22P02';
    end if;
    if not v_priv and (new.recorded_by is distinct from v_uid or not app.has_perm(new.branch_id, 'deposits.record')) then
      raise exception 'Không có quyền ghi cọc.' using errcode = '42501';
    end if;
    if not a.deposit_required then
      raise exception 'Lịch này không cần cọc (không tạo trong mùa cọc).' using errcode = 'P0001';
    end if;
    if a.status not in ('pending', 'confirmed', 'arrived', 'in_progress') then
      raise exception 'Lịch đã kết thúc, không ghi cọc được.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from money_accounts m where m.id = new.money_account_id and m.branch_id = new.branch_id
                   and m.is_active and m.type = case new.method when 'cash' then 'cash' else 'bank' end) then
      raise exception 'Tài khoản nhận cọc không hợp lệ.' using errcode = 'P0001';
    end if;
    new.status := 'recorded';
    new.recorded_by := v_uid;
    new.recorded_at := now();
    new.confirmed_by := null; new.confirmed_at := null;
    new.voided_by := null; new.voided_at := null; new.void_reason := null;
    new.resolved_by := null; new.resolved_at := null; new.resolve_reason := null; new.resolved_amount := null;
    new.resolve_account_id := null; new.suggested_action := null; new.revenue_date := null;
    new.forfeit_owner_user_id := null;
    new.needs_owner_review := false; new.reviewed_by := null; new.reviewed_at := null;
    new.version := 1;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------
  if new.id <> old.id or new.appointment_id <> old.appointment_id or new.branch_id <> old.branch_id
     or new.amount <> old.amount or new.method <> old.method or new.money_account_id <> old.money_account_id
     or new.note is distinct from old.note or new.recorded_by <> old.recorded_by or new.recorded_at <> old.recorded_at
     or new.idempotency_key <> old.idempotency_key then
    raise exception 'Khoản cọc không sửa được; huỷ khoản ghi nhầm rồi ghi lại.' using errcode = '42501';
  end if;

  -- Linh đánh dấu đã xem (Cần xem lại) — thao tác riêng
  if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    if new.status <> old.status or not old.needs_owner_review or old.reviewed_by is not null
       or not (v_priv or app.has_perm(old.branch_id, 'review_queue.read')) then
      raise exception 'Chỉ chủ quán đánh dấu đã xem lại.' using errcode = '42501';
    end if;
    new.reviewed_by := coalesce(v_uid, new.reviewed_by);
    new.reviewed_at := now();
    new.version := old.version + 1;
    return new;
  end if;

  -- Cột do DB đặt: giữ giá trị cũ trừ khi đúng chuyển trạng thái bên dưới
  new.confirmed_by := old.confirmed_by; new.confirmed_at := old.confirmed_at;
  new.voided_by := old.voided_by; new.voided_at := old.voided_at;
  new.resolved_by := old.resolved_by; new.resolved_at := old.resolved_at; new.resolved_amount := old.resolved_amount;
  new.suggested_action := old.suggested_action; new.revenue_date := old.revenue_date;
  new.forfeit_owner_user_id := old.forfeit_owner_user_id; new.needs_owner_review := old.needs_owner_review;

  if new.status = old.status then
    new.void_reason := old.void_reason; new.resolve_reason := old.resolve_reason;
    new.resolve_account_id := old.resolve_account_id;
    new.version := old.version;
    return new;
  end if;

  if old.status = 'recorded' and new.status = 'confirmed' then
    if not (v_priv or app.has_perm(old.branch_id, 'deposits.confirm')) then
      raise exception 'Chỉ Nhung, Linh xác nhận được tiền cọc.' using errcode = '42501';
    end if;
    new.confirmed_by := coalesce(v_uid, new.confirmed_by);
    new.confirmed_at := now();
    new.void_reason := null; new.resolve_reason := null; new.resolve_account_id := null;

  elsif old.status in ('recorded', 'confirmed') and new.status = 'voided' then
    if not (v_priv or app.has_perm(old.branch_id, 'deposits.confirm')
            or (old.status = 'recorded' and old.recorded_by = v_uid and app.has_perm(old.branch_id, 'deposits.record'))) then
      raise exception 'Chỉ người ghi (khi chưa xác nhận) hoặc Nhung, Linh huỷ được khoản cọc.' using errcode = '42501';
    end if;
    if char_length(btrim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'Cần ghi lý do huỷ khoản cọc.' using errcode = 'P0001';
    end if;
    if app.deposit_applied(old.id) > 0 then
      raise exception 'Cọc đã trừ vào bill. Huỷ khoản trừ cọc trên đơn trước.' using errcode = 'P0001';
    end if;
    new.voided_by := coalesce(v_uid, new.voided_by);
    new.voided_at := now();
    new.resolve_reason := null; new.resolve_account_id := null;

  elsif old.status = 'confirmed' and new.status in ('refunded', 'forfeited') then
    if not (v_priv or app.has_perm(old.branch_id, 'deposits.resolve')) then
      raise exception 'Chỉ Linh, Nhung, Chin hoàn hoặc giữ cọc.' using errcode = '42501';
    end if;
    if a.status not in ('cancelled', 'no_show', 'completed') then
      raise exception 'Hoàn hoặc giữ cọc sau khi lịch đã huỷ, khách không đến, hoặc đã làm xong.' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(new.resolve_reason, ''))) = 0 then
      raise exception 'Cần ghi lý do hoàn hoặc giữ cọc.' using errcode = 'P0001';
    end if;
    v_applied := app.deposit_applied(old.id);
    if old.amount - v_applied <= 0 then
      raise exception 'Cọc đã trừ hết vào bill.' using errcode = 'P0001';
    end if;
    new.resolved_amount := old.amount - v_applied;
    new.resolved_by := coalesce(v_uid, new.resolved_by);
    new.resolved_at := now();
    new.suggested_action := app.deposit_suggestion(old.appointment_id);
    v_action := case new.status when 'refunded' then 'refund' else 'forfeit' end;
    if new.status = 'refunded' then
      if not exists (select 1 from money_accounts m where m.id = new.resolve_account_id
                     and m.branch_id = old.branch_id and m.is_active) then
        raise exception 'Chọn tài khoản chi tiền hoàn cọc.' using errcode = 'P0001';
      end if;
    else
      new.resolve_account_id := null;
      select * into s from deposit_seasons where id = a.deposit_season_id;
      new.revenue_date := (a.start_at at time zone app.branch_tz(old.branch_id))::date;
      new.forfeit_owner_user_id := s.forfeit_owner_user_id;
      if new.forfeit_owner_user_id is null then
        raise exception 'Mùa cọc chưa có người nhận phần cọc bỏ hẹn.' using errcode = 'P0001';
      end if;
    end if;
    -- Làm trái gợi ý → Cần xem lại của Linh [P49]
    new.needs_owner_review := v_action is distinct from new.suggested_action and not v_priv
                              and not app.has_perm(old.branch_id, 'review_queue.read');
    new.void_reason := null;
  else
    raise exception 'Không đổi được trạng thái cọc như vậy.' using errcode = 'P0001';
  end if;

  new.version := old.version + 1;
  return new;
end $$;

create trigger deposits_guard before insert or update on appointment_deposits
  for each row execute function app.deposits_guard();

-- ---------------------------------------------------------------- Bút toán cọc

create function app.deposits_ledger() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_tz text := app.branch_tz(new.branch_id);
begin
  if old.status = 'recorded' and new.status = 'confirmed' then
    perform app._ledger_post(new.branch_id, new.money_account_id, 'deposit_in', new.amount, 'deposit', new.id,
                             new.confirmed_by);
  elsif old.status = 'confirmed' and new.status = 'voided' then
    perform app._ledger_post(new.branch_id, new.money_account_id, 'deposit_in_void', -new.amount, 'deposit', new.id,
                             new.voided_by, new.void_reason, app._ledger_entry_of('deposit', new.id, 'deposit_in'));
  elsif old.status = 'confirmed' and new.status = 'refunded' then
    perform app._ledger_post(new.branch_id, new.resolve_account_id, 'deposit_refund', -new.resolved_amount, 'deposit',
                             new.id, new.resolved_by, new.resolve_reason);
  end if;
  return null;
end $$;

create trigger deposits_ledger after update of status on appointment_deposits
  for each row execute function app.deposits_ledger();

-- Lịch sử của lịch hẹn ghi mọi thao tác cọc (module §17.7); danh sách lịch tải lại (nhãn Chưa cọc / Cọc chờ xác
-- nhận). Gói tin chỉ có loại, cơ sở, ngày.
create function app.deposits_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'deposit_recorded';
  elsif new.status <> old.status then
    v_action := 'deposit_' || new.status;
  elsif new.reviewed_at is distinct from old.reviewed_at then
    v_action := 'deposit_reviewed';
  end if;
  if v_action is not null then
    insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, after_json, reason)
    values (new.appointment_id, new.branch_id,
            coalesce(app.uid(), case new.status when 'recorded' then new.recorded_by when 'confirmed' then new.confirmed_by
                                                when 'voided' then new.voided_by else new.resolved_by end),
            v_action,
            jsonb_build_object('depositId', new.id, 'amount', new.amount, 'method', new.method,
                               'resolvedAmount', new.resolved_amount, 'suggestedAction', new.suggested_action),
            case new.status when 'voided' then new.void_reason when 'refunded' then new.resolve_reason
                            when 'forfeited' then new.resolve_reason end);
  end if;
  perform pg_notify('lindy_events', json_build_object(
    'kind', 'appointments', 'branchId', new.branch_id,
    'dates', array[(select to_char(start_at at time zone app.branch_tz(branch_id), 'YYYY-MM-DD')
                    from appointments where id = new.appointment_id)])::text);
  return null;
end $$;

create trigger deposits_after after insert or update on appointment_deposits
  for each row execute function app.deposits_after();

-- ---------------------------------------------------------------- Kiểm khi commit: trừ cọc không vượt số cọc [P55]

create function app._deposit_check(p_deposit uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  d appointment_deposits;
  v_applied bigint;
begin
  select * into d from appointment_deposits where id = p_deposit;
  if not found then return; end if;
  v_applied := app.deposit_applied(d.id);
  if v_applied > 0 and d.status not in ('confirmed', 'refunded', 'forfeited') then
    raise exception 'Chỉ trừ vào bill khoản cọc đã xác nhận.' using errcode = 'P0001';
  end if;
  if v_applied + coalesce(d.resolved_amount, 0) > d.amount then
    raise exception 'Số trừ vào bill vượt số cọc còn lại.' using errcode = 'P0001';
  end if;
end $$;

create function app.deposits_check_payment() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.deposit_id is not null then
    perform app._deposit_check(new.deposit_id);
  end if;
  return null;
end $$;

create function app.deposits_check_self() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._deposit_check(new.id);
  return null;
end $$;

create constraint trigger payments_deposit_invariants after insert or update on payments
  deferrable initially deferred for each row execute function app.deposits_check_payment();
create constraint trigger deposits_invariants after insert or update on appointment_deposits
  deferrable initially deferred for each row execute function app.deposits_check_self();

-- ---------------------------------------------------------------- payments_guard: thêm khoản thu loại cọc

create or replace function app.payments_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not v_priv then
      if new.recorded_by is distinct from v_uid or not app.has_perm(new.branch_id, 'order.confirm') then
        raise exception 'Chỉ Nhung, Linh ghi được tiền thu.' using errcode = '42501';
      end if;
    end if;
    if not exists (select 1 from orders o where o.id = new.order_id and o.branch_id = new.branch_id) then
      raise exception 'Đơn không thuộc cơ sở này.' using errcode = 'P0001';
    end if;
    if new.method = 'deposit' then
      -- Trừ cọc chỉ qua app.apply_deposits (chạy quyền chủ DB): app tự trừ khi bấm Làm xong hoặc xác nhận
      if not v_priv then
        raise exception 'Cọc được app tự trừ vào bill khi bấm Làm xong hoặc xác nhận.' using errcode = '42501';
      end if;
      perform 1 from appointment_deposits where id = new.deposit_id for update;   -- trừ song song phải chờ nhau [S36]
      if not exists (select 1 from appointment_deposits d join orders o on o.appointment_id = d.appointment_id
                     where d.id = new.deposit_id and o.id = new.order_id and d.status = 'confirmed'
                       and d.branch_id = new.branch_id) then
        raise exception 'Cọc không thuộc lịch của đơn này hoặc chưa xác nhận.' using errcode = 'P0001';
      end if;
      new.money_account_id := null;
    else
      new.deposit_id := null;
      if not exists (select 1 from money_accounts m where m.id = new.money_account_id and m.branch_id = new.branch_id
                     and m.is_active and m.type = case new.method when 'cash' then 'cash' else 'bank' end) then
        raise exception 'Tài khoản nhận tiền không hợp lệ.' using errcode = 'P0001';
      end if;
    end if;
    new.received_at := now();
    new.reconciliation_status := 'unreconciled';
    new.voided_by := null; new.voided_at := null; new.void_reason := null;
    return new;
  end if;
  -- UPDATE: chỉ huỷ khoản thu nhập nhầm, một lần, khi chưa đối soát
  if new.id <> old.id or new.order_id <> old.order_id or new.branch_id <> old.branch_id or new.amount <> old.amount
     or new.method <> old.method or new.money_account_id is distinct from old.money_account_id
     or new.deposit_id is distinct from old.deposit_id or new.received_at <> old.received_at
     or new.recorded_by <> old.recorded_by or new.idempotency_key <> old.idempotency_key
     or new.reconciliation_status <> old.reconciliation_status then
    raise exception 'Khoản thu không sửa được; huỷ khoản nhập nhầm rồi ghi lại.' using errcode = '42501';
  end if;
  if old.voided_at is not null then
    raise exception 'Khoản thu này đã huỷ.' using errcode = 'P0001';
  end if;
  if old.reconciliation_status = 'reconciled' then
    raise exception 'Khoản thu đã đối soát, không huỷ được.' using errcode = 'P0001';
  end if;
  if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')) then
    raise exception 'Chỉ Nhung, Linh huỷ được khoản thu.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(new.void_reason, ''))) = 0 then
    raise exception 'Cần ghi lý do huỷ khoản thu.' using errcode = 'P0001';
  end if;
  if old.deposit_id is not null
     and exists (select 1 from appointment_deposits d where d.id = old.deposit_id and d.status in ('refunded', 'forfeited')) then
    raise exception 'Cọc đã hoàn hoặc giữ, không huỷ được khoản trừ cọc.' using errcode = 'P0001';
  end if;
  new.voided_by := coalesce(v_uid, new.voided_by);
  new.voided_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- Trừ cọc vào bill (module §5.4, §10; test 35, 54)

-- Gọi khi đơn tạo từ lịch sang Chờ xác nhận hoặc Đã xác nhận. Trừ phần cọc đã xác nhận còn lại của lịch, không quá số
-- còn phải thu; lịch nhóm nhiều đơn dùng chung phần cọc còn lại. Ai bấm Làm xong cũng gọi được (không tạo tiền mới).
create function app.apply_deposits(p_order uuid) returns bigint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  o orders;
  d appointment_deposits;
  v_due bigint;
  v_rem bigint;
  v_amt bigint;
  v_total bigint := 0;
begin
  if app.uid() is null or not app.order_visible(p_order) then
    raise exception 'Không tìm thấy đơn.' using errcode = '22P02';
  end if;
  select * into o from orders where id = p_order for update;
  if o.appointment_id is null or o.status not in ('awaiting_confirmation', 'confirmed') then
    return 0;
  end if;
  v_due := o.net_amount - (select coalesce(sum(amount), 0) from payments where order_id = o.id and voided_at is null);
  for d in
    select * from appointment_deposits
    where appointment_id = o.appointment_id and status = 'confirmed'
    order by confirmed_at, id
    for update
  loop
    exit when v_due <= 0;
    v_rem := d.amount - coalesce(d.resolved_amount, 0) - app.deposit_applied(d.id);
    if v_rem > 0 then
      v_amt := least(v_rem, v_due);
      insert into payments (order_id, branch_id, amount, method, money_account_id, recorded_by, idempotency_key, deposit_id)
      values (o.id, o.branch_id, v_amt, 'deposit', null, app.uid(), gen_random_uuid(), d.id);
      insert into order_audit_events (order_id, branch_id, actor_user_id, action, after_json)
      values (o.id, o.branch_id, app.uid(), 'deposit_applied', jsonb_build_object('depositId', d.id, 'amount', v_amt));
      v_due := v_due - v_amt;
      v_total := v_total + v_amt;
    end if;
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------- Mùa cọc: Linh lưu qua hàm (booking_settings.manage)

create function app.deposit_season_save(
  p_id uuid, p_branch uuid, p_name text, p_start date, p_end date, p_amount bigint, p_hours int, p_owner uuid,
  p_active boolean
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_old deposit_seasons;
  v_id uuid;
begin
  if v_uid is null or not app.has_perm(p_branch, 'booking_settings.manage') then
    raise exception 'Chỉ chủ quán cài được mùa cọc.' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Ngày kết thúc mùa cọc phải từ ngày bắt đầu trở đi.' using errcode = 'P0001';
  end if;
  if p_end - p_start > 30 then
    raise exception 'Mùa cọc dài tối đa 31 ngày. Kiểm lại năm, tháng.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from user_branch_roles ubr join users u on u.id = ubr.user_id
                 where ubr.user_id = p_owner and ubr.branch_id = p_branch and ubr.revoked_at is null and u.is_active) then
    raise exception 'Người nhận phần cọc bỏ hẹn không thuộc cơ sở này.' using errcode = 'P0001';
  end if;
  perform 1 from branches where id = p_branch for update;   -- hai lần lưu song song phải chờ nhau
  if p_active and exists (select 1 from deposit_seasons s where s.branch_id = p_branch and s.is_active
                          and (p_id is null or s.id <> p_id)
                          and s.start_date <= p_end and p_start <= s.end_date) then
    raise exception 'Trùng ngày với một mùa cọc khác đang bật.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into deposit_seasons (branch_id, name, start_date, end_date, amount_per_guest, refund_notice_hours,
                                 forfeit_owner_user_id, is_active, created_by, updated_by)
    values (p_branch, btrim(p_name), p_start, p_end, p_amount, p_hours, p_owner, p_active, v_uid, v_uid)
    returning id into v_id;
  else
    select * into v_old from deposit_seasons where id = p_id and branch_id = p_branch for update;
    if not found then
      raise exception 'Không tìm thấy mùa cọc.' using errcode = '22P02';
    end if;
    update deposit_seasons set name = btrim(p_name), start_date = p_start, end_date = p_end, amount_per_guest = p_amount,
                               refund_notice_hours = p_hours, forfeit_owner_user_id = p_owner, is_active = p_active,
                               updated_by = v_uid, updated_at = now()
    where id = p_id;
    v_id := p_id;
  end if;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'deposit_season.saved', 'deposit_season', v_id::text,
          jsonb_build_object('before', case when v_old.id is null then null else to_jsonb(v_old) end,
                             'after', jsonb_build_object('name', p_name, 'start', p_start, 'end', p_end,
                                                         'amountPerGuest', p_amount, 'refundNoticeHours', p_hours,
                                                         'forfeitOwner', p_owner, 'active', p_active)));
  return v_id;
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table deposit_seasons enable row level security;
alter table appointment_deposits enable row level security;

grant select on deposit_seasons to app_user;
create policy deposit_seasons_read on deposit_seasons for select to app_user using (app.has_branch(branch_id));

grant select, insert, update on appointment_deposits to app_user;
grant select on appointment_deposits to app_worker;
create policy deposits_read on appointment_deposits for select to app_user
  using (app.has_perm(branch_id, 'appointments.read_branch'));
create policy deposits_insert on appointment_deposits for insert to app_user
  with check (app.has_perm(branch_id, 'deposits.record') and recorded_by = app.uid());
create policy deposits_update on appointment_deposits for update to app_user
  using (app.has_perm(branch_id, 'appointments.read_branch'))
  with check (app.has_perm(branch_id, 'appointments.read_branch'));
create policy deposits_worker on appointment_deposits for select to app_worker using (true);

-- Hàm do trigger chạy quyền người gọi (appointments_deposit_guard, deposits_guard) và service dùng
grant execute on function app.deposit_season_on(uuid, date) to app_user;
grant execute on function app.deposit_applied(uuid) to app_user;
grant execute on function app.deposit_suggestion(uuid) to app_user;
grant execute on function app.apply_deposits(uuid) to app_user;
grant execute on function app.deposit_season_save(uuid, uuid, text, date, date, bigint, int, uuid, boolean) to app_user;
