-- 0015 — Ảnh chứng từ (Đợt 3B-2, bước 3.19; PRD v1.1 §7.3 "chứng từ ảnh/tệp"; test 5; kế hoạch Đợt 3 mục 7.5, 16.3).
-- - Ảnh JPEG/PNG ≤ 1MB (máy thu nhỏ trước khi gửi), lưu trong DB để sao lưu cùng dữ liệu, không cần khoá bí mật.
-- - Gắn vào phiếu chi, phiếu hoàn, phiếu Linh lập; tối đa 3 ảnh mỗi phiếu. Ai xem được phiếu thì xem được ảnh [P56].
-- - Không sửa; gỡ là đánh dấu (người gửi hoặc Linh). Không xoá.

create table attachments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  owner_type text not null check (owner_type in ('expense', 'refund', 'voucher')),
  owner_id uuid not null,
  mime text not null check (mime in ('image/jpeg', 'image/png')),
  size int not null check (size between 1 and 1048576),
  sha256 text not null check (char_length(sha256) = 64),
  data bytea not null,
  uploaded_by uuid not null references users(id),
  uploaded_at timestamptz not null default now(),
  removed_by uuid references users(id),
  removed_at timestamptz,
  check (octet_length(data) = size),
  -- Kiểm byte đầu file đúng loại ảnh khai báo (không tin content-type máy gửi)
  check ((mime = 'image/jpeg' and substring(data from 1 for 3) = '\xffd8ff'::bytea)
         or (mime = 'image/png' and substring(data from 1 for 8) = '\x89504e470d0a1a0a'::bytea))
);
create index attachments_owner_idx on attachments(owner_type, owner_id) where removed_at is null;

create trigger attachments_no_delete before delete on attachments
  for each row execute function app.forbid_mutation();
create trigger attachments_no_truncate before truncate on attachments
  for each statement execute function app.forbid_mutation();

-- Cơ sở của phiếu gốc và người đang thao tác có xem được phiếu đó không
create function app.attachment_owner_branch(p_type text, p_owner uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, public as $$
  select case p_type
    when 'expense' then (select branch_id from expense_requests where id = p_owner)
    when 'refund' then (select branch_id from order_refunds where id = p_owner)
    when 'voucher' then (select branch_id from cash_vouchers where id = p_owner)
  end
$$;

create function app.attachment_can_view(p_type text, p_owner uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select case p_type
    when 'expense' then exists (select 1 from expense_requests e where e.id = p_owner and app.has_branch(e.branch_id)
                                and (app.expense_reader(e.branch_id) or e.requested_by = app.uid()))
    when 'refund' then exists (select 1 from order_refunds r where r.id = p_owner and app.order_visible(r.order_id))
    when 'voucher' then exists (select 1 from cash_vouchers v where v.id = p_owner
                                and app.has_perm(v.branch_id, 'money_accounts.read_balance'))
    else false
  end
$$;

-- Ai gắn được ảnh: phiếu chi — người đề nghị, Nhung, Linh; phiếu hoàn — người hoàn được (order.refund);
-- phiếu Linh lập — Linh (cashbook.owner)
create function app.attachment_can_add(p_type text, p_owner uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select case p_type
    when 'expense' then exists (select 1 from expense_requests e where e.id = p_owner and app.has_branch(e.branch_id)
                                and (app.expense_reader(e.branch_id) or e.requested_by = app.uid()))
    when 'refund' then exists (select 1 from order_refunds r where r.id = p_owner
                               and app.has_perm(r.branch_id, 'order.refund'))
    when 'voucher' then exists (select 1 from cash_vouchers v where v.id = p_owner
                                and app.has_perm(v.branch_id, 'cashbook.owner'))
    else false
  end
$$;

create function app.attachment_add(p_type text, p_owner uuid, p_mime text, p_data bytea) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_id uuid;
begin
  if v_uid is null or not app.attachment_can_add(p_type, p_owner) then
    raise exception 'Không gắn được ảnh vào phiếu này.' using errcode = '42501';
  end if;
  perform 1 from users where id = v_uid for update;   -- gửi song song nhiều ảnh: đếm đúng giới hạn
  if (select count(*) from attachments where owner_type = p_type and owner_id = p_owner and removed_at is null) >= 3 then
    raise exception 'Mỗi phiếu tối đa 3 ảnh.' using errcode = 'P0001';
  end if;
  if octet_length(p_data) > 1048576 then
    raise exception 'Ảnh quá 1MB.' using errcode = 'P0001';
  end if;
  insert into attachments (branch_id, owner_type, owner_id, mime, size, sha256, data, uploaded_by)
  values (app.attachment_owner_branch(p_type, p_owner), p_type, p_owner, p_mime, octet_length(p_data),
          encode(sha256(p_data), 'hex'), p_data, v_uid)
  returning id into v_id;
  return v_id;
end $$;

create function app.attachment_remove(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  a attachments;
begin
  select * into a from attachments where id = p_id for update;
  if a.id is null or a.removed_at is not null or app.uid() is null
     or not app.attachment_can_view(a.owner_type, a.owner_id)
     or not (a.uploaded_by = app.uid() or app.has_perm(a.branch_id, 'review_queue.read')) then
    raise exception 'Chỉ người gửi ảnh hoặc chủ quán gỡ được ảnh.' using errcode = '42501';
  end if;
  update attachments set removed_by = app.uid(), removed_at = now() where id = p_id;
end $$;

-- ---------------------------------------------------------------- Quyền bảng và RLS

alter table attachments enable row level security;
grant select on attachments to app_user;
create policy attachments_read on attachments for select to app_user
  using (removed_at is null and app.attachment_can_view(owner_type, owner_id));

grant execute on function app.attachment_can_view(text, uuid) to app_user;
grant execute on function app.attachment_can_add(text, uuid) to app_user;
grant execute on function app.attachment_add(text, uuid, text, bytea) to app_user;
grant execute on function app.attachment_remove(uuid) to app_user;
