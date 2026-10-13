-- 0009 — Đơn hàng (PRD §6, §12; kế hoạch Đợt 2 mục 7.3; K09–K12).
-- - Nội dung đơn (dòng, khoản giảm, chia thợ) lưu theo phiên bản `rev`: mỗi lần Lưu ghi bộ dòng mới, bộ cũ giữ lại
--   làm lịch sử. Bảng con chỉ thêm, không sửa, không xoá; app_user không có DELETE ở bảng nào.
-- - Trigger orders_guard kiểm quyền theo cột và chuyển trạng thái, cùng luật với src/server/orders/policy.ts.
-- - Constraint trigger kiểm bất biến khi commit (invariant 1, 2, 11, 12, 13, 20) [P26, P29, P30].
-- Tiền là số nguyên VND.

-- ---------------------------------------------------------------- Tài khoản tiền (Đợt 3 thêm sổ quỹ, số dư)

create table money_accounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  code text not null check (code ~ '^[a-z0-9_]{2,20}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  type text not null check (type in ('cash', 'bank')),
  manager_can_view_balance boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, code)
);

-- ---------------------------------------------------------------- Đơn

create table order_counters (
  branch_id uuid primary key references branches(id),
  last_no int not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  code int not null default 0 check (code > 0),        -- orders_assign_code cấp
  customer_id uuid references customers(id),           -- null = khách lẻ
  appointment_id uuid references appointments(id),
  service_date date not null,                           -- doanh thu ghi theo ngày làm dịch vụ (Q02)
  status text not null default 'in_progress'
    check (status in ('in_progress', 'awaiting_confirmation', 'confirmed', 'cancelled')),   -- K11
  gross_amount bigint not null default 0 check (gross_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  net_amount bigint not null default 0 check (net_amount >= 0),
  has_hardening boolean not null default false,
  required_level text not null default 'none' check (required_level in ('none', 'staff', 'manager', 'owner')),
  content_rev int not null default 1,
  content_tx bigint,                                    -- giao dịch đang ghi bộ dòng của content_rev
  pricing_hash text not null default '',                -- băm phần ảnh hưởng giảm giá (dòng, giá, khoản giảm)
  discount_approved_by uuid references users(id),
  discount_approved_at timestamptz,
  discount_approved_level text check (discount_approved_level in ('manager', 'owner')),
  discount_approval_hash text,
  done_by uuid references users(id),
  done_at timestamptz,
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  needs_owner_review boolean not null default false,    -- Q04
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  warranty_until date,
  adjusted_by uuid references users(id),               -- sửa đơn đã xác nhận (D04, bước 2.19)
  adjusted_at timestamptz,
  adjust_reason text check (char_length(adjust_reason) <= 500),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  create_request_id uuid not null,
  create_request_hash text not null check (char_length(create_request_hash) = 64),
  check (net_amount = gross_amount - discount_amount),
  check (status <> 'cancelled' or char_length(btrim(coalesce(cancel_reason, ''))) > 0),
  unique (branch_id, code),
  unique (created_by, create_request_id)
);
create index orders_date_idx on orders(branch_id, service_date);
create index orders_open_idx on orders(branch_id, status) where status in ('in_progress', 'awaiting_confirmation');
create index orders_customer_idx on orders(customer_id) where customer_id is not null;
create index orders_appointment_idx on orders(appointment_id) where appointment_id is not null;
create index orders_review_idx on orders(branch_id) where needs_owner_review and reviewed_at is null;

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  rev int not null,
  position int not null check (position between 0 and 29),
  line_type text not null check (line_type in ('service', 'combo', 'surcharge', 'custom')),
  service_id uuid references services(id),
  combo_id uuid references combos(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  unit text not null check (unit in ('lần', 'ngón', 'hình', 'cái')),
  price_mode text not null check (price_mode in ('list', 'custom', 'fixed')),
  list_min bigint not null check (list_min >= 0),
  list_max bigint not null check (list_max >= list_min),
  unit_price bigint not null check (unit_price between 1 and 10000000),
  quantity int not null check (quantity between 1 and 20),
  gross_amount bigint not null check (gross_amount between 1 and 10000000),
  below_amount bigint not null default 0 check (below_amount >= 0),
  below_reason text check (char_length(below_reason) <= 200),
  line_discount_amount bigint not null check (line_discount_amount >= 0),
  order_discount_amount bigint not null check (order_discount_amount >= 0),
  discount_amount bigint not null,
  net_amount bigint not null check (net_amount >= 0),
  shop_borne_amount bigint not null default 0 check (shop_borne_amount >= 0),
  out_of_range boolean not null default false,
  has_hardening boolean not null default false,
  unallocated_reason text check (char_length(unallocated_reason) <= 200),
  check (discount_amount = line_discount_amount + order_discount_amount),
  check (net_amount = gross_amount - discount_amount),
  check ((line_type = 'service') = (service_id is not null)),
  check ((line_type = 'combo') = (combo_id is not null)),
  check (below_amount <= line_discount_amount),
  check (below_amount = 0 or char_length(btrim(coalesce(below_reason, ''))) > 0),   -- K12: cần lý do
  check (shop_borne_amount <= discount_amount),
  unique (order_id, rev, position)
);

-- Phiếu xử lý dịch vụ (PRD §6.7, §10, §13F; bước 2.18): gắn đơn gốc, tự tính còn/hết bảo hành.
-- Lỗi kỹ thuật trong hạn → sửa miễn phí (không sinh doanh thu); khách đổi ý hoặc hết hạn → tính phí (đơn mới);
-- lỗi kỹ thuật mà khách không đồng ý sửa → ưu đãi 10–20% bill sau, quán chịu, dùng một lần.
create table order_service_tickets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  order_id uuid not null references orders(id),
  customer_id uuid references customers(id),
  issue text not null check (char_length(btrim(issue)) between 1 and 500),
  cause text not null check (cause in ('technical', 'customer_change')),
  within_warranty boolean not null default false,
  outcome text not null check (outcome in ('free_fix', 'charged', 'compensation')),
  repaired_by uuid references users(id),
  compensation_percent int check (compensation_percent between 10 and 20),
  note text check (char_length(note) <= 500),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references users(id),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  needs_owner_review boolean not null default false,   -- K15: phiếu ưu đãi do người không phải chủ lập
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  check ((outcome = 'compensation') = (compensation_percent is not null)),
  check (outcome <> 'free_fix' or (cause = 'technical' and within_warranty)),
  check (outcome <> 'compensation' or (cause = 'technical' and customer_id is not null)),
  check (voided_at is null or char_length(btrim(coalesce(void_reason, ''))) > 0)
);
create index service_tickets_order_idx on order_service_tickets(order_id);
create index service_tickets_customer_idx on order_service_tickets(customer_id) where outcome = 'compensation';
create index service_tickets_review_idx on order_service_tickets(branch_id)
  where needs_owner_review and reviewed_at is null and voided_at is null;

create table order_discounts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  rev int not null,
  position int not null check (position between 0 and 49),
  scope_position int check (scope_position between 0 and 29),   -- null = cả bill
  kind text not null
    check (kind in ('preset_5', 'preset_10', 'birthday', 'manual', 'below_list', 'complaint_compensation')),
  percent int check (percent between 1 and 100),
  amount bigint not null check (amount >= 0),
  shop_borne boolean not null default false,
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  applied_by uuid not null references users(id),
  ticket_id uuid references order_service_tickets(id),           -- ưu đãi bù khiếu nại dùng phiếu nào
  check (shop_borne = (kind = 'complaint_compensation')),
  check ((kind = 'complaint_compensation') = (ticket_id is not null)),
  check (kind <> 'complaint_compensation' or scope_position is null),
  check (kind <> 'below_list' or scope_position is not null),
  unique (order_id, rev, position)
);

create table order_staff_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  rev int not null,
  item_position int not null,
  staff_user_id uuid not null references users(id),
  allocated_net_amount bigint not null check (allocated_net_amount >= 0),
  commission_base_amount bigint not null,
  check (commission_base_amount >= allocated_net_amount),
  unique (order_id, rev, item_position, staff_user_id)
);
create index order_alloc_staff_idx on order_staff_allocations(staff_user_id, order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  branch_id uuid not null references branches(id),
  amount bigint not null check (amount > 0 and amount <= 100000000),
  method text not null check (method in ('cash', 'transfer')),
  money_account_id uuid not null references money_accounts(id),
  received_at timestamptz not null default now(),
  recorded_by uuid not null references users(id),
  idempotency_key uuid not null unique,
  reconciliation_status text not null default 'unreconciled' check (reconciliation_status in ('unreconciled', 'reconciled')),
  voided_by uuid references users(id),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  check (voided_at is null or char_length(btrim(coalesce(void_reason, ''))) > 0)
);
create index payments_order_idx on payments(order_id);
create index payments_branch_date_idx on payments(branch_id, received_at);

create table order_audit_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id),
  branch_id uuid not null references branches(id),
  actor_user_id uuid references users(id),
  action text not null check (char_length(action) <= 50),
  rev int,
  before_json jsonb,
  after_json jsonb,
  reason text check (char_length(reason) <= 500),
  occurred_at timestamptz not null default now()
);
create index order_audit_order_idx on order_audit_events(order_id, id);

-- Bảng chỉ thêm
create trigger order_items_append_only before update or delete on order_items
  for each row execute function app.forbid_mutation();
create trigger order_discounts_append_only before update or delete on order_discounts
  for each row execute function app.forbid_mutation();
create trigger order_alloc_append_only before update or delete on order_staff_allocations
  for each row execute function app.forbid_mutation();
create trigger order_audit_append_only before update or delete on order_audit_events
  for each row execute function app.forbid_mutation();
create trigger payments_no_delete before delete on payments
  for each row execute function app.forbid_mutation();
create trigger order_items_no_truncate before truncate on order_items
  for each statement execute function app.forbid_mutation();
create trigger order_discounts_no_truncate before truncate on order_discounts
  for each statement execute function app.forbid_mutation();
create trigger order_alloc_no_truncate before truncate on order_staff_allocations
  for each statement execute function app.forbid_mutation();
create trigger order_audit_no_truncate before truncate on order_audit_events
  for each statement execute function app.forbid_mutation();
create trigger payments_no_truncate before truncate on payments
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------- Hàm phụ

create function app.level_rank(p text) returns int
language sql immutable as $$
  select case p when 'owner' then 3 when 'manager' then 2 when 'staff' then 1 else 0 end
$$;
grant execute on function app.level_rank(text) to app_user, app_worker;

-- Mức người đang thao tác tự duyệt được ở cơ sở (C15)
create function app.discount_level(p_branch uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select case
    when app.has_perm(p_branch, 'discount.approve_any') then 'owner'
    when app.has_perm(p_branch, 'discount.approve_up_to_20pct') then 'manager'
    when app.has_perm(p_branch, 'discount.apply_up_to_10pct') then 'staff'
    else 'none' end
$$;

-- Người đang thao tác có phần trong bộ dòng hiện tại của đơn (K09)
create function app.order_has_staff(p_order uuid, p_rev int) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from order_staff_allocations
    where order_id = p_order and rev = p_rev and staff_user_id = app.uid())
$$;

-- K09: Linh, Nhung (order.read_all) thấy mọi đơn; thợ thấy đơn mình tạo và đơn có phần mình làm.
create function app.order_visible(p_order uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from orders o
    where o.id = p_order and app.has_branch(o.branch_id)
      and (app.has_perm(o.branch_id, 'order.read_all') or o.created_by = app.uid()
           or app.order_has_staff(o.id, o.content_rev)))
$$;

-- Bảng con chỉ thêm được trong đúng giao dịch vừa tăng content_rev của đơn (bởi người được phép, đã qua orders_guard).
create function app.order_rev_open(p_order uuid, p_rev int) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from orders
    where id = p_order and content_rev = p_rev and content_tx = txid_current() and updated_by = app.uid())
$$;

-- Thợ trong cơ sở để chia tiền (người có quyền tạo đơn, tài khoản còn hoạt động). user_branch_roles chỉ cho
-- người dùng thấy dòng của mình nên cần hàm này.
create function app.branch_staff(p_branch uuid) returns table (id uuid, display_name text)
language sql stable security definer set search_path = pg_catalog, public as $$
  select u.id, u.display_name from users u
  where u.is_active and app.has_branch(p_branch)
    and exists (select 1 from user_branch_roles ubr join role_permissions rp on rp.role_id = ubr.role_id
                where ubr.user_id = u.id and ubr.branch_id = p_branch and ubr.revoked_at is null
                  and rp.permission_code = 'order.create_draft')
  order by u.display_name
$$;
grant execute on function app.branch_staff(uuid) to app_user;

-- Mã đơn tăng dần theo cơ sở, không nhảy số khi rollback (khoá dòng bộ đếm). Trigger riêng chạy quyền chủ DB,
-- chạy trước orders_guard (tên xếp trước); luôn ghi đè mã máy gửi lên.
create function app.orders_assign_code() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into order_counters (branch_id, last_no) values (new.branch_id, 1)
  on conflict (branch_id) do update set last_no = order_counters.last_no + 1
  returning last_no into new.code;
  return new;
end $$;

-- Mức duyệt cần cho bộ dòng `p_rev` (C15, K12). Tính lại độc lập với mã TypeScript để kiểm khi commit.
create function app.order_required_level(p_order uuid, p_rev int) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  with items as (
    select position, gross_amount, below_amount from order_items where order_id = p_order and rev = p_rev
  ), bill as (
    select coalesce(sum(gross_amount), 0)::numeric as g from items
  ), disc as (
    select scope_position, percent, amount from order_discounts
    where order_id = p_order and rev = p_rev and kind <> 'below_list'
  ), per_item as (
    select i.below_amount,
      coalesce((select sum(coalesce(d.percent::numeric, d.amount * 100.0 / i.gross_amount))
                from disc d where d.scope_position = i.position), 0)
      + coalesce((select sum(coalesce(d.percent::numeric, case when b.g > 0 then d.amount * 100.0 / b.g else 0 end))
                  from disc d cross join bill b where d.scope_position is null), 0) as pct
    from items i
  )
  select case coalesce(max(
           case when pct > 20.000000001 then 3
                when pct > 10.000000001 or below_amount > 0 then 2
                when pct > 0.000000001 then 1 else 0 end), 0)
         when 3 then 'owner' when 2 then 'manager' when 1 then 'staff' else 'none' end
  from per_item
$$;
grant execute on function app.order_required_level(uuid, int) to app_user;

-- ---------------------------------------------------------------- orders_guard: quyền theo cột và chuyển trạng thái

create function app.orders_guard() returns trigger
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
          -- D04: kỳ còn mở thì sửa được (Đợt 2 chưa có kỳ lương). Nhung, Linh; lý do bắt buộc; lưu trước/sau.
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
    end if;

    if new.status <> old.status then
      if old.status in ('confirmed', 'cancelled') then
        raise exception 'Đơn đã xác nhận hoặc đã huỷ, không đổi trạng thái được.' using errcode = 'P0001';
      end if;
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

create trigger orders_assign_code before insert on orders
  for each row execute function app.orders_assign_code();
create trigger orders_guard before insert or update on orders
  for each row execute function app.orders_guard();

-- Hàm do orders_guard (invoker) và policy gọi dưới quyền app_user
grant execute on function app.discount_level(uuid) to app_user;
grant execute on function app.order_has_staff(uuid, int) to app_user;
grant execute on function app.order_visible(uuid) to app_user;
grant execute on function app.order_rev_open(uuid, int) to app_user;

-- ---------------------------------------------------------------- Kiểm bất biến khi commit

create function app._order_check(p_order uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  o orders;
  v_n int;
  v_gross bigint;
  v_disc bigint;
  v_net bigint;
  v_hard boolean;
  v_paid bigint;
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

  -- Khoản giảm khớp với số giảm từng dòng
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

  -- Chia thợ: đủ tiền thuần của dòng; cơ sở hoa hồng = phần chia + phần giảm quán chịu (invariant 1, 12)
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

  -- Thu tiền không vượt số phải thu (invariant 2) [P30]
  select coalesce(sum(amount), 0) into v_paid from payments where order_id = o.id and voided_at is null;
  if v_paid > o.net_amount then
    raise exception 'Số đã thu lớn hơn số phải thu.' using errcode = 'P0001';
  end if;
  if v_paid > 0 and o.status not in ('awaiting_confirmation', 'confirmed') then
    raise exception 'Chỉ ghi tiền thu cho đơn đã bấm Làm xong.' using errcode = 'P0001';
  end if;

  -- Mức duyệt giảm giá (invariant 13, K12)
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
    -- P31: người sửa đơn đã xác nhận có phần trong đơn (và không phải chủ) → đơn phải nằm trong Cần xem lại
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

  -- Ưu đãi bù khiếu nại: đúng phiếu của khách, đúng %, phiếu chưa huỷ, chỉ một đơn (chưa huỷ) dùng
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

create function app.orders_check() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._order_check(new.order_id);
  return null;
end $$;

create function app.orders_check_self() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app._order_check(new.id);
  return null;
end $$;

create constraint trigger orders_invariants after insert or update on orders
  deferrable initially deferred for each row execute function app.orders_check_self();
create constraint trigger payments_invariants after insert or update on payments
  deferrable initially deferred for each row execute function app.orders_check();

-- ---------------------------------------------------------------- Thu tiền: chỉ thêm và huỷ khoản nhập nhầm

create function app.payments_guard() returns trigger
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
    if not exists (select 1 from money_accounts m where m.id = new.money_account_id and m.branch_id = new.branch_id
                   and m.is_active and m.type = case new.method when 'cash' then 'cash' else 'bank' end) then
      raise exception 'Tài khoản nhận tiền không hợp lệ.' using errcode = 'P0001';
    end if;
    new.received_at := now();
    new.reconciliation_status := 'unreconciled';
    new.voided_by := null; new.voided_at := null; new.void_reason := null;
    return new;
  end if;
  -- UPDATE: chỉ huỷ khoản thu nhập nhầm, một lần, khi chưa đối soát
  if new.id <> old.id or new.order_id <> old.order_id or new.branch_id <> old.branch_id or new.amount <> old.amount
     or new.method <> old.method or new.money_account_id <> old.money_account_id or new.received_at <> old.received_at
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
  new.voided_by := coalesce(v_uid, new.voided_by);
  new.voided_at := now();
  return new;
end $$;

create trigger payments_guard before insert or update on payments
  for each row execute function app.payments_guard();

-- ---------------------------------------------------------------- Phiếu xử lý dịch vụ (bước 2.18)

create function app.tickets_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  v_order record;
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select id, branch_id, status, customer_id, warranty_until into v_order from orders where id = new.order_id;
    if v_order.id is null or v_order.branch_id <> new.branch_id then
      raise exception 'Không tìm thấy đơn gốc.' using errcode = '22P02';
    end if;
    if v_order.status <> 'confirmed' then
      raise exception 'Chỉ lập phiếu xử lý cho đơn đã xác nhận.' using errcode = 'P0001';
    end if;
    if not v_priv and (new.created_by is distinct from v_uid or not app.has_perm(new.branch_id, 'order.confirm')) then
      raise exception 'Chỉ Nhung, Linh lập phiếu xử lý.' using errcode = '42501';
    end if;
    if new.repaired_by is not null
       and not exists (select 1 from app.branch_staff(new.branch_id) s where s.id = new.repaired_by) then
      raise exception 'Thợ sửa không thuộc cơ sở này.' using errcode = 'P0001';
    end if;
    -- Còn hay hết bảo hành tính ở DB theo ngày hôm nay của cơ sở (C12)
    new.customer_id := v_order.customer_id;
    new.within_warranty := (now() at time zone app.branch_tz(new.branch_id))::date <= v_order.warranty_until;
    new.created_at := now();
    new.voided_by := null; new.voided_at := null; new.void_reason := null;
    -- K15: ưu đãi bù khiếu nại (quán chịu) do người không phải chủ lập → Cần xem lại của Linh [P40]
    new.needs_owner_review := new.outcome = 'compensation' and not v_priv
                              and not app.has_perm(new.branch_id, 'review_queue.read');
    new.reviewed_by := null; new.reviewed_at := null;
    return new;
  end if;
  -- UPDATE: phiếu không sửa; chỉ huỷ một lần, có lý do, khi ưu đãi chưa dùng cho đơn nào; hoặc Linh đánh dấu đã xem
  if row(new.id, new.branch_id, new.order_id, new.customer_id, new.issue, new.cause, new.within_warranty, new.outcome,
         new.repaired_by, new.compensation_percent, new.note, new.created_by, new.created_at, new.needs_owner_review)
     is distinct from
     row(old.id, old.branch_id, old.order_id, old.customer_id, old.issue, old.cause, old.within_warranty, old.outcome,
         old.repaired_by, old.compensation_percent, old.note, old.created_by, old.created_at, old.needs_owner_review) then
    raise exception 'Phiếu xử lý không sửa được; huỷ phiếu rồi lập lại.' using errcode = '42501';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    if not old.needs_owner_review or old.reviewed_by is not null
       or not (v_priv or app.has_perm(old.branch_id, 'review_queue.read')) then
      raise exception 'Chỉ chủ quán đánh dấu đã xem lại.' using errcode = '42501';
    end if;
    if new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason then
      raise exception 'Đánh dấu đã xem và huỷ phiếu là hai thao tác riêng.' using errcode = 'P0001';
    end if;
    new.reviewed_by := coalesce(v_uid, new.reviewed_by);
    new.reviewed_at := now();
    return new;
  end if;
  if old.voided_at is not null then
    raise exception 'Phiếu này đã huỷ.' using errcode = 'P0001';
  end if;
  if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')) then
    raise exception 'Chỉ Nhung, Linh huỷ được phiếu xử lý.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(new.void_reason, ''))) = 0 then
    raise exception 'Cần ghi lý do huỷ phiếu.' using errcode = 'P0001';
  end if;
  if exists (select 1 from orders o join order_discounts d on d.order_id = o.id and d.rev = o.content_rev
             where d.ticket_id = old.id and o.status <> 'cancelled') then
    raise exception 'Ưu đãi của phiếu đã áp vào đơn, không huỷ được phiếu.' using errcode = 'P0001';
  end if;
  new.voided_by := coalesce(v_uid, new.voided_by);
  new.voided_at := now();
  return new;
end $$;

create trigger tickets_guard before insert or update on order_service_tickets
  for each row execute function app.tickets_guard();
create trigger tickets_no_delete before delete on order_service_tickets
  for each row execute function app.forbid_mutation();
create trigger tickets_no_truncate before truncate on order_service_tickets
  for each statement execute function app.forbid_mutation();

-- Ưu đãi bù khiếu nại còn dùng được của khách. Thợ lập bill sau cần thấy, kể cả khi không mở được đơn gốc (K09).
-- p_exclude_order: đơn đang sửa (ưu đãi đang áp vào chính đơn này vẫn tính là dùng được).
create function app.customer_compensations(p_customer uuid, p_exclude_order uuid)
returns table (ticket_id uuid, percent int, created_at timestamptz, order_code int, branch_id uuid)
language sql stable security definer set search_path = pg_catalog, public as $$
  select t.id, t.compensation_percent, t.created_at, o.code, t.branch_id
  from order_service_tickets t join orders o on o.id = t.order_id
  where t.customer_id = p_customer and t.outcome = 'compensation' and t.voided_at is null
    and app.has_perm(t.branch_id, 'order.create_draft')
    and not exists (select 1 from orders o2 join order_discounts d2 on d2.order_id = o2.id and d2.rev = o2.content_rev
                    where d2.ticket_id = t.id and o2.status <> 'cancelled'
                      and (p_exclude_order is null or o2.id <> p_exclude_order))
  order by t.created_at
$$;
grant execute on function app.customer_compensations(uuid, uuid) to app_user;

-- ---------------------------------------------------------------- Cập nhật tức thời

create function app.orders_notify() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform pg_notify('lindy_events', json_build_object(
    'kind', 'orders', 'branchId', new.branch_id, 'dates', array[new.service_date::text])::text);
  return null;
end $$;

create trigger orders_notify after insert or update on orders
  for each row execute function app.orders_notify();

-- ---------------------------------------------------------------- Đồng bộ lịch hẹn ↔ đơn (module §5.4)

-- Gọi trong cùng giao dịch sau khi tạo, xác nhận hoặc huỷ đơn có appointment_id.
-- Có đơn đang làm → lịch Đang làm; mọi đơn (trừ đơn huỷ) đã xác nhận → Hoàn thành; hết đơn → về Khách đã đến.
create function app.sync_appointment(p_appt uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_status text;
  v_branch uuid;
  v_total int;
  v_confirmed int;
begin
  select status, branch_id into v_status, v_branch from appointments where id = p_appt for update;
  if not found or not app.has_perm(v_branch, 'appointments.read_branch') then
    raise exception 'Không tìm thấy lịch.' using errcode = '22P02';
  end if;
  if v_status in ('cancelled', 'no_show', 'completed') then return; end if;
  select count(*) filter (where status <> 'cancelled'), count(*) filter (where status = 'confirmed')
    into v_total, v_confirmed from orders where appointment_id = p_appt;
  if v_total = 0 then
    if v_status = 'in_progress' then
      update appointments set status = 'arrived' where id = p_appt;
    end if;
    return;
  end if;
  if v_status in ('pending', 'confirmed') then
    update appointments set status = 'arrived' where id = p_appt;
    v_status := 'arrived';
  end if;
  if v_confirmed = v_total then
    update appointments set status = 'completed' where id = p_appt;
  elsif v_status <> 'in_progress' then
    update appointments set status = 'in_progress' where id = p_appt;
  end if;
end $$;
grant execute on function app.sync_appointment(uuid) to app_user;

-- Các đơn của một lịch, kể cả đơn người xem không mở được (K09), để không tạo trùng (test 28) và cảnh báo khi huỷ lịch.
create function app.appointment_orders(p_appt uuid)
returns table (id uuid, code int, status text, visible boolean)
language sql stable security definer set search_path = pg_catalog, public as $$
  select o.id, o.code, o.status, app.order_visible(o.id)
  from orders o join appointments a on a.id = o.appointment_id
  where o.appointment_id = p_appt and app.has_perm(a.branch_id, 'appointments.read_branch')
  order by o.created_at
$$;
grant execute on function app.appointment_orders(uuid) to app_user;

-- Gắn hồ sơ khách vào lịch khi tạo đơn từ lịch (người tạo đơn có thể không có quyền sửa lịch).
create function app.appointment_link_customer(p_appt uuid, p_customer uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch from appointments where id = p_appt;
  if v_branch is null or not app.has_perm(v_branch, 'appointments.create_order') then
    raise exception 'Không có quyền tạo đơn từ lịch.' using errcode = '42501';
  end if;
  if not exists (select 1 from customers c where c.id = p_customer and c.organization_id = app.user_org()) then
    raise exception 'Không tìm thấy khách.' using errcode = '22P02';
  end if;
  update appointments set customer_id = p_customer where id = p_appt and customer_id is null;
end $$;
grant execute on function app.appointment_link_customer(uuid, uuid) to app_user;

-- Lịch hẹn: thêm Đang làm và Hoàn thành tự động từ đơn; lịch có đơn thì không bấm tay Hoàn thành (§5.4).
create or replace function app.appointments_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_tz text;
  v_open time;
  v_close time;
  v_local_start timestamp;
  v_local_end timestamp;
  v_fields_changed boolean;
  v_privileged boolean;
  v_own_pending boolean;
begin
  -- Chủ DB (migration, hàm đồng bộ với đơn hàng) không bị kiểm quyền; người dùng app chạy dưới app_user.
  if current_user <> 'app_user' then
    v_uid := coalesce(v_uid, new.updated_by);
  elsif v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  v_tz := app.branch_tz(new.branch_id);
  v_local_start := new.start_at at time zone v_tz;
  v_local_end := new.end_at at time zone v_tz;
  if v_local_start::date <> v_local_end::date then
    raise exception 'Giờ kết thúc phải cùng ngày với giờ bắt đầu.' using errcode = 'P0001';
  end if;
  select open_time, close_time into v_open, v_close from branch_booking_settings where branch_id = new.branch_id;
  new.outside_hours := coalesce(v_local_start::time < v_open or v_local_end::time > v_close, false);
  new.needs_capacity_review := false;

  if tg_op = 'INSERT' then
    if current_user = 'app_user' then
      if new.created_by is distinct from v_uid then
        raise exception 'Người tạo phải là người đang đăng nhập.' using errcode = '42501';
      end if;
      if not app.has_perm(new.branch_id, 'appointments.create') then
        raise exception 'Không có quyền tạo lịch.' using errcode = '42501';
      end if;
      if new.status = 'confirmed' and not app.has_perm(new.branch_id, 'appointments.confirm_all') then
        raise exception 'Không có quyền Tạo và chốt.' using errcode = '42501';
      end if;
    end if;
    if new.status not in ('pending', 'confirmed') then
      raise exception 'Lịch mới chỉ ở trạng thái Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
    end if;
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    new.confirmed_by := case when new.status = 'confirmed' then new.created_by end;
    new.confirmed_at := case when new.status = 'confirmed' then now() end;
    new.customer_cancel_reported_at := null; new.customer_cancel_reported_by := null; new.customer_cancel_note := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    new.arrived_by := null; new.arrived_at := null; new.no_show_by := null; new.no_show_at := null;
    new.completed_by := null; new.completed_at := null;
    return new;
  end if;

  -- UPDATE ---------------------------------------------------------
  if new.id <> old.id or new.branch_id <> old.branch_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.create_request_id <> old.create_request_id
     or new.create_request_hash <> old.create_request_hash then
    raise exception 'Không được đổi cơ sở, người tạo hoặc mã lịch.' using errcode = '42501';
  end if;

  v_privileged := current_user <> 'app_user';
  v_own_pending := old.created_by = v_uid and old.status = 'pending';

  v_fields_changed := new.customer_display_name is distinct from old.customer_display_name
    or new.phone is distinct from old.phone or new.start_at is distinct from old.start_at
    or new.end_at is distinct from old.end_at or new.guest_count is distinct from old.guest_count
    or new.service_summary is distinct from old.service_summary or new.notes is distinct from old.notes
    or new.customer_id is distinct from old.customer_id;
  if v_fields_changed then
    if old.status in ('cancelled', 'no_show', 'completed') then
      raise exception 'Lịch đã kết thúc, không sửa được.' using errcode = 'P0001';
    end if;
    if not (v_privileged or app.has_perm(old.branch_id, 'appointments.manage_all')
            or (v_own_pending and app.has_perm(old.branch_id, 'appointments.update_own_pending'))) then
      raise exception 'Chỉ sửa được lịch do mình tạo khi còn Mới đặt.' using errcode = '42501';
    end if;
  end if;

  if old.customer_cancel_reported_at is not null then
    new.customer_cancel_reported_at := old.customer_cancel_reported_at;
    new.customer_cancel_reported_by := old.customer_cancel_reported_by;
    new.customer_cancel_note := old.customer_cancel_note;
  elsif new.customer_cancel_reported_at is not null then
    if old.status not in ('pending', 'confirmed') then
      raise exception 'Chỉ báo huỷ được lịch Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
    end if;
    if not (v_privileged or app.has_perm(old.branch_id, 'appointments.report_customer_cancel')) then
      raise exception 'Không có quyền báo khách huỷ.' using errcode = '42501';
    end if;
    new.customer_cancel_reported_at := now();
    new.customer_cancel_reported_by := v_uid;
  else
    new.customer_cancel_reported_by := null;
    new.customer_cancel_note := null;
  end if;

  new.confirmed_by := old.confirmed_by; new.confirmed_at := old.confirmed_at;
  new.arrived_by := old.arrived_by; new.arrived_at := old.arrived_at;
  new.no_show_by := old.no_show_by; new.no_show_at := old.no_show_at;
  new.completed_by := old.completed_by; new.completed_at := old.completed_at;
  if new.status = old.status then
    new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at; new.cancel_reason := old.cancel_reason;
  end if;

  if new.status <> old.status then
    if old.status in ('cancelled', 'no_show', 'completed') then
      raise exception 'Lịch đã kết thúc, không đổi trạng thái được.' using errcode = 'P0001';
    end if;
    case new.status
      when 'confirmed' then
        if old.status <> 'pending' then
          raise exception 'Chỉ chốt được lịch Mới đặt.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.confirm_all')) then
          raise exception 'Không có quyền chốt lịch.' using errcode = '42501';
        end if;
        new.confirmed_by := v_uid; new.confirmed_at := now();
      when 'arrived' then
        if old.status = 'in_progress' and v_privileged then
          null;   -- đơn liên kết bị huỷ hết: lịch về Khách đã đến
        else
          if old.status not in ('pending', 'confirmed') then
            raise exception 'Chỉ đánh dấu đến được lịch Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
          end if;
          if not (v_privileged or app.has_perm(old.branch_id, 'appointments.mark_arrived')) then
            raise exception 'Không có quyền đánh dấu khách đến.' using errcode = '42501';
          end if;
          new.arrived_by := v_uid; new.arrived_at := now();
        end if;
      when 'in_progress' then
        if not v_privileged or old.status <> 'arrived' then
          raise exception 'Lịch sang Đang làm khi tạo đơn từ lịch.' using errcode = 'P0001';
        end if;
      when 'no_show' then
        if old.status not in ('pending', 'confirmed') then
          raise exception 'Chỉ đánh dấu không đến được lịch Mới đặt hoặc Đã chốt lịch.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.manage_all')) then
          raise exception 'Không có quyền đánh dấu khách không đến.' using errcode = '42501';
        end if;
        new.no_show_by := v_uid; new.no_show_at := now();
      when 'completed' then
        if old.status not in ('arrived', 'in_progress') then
          raise exception 'Chỉ hoàn thành được lịch khách đã đến.' using errcode = 'P0001';
        end if;
        if not v_privileged then
          if not app.has_perm(old.branch_id, 'appointments.manage_all') then
            raise exception 'Không có quyền đánh dấu hoàn thành.' using errcode = '42501';
          end if;
          if exists (select 1 from orders o where o.appointment_id = old.id and o.status <> 'cancelled') then
            raise exception 'Lịch có đơn liên kết; lịch tự Hoàn thành khi đơn được xác nhận.' using errcode = 'P0001';
          end if;
        end if;
        new.completed_by := v_uid; new.completed_at := now();
      when 'cancelled' then
        if old.status not in ('pending', 'confirmed', 'arrived') then
          raise exception 'Không huỷ được lịch ở trạng thái này.' using errcode = 'P0001';
        end if;
        if not (v_privileged or app.has_perm(old.branch_id, 'appointments.cancel_all')
                or (v_own_pending and app.has_perm(old.branch_id, 'appointments.cancel_own_pending'))) then
          raise exception 'Không huỷ được lịch này. Dùng Khách báo huỷ để báo người có quyền.' using errcode = '42501';
        end if;
        if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
          raise exception 'Cần ghi lý do huỷ.' using errcode = 'P0001';
        end if;
        new.cancelled_by := v_uid; new.cancelled_at := now();
      else
        raise exception 'Không đổi được sang trạng thái này.' using errcode = 'P0001';
    end case;
  end if;

  new.updated_by := v_uid;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

-- Lịch sử lịch hẹn: thêm "customer_linked" khi tạo đơn từ lịch gắn hồ sơ khách (không đổi trường nào người dùng thấy).
-- Chuyển trạng thái in_progress (đơn tạo từ lịch) ghi như các trạng thái khác.
create or replace function app.appointments_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_action text;
  v_reason text;
  v_tz text := app.branch_tz(new.branch_id);
  v_dates text[];
begin
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'confirmed' then 'created_confirmed' else 'created' end;
    insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, before_json, after_json)
    values (new.id, new.branch_id, new.created_by, v_action, null, app.appointment_snapshot(new));
    v_dates := array[to_char(new.start_at at time zone v_tz, 'YYYY-MM-DD')];
  else
    if new.status <> old.status then
      v_action := new.status;
      v_reason := case when new.status = 'cancelled' then new.cancel_reason end;
    elsif new.customer_cancel_reported_at is distinct from old.customer_cancel_reported_at then
      v_action := 'customer_cancel_reported';
      v_reason := new.customer_cancel_note;
    elsif new.start_at <> old.start_at or new.end_at <> old.end_at then
      v_action := 'rescheduled';
    elsif new.customer_id is distinct from old.customer_id
          and app.appointment_snapshot(old) = app.appointment_snapshot(new) then
      v_action := 'customer_linked';
    else
      v_action := 'updated';
    end if;
    insert into appointment_audit_events (appointment_id, branch_id, actor_user_id, action, before_json, after_json, reason)
    values (new.id, new.branch_id, new.updated_by, v_action, app.appointment_snapshot(old), app.appointment_snapshot(new), v_reason);
    v_dates := array[to_char(new.start_at at time zone v_tz, 'YYYY-MM-DD'), to_char(old.start_at at time zone v_tz, 'YYYY-MM-DD')];
  end if;
  perform pg_notify('lindy_events', json_build_object('kind', 'appointments', 'branchId', new.branch_id, 'dates', v_dates)::text);
  return null;
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS (không có DELETE)

alter table money_accounts enable row level security;
alter table order_counters enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_discounts enable row level security;
alter table order_staff_allocations enable row level security;
alter table payments enable row level security;
alter table order_audit_events enable row level security;

grant select on money_accounts to app_user, app_worker;
create policy money_accounts_read on money_accounts for select to app_user using (app.has_branch(branch_id));
create policy money_accounts_worker on money_accounts for select to app_worker using (true);

grant select, insert, update on orders to app_user;
grant select on orders to app_worker;
create policy orders_read on orders for select to app_user
  using (app.has_branch(branch_id) and (app.has_perm(branch_id, 'order.read_all') or created_by = app.uid()
                                        or app.order_has_staff(id, content_rev)));
create policy orders_insert on orders for insert to app_user
  with check (app.has_perm(branch_id, 'order.create_draft') and created_by = app.uid());
create policy orders_update on orders for update to app_user
  using (app.has_branch(branch_id) and (app.has_perm(branch_id, 'order.read_all') or created_by = app.uid()
                                        or app.order_has_staff(id, content_rev)))
  with check (app.has_branch(branch_id));
create policy orders_worker on orders for select to app_worker using (true);

grant select, insert on order_items, order_discounts, order_staff_allocations to app_user;
grant select on order_items, order_discounts, order_staff_allocations to app_worker;
create policy order_items_read on order_items for select to app_user using (app.order_visible(order_id));
create policy order_items_insert on order_items for insert to app_user with check (app.order_rev_open(order_id, rev));
create policy order_items_worker on order_items for select to app_worker using (true);
create policy order_discounts_read on order_discounts for select to app_user using (app.order_visible(order_id));
create policy order_discounts_insert on order_discounts for insert to app_user
  with check (app.order_rev_open(order_id, rev) and applied_by = app.uid());
create policy order_discounts_worker on order_discounts for select to app_worker using (true);
create policy order_alloc_read on order_staff_allocations for select to app_user using (app.order_visible(order_id));
create policy order_alloc_insert on order_staff_allocations for insert to app_user
  with check (app.order_rev_open(order_id, rev));
create policy order_alloc_worker on order_staff_allocations for select to app_worker using (true);

grant select, insert, update on payments to app_user;
grant select on payments to app_worker;
create policy payments_read on payments for select to app_user using (app.order_visible(order_id));
create policy payments_insert on payments for insert to app_user
  with check (app.has_perm(branch_id, 'order.confirm') and recorded_by = app.uid() and app.order_visible(order_id));
create policy payments_update on payments for update to app_user
  using (app.has_perm(branch_id, 'order.confirm')) with check (app.has_perm(branch_id, 'order.confirm'));
create policy payments_worker on payments for select to app_worker using (true);

alter table order_service_tickets enable row level security;
grant select, insert, update on order_service_tickets to app_user;
grant select on order_service_tickets to app_worker;
create policy tickets_read on order_service_tickets for select to app_user using (app.order_visible(order_id));
create policy tickets_insert on order_service_tickets for insert to app_user
  with check (app.has_perm(branch_id, 'order.confirm') and created_by = app.uid());
create policy tickets_update on order_service_tickets for update to app_user
  using (app.has_perm(branch_id, 'order.confirm')) with check (app.has_perm(branch_id, 'order.confirm'));
create policy tickets_worker on order_service_tickets for select to app_worker using (true);

grant select, insert on order_audit_events to app_user;
create policy order_audit_read on order_audit_events for select to app_user using (app.order_visible(order_id));
create policy order_audit_insert on order_audit_events for insert to app_user
  with check (actor_user_id = app.uid() and app.order_visible(order_id));

-- Tài khoản tiền mặc định cho các cơ sở đã có (seedBase cũng nạp cho cơ sở mới)
insert into money_accounts (branch_id, code, name, type)
select id, 'cash', 'Tiền mặt cs ' || code, 'cash' from branches
on conflict (branch_id, code) do nothing;
insert into money_accounts (branch_id, code, name, type)
select id, 'bank', 'Tài khoản cs ' || code, 'bank' from branches
on conflict (branch_id, code) do nothing;
