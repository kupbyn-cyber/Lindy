-- 0036 — MCP cho Claude/ChatGPT (kế hoạch docs/vibe/mcp/plan.md, anh duyệt 10/11/2026).
-- - OAuth 2.1 + PKCE, đăng ký client động: client, grant (một lần đồng ý), mã đăng nhập, token. Chỉ lưu SHA-256 của mã và token.
-- - Intent ghi: tool xem trước lưu bản đã chuẩn hoá + mã dùng một lần; tool thực hiện chỉ nhận mã, chạy đúng một lần.
-- - Chỉ role app_worker chạm các bảng này (như sessions); app_user không thấy. Không xoá dòng, chỉ đánh dấu thu hồi.
-- - Bản sao lưu bỏ qua các bảng MCP (có token_hash).

create table mcp_oauth_clients (
  client_id uuid primary key default gen_random_uuid(),
  client_name text check (char_length(client_name) <= 200),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  client_label text not null default 'other' check (client_label in ('claude', 'chatgpt', 'other')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  client_id uuid not null references mcp_oauth_clients(client_id),
  scope text[] not null check (cardinality(scope) between 1 and 10),
  resource text not null check (char_length(resource) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (char_length(revoked_reason) <= 100)
);
create index mcp_oauth_grants_user_idx on mcp_oauth_grants(user_id) where revoked_at is null;

create table mcp_oauth_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  grant_id uuid not null references mcp_oauth_grants(id),
  redirect_uri text not null check (char_length(redirect_uri) <= 2000),
  code_challenge text not null check (char_length(code_challenge) between 43 and 128),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  kind text not null check (kind in ('access', 'refresh')),
  grant_id uuid not null references mcp_oauth_grants(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index mcp_oauth_tokens_grant_idx on mcp_oauth_tokens(grant_id) where revoked_at is null;

create table mcp_write_intents (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  user_id uuid not null references users(id),
  grant_id uuid not null references mcp_oauth_grants(id),
  action_type text not null check (action_type ~ '^[a-z0-9_]{1,64}$'),
  payload jsonb not null,
  summary jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'executing', 'done', 'failed')),
  result jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  claimed_at timestamptz,
  finished_at timestamptz
);
create index mcp_write_intents_grant_idx on mcp_write_intents(grant_id, created_at);

-- Không xoá dòng (thu hồi bằng revoked_at / trạng thái)
create trigger mcp_oauth_clients_no_delete before delete on mcp_oauth_clients
  for each row execute function app.forbid_mutation();
create trigger mcp_oauth_grants_no_delete before delete on mcp_oauth_grants
  for each row execute function app.forbid_mutation();
create trigger mcp_oauth_codes_no_delete before delete on mcp_oauth_codes
  for each row execute function app.forbid_mutation();
create trigger mcp_oauth_tokens_no_delete before delete on mcp_oauth_tokens
  for each row execute function app.forbid_mutation();
create trigger mcp_write_intents_no_delete before delete on mcp_write_intents
  for each row execute function app.forbid_mutation();
create trigger mcp_oauth_clients_no_truncate before truncate on mcp_oauth_clients
  for each statement execute function app.forbid_mutation();
create trigger mcp_oauth_grants_no_truncate before truncate on mcp_oauth_grants
  for each statement execute function app.forbid_mutation();
create trigger mcp_oauth_codes_no_truncate before truncate on mcp_oauth_codes
  for each statement execute function app.forbid_mutation();
create trigger mcp_oauth_tokens_no_truncate before truncate on mcp_oauth_tokens
  for each statement execute function app.forbid_mutation();
create trigger mcp_write_intents_no_truncate before truncate on mcp_write_intents
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------- Quyền bảng và RLS
alter table mcp_oauth_clients enable row level security;
alter table mcp_oauth_grants enable row level security;
alter table mcp_oauth_codes enable row level security;
alter table mcp_oauth_tokens enable row level security;
alter table mcp_write_intents enable row level security;
grant select, insert, update on mcp_oauth_clients, mcp_oauth_grants, mcp_oauth_codes, mcp_oauth_tokens,
  mcp_write_intents to app_worker;
create policy mcp_oauth_clients_worker on mcp_oauth_clients for all to app_worker using (true) with check (true);
create policy mcp_oauth_grants_worker on mcp_oauth_grants for all to app_worker using (true) with check (true);
create policy mcp_oauth_codes_worker on mcp_oauth_codes for all to app_worker using (true) with check (true);
create policy mcp_oauth_tokens_worker on mcp_oauth_tokens for all to app_worker using (true) with check (true);
create policy mcp_write_intents_worker on mcp_write_intents for all to app_worker using (true) with check (true);

-- ---------------------------------------------------------------- Sao lưu: bỏ qua bảng MCP (có token_hash)
create or replace function app.backup_dump() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := app.uid();
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_version text;
  r record;
begin
  if v_uid is not null then
    if not exists (select 1 from user_branch_roles ubr join users u on u.id = ubr.user_id
                   join role_permissions rp on rp.role_id = ubr.role_id
                   where ubr.user_id = v_uid and ubr.revoked_at is null and u.is_active
                     and rp.permission_code = 'data.export') then
      raise exception 'Chỉ chủ quán tải bản sao lưu.' using errcode = '42501';
    end if;
  elsif session_user = 'lindy_app' then
    raise exception 'Thiếu danh tính người thao tác.' using errcode = '42501';
  end if;

  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('user_credentials', 'sessions', 'login_attempts', 'push_subscriptions',
                            'notification_deliveries', 'schema_migrations', 'attendance_photos',
                            'mcp_oauth_clients', 'mcp_oauth_grants', 'mcp_oauth_codes', 'mcp_oauth_tokens',
                            'mcp_write_intents')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', r.relname) into v_rows;
    v_tables := v_tables || jsonb_build_object(r.relname, v_rows);
    v_counts := v_counts || jsonb_build_object(r.relname, jsonb_array_length(v_rows));
  end loop;
  select max(version) into v_version from schema_migrations;

  insert into audit_logs (actor_user_id, actor_label, action, entity_type, details)
  values (v_uid, case when v_uid is null then 'script' end, 'backup.downloaded', 'organization',
          jsonb_build_object('migration', v_version, 'tables', (select count(*) from jsonb_object_keys(v_counts))));

  return jsonb_build_object(
    'format', 'lindy-backup-1',
    'migration', v_version,
    'exportedAt', now(),
    'summary', jsonb_build_object(
      'counts', v_counts,
      'balances', coalesce((select jsonb_object_agg(money_account_id, s) from (
                    select money_account_id, sum(amount) as s from money_ledger_entries group by money_account_id) b),
                  '{}'::jsonb),
      'revenueByMonth', coalesce((select jsonb_object_agg(m, s) from (
                    select to_char(service_date, 'YYYY-MM') as m, sum(net_amount) as s from orders
                    where status = 'confirmed' group by 1) x), '{}'::jsonb)),
    'tables', v_tables);
end $$;
