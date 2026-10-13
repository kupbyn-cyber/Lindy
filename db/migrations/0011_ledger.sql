-- 0011 — Sổ tiền: bút toán, mở sổ, số dư (PRD §7.1–7.2, invariant 5, 9; kế hoạch Đợt 3 mục 7.1, bước 3.2–3.3).
-- - Số dư = Σ bút toán của tài khoản từ ngày mở sổ (bút toán mở sổ nằm đúng ngày mở sổ). Không có cột số dư để sửa.
-- - Bút toán chỉ thêm. Chỉ hàm app._ledger_post (gọi từ trigger, hàm SECURITY DEFINER) ghi được; app_user chỉ đọc.
-- - Mỗi nguồn (khoản thu, cọc, phiếu…) ghi mỗi loại bút toán một lần: unique (source_type, source_id, entry_type) [P46].
-- - Sai sót sửa bằng bút toán đảo trỏ về bút toán gốc, không sửa số [P47].
-- Tiền là số nguyên VND.

create table money_books (
  branch_id uuid primary key references branches(id),
  opening_date date not null check (extract(day from opening_date) = 1),   -- Q24: ngày 1 của tháng
  opened_by uuid not null references users(id),
  opened_at timestamptz not null default now()
);

create table money_ledger_entries (
  id bigint generated always as identity primary key,
  branch_id uuid not null references branches(id),
  money_account_id uuid not null references money_accounts(id),
  entry_type text not null constraint money_ledger_entry_type_check check (entry_type in (
    'opening',                                   -- số dư mở sổ
    'payment', 'payment_void',                   -- thu từ đơn; huỷ khoản thu nhập nhầm
    'deposit_in', 'deposit_in_void', 'deposit_refund',   -- cọc đã xác nhận; huỷ xác nhận; hoàn cọc
    'tip_in', 'tip_in_void', 'tip_payout',       -- tip giữ hộ; trả tip cho thợ
    'expense',                                   -- phiếu chi đã chi
    'other_income', 'capital_in', 'capital_out', -- thu khác, góp vốn, rút vốn
    'transfer_out', 'transfer_in',               -- chuyển nội bộ (cặp −X/+X)
    'refund',                                    -- hoàn tiền đơn
    'cash_count_diff',                           -- chênh lệch kiểm quỹ khi chốt (K17)
    'adjustment')),                              -- bút toán điều chỉnh của Linh
  amount bigint not null check (amount <> 0 and abs(amount) <= 10000000000),
  business_date date not null,                   -- ngày theo giờ của cơ sở; ngày đã chốt quỹ thì sang ngày kế (Đợt 3B)
  occurred_at timestamptz not null default now(),
  source_type text not null check (source_type in (
    'book', 'payment', 'deposit', 'expense', 'voucher', 'transfer', 'tip', 'tip_payout', 'refund', 'day_close')),
  source_id uuid not null,
  reverses_entry_id bigint references money_ledger_entries(id),
  transfer_group uuid,
  note text check (char_length(note) <= 500),
  created_by uuid references users(id),
  unique (source_type, source_id, entry_type)
);
create index money_ledger_account_idx on money_ledger_entries(money_account_id, business_date);
create index money_ledger_branch_date_idx on money_ledger_entries(branch_id, business_date, id);

-- ---------------------------------------------------------------- Ghi bù khoản thu đã có (Đợt 2)
-- Chạy trước khi tạo trigger. Bút toán trước ngày mở sổ vẫn lưu nhưng không tính vào số dư.

insert into money_ledger_entries (branch_id, money_account_id, entry_type, amount, business_date, occurred_at,
                                  source_type, source_id, created_by)
select p.branch_id, p.money_account_id, 'payment', p.amount,
       (p.received_at at time zone b.timezone)::date, p.received_at, 'payment', p.id, p.recorded_by
from payments p join branches b on b.id = p.branch_id
order by p.received_at, p.id;

insert into money_ledger_entries (branch_id, money_account_id, entry_type, amount, business_date, occurred_at,
                                  source_type, source_id, reverses_entry_id, note, created_by)
select p.branch_id, p.money_account_id, 'payment_void', -p.amount,
       (p.voided_at at time zone b.timezone)::date, p.voided_at, 'payment', p.id, e.id, p.void_reason, p.voided_by
from payments p
join branches b on b.id = p.branch_id
join money_ledger_entries e on e.source_type = 'payment' and e.source_id = p.id and e.entry_type = 'payment'
where p.voided_at is not null
order by p.voided_at, p.id;

-- ---------------------------------------------------------------- Bảng chỉ thêm

create trigger money_ledger_append_only before update or delete on money_ledger_entries
  for each row execute function app.forbid_mutation();
create trigger money_ledger_no_truncate before truncate on money_ledger_entries
  for each statement execute function app.forbid_mutation();
create trigger money_books_append_only before update or delete on money_books
  for each row execute function app.forbid_mutation();
create trigger money_books_no_truncate before truncate on money_books
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------- Ghi bút toán

-- Ngày của bút toán ghi lúc này. Đợt 3B (chốt quỹ) thay hàm này: ngày đã chốt thì sang ngày kế [P54].
create function app.ledger_business_date(p_branch uuid) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
  select (now() at time zone app.branch_tz(p_branch))::date
$$;

-- Cửa duy nhất ghi sổ. Không cấp cho ai; chỉ trigger và hàm SECURITY DEFINER gọi.
-- Gọi lại với cùng nguồn và loại → trả bút toán đã có, không ghi đôi [P46].
create function app._ledger_post(
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

-- Bút toán gốc của một nguồn (để bút toán đảo trỏ về)
create function app._ledger_entry_of(p_source_type text, p_source_id uuid, p_type text) returns bigint
language sql stable security definer set search_path = pg_catalog, public as $$
  select id from money_ledger_entries where source_type = p_source_type and source_id = p_source_id and entry_type = p_type
$$;

-- Khoản thu tiền mặt / chuyển khoản → tiền vào tài khoản; huỷ khoản thu → bút toán đảo (test 2).
-- Khoản thu loại "cọc" (Đợt 3, 0012) không có bút toán: tiền đã vào sổ lúc xác nhận cọc.
create function app.payments_ledger() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.method not in ('cash', 'transfer') then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform app._ledger_post(new.branch_id, new.money_account_id, 'payment', new.amount, 'payment', new.id,
                             new.recorded_by);
  elsif old.voided_at is null and new.voided_at is not null then
    perform app._ledger_post(new.branch_id, new.money_account_id, 'payment_void', -new.amount, 'payment', new.id,
                             new.voided_by, new.void_reason, app._ledger_entry_of('payment', new.id, 'payment'));
  end if;
  return null;
end $$;

create trigger payments_ledger after insert or update of voided_at on payments
  for each row execute function app.payments_ledger();

-- Báo các máy đang mở màn tiền tải lại (gói tin chỉ có loại và cơ sở; hub chỉ gửi cho người xem được số dư).
create function app.ledger_notify() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform pg_notify('lindy_events', json_build_object('kind', 'money', 'branchId', new.branch_id)::text);
  return null;
end $$;

create trigger money_ledger_notify after insert on money_ledger_entries
  for each row execute function app.ledger_notify();

-- ---------------------------------------------------------------- Mở sổ (Linh, một lần)

-- Số dư mở sổ cho đủ các tài khoản đang dùng của cơ sở. Nhập sai thì ghi bút toán điều chỉnh có lý do (Đợt 3B).
create function app.open_book(p_branch uuid, p_opening_date date, p_accounts uuid[], p_amounts bigint[])
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_today date;
  v_n int := coalesce(array_length(p_accounts, 1), 0);
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.owner') then
    raise exception 'Chỉ chủ quán mở sổ được.' using errcode = '42501';
  end if;
  v_today := (now() at time zone app.branch_tz(p_branch))::date;
  if p_opening_date is null or extract(day from p_opening_date) <> 1 then
    raise exception 'Ngày mở sổ phải là ngày 1 của một tháng.' using errcode = 'P0001';
  end if;
  if p_opening_date > v_today then
    raise exception 'Chưa đến ngày mở sổ. Mở sổ vào hoặc sau ngày %.', to_char(p_opening_date, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  perform 1 from branches where id = p_branch for update;   -- hai lần mở sổ song song phải chờ nhau
  if exists (select 1 from money_books where branch_id = p_branch) then
    raise exception 'Cơ sở đã mở sổ. Nhập sai thì ghi bút toán điều chỉnh.' using errcode = 'P0001';
  end if;
  if v_n = 0 or v_n <> coalesce(array_length(p_amounts, 1), 0)
     or (select count(distinct a) from unnest(p_accounts) a) <> v_n
     or exists (select 1 from unnest(p_accounts) a(id)
                where not exists (select 1 from money_accounts m where m.id = a.id and m.branch_id = p_branch and m.is_active))
     or exists (select 1 from money_accounts m where m.branch_id = p_branch and m.is_active and m.id <> all(p_accounts)) then
    raise exception 'Cần nhập số dư mở sổ cho đủ các tài khoản của cơ sở.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_amounts) a where a is null or a < 0 or a > 10000000000) then
    raise exception 'Số dư mở sổ không hợp lệ.' using errcode = 'P0001';
  end if;

  insert into money_books (branch_id, opening_date, opened_by) values (p_branch, p_opening_date, v_uid);
  for i in 1..v_n loop
    if p_amounts[i] <> 0 then
      perform app._ledger_post(p_branch, p_accounts[i], 'opening', p_amounts[i], 'book', p_accounts[i], v_uid,
                               'Số dư mở sổ', null, null, p_opening_date);
    end if;
  end loop;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'money.book_opened', 'branch', p_branch::text,
          jsonb_build_object('openingDate', p_opening_date,
                             'amounts', (select jsonb_object_agg(a.id, a.amount)
                                         from unnest(p_accounts, p_amounts) a(id, amount))));
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS

-- Xem số dư, bút toán: Linh, Nhung (money_accounts.read_balance, Q17). Tài khoản tắt manager_can_view_balance
-- chỉ chủ (cashbook.owner) xem.
create function app.can_view_account(p_account uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from money_accounts m
    where m.id = p_account and app.has_perm(m.branch_id, 'money_accounts.read_balance')
      and (m.manager_can_view_balance or app.has_perm(m.branch_id, 'cashbook.owner')))
$$;

alter table money_books enable row level security;
alter table money_ledger_entries enable row level security;

grant select on money_books to app_user;
create policy money_books_read on money_books for select to app_user
  using (app.has_perm(branch_id, 'money_accounts.read_balance'));

grant select on money_ledger_entries to app_user;
create policy money_ledger_read on money_ledger_entries for select to app_user
  using (app.can_view_account(money_account_id));

grant execute on function app.open_book(uuid, date, uuid[], bigint[]) to app_user;
grant execute on function app.can_view_account(uuid) to app_user;
