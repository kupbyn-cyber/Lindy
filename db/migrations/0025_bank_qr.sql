-- 0025 — Tài khoản nhận chuyển khoản cho QR VietQR (S23–S26). Linh (cashbook.owner) nhập ngân hàng, số tài khoản,
-- tên chủ tài khoản cho tài khoản ngân hàng của cơ sở; app vẽ QR có sẵn số tiền ở hộp ghi tiền thu của đơn.
-- Đổi số tài khoản là đổi nơi khách chuyển tiền: app_user không UPDATE được bảng, chỉ sửa qua hàm dưới đây
-- (kiểm quyền trong DB, ghi nhật ký trước / sau). Chưa nhập thì để trống, app không hiện QR.

alter table money_accounts
  add column bank_bin text check (bank_bin ~ '^[0-9]{6}$'),
  add column bank_account_no text check (bank_account_no ~ '^[0-9A-Z]{4,19}$'),
  add column bank_account_name text check (char_length(btrim(bank_account_name)) between 1 and 60),
  add constraint money_accounts_bank_info_ck check (
    (bank_bin is null and bank_account_no is null and bank_account_name is null)
    or (type = 'bank' and bank_bin is not null and bank_account_no is not null and bank_account_name is not null)
  );

-- Lưu thông tin nhận chuyển khoản của tài khoản ngân hàng đang dùng ở cơ sở (tài khoản mà tiền thu chuyển khoản vào)
create function app.bank_account_save(p_branch uuid, p_bin text, p_no text, p_name text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_old money_accounts%rowtype;
  v_no text := upper(regexp_replace(coalesce(p_no, ''), '\s', '', 'g'));
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null or not app.has_perm(p_branch, 'cashbook.owner') then
    raise exception 'Chỉ chủ quán sửa tài khoản nhận chuyển khoản.' using errcode = '42501';
  end if;
  if coalesce(p_bin, '') !~ '^[0-9]{6}$' then
    raise exception 'Chọn ngân hàng.' using errcode = 'P0001';
  end if;
  if v_no !~ '^[0-9A-Z]{4,19}$' then
    raise exception 'Số tài khoản gồm 4–19 chữ số hoặc chữ cái, không dấu.' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Nhập tên chủ tài khoản (tối đa 60 ký tự).' using errcode = 'P0001';
  end if;
  select * into v_old from money_accounts
  where branch_id = p_branch and type = 'bank' and is_active order by code limit 1 for update;
  if not found then
    raise exception 'Cơ sở chưa có tài khoản ngân hàng.' using errcode = 'P0001';
  end if;
  update money_accounts set bank_bin = p_bin, bank_account_no = v_no, bank_account_name = v_name
  where id = v_old.id;
  insert into audit_logs (actor_user_id, branch_id, action, entity_type, entity_id, details)
  values (v_uid, p_branch, 'money_account.bank_saved', 'money_account', v_old.id::text,
          jsonb_build_object(
            'before', case when v_old.bank_bin is null then null
                           else jsonb_build_object('bin', v_old.bank_bin, 'accountNo', v_old.bank_account_no,
                                                   'accountName', v_old.bank_account_name) end,
            'after', jsonb_build_object('bin', p_bin, 'accountNo', v_no, 'accountName', v_name)));
end $$;
grant execute on function app.bank_account_save(uuid, text, text, text) to app_user;
