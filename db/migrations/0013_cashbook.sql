-- 0013 — Thu chi và chốt ngày (Đợt 3B-1; PRD §7.3–7.4, §13 C–D; Q19–Q23; K17; kế hoạch Đợt 3 mục 7.3, 16).
-- - Đề nghị chi: mọi người đề nghị; Nhung duyệt đến 1.000.000đ/phiếu trừ 4 nhóm; trên mức hoặc 4 nhóm thì Linh
--   (invariant 14). Chỉ ghi tiền ra khi bấm "Đã chi" (invariant 9).
-- - Phiếu Linh lập: thu khác, góp vốn, rút vốn, điều chỉnh. Chuyển nội bộ: cặp bút toán −X/+X.
-- - Đối soát chuyển khoản theo từng bút toán của tài khoản ngân hàng; đã đối soát thì khoản gốc không huỷ được.
-- - Chốt quỹ tiền mặt: một lần mỗi ngày, sau giờ đóng cửa (Q23); lệch thì ghi bút toán chênh lệch (K17); bút toán ghi
--   sau khi chốt rơi vào ngày kế [P54]. Bản chốt chỉ thêm (test 14).

-- ---------------------------------------------------------------- Nhóm chi (PRD §7.3; Q20)

create table expense_categories (
  code text primary key check (code ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('operating', 'staff')),
  owner_only boolean not null default false,       -- Q20: luôn cần Linh duyệt dù số tiền nhỏ
  sort_order int not null
);

insert into expense_categories (code, name, kind, owner_only, sort_order) values
  ('supplies', 'Vật tư', 'operating', false, 10),
  ('tools', 'Công cụ', 'operating', false, 20),
  ('utilities', 'Điện nước', 'operating', false, 30),
  ('internet', 'Internet', 'operating', false, 40),
  ('marketing', 'Marketing', 'operating', false, 50),
  ('cleaning', 'Vệ sinh', 'operating', false, 60),
  ('training', 'Đào tạo', 'operating', false, 70),
  ('bank_fee', 'Phí chuyển khoản', 'operating', false, 80),
  ('other', 'Chi khác', 'operating', false, 90),
  ('rent', 'Tiền nhà', 'operating', true, 100),
  ('equipment', 'Máy móc, thiết bị', 'operating', true, 110),
  ('repair', 'Sửa chữa', 'operating', true, 120),
  ('salary', 'Lương', 'staff', true, 130),
  ('bonus', 'Thưởng', 'staff', true, 140);

grant select on expense_categories to app_user;

-- ---------------------------------------------------------------- Đề nghị chi

create table expense_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  category_code text not null references expense_categories(code),
  amount bigint not null check (amount between 1 and 100000000),
  note text not null check (char_length(btrim(note)) between 1 and 300),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'paid', 'cancelled')),
  required_level text not null default 'manager' check (required_level in ('manager', 'owner')),
  requested_by uuid not null references users(id),
  requested_at timestamptz not null default now(),
  approved_by uuid references users(id),
  approved_at timestamptz,
  approved_level text check (approved_level in ('manager', 'owner')),
  rejected_by uuid references users(id),
  rejected_at timestamptz,
  reject_reason text check (char_length(reject_reason) <= 500),
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  paid_by uuid references users(id),
  paid_at timestamptz,
  paid_account_id uuid references money_accounts(id),
  needs_owner_review boolean not null default false,       -- Nhung tự duyệt phiếu của mình
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  version int not null default 1,
  create_request_id uuid not null,
  unique (requested_by, create_request_id),
  check (status <> 'rejected' or char_length(btrim(coalesce(reject_reason, ''))) > 0),
  check (status <> 'paid' or (paid_account_id is not null and approved_by is not null))
);
create index expense_requests_branch_idx on expense_requests(branch_id, status, requested_at desc);
create index expense_requests_review_idx on expense_requests(branch_id) where needs_owner_review and reviewed_at is null;

create trigger expense_requests_no_delete before delete on expense_requests
  for each row execute function app.forbid_mutation();
create trigger expense_requests_no_truncate before truncate on expense_requests
  for each statement execute function app.forbid_mutation();

-- Mức duyệt (Q19, Q20, invariant 14): trên 1.000.000đ hoặc nhóm luôn cần Linh → owner
create function app.expense_level(p_category text, p_amount bigint) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select case when p_amount > 1000000 or coalesce((select owner_only from expense_categories where code = p_category), true)
              then 'owner' else 'manager' end
$$;

-- Người đang thao tác duyệt được mức này ở cơ sở không
create function app.expense_can_approve(p_branch uuid, p_level text) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select app.has_perm(p_branch, 'expense.approve_above_limit')
         or (p_level = 'manager' and app.has_perm(p_branch, 'expense.approve_within_limit'))
$$;

create function app.expenses_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not v_priv and (new.requested_by is distinct from v_uid or not app.has_perm(new.branch_id, 'expense.request')) then
      raise exception 'Không có quyền đề nghị chi.' using errcode = '42501';
    end if;
    new.required_level := app.expense_level(new.category_code, new.amount);
    new.status := 'requested';
    new.requested_at := now();
    new.approved_by := null; new.approved_at := null; new.approved_level := null;
    new.rejected_by := null; new.rejected_at := null; new.reject_reason := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    new.paid_by := null; new.paid_at := null; new.paid_account_id := null;
    new.needs_owner_review := false; new.reviewed_by := null; new.reviewed_at := null;
    new.version := 1;
    -- Người lập đủ quyền duyệt mức này → duyệt luôn; người duyệt không phải chủ (Nhung) → Cần xem lại của Linh
    if not v_priv and app.expense_can_approve(new.branch_id, new.required_level) then
      new.status := 'approved';
      new.approved_by := v_uid;
      new.approved_at := now();
      new.approved_level := case when app.has_perm(new.branch_id, 'expense.approve_above_limit') then 'owner' else 'manager' end;
      new.needs_owner_review := not app.has_perm(new.branch_id, 'review_queue.read');
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------
  if new.id <> old.id or new.branch_id <> old.branch_id or new.category_code <> old.category_code
     or new.amount <> old.amount or new.note <> old.note or new.requested_by <> old.requested_by
     or new.requested_at <> old.requested_at or new.create_request_id <> old.create_request_id
     or new.required_level <> old.required_level then
    raise exception 'Đề nghị chi không sửa được; huỷ rồi lập lại.' using errcode = '42501';
  end if;

  -- Linh đánh dấu đã xem — thao tác riêng
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

  new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.approved_level := old.approved_level;
  new.rejected_by := old.rejected_by; new.rejected_at := old.rejected_at;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  new.paid_by := old.paid_by; new.paid_at := old.paid_at;
  new.needs_owner_review := old.needs_owner_review;

  if new.status = old.status then
    new.reject_reason := old.reject_reason; new.cancel_reason := old.cancel_reason;
    new.paid_account_id := old.paid_account_id;
    new.version := old.version;
    return new;
  end if;

  if old.status = 'requested' and new.status = 'approved' then
    if not (v_priv or app.expense_can_approve(old.branch_id, old.required_level)) then
      raise exception '%', case when old.required_level = 'owner'
        then 'Phiếu trên 1.000.000đ hoặc thuộc nhóm tiền nhà, lương thưởng, máy móc, sửa chữa: chỉ Linh duyệt.'
        else 'Không có quyền duyệt chi.' end using errcode = '42501';
    end if;
    new.approved_by := coalesce(v_uid, new.approved_by);
    new.approved_at := now();
    new.approved_level := case when v_priv or app.has_perm(old.branch_id, 'expense.approve_above_limit')
                               then 'owner' else 'manager' end;
    new.needs_owner_review := not v_priv and old.requested_by = v_uid
                              and not app.has_perm(old.branch_id, 'review_queue.read');
    new.paid_account_id := null;

  elsif old.status = 'requested' and new.status = 'rejected' then
    if not (v_priv or app.expense_can_approve(old.branch_id, old.required_level)) then
      raise exception 'Không có quyền từ chối phiếu này.' using errcode = '42501';
    end if;
    if char_length(btrim(coalesce(new.reject_reason, ''))) = 0 then
      raise exception 'Cần ghi lý do từ chối.' using errcode = 'P0001';
    end if;
    new.rejected_by := coalesce(v_uid, new.rejected_by);
    new.rejected_at := now();
    new.paid_account_id := null;

  elsif old.status in ('requested', 'approved') and new.status = 'cancelled' then
    if not (v_priv or app.expense_can_approve(old.branch_id, old.required_level)
            or app.has_perm(old.branch_id, 'cashbook.manage')
            or (old.status = 'requested' and old.requested_by = v_uid)) then
      raise exception 'Chỉ người đề nghị (khi chưa duyệt) hoặc Nhung, Linh huỷ được phiếu.' using errcode = '42501';
    end if;
    if old.status = 'approved' and char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'Phiếu đã duyệt: cần ghi lý do huỷ.' using errcode = 'P0001';
    end if;
    new.cancelled_by := coalesce(v_uid, new.cancelled_by);
    new.cancelled_at := now();
    new.paid_account_id := null;

  elsif old.status = 'approved' and new.status = 'paid' then
    if not (v_priv or app.has_perm(old.branch_id, 'cashbook.manage')) then
      raise exception 'Chỉ Nhung, Linh ghi "Đã chi".' using errcode = '42501';
    end if;
    if not exists (select 1 from money_accounts m where m.id = new.paid_account_id and m.branch_id = old.branch_id
                   and m.is_active) then
      raise exception 'Chọn tài khoản chi tiền.' using errcode = 'P0001';
    end if;
    new.paid_by := coalesce(v_uid, new.paid_by);
    new.paid_at := now();

  else
    raise exception 'Không đổi được trạng thái phiếu chi như vậy.' using errcode = 'P0001';
  end if;

  new.version := old.version + 1;
  return new;
end $$;

create trigger expenses_guard before insert or update on expense_requests
  for each row execute function app.expenses_guard();

-- Tiền ra khi "Đã chi" (một lần, invariant 9); báo màn tiền tải lại khi phiếu đổi trạng thái
create function app.expenses_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'paid' then
    perform app._ledger_post(new.branch_id, new.paid_account_id, 'expense', -new.amount, 'expense', new.id, new.paid_by,
                             (select name from expense_categories where code = new.category_code) || ': ' || new.note);
  end if;
  perform pg_notify('lindy_events', json_build_object('kind', 'money', 'branchId', new.branch_id)::text);
  return null;
end $$;

create trigger expenses_after after insert or update on expense_requests
  for each row execute function app.expenses_after();

-- ---------------------------------------------------------------- Phiếu Linh lập, chuyển nội bộ

create table cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  kind text not null check (kind in ('other_income', 'capital_in', 'capital_out', 'adjustment')),
  income_type text check (income_type in ('loan', 'supplier_refund', 'other')),
  money_account_id uuid not null references money_accounts(id),
  amount bigint not null check (amount <> 0 and abs(amount) <= 10000000000),   -- có dấu: tiền vào +, tiền ra −
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  check ((kind = 'other_income') = (income_type is not null)),
  check (kind not in ('other_income', 'capital_in') or amount > 0),
  check (kind <> 'capital_out' or amount < 0)
);

create table cash_transfers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  from_account_id uuid not null references money_accounts(id),
  to_account_id uuid not null references money_accounts(id),
  amount bigint not null check (amount between 1 and 10000000000),
  note text check (char_length(note) <= 300),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  check (from_account_id <> to_account_id)
);

create trigger cash_vouchers_append_only before update or delete on cash_vouchers
  for each row execute function app.forbid_mutation();
create trigger cash_vouchers_no_truncate before truncate on cash_vouchers
  for each statement execute function app.forbid_mutation();
create trigger cash_transfers_append_only before update or delete on cash_transfers
  for each row execute function app.forbid_mutation();
create trigger cash_transfers_no_truncate before truncate on cash_transfers
  for each statement execute function app.forbid_mutation();

-- Linh (cashbook.owner): thu khác, góp vốn, rút vốn, điều chỉnh. Gửi lại cùng mã → trả phiếu đã có.
create function app.cash_voucher_create(
  p_branch uuid, p_kind text, p_income_type text, p_account uuid, p_amount bigint, p_reason text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
  v_amount bigint;
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.owner') then
    raise exception 'Chỉ chủ quán lập phiếu thu khác, góp/rút vốn, điều chỉnh.' using errcode = '42501';
  end if;
  select id into v_id from cash_vouchers where idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from money_accounts where id = p_account and branch_id = p_branch and is_active) then
    raise exception 'Không tìm thấy tài khoản tiền.' using errcode = '22P02';
  end if;
  if not exists (select 1 from money_books where branch_id = p_branch) then
    raise exception 'Chưa mở sổ. Mở sổ trước rồi lập phiếu.' using errcode = 'P0001';
  end if;
  -- Thu khác, góp vốn: tiền vào; rút vốn: tiền ra; điều chỉnh: giữ dấu người nhập
  v_amount := case p_kind when 'capital_out' then -abs(p_amount) when 'adjustment' then p_amount else abs(p_amount) end;
  insert into cash_vouchers (branch_id, kind, income_type, money_account_id, amount, reason, created_by, idempotency_key)
  values (p_branch, p_kind, case when p_kind = 'other_income' then p_income_type end, p_account, v_amount,
          btrim(p_reason), v_uid, p_key)
  returning id into v_id;
  perform app._ledger_post(p_branch, p_account, p_kind, v_amount, 'voucher', v_id, v_uid, btrim(p_reason));
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'money.voucher_created', 'cash_voucher', v_id::text,
          jsonb_build_object('kind', p_kind, 'incomeType', p_income_type, 'account', p_account, 'amount', v_amount));
  return v_id;
end $$;

-- Nhung, Linh (cashbook.manage): chuyển nội bộ, tổng hai tài khoản không đổi (test 6)
create function app.cash_transfer_create(
  p_branch uuid, p_from uuid, p_to uuid, p_amount bigint, p_note text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.manage') then
    raise exception 'Chỉ Nhung, Linh chuyển tiền nội bộ.' using errcode = '42501';
  end if;
  select id into v_id from cash_transfers where idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  if p_from = p_to then
    raise exception 'Chọn hai tài khoản khác nhau.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền chuyển phải lớn hơn 0.' using errcode = 'P0001';
  end if;
  if (select count(*) from money_accounts where id in (p_from, p_to) and branch_id = p_branch and is_active) <> 2 then
    raise exception 'Không tìm thấy tài khoản tiền.' using errcode = '22P02';
  end if;
  if not exists (select 1 from money_books where branch_id = p_branch) then
    raise exception 'Chưa mở sổ. Mở sổ trước rồi chuyển tiền.' using errcode = 'P0001';
  end if;
  insert into cash_transfers (branch_id, from_account_id, to_account_id, amount, note, created_by, idempotency_key)
  values (p_branch, p_from, p_to, p_amount, nullif(btrim(coalesce(p_note, '')), ''), v_uid, p_key)
  returning id into v_id;
  perform app._ledger_post(p_branch, p_from, 'transfer_out', -p_amount, 'transfer', v_id, v_uid, p_note, null, v_id);
  perform app._ledger_post(p_branch, p_to, 'transfer_in', p_amount, 'transfer', v_id, v_uid, p_note, null, v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------- Đối soát chuyển khoản (theo bút toán)

create table money_ledger_reconciliations (
  entry_id bigint primary key references money_ledger_entries(id),
  branch_id uuid not null references branches(id),
  reconciled_by uuid not null references users(id),
  reconciled_at timestamptz not null default now()
);
create trigger ledger_reconciliations_append_only before update or delete on money_ledger_reconciliations
  for each row execute function app.forbid_mutation();
create trigger ledger_reconciliations_no_truncate before truncate on money_ledger_reconciliations
  for each statement execute function app.forbid_mutation();

-- Bút toán của nguồn này đã khớp sao kê chưa
create function app.source_reconciled(p_source_type text, p_source_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from money_ledger_entries e join money_ledger_reconciliations r on r.entry_id = e.id
                 where e.source_type = p_source_type and e.source_id = p_source_id)
$$;

-- Nhung, Linh đánh dấu các bút toán tài khoản ngân hàng đã khớp sao kê. Không gỡ được.
create function app.reconcile_entries(p_branch uuid, p_entries bigint[]) returns int
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_n int;
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.manage') then
    raise exception 'Chỉ Nhung, Linh đối soát chuyển khoản.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_entries) x(id)
             where not exists (select 1 from money_ledger_entries e join money_accounts m on m.id = e.money_account_id
                               where e.id = x.id and e.branch_id = p_branch and m.type = 'bank')) then
    raise exception 'Chỉ đối soát được khoản của tài khoản ngân hàng.' using errcode = 'P0001';
  end if;
  insert into money_ledger_reconciliations (entry_id, branch_id, reconciled_by)
  select distinct x.id, p_branch, v_uid from unnest(p_entries) x(id)
  on conflict (entry_id) do nothing;
  get diagnostics v_n = row_count;
  -- Khoản thu đơn: giữ cột đối soát (PRD §12.1) khớp với sổ
  update payments p set reconciliation_status = 'reconciled'
  from money_ledger_entries e
  where e.id = any(p_entries) and e.source_type = 'payment' and e.entry_type = 'payment' and p.id = e.source_id
    and p.reconciliation_status <> 'reconciled';
  perform pg_notify('lindy_events', json_build_object('kind', 'money', 'branchId', p_branch)::text);
  return v_n;
end $$;

-- payments_guard: đối soát chỉ do app.reconcile_entries (chủ DB) đặt; khoản đã đối soát không huỷ được
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
      if not v_priv then
        raise exception 'Cọc được app tự trừ vào bill khi bấm Làm xong hoặc xác nhận.' using errcode = '42501';
      end if;
      perform 1 from appointment_deposits where id = new.deposit_id for update;
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
  -- UPDATE: đối soát (chỉ chủ DB, một chiều)
  if new.reconciliation_status <> old.reconciliation_status then
    if not v_priv or old.reconciliation_status <> 'unreconciled' or new.voided_at is distinct from old.voided_at then
      raise exception 'Đối soát qua màn Sổ tiền.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- UPDATE: chỉ huỷ khoản thu nhập nhầm, một lần, khi chưa đối soát
  if new.id <> old.id or new.order_id <> old.order_id or new.branch_id <> old.branch_id or new.amount <> old.amount
     or new.method <> old.method or new.money_account_id is distinct from old.money_account_id
     or new.deposit_id is distinct from old.deposit_id or new.received_at <> old.received_at
     or new.recorded_by <> old.recorded_by or new.idempotency_key <> old.idempotency_key then
    raise exception 'Khoản thu không sửa được; huỷ khoản nhập nhầm rồi ghi lại.' using errcode = '42501';
  end if;
  if old.voided_at is not null then
    raise exception 'Khoản thu này đã huỷ.' using errcode = 'P0001';
  end if;
  if old.reconciliation_status = 'reconciled' or app.source_reconciled('payment', old.id) then
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

-- Cọc chuyển khoản đã khớp sao kê thì không huỷ xác nhận được (vẫn hoàn được)
create function app.deposits_reconciled_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.status = 'confirmed' and new.status = 'voided' and app.source_reconciled('deposit', old.id) then
    raise exception 'Cọc đã đối soát với sao kê, không huỷ được. Dùng Hoàn cọc nếu cần trả lại khách.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger deposits_reconciled_guard before update on appointment_deposits
  for each row execute function app.deposits_reconciled_guard();

-- ---------------------------------------------------------------- Chốt quỹ cuối ngày (Q23, K17)

create table cash_day_closes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  business_date date not null,
  money_account_id uuid not null references money_accounts(id),
  period_start date not null,               -- ngày đầu của lần chốt này (ngày sau lần chốt trước, hoặc ngày mở sổ)
  opening bigint not null,                  -- tiền mặt đầu kỳ (lý thuyết)
  cash_in bigint not null,
  cash_out bigint not null,
  expected bigint not null,                 -- tiền mặt lý thuyết cuối ngày
  counted bigint not null check (counted >= 0),
  difference bigint not null,
  reason text check (char_length(reason) <= 500),
  warnings jsonb not null default '{}'::jsonb,
  closed_by uuid not null references users(id),
  closed_at timestamptz not null default now(),
  needs_owner_review boolean not null default false,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  unique (branch_id, business_date),
  check (difference = counted - expected),
  check (expected = opening + cash_in - cash_out),
  check (difference = 0 or char_length(btrim(coalesce(reason, ''))) > 0)
);

-- Bản chốt không sửa, không xoá (test 14); chỉ Linh đánh dấu đã xem lệch quỹ
create function app.day_closes_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Bản chốt quỹ không xoá được.' using errcode = '42501';
  end if;
  if row(new.id, new.branch_id, new.business_date, new.money_account_id, new.period_start, new.opening, new.cash_in,
         new.cash_out, new.expected, new.counted, new.difference, new.reason, new.warnings, new.closed_by,
         new.closed_at, new.needs_owner_review)
     is distinct from
     row(old.id, old.branch_id, old.business_date, old.money_account_id, old.period_start, old.opening, old.cash_in,
         old.cash_out, old.expected, old.counted, old.difference, old.reason, old.warnings, old.closed_by,
         old.closed_at, old.needs_owner_review)
     or old.reviewed_by is not null or not old.needs_owner_review then
    raise exception 'Bản chốt quỹ không sửa được.' using errcode = '42501';
  end if;
  if not (current_user <> 'app_user' or app.has_perm(old.branch_id, 'review_queue.read')) then
    raise exception 'Chỉ chủ quán đánh dấu đã xem lại.' using errcode = '42501';
  end if;
  new.reviewed_by := coalesce(app.uid(), new.reviewed_by);
  new.reviewed_at := now();
  return new;
end $$;

create trigger day_closes_guard before update or delete on cash_day_closes
  for each row execute function app.day_closes_guard();
create trigger day_closes_no_truncate before truncate on cash_day_closes
  for each statement execute function app.forbid_mutation();

-- Ngày của bút toán ghi lúc này: hôm nay, hoặc sau ngày đã chốt quỹ gần nhất [P54]
create or replace function app.ledger_business_date(p_branch uuid) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
  select greatest((now() at time zone app.branch_tz(p_branch))::date,
                  coalesce((select max(business_date) + 1 from cash_day_closes where branch_id = p_branch),
                           '-infinity'::date))
$$;

-- Tài khoản tiền mặt của quỹ (Q23: một quỹ tiền mặt)
create function app.cash_account_of(p_branch uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, public as $$
  select id from money_accounts where branch_id = p_branch and type = 'cash' and is_active order by code limit 1
$$;

-- Số liệu chốt quỹ của ngày p_date (để xem trước và để chốt): kỳ từ ngày sau lần chốt trước đến hết p_date.
create function app.day_close_figures(p_branch uuid, p_date date)
returns table (account_id uuid, period_start date, opening bigint, cash_in bigint, cash_out bigint, expected bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  with b as (
    select mb.opening_date,
           coalesce((select max(business_date) + 1 from cash_day_closes where branch_id = p_branch), mb.opening_date)
             as start_date,
           app.cash_account_of(p_branch) as acc
    from money_books mb
    where mb.branch_id = p_branch and app.has_perm(p_branch, 'money_accounts.read_balance')   -- thợ gọi thẳng: 0 dòng
  )
  select b.acc, b.start_date,
         coalesce(sum(e.amount) filter (where e.business_date < b.start_date), 0)::bigint,
         coalesce(sum(e.amount) filter (where e.business_date >= b.start_date and e.amount > 0), 0)::bigint,
         coalesce(sum(-e.amount) filter (where e.business_date >= b.start_date and e.amount < 0), 0)::bigint,
         coalesce(sum(e.amount), 0)::bigint
  from b left join money_ledger_entries e
    on e.money_account_id = b.acc and e.business_date >= b.opening_date and e.business_date <= p_date
  group by b.acc, b.start_date
$$;

-- Việc còn treo khi chốt (PRD §7.4, §13D). Tip chưa trả thêm ở 3B-2.
create function app.day_close_warnings(p_branch uuid, p_date date) returns jsonb
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
    'unreconciled', (select count(*) from money_ledger_entries e join money_accounts m on m.id = e.money_account_id
                     where e.branch_id = p_branch and m.type = 'bank' and e.business_date <= p_date
                       and e.entry_type <> 'opening'
                       and not exists (select 1 from money_ledger_reconciliations r where r.entry_id = e.id)))
  end
$$;

-- Nhung chốt; ngày Nhung nghỉ Linh chốt (cashbook.manage). Hôm nay chốt được từ giờ đóng cửa; hôm trước chốt bù được.
create function app.close_day(p_branch uuid, p_date date, p_counted bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_tz text := app.branch_tz(p_branch);
  v_now timestamp := now() at time zone app.branch_tz(p_branch);
  v_close time;
  v_book money_books;
  f record;
  v_last date;
  v_id uuid := gen_random_uuid();
  v_diff bigint;
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.manage') then
    raise exception 'Chỉ Nhung, Linh chốt quỹ.' using errcode = '42501';
  end if;
  perform 1 from branches where id = p_branch for update;   -- chốt và ghi sổ song song phải chờ nhau
  select * into v_book from money_books where branch_id = p_branch;
  if v_book.branch_id is null then
    raise exception 'Chưa mở sổ. Linh mở sổ ở Thêm → Sổ tiền.' using errcode = 'P0001';
  end if;
  select max(business_date) into v_last from cash_day_closes where branch_id = p_branch;
  if v_last is not null and p_date <= v_last then
    raise exception 'Ngày % đã chốt quỹ.', to_char(p_date, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if p_date < v_book.opening_date then
    raise exception 'Ngày chốt trước ngày mở sổ.' using errcode = 'P0001';
  end if;
  if p_date > v_now::date then
    raise exception 'Chưa đến ngày này.' using errcode = 'P0001';
  end if;
  select close_time into v_close from branch_booking_settings where branch_id = p_branch;
  if p_date = v_now::date and v_now::time < coalesce(v_close, '21:00') then
    raise exception 'Chốt quỹ từ % (giờ đóng cửa).', to_char(coalesce(v_close, '21:00'), 'HH24:MI') using errcode = 'P0001';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Nhập số tiền mặt đếm được.' using errcode = 'P0001';
  end if;

  select * into f from app.day_close_figures(p_branch, p_date);
  if f.account_id is null then
    raise exception 'Chưa có tài khoản tiền mặt.' using errcode = 'P0001';
  end if;
  v_diff := p_counted - f.expected;
  if v_diff <> 0 and char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Số đếm lệch số lý thuyết. Ghi lý do chênh lệch.' using errcode = 'P0001';
  end if;
  -- K17: ghi bút toán chênh lệch đúng ngày chốt để số dư tiền mặt bằng tiền thật trong két
  if v_diff <> 0 then
    perform app._ledger_post(p_branch, f.account_id, 'cash_count_diff', v_diff, 'day_close', v_id, v_uid,
                             btrim(p_reason), null, null, p_date);
  end if;
  insert into cash_day_closes (id, branch_id, business_date, money_account_id, period_start, opening, cash_in, cash_out,
                               expected, counted, difference, reason, warnings, closed_by, needs_owner_review)
  values (v_id, p_branch, p_date, f.account_id, f.period_start, f.opening, f.cash_in, f.cash_out, f.expected,
          p_counted, v_diff, nullif(btrim(coalesce(p_reason, '')), ''), app.day_close_warnings(p_branch, p_date), v_uid,
          v_diff <> 0 and not app.has_perm(p_branch, 'review_queue.read'));
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'money.day_closed', 'cash_day_close', v_id::text,
          jsonb_build_object('date', p_date, 'expected', f.expected, 'counted', p_counted, 'difference', v_diff));
  perform pg_notify('lindy_events', json_build_object('kind', 'money', 'branchId', p_branch)::text);
  return v_id;
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table expense_requests enable row level security;
alter table cash_vouchers enable row level security;
alter table cash_transfers enable row level security;
alter table money_ledger_reconciliations enable row level security;
alter table cash_day_closes enable row level security;

-- Đề nghị chi: Nhung, Linh thấy mọi phiếu; người khác thấy phiếu của mình
create function app.expense_reader(p_branch uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select app.has_perm(p_branch, 'expense.approve_within_limit') or app.has_perm(p_branch, 'expense.approve_above_limit')
         or app.has_perm(p_branch, 'cashbook.manage') or app.has_perm(p_branch, 'review_queue.read')
$$;

grant select, insert, update on expense_requests to app_user;
create policy expenses_read on expense_requests for select to app_user
  using (app.has_branch(branch_id) and (app.expense_reader(branch_id) or requested_by = app.uid()));
create policy expenses_insert on expense_requests for insert to app_user
  with check (app.has_perm(branch_id, 'expense.request') and requested_by = app.uid());
create policy expenses_update on expense_requests for update to app_user
  using (app.has_branch(branch_id) and (app.expense_reader(branch_id) or requested_by = app.uid()))
  with check (app.has_branch(branch_id));

grant select on cash_vouchers, cash_transfers, money_ledger_reconciliations, cash_day_closes to app_user;
create policy vouchers_read on cash_vouchers for select to app_user
  using (app.has_perm(branch_id, 'money_accounts.read_balance'));
create policy transfers_read on cash_transfers for select to app_user
  using (app.has_perm(branch_id, 'money_accounts.read_balance'));
create policy reconciliations_read on money_ledger_reconciliations for select to app_user
  using (app.has_perm(branch_id, 'money_accounts.read_balance'));
create policy day_closes_read on cash_day_closes for select to app_user
  using (app.has_perm(branch_id, 'money_accounts.read_balance'));
grant update (reviewed_by, reviewed_at) on cash_day_closes to app_user;
create policy day_closes_review on cash_day_closes for update to app_user
  using (app.has_perm(branch_id, 'review_queue.read')) with check (app.has_perm(branch_id, 'review_queue.read'));

grant execute on function app.expense_level(text, bigint) to app_user;
grant execute on function app.expense_can_approve(uuid, text) to app_user;
grant execute on function app.expense_reader(uuid) to app_user;
grant execute on function app.source_reconciled(text, uuid) to app_user;
grant execute on function app.cash_voucher_create(uuid, text, text, uuid, bigint, text, uuid) to app_user;
grant execute on function app.cash_transfer_create(uuid, uuid, uuid, bigint, text, uuid) to app_user;
grant execute on function app.reconcile_entries(uuid, bigint[]) to app_user;
grant execute on function app.close_day(uuid, date, bigint, text) to app_user;
grant execute on function app.day_close_figures(uuid, date) to app_user;
grant execute on function app.day_close_warnings(uuid, date) to app_user;
