-- 0029 — Xoá món trong danh mục (S42, 23/10/2026). Chủ (catalog.manage) bấm Xoá: dịch vụ, combo biến mất khỏi menu tạo đơn
-- và khỏi màn Danh mục. Không xoá dòng (quy tắc không xoá vĩnh viễn; dòng đơn tham chiếu món; seed lúc khởi động chỉ thêm
-- mã chưa có nên xoá hẳn món gốc thì món tự quay lại): đánh dấu deleted_at, deleted_by và ngừng bán. Đơn cũ giữ tên, giá lúc bán.
-- Dịch vụ còn nằm trong combo chưa xoá thì phải xoá combo trước. Món đã xoá không sửa, không đưa vào combo mới được.

alter table services
  add column deleted_at timestamptz,
  add column deleted_by uuid references users(id),
  add constraint services_deleted_inactive check (deleted_at is null or not is_active);
alter table combos
  add column deleted_at timestamptz,
  add column deleted_by uuid references users(id),
  add constraint combos_deleted_inactive check (deleted_at is null or not is_active);

create function app.catalog_delete(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_org uuid := app._require_catalog_manage();
  v_name text;
  v_combos text;
begin
  if p_kind = 'service' then
    select name into v_name from services
    where id = p_id and organization_id = v_org and deleted_at is null for update;
    if not found then
      raise exception 'Không tìm thấy dịch vụ.' using errcode = '22P02';
    end if;
    select string_agg(c.name, ', ' order by c.sort_order, c.code) into v_combos
    from combo_items ci join combos c on c.id = ci.combo_id
    where ci.service_id = p_id and c.deleted_at is null;
    if v_combos is not null then
      raise exception 'Dịch vụ đang nằm trong combo %. Xoá combo trước.', v_combos using errcode = 'P0001';
    end if;
    update services set is_active = false, deleted_at = now(), deleted_by = app.uid(),
                        updated_at = now(), updated_by = app.uid()
    where id = p_id;
  elsif p_kind = 'combo' then
    select name into v_name from combos
    where id = p_id and organization_id = v_org and deleted_at is null for update;
    if not found then
      raise exception 'Không tìm thấy combo.' using errcode = '22P02';
    end if;
    update combos set is_active = false, deleted_at = now(), deleted_by = app.uid(),
                      updated_at = now(), updated_by = app.uid()
    where id = p_id;
  else
    raise exception 'Loại món không hợp lệ.' using errcode = '22P02';
  end if;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
  values (app.uid(), 'catalog.' || p_kind || '_deleted', p_kind, p_id::text, jsonb_build_object('name', v_name));
end $$;

grant execute on function app.catalog_delete(text, uuid) to app_user;

-- Sửa: không sửa món đã xoá; combo mới không gồm dịch vụ đã xoá. Còn lại giữ như 0010.

create or replace function app.catalog_save_service(
  p_id uuid, p_category text, p_name text, p_price_mode text, p_unit text, p_min bigint, p_max bigint,
  p_has_hardening boolean, p_active boolean
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_org uuid := app._require_catalog_manage();
  v_old services;
  v_id uuid;
  v_max bigint := case when p_price_mode = 'list' then p_min else p_max end;
begin
  if p_id is null then
    insert into services (organization_id, code, category, name, price_mode, unit, price_min, price_max, has_hardening,
                          is_active, sort_order, updated_by)
    select v_org,
           'DV' || lpad((coalesce(max(substring(code from 3)::int) filter (where code ~ '^DV[0-9]{1,9}$'), 0) + 1)::text, 3, '0'),
           btrim(p_category), btrim(p_name), p_price_mode, p_unit, p_min, v_max, p_has_hardening, p_active,
           coalesce(max(sort_order), 0) + 10, app.uid()
    from services where organization_id = v_org
    returning id into v_id;
    insert into catalog_price_history (organization_id, item_type, item_id, old_min, old_max, new_min, new_max, changed_by)
    values (v_org, 'service', v_id, null, null, p_min, v_max, app.uid());
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
    values (app.uid(), 'catalog.service_created', 'service', v_id::text,
            jsonb_build_object('name', p_name, 'min', p_min, 'max', v_max));
    return v_id;
  end if;

  select * into v_old from services where id = p_id and organization_id = v_org and deleted_at is null for update;
  if not found then
    raise exception 'Không tìm thấy dịch vụ.' using errcode = '22P02';
  end if;
  update services set category = btrim(p_category), name = btrim(p_name), price_mode = p_price_mode, unit = p_unit,
                      price_min = p_min, price_max = v_max, has_hardening = p_has_hardening, is_active = p_active,
                      updated_at = now(), updated_by = app.uid()
  where id = p_id;
  if v_old.price_min <> p_min or v_old.price_max <> v_max then
    insert into catalog_price_history (organization_id, item_type, item_id, old_min, old_max, new_min, new_max, changed_by)
    values (v_org, 'service', p_id, v_old.price_min, v_old.price_max, p_min, v_max, app.uid());
  end if;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
  values (app.uid(), 'catalog.service_updated', 'service', p_id::text,
          jsonb_build_object('before', to_jsonb(v_old) - 'organization_id',
                             'after', jsonb_build_object('name', p_name, 'min', p_min, 'max', v_max, 'active', p_active)));
  return p_id;
end $$;

create or replace function app.catalog_save_combo(
  p_id uuid, p_name text, p_group text, p_price bigint, p_active boolean, p_service_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_org uuid := app._require_catalog_manage();
  v_old combos;
  v_id uuid;
begin
  if p_id is null then
    if coalesce(array_length(p_service_ids, 1), 0) < 2 then
      raise exception 'Combo cần ít nhất 2 dịch vụ.' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(p_service_ids) s(id)
               where not exists (select 1 from services x
                                 where x.id = s.id and x.organization_id = v_org and x.deleted_at is null)) then
      raise exception 'Dịch vụ trong combo không có trong danh mục.' using errcode = 'P0001';
    end if;
    insert into combos (organization_id, code, name, group_name, price, is_active, sort_order, updated_by)
    select v_org,
           'CBX' || lpad((coalesce(max(substring(code from 4)::int) filter (where code ~ '^CBX[0-9]{1,8}$'), 0) + 1)::text, 2, '0'),
           btrim(p_name), btrim(p_group), p_price, p_active, coalesce(max(sort_order), 0) + 10, app.uid()
    from combos where organization_id = v_org
    returning id into v_id;
    insert into combo_items (combo_id, service_id, position)
    select v_id, s.id, s.ord from unnest(p_service_ids) with ordinality as s(id, ord);
    insert into catalog_price_history (organization_id, item_type, item_id, old_min, old_max, new_min, new_max, changed_by)
    values (v_org, 'combo', v_id, null, null, p_price, p_price, app.uid());
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
    values (app.uid(), 'catalog.combo_created', 'combo', v_id::text, jsonb_build_object('name', p_name, 'price', p_price));
    return v_id;
  end if;

  select * into v_old from combos where id = p_id and organization_id = v_org and deleted_at is null for update;
  if not found then
    raise exception 'Không tìm thấy combo.' using errcode = '22P02';
  end if;
  update combos set name = btrim(p_name), group_name = btrim(p_group), price = p_price, is_active = p_active,
                    updated_at = now(), updated_by = app.uid()
  where id = p_id;
  if v_old.price <> p_price then
    insert into catalog_price_history (organization_id, item_type, item_id, old_min, old_max, new_min, new_max, changed_by)
    values (v_org, 'combo', p_id, v_old.price, v_old.price, p_price, p_price, app.uid());
  end if;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, details)
  values (app.uid(), 'catalog.combo_updated', 'combo', p_id::text,
          jsonb_build_object('before', to_jsonb(v_old) - 'organization_id',
                             'after', jsonb_build_object('name', p_name, 'price', p_price, 'active', p_active)));
  return p_id;
end $$;
