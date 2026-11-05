-- 0035 — S62–S64 (anh duyệt 05/11/2026). Kế hoạch: docs/plans/2026-11-05-sua-don-va-kim.md.
-- S62: người tạo đơn sửa được đơn của mình trong ngày làm dịch vụ, kể cả sau Làm xong (Chờ xác nhận, Đã xác nhận).
--      Qua ngày chỉ Nhung, Linh (order.confirm) sửa. Thay K10, K14 phần sau Làm xong.
-- S63: sau Làm xong, người không có order.confirm không sửa làm thành tiền thấp đi, không đổi ngày làm dịch vụ.
--      Người tạo sửa đơn đã xác nhận mà tiền chia của một thợ bị giảm → bắt buộc vào Cần xem lại của Linh.
--      Nhung, Linh sửa giữ luật P31 như cũ.
-- S64: hàng bán (món Kìm): không giảm giá (dòng lẫn cả bill), không chia cho thợ, không hoa hồng, không vào doanh thu
--      tính KPI của Nhung; vẫn vào doanh thu quán. Đơn cũ không có dòng hàng bán → số cũ không đổi.

-- ---------------------------------------------------------------- Cờ hàng bán

alter table services add column is_retail boolean not null default false;
alter table order_items add column is_retail boolean not null default false;
-- Hàng bán là món bán đúng giá niêm yết, không giảm (kiểm cả khi commit trong _order_check)
alter table order_items add constraint order_items_retail_check
  check (not is_retail or (line_type = 'service' and discount_amount = 0));

-- Dòng đơn nhớ cờ lúc bán (như tên, giá – P35); DB tự đặt từ danh mục, máy gửi lên không giả được.
create function app.order_items_set_retail() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  new.is_retail := new.line_type = 'service'
                   and coalesce((select s.is_retail from services s where s.id = new.service_id), false);
  return new;
end $$;
create trigger order_items_set_retail before insert on order_items
  for each row execute function app.order_items_set_retail();

-- ---------------------------------------------------------------- Mức duyệt giảm giá: bỏ dòng hàng bán (S64)
-- Giữ nguyên bản 0009; gốc % của giảm cả bill chỉ gồm các dòng không phải hàng bán, dòng hàng bán không có bậc.

create or replace function app.order_required_level(p_order uuid, p_rev int) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  with items as (
    select position, gross_amount, below_amount from order_items
    where order_id = p_order and rev = p_rev and not is_retail
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

-- ---------------------------------------------------------------- orders_guard: người tạo sửa trong ngày (S62, S63)
-- Giữ nguyên bản 0030, chỉ đổi quyền sửa nội dung đơn sau Làm xong và thêm luật không giảm thành tiền, không đổi ngày.

create or replace function app.orders_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  v_today date;
  v_level text;
  v_content_changed boolean;
  v_adjust boolean := false;
  v_creator_today boolean;
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
      -- S62: người tạo đơn (còn quyền tạo đơn) sửa được trong ngày làm dịch vụ
      v_creator_today := old.created_by = v_uid and app.has_perm(old.branch_id, 'order.create_draft')
                         and old.service_date >= v_today;
      case old.status
        when 'in_progress' then
          -- K14: người tạo đơn và Nhung, Linh; thợ được chia phần chỉ xem [P39]
          if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')
                  or (old.created_by = v_uid and app.has_perm(old.branch_id, 'order.create_draft'))) then
            raise exception 'Chỉ người tạo đơn hoặc Nhung, Linh sửa được đơn.' using errcode = '42501';
          end if;
        when 'awaiting_confirmation' then
          -- K10, S62: sau Làm xong Nhung, Linh sửa; người tạo sửa trong ngày làm dịch vụ
          if not (v_priv or app.has_perm(old.branch_id, 'order.confirm') or v_creator_today) then
            raise exception 'Đơn đã bấm Làm xong. Người tạo chỉ sửa trong ngày làm dịch vụ; ngoài ra nhờ Nhung, Linh.'
              using errcode = '42501';
          end if;
        when 'confirmed' then
          -- D04: kỳ còn mở thì sửa được; lý do bắt buộc; lưu trước/sau. S62: người tạo sửa trong ngày làm dịch vụ.
          if new.status <> 'confirmed' then
            raise exception 'Không đổi trạng thái khi sửa đơn đã xác nhận.' using errcode = 'P0001';
          end if;
          if not (v_priv or app.has_perm(old.branch_id, 'order.confirm') or v_creator_today) then
            raise exception 'Đơn đã xác nhận. Người tạo chỉ sửa trong ngày làm dịch vụ; ngoài ra nhờ Nhung, Linh.'
              using errcode = '42501';
          end if;
          if char_length(btrim(coalesce(new.adjust_reason, ''))) = 0 then
            raise exception 'Cần ghi lý do sửa đơn đã xác nhận.' using errcode = 'P0001';
          end if;
        else
          raise exception 'Đơn đã huỷ, không sửa được.' using errcode = 'P0001';
      end case;
      -- S63: sau Làm xong chỉ Linh, Quản lý sửa làm thành tiền thấp đi hoặc đổi ngày làm dịch vụ
      if old.status in ('awaiting_confirmation', 'confirmed')
         and not (v_priv or app.has_perm(old.branch_id, 'order.confirm')) then
        if new.net_amount < old.net_amount then
          raise exception 'Thành tiền giảm từ %đ xuống %đ, cần Nhung hoặc Linh sửa.',
            to_char(old.net_amount, 'FM999G999G999G999'), to_char(new.net_amount, 'FM999G999G999G999')
            using errcode = '42501';
        end if;
        if new.service_date <> old.service_date then
          raise exception 'Sau Làm xong chỉ Nhung, Linh đổi được ngày làm dịch vụ.' using errcode = '42501';
        end if;
      end if;
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
        -- P31, S63: sửa đơn đã xác nhận cần Linh xem lại (constraint trigger kiểm khi commit)
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
            -- S41: mọi tài khoản có order.confirm_bill xác nhận được đơn mình xem được (RLS orders_update giữ K09)
            if not (v_priv or app.has_perm(old.branch_id, 'order.confirm')
                    or app.has_perm(old.branch_id, 'order.confirm_bill')) then
              raise exception 'Không có quyền xác nhận bill.' using errcode = '42501';
            end if;
            if old.status = 'in_progress' then
              new.done_by := v_uid; new.done_at := now();
            end if;
            new.confirmed_by := v_uid; new.confirmed_at := now();
            new.warranty_until := new.service_date + case when new.has_hardening then 7 else 3 end;
            -- S43: bỏ Q04 — tự xác nhận đơn có phần mình không còn vào Cần xem lại (Làm xong là xác nhận luôn)
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

-- ---------------------------------------------------------------- _order_check: hàng bán, Cần xem lại khi đổi phần chia
-- Giữ nguyên bản 0014. Thêm: dòng hàng bán không giảm, không chia thợ, không cần chọn thợ (S64); người sửa đơn đã
-- xác nhận không có order.confirm mà làm giảm tiền chia của một thợ so với bản trước → phải vào Cần xem lại (S63).
-- Luật S63 chỉ kiểm trong giao dịch vừa sửa (adjusted_at = now()) để đơn cũ không bị kiểm lại theo vai trò đã đổi.

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
  v_adj_review boolean;
  v_adj_manager boolean;
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

  -- S64: hàng bán không nhận giảm giá (constraint dòng đã chặn), không chia cho thợ
  if exists (
    select 1 from order_staff_allocations a
    join order_items i on i.order_id = a.order_id and i.rev = a.rev and i.position = a.item_position
    where a.order_id = o.id and a.rev = o.content_rev and i.is_retail
  ) then
    raise exception 'Hàng bán (kìm) không chia cho thợ.' using errcode = 'P0001';
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
      where i.order_id = o.id and i.rev = o.content_rev and i.unallocated_reason is null and not i.is_retail
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
       and not (o.needs_owner_review and (o.reviewed_at is null or o.reviewed_at > o.adjusted_at)) then
      select exists (select 1 from user_branch_roles ubr join role_permissions rp on rp.role_id = ubr.role_id
                     where ubr.user_id = o.adjusted_by and ubr.branch_id = o.branch_id and ubr.revoked_at is null
                       and rp.permission_code = 'review_queue.read'),
             exists (select 1 from user_branch_roles ubr join role_permissions rp on rp.role_id = ubr.role_id
                     where ubr.user_id = o.adjusted_by and ubr.branch_id = o.branch_id and ubr.revoked_at is null
                       and rp.permission_code = 'order.confirm')
        into v_adj_review, v_adj_manager;
      if not v_adj_review then
        -- P31: Nhung sửa đơn có phần của mình
        if v_adj_manager and exists (select 1 from order_staff_allocations a where a.order_id = o.id
                                     and a.rev = o.content_rev and a.staff_user_id = o.adjusted_by) then
          raise exception 'Đơn có phần của người sửa phải vào danh sách Cần xem lại.' using errcode = 'P0001';
        end if;
        -- S63: người tạo sửa làm giảm tiền chia của một thợ so với bản trước
        if not v_adj_manager and o.adjusted_at = now() and exists (
          select 1 from (
            select staff_user_id, sum(case when rev = o.content_rev then allocated_net_amount else 0 end) as now_amt,
                   sum(case when rev = o.content_rev - 1 then allocated_net_amount else 0 end) as before_amt
            from order_staff_allocations
            where order_id = o.id and rev in (o.content_rev, o.content_rev - 1)
            group by staff_user_id
          ) s where s.now_amt < s.before_amt
        ) then
          raise exception 'Sửa làm giảm tiền chia của thợ phải vào danh sách Cần xem lại.' using errcode = 'P0001';
        end if;
      end if;
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

-- ---------------------------------------------------------------- Doanh thu tính KPI không gồm hàng bán (S64)
-- Giữ nguyên bản 0017. Doanh thu quán của đơn (cơ sở KPI) = tiền thuần − tiền thuần dòng hàng bán; phiếu hoàn trừ KPI
-- theo tỷ lệ phần không phải hàng bán. Đơn không có hàng bán → đúng số cũ, sổ không phát sinh dòng đảo (K24).

create or replace function app._payroll_target(p_order uuid)
returns table (source_type text, source_id uuid, staff_user_id uuid, natural_month date, commission_base bigint,
               shop_revenue bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  with o as (select * from orders where id = p_order and status = 'confirmed'),
  rt as (
    select coalesce(sum(i.net_amount), 0)::bigint as retail
    from o join order_items i on i.order_id = o.id and i.rev = o.content_rev and i.is_retail
  )
  select * from (
    select 'order'::text, o.id, a.staff_user_id, date_trunc('month', o.service_date)::date,
           sum(a.commission_base_amount)::bigint, 0::bigint
    from o join order_staff_allocations a on a.order_id = o.id and a.rev = o.content_rev
    group by o.id, o.service_date, a.staff_user_id
    union all
    select 'order', o.id, null, date_trunc('month', o.service_date)::date, 0, o.net_amount - rt.retail from o, rt
    union all
    select 'refund', r.id, ra.staff_user_id, date_trunc('month', r.revenue_date)::date, -ra.amount, 0
    from o join order_refunds r on r.order_id = o.id join order_refund_allocations ra on ra.refund_id = r.id
    union all
    select 'refund', r.id, null, date_trunc('month', r.revenue_date)::date, 0,
           case when rt.retail = 0 or o.net_amount = 0 then -r.amount
                else -round(r.amount::numeric * (o.net_amount - rt.retail) / o.net_amount)::bigint end
    from o cross join rt join order_refunds r on r.order_id = o.id
  ) t (source_type, source_id, staff_user_id, natural_month, commission_base, shop_revenue)
  where commission_base <> 0 or shop_revenue <> 0
$$;
