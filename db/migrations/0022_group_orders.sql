-- 0022 — Lịch nhiều khách (S06–S08, Đợt 6C): mỗi khách của lịch một đơn ngang nhau, số đơn bằng số khách;
-- cọc của lịch chia đều cho các đơn.
-- - orders.guest_no: khách thứ mấy của lịch (1…4). Một lịch không có hai đơn chưa huỷ cùng một khách.
-- - orders.guest_label: tên hiển thị khi khách đi cùng không có hồ sơ ("Khách đi cùng Mai Anh").
-- - Giảm số khách của lịch thấp hơn khách đang có đơn → chặn.
-- - Trừ cọc: mỗi đơn tối đa phần chia đều của lịch (tổng cọc ÷ số khách, phần lẻ vào Khách 1).

alter table orders
  add column guest_no int check (guest_no between 1 and 4),
  add column guest_label text check (char_length(guest_label) between 1 and 120);

-- Đơn cũ tạo từ lịch: đánh số theo thứ tự tạo (đơn chưa huỷ). Tắt trigger để không đổi version, không phát sự kiện.
alter table orders disable trigger user;
with ranked as (
  select id, row_number() over (partition by appointment_id order by created_at, id) as rn
  from orders where appointment_id is not null and status <> 'cancelled'
)
update orders o set guest_no = r.rn from ranked r where o.id = r.id and r.rn <= 4;
alter table orders enable trigger user;

create unique index orders_appointment_guest_uq on orders(appointment_id, guest_no)
  where appointment_id is not null and guest_no is not null and status <> 'cancelled';

-- Các đơn của lịch kèm khách thứ mấy (thêm cột guest_no vào hàm của 0009)
drop function app.appointment_orders(uuid);
create function app.appointment_orders(p_appt uuid)
returns table (id uuid, code int, status text, visible boolean, guest_no int, customer_name text)
language sql stable security definer set search_path = pg_catalog, public as $$
  select o.id, o.code, o.status, app.order_visible(o.id), o.guest_no, coalesce(c.name, o.guest_label)
  from orders o join appointments a on a.id = o.appointment_id
  left join customers c on c.id = o.customer_id
  where o.appointment_id = p_appt and app.has_perm(a.branch_id, 'appointments.read_branch')
  order by o.guest_no nulls last, o.created_at
$$;
grant execute on function app.appointment_orders(uuid) to app_user;

-- Khách cao nhất đang có đơn chưa huỷ của lịch (đọc cả đơn người xem không thấy, K09)
create function app.appointment_max_guest(p_appt uuid) returns int
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(max(guest_no), 0)::int from orders where appointment_id = p_appt and status <> 'cancelled'
$$;
grant execute on function app.appointment_max_guest(uuid) to app_user;

-- guest_no, guest_label: chỉ ghi lúc tạo đơn, không quá số khách của lịch
create function app.orders_guest_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_guests int;
begin
  if tg_op = 'INSERT' then
    if new.guest_no is not null then
      select guest_count into v_guests from appointments where id = new.appointment_id;
      if v_guests is null then
        raise exception 'Đơn theo khách phải gắn lịch.' using errcode = 'P0001';
      end if;
      if new.guest_no > v_guests then
        raise exception 'Lịch chỉ có % khách.', v_guests using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  if (new.guest_no is distinct from old.guest_no or new.guest_label is distinct from old.guest_label)
     and current_user = 'app_user' then
    raise exception 'Không đổi được khách của đơn.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger orders_guest_guard before insert or update on orders
  for each row execute function app.orders_guest_guard();

-- Giảm số khách thấp hơn khách đang có đơn → chặn (S08)
create function app.appointments_guest_count_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_max int;
begin
  if new.guest_count < old.guest_count then
    v_max := app.appointment_max_guest(new.id);
    if v_max > new.guest_count then
      raise exception 'Lịch đang có đơn của khách thứ %. Huỷ đơn đó trước khi giảm số khách.', v_max
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger appointments_guest_count_guard before update on appointments
  for each row execute function app.appointments_guest_count_guard();

-- Trừ cọc vào bill: như 0012, thêm giới hạn phần chia đều cho đơn có guest_no (S07).
create or replace function app.apply_deposits(p_order uuid) returns bigint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  o orders;
  d appointment_deposits;
  v_due bigint;
  v_rem bigint;
  v_amt bigint;
  v_total bigint := 0;
  v_guests int;
  v_pool bigint;
  v_share bigint;
  v_applied bigint;
begin
  if app.uid() is null or not app.order_visible(p_order) then
    raise exception 'Không tìm thấy đơn.' using errcode = '22P02';
  end if;
  select * into o from orders where id = p_order for update;
  if o.appointment_id is null or o.status not in ('awaiting_confirmation', 'confirmed') then
    return 0;
  end if;
  v_due := o.net_amount - (select coalesce(sum(amount), 0) from payments where order_id = o.id and voided_at is null);

  if o.guest_no is not null then
    select guest_count into v_guests from appointments where id = o.appointment_id;
    -- Tổng cọc đã nhận của lịch (trừ phần đã hoàn/giữ), chia đều theo số khách; phần lẻ vào Khách 1
    select coalesce(sum(amount - coalesce(resolved_amount, 0)), 0) into v_pool
    from appointment_deposits where appointment_id = o.appointment_id and status = 'confirmed';
    v_share := v_pool / greatest(v_guests, 1)
             + case when o.guest_no = 1 then v_pool % greatest(v_guests, 1) else 0 end;
    select coalesce(sum(amount), 0) into v_applied
    from payments where order_id = o.id and deposit_id is not null and voided_at is null;
    v_due := least(v_due, v_share - v_applied);
  end if;

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
