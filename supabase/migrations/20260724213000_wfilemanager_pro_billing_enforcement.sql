-- wFileManager Pro billing enforcement.
-- Pro installation now requires a paid activation token. Past-due Pro
-- instances are suspended after 7 days unpaid and permanently deleted after
-- 30 days unpaid. Offline heartbeat inactivity no longer freezes or deletes data.

alter table public.wfilemanager_instances
  add column if not exists paid_until timestamptz,
  add column if not exists past_due_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.wfilemanager_instances
  drop constraint if exists wfilemanager_instances_subscription_status_check,
  add constraint wfilemanager_instances_subscription_status_check
  check (subscription_status in ('active','trialing','past_due','suspended','cancelled','expired'));

alter table public.wfilemanager_instances
  drop constraint if exists wfilemanager_instances_data_status_check,
  add constraint wfilemanager_instances_data_status_check
  check (data_status in ('active','frozen','suspended','retention','pending_delete','deleted'));

create table if not exists public.wfilemanager_pro_activation_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  status text not null default 'available' check (status in ('available','claimed','revoked','expired')),
  period_days integer not null default 365 check (period_days > 0),
  storage_quota_bytes bigint not null default 104857600,
  customer_email text,
  order_reference text,
  instance_key text,
  claimed_by_instance_id uuid references public.wfilemanager_instances(id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wfilemanager_pro_activation_tokens_available_idx
  on public.wfilemanager_pro_activation_tokens (status, expires_at)
  where status = 'available';

create or replace function public.wfilemanager_delete_instance(p_instance_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.wfilemanager_instances where id = p_instance_id
  ) then
    return false;
  end if;

  update public.wfilemanager_instances
  set status = 'disabled',
      subscription_status = 'expired',
      data_status = 'deleted',
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = p_instance_id;

  delete from public.wfilemanager_notifications where instance_id = p_instance_id;
  delete from public.wfilemanager_path_rules where instance_id = p_instance_id;
  delete from public.wfilemanager_settings where instance_id = p_instance_id;
  delete from public.wfilemanager_audit_logs where instance_id = p_instance_id;
  delete from public.wfilemanager_sessions where instance_id = p_instance_id;
  delete from public.wfilemanager_users where instance_id = p_instance_id;
  delete from public.wfilemanager_roles where instance_id = p_instance_id;
  delete from public.wfilemanager_root_reset_tokens where instance_id = p_instance_id;
  delete from public.wfilemanager_instance_credentials where instance_id = p_instance_id;
  delete from public.wfilemanager_backup_snapshots where instance_id = p_instance_id;
  delete from public.wfilemanager_instances where id = p_instance_id;

  return true;
end;
$$;

revoke all on function public.wfilemanager_delete_instance(uuid) from public, anon, authenticated;
grant execute on function public.wfilemanager_delete_instance(uuid) to service_role;

create or replace function public.wfilemanager_apply_instance_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  grace_started integer := 0;
  suspended_ids uuid[] := array[]::uuid[];
  suspended_count integer := 0;
  deleted_count integer := 0;
  candidate record;
begin
  -- Due date passed: start the unpaid grace period, but keep the instance usable.
  with started as (
    update public.wfilemanager_instances
    set subscription_status = 'past_due',
        past_due_at = coalesce(past_due_at, paid_until, now()),
        delete_after_at = coalesce(delete_after_at, coalesce(past_due_at, paid_until, now()) + interval '30 days'),
        updated_at = now()
    where service_plan = 'pro'
      and subscription_status in ('active','trialing')
      and paid_until is not null
      and paid_until < now()
    returning id
  )
  select count(*) into grace_started from started;

  -- More than 7 days unpaid: suspend access and revoke sessions.
  with newly_suspended as (
    update public.wfilemanager_instances
    set status = 'disabled',
        subscription_status = 'suspended',
        data_status = 'suspended',
        suspended_at = coalesce(suspended_at, now()),
        delete_after_at = coalesce(delete_after_at, coalesce(past_due_at, now()) + interval '30 days'),
        updated_at = now()
    where service_plan = 'pro'
      and subscription_status = 'past_due'
      and coalesce(past_due_at, paid_until, now()) <= now() - interval '7 days'
      and data_status <> 'deleted'
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into suspended_ids from newly_suspended;

  suspended_count := coalesce(cardinality(suspended_ids), 0);

  if suspended_count > 0 then
    update public.wfilemanager_sessions
    set revoked_at = coalesce(revoked_at, now())
    where instance_id = any(suspended_ids)
      and revoked_at is null;
  end if;

  -- 30 days unpaid: delete managed application records and the instance account.
  for candidate in
    select id
    from public.wfilemanager_instances
    where service_plan = 'pro'
      and data_status <> 'deleted'
      and coalesce(past_due_at, paid_until, now()) <= now() - interval '30 days'
  loop
    if public.wfilemanager_delete_instance(candidate.id) then
      deleted_count := deleted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'graceStarted', grace_started,
    'suspended', suspended_count,
    'deleted', deleted_count,
    'policy', 'pro-payment-7-day-suspend-30-day-delete',
    'processedAt', now()
  );
end;
$$;

revoke all on function public.wfilemanager_apply_instance_lifecycle() from public, anon, authenticated;
grant execute on function public.wfilemanager_apply_instance_lifecycle() to service_role;

comment on table public.wfilemanager_pro_activation_tokens is
  'One-time Pro activation tokens created after payment. New Pro setup must claim a valid token.';
comment on column public.wfilemanager_instances.paid_until is
  'Paid-through date for the Pro subscription. Passing this date starts the unpaid grace period.';
comment on column public.wfilemanager_instances.past_due_at is
  'Timestamp when payment became overdue. More than 7 days unpaid suspends access; more than 30 days deletes Pro managed application records.';
comment on column public.wfilemanager_instances.delete_after_at is
  'Billing-driven deletion deadline for unpaid Pro instances, normally 30 days after past_due_at.';
