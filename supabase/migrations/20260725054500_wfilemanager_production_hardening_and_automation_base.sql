-- Production hardening and backward-compatible automation foundations.

alter table public.wfilemanager_pro_activation_tokens enable row level security;
alter table public.wfilemanager_backup_snapshots enable row level security;
alter table public.wfilemanager_instance_credentials enable row level security;

revoke all on table public.wfilemanager_pro_activation_tokens from anon, authenticated;
revoke all on table public.wfilemanager_backup_snapshots from anon, authenticated;
revoke all on table public.wfilemanager_instance_credentials from anon, authenticated;

alter function public.wfilemanager_set_updated_at() set search_path = public;

create index if not exists wfilemanager_audit_logs_user_id_idx
  on public.wfilemanager_audit_logs(user_id);
create index if not exists wfilemanager_path_rules_instance_id_idx
  on public.wfilemanager_path_rules(instance_id);
create index if not exists wfilemanager_activation_tokens_claimed_instance_idx
  on public.wfilemanager_pro_activation_tokens(claimed_by_instance_id);
create index if not exists wfilemanager_pro_orders_activation_token_idx
  on public.wfilemanager_pro_orders(activation_token_id);
create index if not exists wfilemanager_pro_orders_wallet_transaction_idx
  on public.wfilemanager_pro_orders(wallet_transaction_id);
create index if not exists wfilemanager_sessions_instance_id_idx
  on public.wfilemanager_sessions(instance_id);
create index if not exists wfilemanager_settings_updated_by_idx
  on public.wfilemanager_settings(updated_by);

drop index if exists public.wfilemanager_wallet_transactions_idempotency_idx;

alter table public.wfilemanager_customer_accounts
  alter column auto_renew_default set default false;
alter table public.wfilemanager_instances
  alter column auto_renew set default false;

alter table public.wfilemanager_pro_subscription_config
  add column if not exists automation_secret_hash text;

alter table public.wfilemanager_pro_orders
  add column if not exists reconciliation_attempts integer not null default 0,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists next_reconcile_at timestamptz not null default now(),
  add column if not exists reconciliation_error text;

alter table public.wfilemanager_wallet_topups
  add column if not exists reconciliation_attempts integer not null default 0,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists next_reconcile_at timestamptz not null default now(),
  add column if not exists reconciliation_error text;

create index if not exists wfilemanager_orders_reconciliation_due_idx
  on public.wfilemanager_pro_orders(next_reconcile_at, created_at)
  where status in ('pending','payment_pending','paid','email_failed');
create index if not exists wfilemanager_topups_reconciliation_due_idx
  on public.wfilemanager_wallet_topups(next_reconcile_at, created_at)
  where status in ('pending','payment_pending','paid');

create table if not exists public.wfilemanager_auth_rate_limits (
  scope text not null,
  identifier_hash text not null,
  ip_address text not null default '',
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  blocked_until timestamptz,
  primary key (scope, identifier_hash, ip_address)
);
alter table public.wfilemanager_auth_rate_limits enable row level security;
revoke all on table public.wfilemanager_auth_rate_limits from anon, authenticated;

create or replace function public.wfilemanager_auth_rate_check(
  p_scope text,
  p_identifier_hash text,
  p_ip_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wfilemanager_auth_rate_limits%rowtype;
  v_retry integer := 0;
begin
  select * into v_row
  from public.wfilemanager_auth_rate_limits
  where scope = p_scope
    and identifier_hash = p_identifier_hash
    and ip_address = coalesce(p_ip_address, '');

  if not found then
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.blocked_until - now())))::integer);
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry);
  end if;

  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;

create or replace function public.wfilemanager_auth_rate_record(
  p_scope text,
  p_identifier_hash text,
  p_ip_address text,
  p_success boolean,
  p_limit integer default 5,
  p_window_minutes integer default 15,
  p_block_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_ip text := coalesce(p_ip_address, '');
  v_count integer;
  v_blocked_until timestamptz;
begin
  if p_success then
    delete from public.wfilemanager_auth_rate_limits
    where scope = p_scope and identifier_hash = p_identifier_hash and ip_address = v_ip;
    return jsonb_build_object('allowed', true, 'failedAttempts', 0, 'retryAfterSeconds', 0);
  end if;

  insert into public.wfilemanager_auth_rate_limits(
    scope, identifier_hash, ip_address, failed_attempts,
    window_started_at, last_attempt_at, blocked_until
  )
  values (p_scope, p_identifier_hash, v_ip, 1, v_now, v_now, null)
  on conflict (scope, identifier_hash, ip_address)
  do update set
    failed_attempts = case
      when public.wfilemanager_auth_rate_limits.window_started_at < v_now - make_interval(mins => greatest(1, p_window_minutes))
        then 1
      else public.wfilemanager_auth_rate_limits.failed_attempts + 1
    end,
    window_started_at = case
      when public.wfilemanager_auth_rate_limits.window_started_at < v_now - make_interval(mins => greatest(1, p_window_minutes))
        then v_now
      else public.wfilemanager_auth_rate_limits.window_started_at
    end,
    last_attempt_at = v_now,
    blocked_until = case
      when (
        case
          when public.wfilemanager_auth_rate_limits.window_started_at < v_now - make_interval(mins => greatest(1, p_window_minutes))
            then 1
          else public.wfilemanager_auth_rate_limits.failed_attempts + 1
        end
      ) >= greatest(2, p_limit)
        then v_now + make_interval(mins => greatest(1, p_block_minutes))
      else null
    end
  returning failed_attempts, blocked_until into v_count, v_blocked_until;

  return jsonb_build_object(
    'allowed', v_blocked_until is null or v_blocked_until <= v_now,
    'failedAttempts', v_count,
    'retryAfterSeconds', case
      when v_blocked_until is not null and v_blocked_until > v_now
        then greatest(1, ceil(extract(epoch from (v_blocked_until - v_now)))::integer)
      else 0
    end
  );
end;
$$;

revoke all on function public.wfilemanager_auth_rate_check(text,text,text) from public, anon, authenticated;
revoke all on function public.wfilemanager_auth_rate_record(text,text,text,boolean,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.wfilemanager_auth_rate_check(text,text,text) to service_role;
grant execute on function public.wfilemanager_auth_rate_record(text,text,text,boolean,integer,integer,integer) to service_role;

alter table public.wfilemanager_backup_snapshots
  add column if not exists verified_at timestamptz,
  add column if not exists verification_error text,
  add column if not exists restored_at timestamptz,
  add column if not exists restore_error text;

create index if not exists wfilemanager_backup_snapshots_instance_created_idx
  on public.wfilemanager_backup_snapshots(instance_id, created_at desc);
create index if not exists wfilemanager_backup_snapshots_retention_idx
  on public.wfilemanager_backup_snapshots(retention_until)
  where retention_until is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wfilemanager-backups',
  'wfilemanager-backups',
  false,
  52428800,
  array['application/json','application/gzip','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.wfilemanager_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid not null references public.wfilemanager_customer_accounts(id) on delete restrict,
  order_id uuid references public.wfilemanager_pro_orders(id) on delete set null,
  topup_id uuid references public.wfilemanager_wallet_topups(id) on delete set null,
  invoice_type text not null check (invoice_type in ('licence','renewal','topup','storage','refund','credit_note')),
  status text not null default 'issued' check (status in ('draft','issued','paid','void','refunded')),
  currency text not null default 'USD' check (currency = 'USD'),
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  issued_at timestamptz not null default now(),
  pdf_storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wfilemanager_invoices enable row level security;
revoke all on table public.wfilemanager_invoices from anon, authenticated;
create index if not exists wfilemanager_invoices_customer_issued_idx
  on public.wfilemanager_invoices(customer_id, issued_at desc);
create index if not exists wfilemanager_invoices_order_idx
  on public.wfilemanager_invoices(order_id) where order_id is not null;
create index if not exists wfilemanager_invoices_topup_idx
  on public.wfilemanager_invoices(topup_id) where topup_id is not null;

create or replace function public.wfilemanager_setup_pro_instance(
  p_activation_token_hash text,
  p_instance_key text,
  p_instance_name text,
  p_hostname text,
  p_base_url text,
  p_username text,
  p_email text,
  p_display_name text,
  p_password_hash text,
  p_password_salt text,
  p_password_iterations integer,
  p_root_reset_token_hash text,
  p_instance_secret_hash text,
  p_ip_address text,
  p_user_agent text,
  p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_instance public.wfilemanager_instances%rowtype;
  v_token public.wfilemanager_pro_activation_tokens%rowtype;
  v_instance_id uuid;
  v_role_id uuid;
  v_user public.wfilemanager_users%rowtype;
  v_paid_until timestamptz;
  v_quota bigint;
  v_customer_auto_renew boolean := false;
  v_claimed_id uuid;
begin
  if coalesce(btrim(p_instance_key), '') = '' then
    raise exception using message = 'installation_identity_missing', errcode = 'P0001';
  end if;

  select * into v_instance
  from public.wfilemanager_instances
  where instance_key = p_instance_key
  for update;

  if found then
    if v_instance.status = 'frozen' then
      raise exception using message = 'installation_frozen', errcode = 'P0001';
    end if;
    if v_instance.subscription_status = 'suspended' or v_instance.data_status = 'suspended' then
      raise exception using message = 'subscription_suspended', errcode = 'P0001';
    end if;
    if v_instance.data_status = 'deleted' or v_instance.subscription_status = 'expired' then
      raise exception using message = 'managed_account_deleted', errcode = 'P0001';
    end if;
    if v_instance.status = 'disabled' then
      raise exception using message = 'installation_disabled', errcode = 'P0001';
    end if;
    if exists (select 1 from public.wfilemanager_users where instance_id = v_instance.id) then
      raise exception using message = 'already_configured', errcode = 'P0001';
    end if;
  end if;

  if v_instance.id is null or v_instance.paid_until is null then
    if coalesce(p_activation_token_hash, '') = '' then
      raise exception using message = 'licence_required', errcode = 'P0001';
    end if;

    select * into v_token
    from public.wfilemanager_pro_activation_tokens
    where token_hash = p_activation_token_hash
    for update;

    if not found or v_token.status <> 'available' then
      raise exception using message = 'licence_invalid', errcode = 'P0001';
    end if;
    if v_token.instance_key is not null and v_token.instance_key <> p_instance_key then
      raise exception using message = 'licence_wrong_instance', errcode = 'P0001';
    end if;
    if v_token.expires_at is not null and v_token.expires_at < v_now then
      raise exception using message = 'licence_expired', errcode = 'P0001';
    end if;

    v_paid_until := v_now + make_interval(days => greatest(1, v_token.period_days));
    v_quota := greatest(1, v_token.storage_quota_bytes);
  else
    v_paid_until := v_instance.paid_until;
    v_quota := v_instance.storage_quota_bytes;
  end if;

  if v_token.customer_id is not null then
    select auto_renew_default into v_customer_auto_renew
    from public.wfilemanager_customer_accounts
    where id = v_token.customer_id;
    v_customer_auto_renew := coalesce(v_customer_auto_renew, false);
  end if;

  if v_instance.id is null then
    v_instance_id := gen_random_uuid();
    insert into public.wfilemanager_instances(
      id, instance_key, name, hostname, base_url, status,
      service_plan, subscription_status, data_status,
      paid_until, storage_quota_bytes, activated_at, last_seen_at,
      billing_customer_id, auto_renew
    )
    values (
      v_instance_id, p_instance_key, coalesce(nullif(btrim(p_instance_name), ''), 'wFileManager'),
      nullif(btrim(p_hostname), ''), nullif(btrim(p_base_url), ''), 'active',
      'pro', 'active', 'active',
      v_paid_until, v_quota, v_now, v_now,
      v_token.customer_id, v_customer_auto_renew
    )
    returning * into v_instance;
  else
    update public.wfilemanager_instances
    set hostname = coalesce(nullif(btrim(p_hostname), ''), hostname),
        base_url = coalesce(nullif(btrim(p_base_url), ''), base_url),
        status = 'active',
        subscription_status = 'active',
        data_status = 'active',
        paid_until = v_paid_until,
        storage_quota_bytes = v_quota,
        activated_at = coalesce(activated_at, v_now),
        past_due_at = null,
        suspended_at = null,
        frozen_at = null,
        delete_after_at = null,
        billing_customer_id = coalesce(v_token.customer_id, billing_customer_id),
        auto_renew = case when v_token.customer_id is not null then v_customer_auto_renew else auto_renew end,
        updated_at = v_now,
        last_seen_at = v_now
    where id = v_instance.id
    returning * into v_instance;
    v_instance_id := v_instance.id;
  end if;

  if v_token.id is not null then
    update public.wfilemanager_pro_activation_tokens
    set status = 'claimed',
        instance_key = p_instance_key,
        claimed_by_instance_id = v_instance_id,
        claimed_at = v_now,
        updated_at = v_now
    where id = v_token.id
      and status = 'available'
    returning id into v_claimed_id;

    if v_claimed_id is null then
      raise exception using message = 'licence_already_claimed', errcode = 'P0001';
    end if;
  end if;

  insert into public.wfilemanager_roles(
    instance_id, name, description, permissions, is_system, updated_at
  )
  values (
    v_instance_id, 'Administrator', 'Full access',
    coalesce(p_permissions, '[]'::jsonb), true, v_now
  )
  on conflict (instance_id, name)
  do update set
    description = excluded.description,
    permissions = excluded.permissions,
    is_system = true,
    updated_at = v_now
  returning id into v_role_id;

  insert into public.wfilemanager_users(
    instance_id, role_id, username, email, display_name,
    password_hash, password_salt, password_iterations,
    is_admin, status, must_change_password, timezone
  )
  values (
    v_instance_id, v_role_id, lower(btrim(p_username)),
    nullif(lower(btrim(p_email)), ''), btrim(p_display_name),
    p_password_hash, p_password_salt, p_password_iterations,
    true, 'active', false, 'UTC'
  )
  returning * into v_user;

  insert into public.wfilemanager_path_rules(
    instance_id, user_id, path, access_mode, recursive
  )
  values (v_instance_id, v_user.id, '/', 'allow', true);

  insert into public.wfilemanager_root_reset_tokens(instance_id, token_hash, updated_at)
  values (v_instance_id, p_root_reset_token_hash, v_now)
  on conflict (instance_id)
  do update set token_hash = excluded.token_hash, updated_at = excluded.updated_at;

  if coalesce(p_instance_secret_hash, '') <> '' then
    insert into public.wfilemanager_instance_credentials(
      instance_id, credential_type, secret_hash, last_used_at, revoked_at, updated_at
    )
    values (v_instance_id, 'heartbeat', p_instance_secret_hash, null, null, v_now)
    on conflict (instance_id, credential_type)
    do update set
      secret_hash = excluded.secret_hash,
      last_used_at = null,
      revoked_at = null,
      updated_at = excluded.updated_at;
  end if;

  insert into public.wfilemanager_audit_logs(
    instance_id, user_id, username, action, target, result, metadata,
    ip_address, user_agent
  )
  values (
    v_instance_id, v_user.id, v_user.username,
    'instance.setup', p_instance_key, 'success',
    jsonb_build_object(
      'password_policy', 'admin_v3',
      'recovery_key_enrolled', true,
      'heartbeat_secret_enrolled', coalesce(p_instance_secret_hash, '') <> '',
      'paid_activation_claimed', v_token.id is not null,
      'paid_until', v_paid_until,
      'atomic_setup', true
    ),
    case when coalesce(p_ip_address, '') ~ '^[0-9a-fA-F:.]+$' then p_ip_address::inet else null end, p_user_agent
  );

  return jsonb_build_object(
    'success', true,
    'paidUntil', v_paid_until,
    'instanceId', v_instance_id,
    'user', jsonb_build_object(
      'id', v_user.id,
      'instanceId', v_user.instance_id,
      'roleId', v_user.role_id,
      'username', v_user.username,
      'email', v_user.email,
      'displayName', v_user.display_name,
      'status', v_user.status,
      'isAdmin', v_user.is_admin,
      'mustChangePassword', v_user.must_change_password,
      'lastLoginAt', v_user.last_login_at,
      'createdAt', v_user.created_at
    )
  );
end;
$$;

revoke all on function public.wfilemanager_setup_pro_instance(
  text,text,text,text,text,text,text,text,text,text,integer,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.wfilemanager_setup_pro_instance(
  text,text,text,text,text,text,text,text,text,text,integer,text,text,text,text,jsonb
) to service_role;

create or replace function public.wfilemanager_cleanup_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_sessions integer := 0;
  v_app_sessions integer := 0;
  v_rate_limits integer := 0;
  v_reminders integer := 0;
  v_notifications integer := 0;
begin
  with removed as (
    delete from public.wfilemanager_customer_sessions
    where (expires_at < now() - interval '7 days')
       or (revoked_at is not null and revoked_at < now() - interval '7 days')
    returning 1
  ) select count(*) into v_customer_sessions from removed;

  with removed as (
    delete from public.wfilemanager_sessions
    where (expires_at < now() - interval '7 days')
       or (revoked_at is not null and revoked_at < now() - interval '7 days')
    returning 1
  ) select count(*) into v_app_sessions from removed;

  with removed as (
    delete from public.wfilemanager_auth_rate_limits
    where last_attempt_at < now() - interval '24 hours'
      and (blocked_until is null or blocked_until < now())
    returning 1
  ) select count(*) into v_rate_limits from removed;

  with removed as (
    delete from public.wfilemanager_billing_reminders
    where sent_at < now() - interval '18 months'
    returning 1
  ) select count(*) into v_reminders from removed;

  with removed as (
    delete from public.wfilemanager_notifications
    where expires_at is not null and expires_at < now() - interval '30 days'
    returning 1
  ) select count(*) into v_notifications from removed;

  return jsonb_build_object(
    'customerSessions', v_customer_sessions,
    'applicationSessions', v_app_sessions,
    'rateLimits', v_rate_limits,
    'billingReminders', v_reminders,
    'notifications', v_notifications,
    'processedAt', now()
  );
end;
$$;

revoke all on function public.wfilemanager_cleanup_operational_data() from public, anon, authenticated;
grant execute on function public.wfilemanager_cleanup_operational_data() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wfilemanager-operational-cleanup') then
    perform cron.unschedule('wfilemanager-operational-cleanup');
  end if;
  perform cron.schedule(
    'wfilemanager-operational-cleanup',
    '15 3 * * *',
    'select public.wfilemanager_cleanup_operational_data();'
  );
end;
$$;
