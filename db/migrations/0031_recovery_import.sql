-- 0031 — Nhập lại dữ liệu thật sau sự cố 01/11/2026 (công cụ dùng một lần, migration sau gỡ đi).
-- Nút "Xoá, bắt đầu dùng thật" đã xoá cả dữ liệu thật quán nhập từ 15/10. File nhập lấy từ bản sao lưu 02:00 ngày 01/11,
-- chỉ gồm phần thật. Hàm chỉ thêm dòng vào DB đang chạy, không sửa dòng nào đang có.
-- - Chỉ nhận đúng file có sha256 ghi dưới đây (trong migration không có dữ liệu khách). Chỉ Chủ gọi được, thành công
--   một lần (audit recovery.imported).
-- - p_commit = false: chạy hết các bước rồi huỷ và trả báo cáo, để thử trên DB thật trước khi ghi.
-- - Tắt trigger trong chính giao dịch này như app.demo_golive_wipe: dòng trong file đã qua trigger từ lần ghi đầu, chạy lại
--   sẽ cấp lại mã đơn, ghi đôi sổ tiền, phát lại thông báo. Khoá ngoại, ràng buộc vẫn kiểm.

-- Một bảng: mọi cột ép kiểu từ chữ. Cột identity cấp số mới theo thứ tự cũ vì DB đang chạy đã dùng lại các số đó; p_self là
-- cột trỏ về chính bảng (bút toán đảo), đổi theo số mới.
create function app._recovery_copy(p_table text, p_rows jsonb, p_self text, p_skip_conflict boolean) returns bigint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_rel regclass := format('public.%I', p_table)::regclass;
  v_identity text;
  v_cols text;
  v_exprs text;
  v_n bigint;
begin
  select a.attname into v_identity from pg_attribute a
  where a.attrelid = v_rel and a.attidentity <> '' and not a.attisdropped;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(case when a.attname = v_identity then 's.new_id'
                         when a.attname = p_self then 'm.new_id'
                         else format('(s.r->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod)) end,
                    ', ' order by a.attnum)
    into v_cols, v_exprs
  from pg_attribute a
  where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';

  if v_identity is not null then
    execute format(
      $q$with src as materialized (
           select x.r, (x.r->>%L)::bigint as old_id, nextval(%L::regclass) as new_id
           from (select r from jsonb_array_elements($1) e(r) order by (r->>%L)::bigint) x)
         insert into %s (%s) overriding system value
         select %s from src s %s order by s.new_id$q$,
      v_identity, pg_get_serial_sequence(v_rel::text, v_identity), v_identity, v_rel, v_cols, v_exprs,
      case when p_self is not null then format('left join src m on m.old_id = (s.r->>%L)::bigint', p_self) else '' end)
    using p_rows;
  else
    execute format('insert into %s (%s) select %s from jsonb_array_elements($1) s(r) %s', v_rel, v_cols, v_exprs,
                   case when p_skip_conflict then 'on conflict do nothing' else '' end)
    using p_rows;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function app.recovery_import(p_branch uuid, p_payload text, p_commit boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  c_sha256 constant text := 'dcd5076b434f78247d4497f968fbed97dd65cceb12b372524a7a37f842fa1e7f';
  -- Cha trước con để khoá ngoại kiểm được
  c_tables constant text[] := array[
    'customers', 'customer_audit_events',
    'appointments', 'appointment_audit_events',
    'orders', 'order_items', 'order_service_tickets', 'order_discounts', 'order_staff_allocations', 'order_audit_events',
    'payments', 'money_ledger_entries', 'payroll_revenue_entries',
    'payroll_settings', 'staff_profiles', 'staff_policy_versions', 'attendance_days', 'leave_requests'
  ];
  v_data jsonb;
  v_rows jsonb := '{}'::jsonb;
  t text;
begin
  perform app._require_users_manage(p_branch);
  if encode(sha256(convert_to(p_payload, 'UTF8')), 'hex') <> c_sha256 then
    raise exception 'File không đúng bản đã chuẩn bị.' using errcode = 'P0001';
  end if;
  perform 1 from branches where id = p_branch for update;   -- hai lần chạy song song phải chờ nhau
  if exists (select 1 from audit_logs where action = 'recovery.imported') then
    raise exception 'Đã nhập lại dữ liệu rồi, không nhập lần hai.' using errcode = 'P0001';
  end if;
  v_data := p_payload::jsonb;

  begin
    foreach t in array c_tables loop
      execute format('alter table %I disable trigger user', t);
    end loop;
    foreach t in array c_tables loop
      v_rows := v_rows || jsonb_build_object(t, app._recovery_copy(
        t, v_data->t,
        case t when 'money_ledger_entries' then 'reverses_entry_id' when 'payroll_revenue_entries' then 'reverses_id' end,
        -- Hồ sơ, chấm công Linh đã nhập lại trên app thì giữ bản đang có
        t in ('payroll_settings', 'staff_profiles', 'staff_policy_versions', 'attendance_days')));
    end loop;
    foreach t in array c_tables loop
      execute format('alter table %I enable trigger user', t);
    end loop;
    -- Mã đơn trong file từ 58 đến 230; đơn mới phải đi tiếp sau đó, không dùng lại
    insert into order_counters (branch_id, last_no)
    values (p_branch, (select max(code) from orders where branch_id = p_branch))
    on conflict (branch_id) do update set last_no = greatest(order_counters.last_no, excluded.last_no);
    if not p_commit then
      raise exception 'chạy thử' using errcode = 'LR001';
    end if;
  exception when sqlstate 'LR001' then
    return jsonb_build_object('committed', false, 'rows', v_rows);
  end;

  perform app._audit(p_branch, 'recovery.imported', app.uid(), jsonb_build_object('rows', v_rows));
  return jsonb_build_object('committed', true, 'rows', v_rows);
end $$;
grant execute on function app.recovery_import(uuid, text, boolean) to app_user;
