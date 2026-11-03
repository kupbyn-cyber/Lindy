-- 0033 — S55, S57, S58: nghỉ giờ trừ riêng, đủ khách mới hoàn thành lịch, chỉ chủ duyệt chi.
alter table leave_requests add column start_time time, add column end_time time;
alter table leave_requests add constraint leave_hours_check check (
  (start_time is null and end_time is null) or
  (start_time is not null and end_time is not null and from_date = to_date
   and start_time >= time '09:00' and end_time <= time '21:00' and end_time > start_time
   and extract(second from start_time) = 0 and extract(second from end_time) = 0)
);
create or replace function app.leave_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_priv boolean := current_user <> 'app_user';
  v_approver boolean;
begin
  if not v_priv and v_uid is null then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not v_priv and (new.user_id is distinct from v_uid or not app.has_perm(new.branch_id, 'attendance.own')) then
      raise exception 'Không có quyền đăng ký nghỉ.' using errcode = '42501';
    end if;
    -- Gửi lại cùng mã (bấm hai lần): để ON CONFLICT bỏ qua, không báo trùng ngày với chính đơn đó
    if exists (select 1 from leave_requests where user_id = new.user_id and create_request_id = new.create_request_id) then
      return new;
    end if;
    if not exists (select 1 from staff_profiles where user_id = new.user_id and branch_id = new.branch_id) then
      raise exception 'Chưa có hồ sơ nhân viên. Báo Linh thêm ngày vào làm.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('payroll:' || new.branch_id::text, 0));
    perform app._require_open(new.branch_id, new.from_date);
    -- Hai đơn song song cùng người phải chờ nhau để kiểm trùng ngày
    perform pg_advisory_xact_lock(hashtextextended('leave:' || new.branch_id::text || new.user_id::text, 0));
    if exists (select 1 from leave_requests l where l.branch_id = new.branch_id and l.user_id = new.user_id
               and l.status in ('requested', 'approved')
               and l.from_date <= new.to_date and new.from_date <= l.to_date
               and (l.start_time is null or new.start_time is null
                    or (l.start_time < new.end_time and new.start_time < l.end_time))) then
      raise exception 'Đã có đơn nghỉ trùng thời gian.' using errcode = 'P0001';
    end if;
    new.status := 'requested';
    new.requested_at := now();
    new.decided_by := null; new.decided_at := null; new.decide_note := null;
    new.cancelled_by := null; new.cancelled_at := null;
    new.version := 1;
    -- Nhung, Linh đăng ký cho mình → duyệt luôn (Q27, có audit)
    if not v_priv and app.has_perm(new.branch_id, 'attendance.approve') then
      new.status := 'approved';
      new.decided_by := v_uid;
      new.decided_at := now();
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------
  if new.id <> old.id or new.branch_id <> old.branch_id or new.user_id <> old.user_id
     or new.from_date <> old.from_date or new.to_date <> old.to_date or new.reason <> old.reason
     or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time
     or new.requested_at <> old.requested_at or new.create_request_id <> old.create_request_id then
    raise exception 'Đơn nghỉ không sửa được; huỷ rồi đăng ký lại.' using errcode = '42501';
  end if;
  new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  if new.status = old.status then
    new.decide_note := old.decide_note;
    new.version := old.version;
    return new;
  end if;
  v_approver := v_priv or app.has_perm(old.branch_id, 'attendance.approve');

  if old.status = 'requested' and new.status in ('approved', 'rejected') then
    if not v_approver then
      raise exception 'Chỉ Nhung, Linh duyệt ngày nghỉ.' using errcode = '42501';
    end if;
    if new.status = 'rejected' and char_length(btrim(coalesce(new.decide_note, ''))) = 0 then
      raise exception 'Cần ghi lý do từ chối.' using errcode = 'P0001';
    end if;
    if new.status = 'approved' then
      perform pg_advisory_xact_lock(hashtextextended('payroll:' || old.branch_id::text, 0));
      perform app._require_open(old.branch_id, old.from_date);
    end if;
    new.decided_by := coalesce(v_uid, new.decided_by);
    new.decided_at := now();

  elsif old.status in ('requested', 'approved') and new.status = 'cancelled' then
    if old.status = 'requested' and not (v_approver or old.user_id = v_uid) then
      raise exception 'Chỉ người đăng ký hoặc Nhung, Linh huỷ được đơn nghỉ.' using errcode = '42501';
    end if;
    if old.status = 'approved' then
      if not v_approver then
        raise exception 'Ngày nghỉ đã duyệt: chỉ Nhung, Linh huỷ được.' using errcode = '42501';
      end if;
      if char_length(btrim(coalesce(new.decide_note, ''))) = 0 then
        raise exception 'Cần ghi lý do huỷ ngày nghỉ đã duyệt.' using errcode = 'P0001';
      end if;
      perform pg_advisory_xact_lock(hashtextextended('payroll:' || old.branch_id::text, 0));
      perform app._require_open(old.branch_id, old.from_date);
    end if;
    new.cancelled_by := coalesce(v_uid, new.cancelled_by);
    new.cancelled_at := now();

  else
    raise exception 'Không đổi được trạng thái đơn nghỉ như vậy.' using errcode = 'P0001';
  end if;

  new.version := old.version + 1;
  return new;
end $$;

create or replace function app.attendance_grid(p_branch uuid, p_from date, p_to date)
returns table (user_id uuid, work_date date, status text, check_in_at timestamptz, check_out_at timestamptz,
               note text, decided_status text, leave_id uuid, closed_reason text)
language sql stable set search_path = pg_catalog, public as $$
  with t as (select app.branch_today(p_branch) as today),
  days as (
    select sp.user_id, sp.start_date, sp.end_date, g::date as d
    from staff_profiles sp cross join generate_series(p_from, p_to, interval '1 day') g
    where sp.branch_id = p_branch)
  select x.user_id, x.d,
    case when x.d < x.start_date or (x.end_date is not null and x.d > x.end_date) then 'out'
         when c.id is not null then 'closed'
         when a.status is not null then a.status
         when l.id is not null then 'leave'
         when x.d > (select today from t) then 'future'
         else 'pending' end,
    a.check_in_at, a.check_out_at, a.note, a.status, l.id, c.reason
  from days x
  left join shop_closed_days c on c.branch_id = p_branch and c.closed_date = x.d and c.removed_at is null
  left join attendance_days a on a.branch_id = p_branch and a.user_id = x.user_id and a.work_date = x.d
  left join lateral (select lr.id from leave_requests lr
                     where lr.branch_id = p_branch and lr.user_id = x.user_id and lr.status = 'approved'
                       and lr.start_time is null and x.d between lr.from_date and lr.to_date
                     limit 1) l on true
  order by x.user_id, x.d
$$;

create or replace function app.leave_after() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_actor uuid := coalesce(app.uid(), new.decided_by, new.cancelled_by);
begin
  if (tg_op = 'INSERT' and new.status = 'approved') or (tg_op = 'UPDATE' and new.status <> old.status) then
    insert into audit_logs (actor_user_id, actor_label, branch_id, action, entity_type, entity_id, details)
    values (v_actor, case when v_actor is null then 'system' end, new.branch_id,
            case when v_actor = new.user_id then 'leave.self_' else 'leave.' end || new.status,
            'leave_request', new.id::text,
            jsonb_build_object('user', new.user_id, 'from', new.from_date, 'to', new.to_date, 'startTime', new.start_time, 'endTime', new.end_time, 'note', new.decide_note));
  end if;
  return null;
end $$;


-- S55. Tổng hợp nội bộ, không cấp quyền gọi trực tiếp cho app_user.
create function app._hourly_leave_totals(p_branch uuid, p_month date)
returns table (user_id uuid, minutes int, amount bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  with hours as (
    select l.user_id, sum(extract(epoch from (l.end_time - l.start_time)) / 60)::int as minutes
    from leave_requests l
    join staff_profiles sp on sp.branch_id = l.branch_id and sp.user_id = l.user_id
    where l.branch_id = p_branch and l.status = 'approved' and l.start_time is not null
      and l.from_date >= p_month and l.from_date < p_month + interval '1 month'
      and l.from_date >= sp.start_date and (sp.end_date is null or l.from_date <= sp.end_date)
      and not exists (select 1 from shop_closed_days c where c.branch_id = p_branch
                       and c.closed_date = l.from_date and c.removed_at is null)
      and not exists (select 1 from attendance_days a where a.branch_id = p_branch and a.user_id = l.user_id
                       and a.work_date = l.from_date and a.status in ('leave', 'unexcused'))
    group by l.user_id
  )
  select h.user_id, h.minutes,
         round(h.minutes::numeric * p.base_salary /
           ((extract(day from (p_month + interval '1 month - 1 day'))::int - p.leave_days) * 720))::bigint
  from hours h
  join lateral (select base_salary, leave_days from staff_policy_versions
                 where branch_id = p_branch and user_id = h.user_id and effective_month <= p_month
                 order by effective_month desc limit 1) p on true
$$;
alter table payroll_lines
  add column hourly_leave_minutes int not null default 0,
  add column hourly_leave_deduction bigint not null default 0;
create or replace function app._payroll_rows(p_branch uuid, p_month date)
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
           coalesce(a.bonus, 0) as bonus, coalesce(a.deduction, 0) + coalesce(h.amount, 0) as deduction, coalesce(a.carry, 0) as carry,
           coalesce(v.amount, 0) as adv
    from people p cross join m
    left join days d on d.user_id = p.user_id
    left join rev r on r.staff_user_id = p.user_id
    left join kpi k on true
    left join app._hourly_leave_totals(p_branch, p_month) h on h.user_id = p.user_id
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

create or replace function app.payroll_lock(p_branch uuid, p_month date) returns int
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_start date;
  v_pending int;
  v_missing text;
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
  -- Người có hồ sơ trong tháng mà chưa có chính sách lương thì không có phiếu lương → không khoá để khỏi sót [P74]
  select string_agg(u.display_name, ', ' order by u.display_name) into v_missing
  from staff_profiles sp join users u on u.id = sp.user_id
  where sp.branch_id = p_branch and sp.start_date < v_next and (sp.end_date is null or sp.end_date >= p_month)
    and app._base_salary(p_branch, sp.user_id, p_month) is null;
  if v_missing is not null then
    raise exception 'Chưa có chính sách lương của: %. Nhập ở Thêm → Nhân viên rồi mới khoá.', v_missing
      using errcode = 'P0001';
  end if;

  insert into payroll_periods (branch_id, month, locked_by) values (p_branch, p_month, v_uid);
  insert into payroll_lines (branch_id, month, user_id, pay_method, days_in_month, leave_allowance, standard_days,
                             absent_days, closed_days, base_salary, attendance_adjustment, commission_bps,
                             commission_base, commission, manager_kpi, shop_revenue, kpi_bps, kpi_bonus, bonus,
                             deduction, carry_in, gross_pay, advances, carried_out, payable, hourly_leave_minutes, hourly_leave_deduction)
  select p_branch, p_month, r.user_id, r.pay_method, r.days_in_month, r.leave_allowance, r.standard_days,
         r.absent_days, r.closed_days, r.base_salary, r.attendance_adjustment, r.commission_bps, r.commission_base,
         r.commission, r.manager_kpi, r.shop_revenue, r.kpi_bps, r.kpi_bonus, r.bonus, r.deduction, r.carry_in,
         r.gross_pay, r.advances, greatest(r.advances - r.gross_pay, 0), greatest(r.gross_pay - r.advances, 0), coalesce(h.minutes, 0), coalesce(h.amount, 0)
  from app._payroll_rows(p_branch, p_month) r
  left join app._hourly_leave_totals(p_branch, p_month) h on h.user_id = r.user_id;
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


-- Quyền đọc như payroll_view; tháng đã khoá đọc số liệu đã chụp.
create function app.payroll_hourly(p_branch uuid, p_month date)
returns table (user_id uuid, hourly_leave_minutes int, hourly_leave_deduction bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  select h.user_id, h.minutes, h.amount
  from app._hourly_leave_totals(p_branch, p_month) h
  where not app.payroll_month_locked(p_branch, p_month)
    and (app.has_perm(p_branch, 'payroll.read_all_branch')
      or (h.user_id = app.uid() and app.has_perm(p_branch, 'payroll.read_own')))
  union all
  select l.user_id, l.hourly_leave_minutes, l.hourly_leave_deduction
  from payroll_lines l where l.branch_id = p_branch and l.month = p_month
    and app.payroll_month_locked(p_branch, p_month)
    and (app.has_perm(p_branch, 'payroll.read_all_branch')
      or (l.user_id = app.uid() and app.has_perm(p_branch, 'payroll.read_own')))
$$;
grant execute on function app.payroll_hourly(uuid, date) to app_user;
-- Lịch công khai chỉ trả tên/khoảng giờ, không trả lý do nghỉ.
create function app.staff_off_hours_on(p_branch uuid, p_date date)
returns table (display_name text, status text, start_time text, end_time text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if app.uid() is null or not app.has_perm(p_branch, 'appointments.read_branch') then
    raise exception 'Không có quyền xem lịch của cơ sở này.' using errcode = '42501';
  end if;
  return query select u.display_name, l.status, to_char(l.start_time, 'HH24:MI'), to_char(l.end_time, 'HH24:MI')
  from leave_requests l join users u on u.id = l.user_id
  where l.branch_id = p_branch and l.status in ('approved', 'requested')
    and p_date between l.from_date and l.to_date
    and exists (select 1 from user_branch_roles r where r.user_id = l.user_id and r.branch_id = p_branch
                 and r.revoked_at is null)
  order by u.display_name, l.start_time;
end $$;
grant execute on function app.staff_off_hours_on(uuid, date) to app_user;
-- S58: chủ duyệt chi; vai trò seed Linh=owner, Nhung=manager (seed-core.ts).
create or replace function app.expense_can_approve(p_branch uuid, p_level text) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select app.has_perm(p_branch, 'expense.approve_above_limit')
$$;
-- Chỉ thu hồi quyền trong hạn mức của vai trò manager theo yêu cầu; giữ phiếu lịch sử.
delete from role_permissions where role_id in (select id from roles where code = 'manager')
  and permission_code = 'expense.approve_within_limit';
create or replace function app.sync_appointment(p_appt uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_status text;
  v_branch uuid;
  v_total int;
  v_confirmed int;
  v_guests int;
begin
  select status, branch_id, guest_count into v_status, v_branch, v_guests from appointments where id = p_appt for update;
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
  if v_confirmed = v_total and v_total >= v_guests then
    update appointments set status = 'completed' where id = p_appt;
  elsif v_status <> 'in_progress' then
    update appointments set status = 'in_progress' where id = p_appt;
  end if;
end $$;

-- Giảm số khách sau khi một khách không làm: tính lại trạng thái từ số khách mới.
create function app.appointments_resync_guests() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform app.sync_appointment(new.id);
  return null;
end $$;
create trigger appointments_resync_guests after update of guest_count on appointments
  for each row when (old.guest_count is distinct from new.guest_count)
  execute function app.appointments_resync_guests();
