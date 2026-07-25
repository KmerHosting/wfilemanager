alter table public.wfilemanager_billing_reminders
  drop constraint if exists wfilemanager_billing_reminders_reminder_kind_check;
alter table public.wfilemanager_billing_reminders
  add constraint wfilemanager_billing_reminders_reminder_kind_check
  check (reminder_kind in (
    'renewal_14d','renewal_7d','renewal_1d','past_due','suspended',
    'auto_renew_insufficient','auto_renew_success',
    'deletion_7d','deletion_1d','activation_7d','activation_21d'
  ));

create table if not exists public.wfilemanager_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null check (event_type in ('delete_instance','instance_deleted')),
  instance_id uuid,
  instance_key text not null,
  customer_id uuid,
  customer_email text,
  customer_name text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.wfilemanager_lifecycle_events enable row level security;
revoke all on table public.wfilemanager_lifecycle_events from anon, authenticated;
create index if not exists wfilemanager_lifecycle_events_due_idx
  on public.wfilemanager_lifecycle_events(next_attempt_at, created_at)
  where status in ('pending','failed');

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
  deletion_queued integer := 0;
begin
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

  with candidates as (
    select
      i.id,
      i.instance_key,
      i.billing_customer_id,
      coalesce(a.email, t.customer_email) as customer_email,
      coalesce(a.full_name, 'Customer') as customer_name,
      coalesce(i.delete_after_at, coalesce(i.past_due_at, i.paid_until, now()) + interval '30 days') as delete_at
    from public.wfilemanager_instances i
    left join public.wfilemanager_customer_accounts a on a.id = i.billing_customer_id
    left join lateral (
      select customer_email
      from public.wfilemanager_pro_activation_tokens pat
      where pat.claimed_by_instance_id = i.id
      order by pat.claimed_at desc nulls last
      limit 1
    ) t on true
    where i.service_plan = 'pro'
      and i.data_status not in ('deleted','pending_delete')
      and coalesce(i.past_due_at, i.paid_until, now()) <= now() - interval '30 days'
  ),
  queued as (
    insert into public.wfilemanager_lifecycle_events(
      idempotency_key,event_type,instance_id,instance_key,customer_id,
      customer_email,customer_name,status,next_attempt_at,metadata
    )
    select
      'delete-instance:' || c.instance_key || ':' || to_char(c.delete_at at time zone 'UTC','YYYYMMDDHH24MISS'),
      'delete_instance',c.id,c.instance_key,c.billing_customer_id,
      c.customer_email,c.customer_name,'pending',now(),
      jsonb_build_object('delete_after_at',c.delete_at,'reason','unpaid_30_days')
    from candidates c
    on conflict (idempotency_key) do nothing
    returning instance_id
  ),
  marked as (
    update public.wfilemanager_instances i
    set status='disabled',
        subscription_status='expired',
        data_status='pending_delete',
        updated_at=now()
    where i.id in (select instance_id from queued)
    returning i.id
  )
  select count(*) into deletion_queued from marked;

  return jsonb_build_object(
    'graceStarted', grace_started,
    'suspended', suspended_count,
    'deletionQueued', deletion_queued,
    'policy', 'pro-payment-7-day-suspend-30-day-queued-delete',
    'processedAt', now()
  );
end;
$$;

revoke all on function public.wfilemanager_apply_instance_lifecycle() from public, anon, authenticated;
grant execute on function public.wfilemanager_apply_instance_lifecycle() to service_role;
