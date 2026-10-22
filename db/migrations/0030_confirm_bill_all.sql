-- 0030 — Mọi tài khoản xác nhận được bill (S41, 23/10/2026). Thợ, Chin, Nhung, Linh xác nhận bill của đơn mình xem được
-- (thợ: đơn mình tạo hoặc có phần mình làm, K09). Bấm Làm xong là xác nhận luôn khi không còn giảm giá chờ duyệt (server
-- chuyển thẳng Đang làm → Đã xác nhận); giảm giá cần Nhung, Linh duyệt thì sang Chờ xác nhận như cũ (C15, K12).
-- Quyền mới order.confirm_bill chỉ là xác nhận bill; sửa đơn sau Làm xong vẫn theo order.confirm (Nhung, Linh; K10).
-- S43: bỏ luật Q04 (người không phải chủ tự xác nhận đơn có phần mình → Cần xem lại của Linh); thợ ghi được tiền thu
-- đơn mình xem được (order.record_payment), huỷ khoản thu vẫn Nhung, Linh.

insert into permissions (code, description)
values ('order.confirm_bill', 'Xác nhận bill đơn mình xem được; Làm xong là xác nhận luôn (S41)')
on conflict (code) do nothing;
insert into role_permissions (role_id, permission_code)
select id, 'order.confirm_bill' from roles where code in ('owner', 'manager', 'staff_booking_plus', 'staff')
on conflict do nothing;

-- ---------------------------------------------------------------- orders_guard: xác nhận bill theo order.confirm_bill (S41)
-- Giữ nguyên bản 0014, chỉ đổi quyền ở bước chuyển sang Đã xác nhận và bỏ Q04 (S43).

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

-- ---------------------------------------------------------------- Thợ ghi tiền thu (S43)
-- Mọi tài khoản ghi được tiền thu của đơn mình xem được (đơn đã bấm Làm xong). Huỷ khoản thu, đối soát, chốt quỹ vẫn
-- theo order.confirm / cashbook.manage (Nhung, Linh).

insert into permissions (code, description)
values ('order.record_payment', 'Ghi tiền thu đơn mình xem được (S43)')
on conflict (code) do nothing;
insert into role_permissions (role_id, permission_code)
select id, 'order.record_payment' from roles where code in ('owner', 'manager', 'staff_booking_plus', 'staff')
on conflict do nothing;

drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert to app_user
  with check ((app.has_perm(branch_id, 'order.confirm') or app.has_perm(branch_id, 'order.record_payment'))
              and recorded_by = app.uid() and app.order_visible(order_id));

-- payments_guard: giữ nguyên bản 0013, chỉ đổi quyền ghi khoản thu.

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
      -- S43: mọi tài khoản có order.record_payment ghi được (RLS payments_insert giữ đơn mình xem được)
      if new.recorded_by is distinct from v_uid
         or not (app.has_perm(new.branch_id, 'order.confirm') or app.has_perm(new.branch_id, 'order.record_payment')) then
        raise exception 'Không có quyền ghi tiền thu.' using errcode = '42501';
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
