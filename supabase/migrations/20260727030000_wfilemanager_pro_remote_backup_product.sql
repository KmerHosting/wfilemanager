-- Pro 0.9: $100/year, 5 GB managed capacity, 20 GB monthly remote traffic.
alter table public.wfilemanager_pro_subscription_config
  add column if not exists included_storage_bytes bigint not null default 5368709120,
  add column if not exists included_backup_traffic_bytes bigint not null default 21474836480,
  add column if not exists extra_storage_usd_per_gb_month numeric(10,2) not null default 1.00,
  add column if not exists max_file_bytes bigint not null default 21474836480;

update public.wfilemanager_pro_subscription_config
set price_usd = 100.00,
    storage_quota_bytes = 5368709120,
    included_storage_bytes = 5368709120,
    included_backup_traffic_bytes = 21474836480,
    extra_storage_usd_per_gb_month = 1.00,
    max_file_bytes = 21474836480
where id = true;

alter table public.wfilemanager_instances
  add column if not exists backup_traffic_cycle_started_at timestamptz,
  add column if not exists backup_traffic_used_bytes bigint not null default 0 check (backup_traffic_used_bytes >= 0),
  add column if not exists backup_traffic_quota_bytes bigint not null default 21474836480 check (backup_traffic_quota_bytes > 0),
  add column if not exists backup_capacity_gb integer not null default 5 check (backup_capacity_gb >= 5),
  add column if not exists backup_billing_status text not null default 'active'
    check (backup_billing_status in ('active','past_due','blocked'));

update public.wfilemanager_instances
set storage_quota_bytes = greatest(storage_quota_bytes, 5368709120),
    backup_capacity_gb = greatest(backup_capacity_gb, 5),
    backup_traffic_quota_bytes = 21474836480,
    backup_traffic_cycle_started_at = coalesce(backup_traffic_cycle_started_at, activated_at, now());

create table if not exists public.wfilemanager_backup_sources (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.wfilemanager_instances(id) on delete cascade,
  source_path text not null check (source_path like '/%'),
  label text not null check (length(label) between 1 and 120),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_id, source_path)
);

create table if not exists public.wfilemanager_backup_jobs (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.wfilemanager_instances(id) on delete cascade,
  requested_by text,
  kind text not null check (kind in ('scheduled','manual','restore')),
  status text not null default 'queued'
    check (status in ('queued','running','uploading','verifying','completed','failed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  bytes_processed bigint not null default 0 check (bytes_processed >= 0),
  traffic_bytes bigint not null default 0 check (traffic_bytes >= 0),
  retention_days integer not null default 30 check (retention_days between 1 and 365),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  snapshot_id uuid references public.wfilemanager_backup_snapshots(id) on delete set null,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wfilemanager_backup_capacity_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.wfilemanager_instances(id) on delete cascade,
  customer_id uuid references public.wfilemanager_customer_accounts(id) on delete set null,
  capacity_gb integer not null check (capacity_gb >= 5),
  amount_usd numeric(14,2) not null check (amount_usd >= 0),
  cycle_started_at timestamptz not null,
  cycle_ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  grace_ends_at timestamptz,
  delete_after_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wfilemanager_backup_traffic_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.wfilemanager_instances(id) on delete cascade,
  bytes bigint not null check (bytes > 0),
  direction text not null check (direction in ('upload','restore')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists wfm_backup_sources_instance_idx on public.wfilemanager_backup_sources(instance_id, enabled);
create index if not exists wfm_backup_jobs_instance_idx on public.wfilemanager_backup_jobs(instance_id, created_at desc);
create index if not exists wfm_backup_capacity_events_instance_idx on public.wfilemanager_backup_capacity_events(instance_id, cycle_ends_at);
create index if not exists wfm_backup_traffic_events_instance_idx on public.wfilemanager_backup_traffic_events(instance_id, created_at desc);

alter table public.wfilemanager_backup_sources enable row level security;
alter table public.wfilemanager_backup_jobs enable row level security;
alter table public.wfilemanager_backup_capacity_events enable row level security;
alter table public.wfilemanager_backup_traffic_events enable row level security;
revoke all on public.wfilemanager_backup_sources, public.wfilemanager_backup_jobs, public.wfilemanager_backup_capacity_events, public.wfilemanager_backup_traffic_events from anon, authenticated;

create or replace function public.wfilemanager_backup_consume_traffic(
  p_instance_id uuid,
  p_bytes bigint,
  p_direction text,
  p_idempotency_key text
)
returns table(used_bytes bigint, quota_bytes bigint, blocked boolean)
language plpgsql security definer set search_path = public as $$
declare v_instance public.wfilemanager_instances%rowtype;
begin
  if p_bytes is null or p_bytes <= 0 or p_bytes > 21474836480 then raise exception 'invalid_backup_traffic'; end if;
  if p_direction not in ('upload', 'restore') then raise exception 'invalid_backup_traffic_direction'; end if;
  select * into v_instance from public.wfilemanager_instances where id = p_instance_id for update;
  if not found then raise exception 'instance_not_found'; end if;
  if v_instance.backup_traffic_cycle_started_at + interval '1 month' <= now() then
    update public.wfilemanager_instances set backup_traffic_used_bytes = 0,
      backup_traffic_cycle_started_at = now(), backup_billing_status = 'active', updated_at = now()
      where id = p_instance_id returning * into v_instance;
  end if;
  if exists(select 1 from public.wfilemanager_backup_traffic_events where idempotency_key = p_idempotency_key) then
    return query select v_instance.backup_traffic_used_bytes, v_instance.backup_traffic_quota_bytes,
      v_instance.backup_traffic_used_bytes >= v_instance.backup_traffic_quota_bytes;
    return;
  end if;
  if v_instance.backup_traffic_used_bytes + p_bytes > v_instance.backup_traffic_quota_bytes then
    update public.wfilemanager_instances set backup_billing_status = 'blocked', updated_at = now() where id = p_instance_id;
    raise exception 'backup_traffic_exhausted';
  end if;
  update public.wfilemanager_instances set backup_traffic_used_bytes = backup_traffic_used_bytes + p_bytes,
    updated_at = now() where id = p_instance_id returning * into v_instance;
  insert into public.wfilemanager_backup_traffic_events(instance_id, bytes, direction, idempotency_key)
    values (p_instance_id, p_bytes, p_direction, p_idempotency_key);
  return query select v_instance.backup_traffic_used_bytes, v_instance.backup_traffic_quota_bytes, false;
end;
$$;
revoke all on function public.wfilemanager_backup_consume_traffic(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.wfilemanager_backup_consume_traffic(uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.wfilemanager_backup_consume_traffic(uuid,bigint,text,text) to service_role;

create or replace function public.wfilemanager_backup_charge_capacity(
  p_instance_id uuid,
  p_idempotency_key text
)
returns table(status text, balance_usd numeric, amount_usd numeric, grace_ends_at timestamptz, delete_after_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_instance public.wfilemanager_instances%rowtype;
  v_amount numeric(14,2);
  v_debit record;
  v_now timestamptz := now();
begin
  select * into v_instance from public.wfilemanager_instances where id = p_instance_id for update;
  if not found then raise exception 'instance_not_found'; end if;
  if v_instance.billing_customer_id is null then raise exception 'backup_billing_customer_missing'; end if;
  v_amount := greatest(v_instance.backup_capacity_gb - 5, 0)::numeric * 1.00;
  if v_amount = 0 then
    update public.wfilemanager_instances set backup_billing_status = 'active', updated_at = v_now where id = v_instance.id;
    return query select 'active'::text, null::numeric, v_amount, null::timestamptz, null::timestamptz;
    return;
  end if;
  begin
    select * into v_debit from public.wfilemanager_wallet_debit(
      v_instance.billing_customer_id, v_amount, 'backup_capacity_debit', 'backup capacity', p_idempotency_key,
      jsonb_build_object('instance_id', v_instance.id, 'capacity_gib', v_instance.backup_capacity_gb)
    );
    insert into public.wfilemanager_backup_capacity_events(
      instance_id, customer_id, capacity_gb, amount_usd, cycle_started_at, cycle_ends_at, status, idempotency_key
    ) values (
      v_instance.id, v_instance.billing_customer_id, v_instance.backup_capacity_gb, v_amount,
      coalesce(v_instance.backup_traffic_cycle_started_at, v_now),
      coalesce(v_instance.backup_traffic_cycle_started_at, v_now) + interval '1 month', 'paid', p_idempotency_key
    ) on conflict (idempotency_key) do nothing;
    update public.wfilemanager_instances set backup_billing_status = 'active', updated_at = v_now where id = v_instance.id;
    return query select 'active'::text, v_debit.balance_usd, v_amount, null::timestamptz, null::timestamptz;
  exception when others then
    insert into public.wfilemanager_backup_capacity_events(
      instance_id, customer_id, capacity_gb, amount_usd, cycle_started_at, cycle_ends_at, status, grace_ends_at, delete_after_at, idempotency_key
    ) values (
      v_instance.id, v_instance.billing_customer_id, v_instance.backup_capacity_gb, v_amount,
      coalesce(v_instance.backup_traffic_cycle_started_at, v_now), coalesce(v_instance.backup_traffic_cycle_started_at, v_now) + interval '1 month',
      'failed', v_now + interval '7 days', v_now + interval '30 days', p_idempotency_key
    ) on conflict (idempotency_key) do nothing;
    update public.wfilemanager_instances set backup_billing_status = 'past_due', updated_at = v_now where id = v_instance.id;
    return query select 'past_due'::text, null::numeric, v_amount, v_now + interval '7 days', v_now + interval '30 days';
  end;
end;
$$;
revoke all on function public.wfilemanager_backup_charge_capacity(uuid,text) from public, anon, authenticated;
grant execute on function public.wfilemanager_backup_charge_capacity(uuid,text) to service_role;
