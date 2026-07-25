create extension if not exists pgcrypto with schema extensions;

alter table public.wfilemanager_customer_accounts
  add column if not exists balance_usd numeric(14,2) not null default 0,
  add column if not exists auto_renew_default boolean not null default true;

alter table public.wfilemanager_instances
  add column if not exists billing_customer_id uuid references public.wfilemanager_customer_accounts(id) on delete set null,
  add column if not exists auto_renew boolean not null default true,
  add column if not exists auto_renew_last_attempt_at timestamptz,
  add column if not exists auto_renew_last_error text;

alter table public.wfilemanager_pro_activation_tokens
  add column if not exists customer_id uuid references public.wfilemanager_customer_accounts(id) on delete set null;

alter table public.wfilemanager_pro_subscription_config
  add column if not exists usd_to_xaf_rate numeric(14,4) not null default 600;

create table if not exists public.wfilemanager_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.wfilemanager_customer_accounts(id) on delete cascade,
  transaction_type text not null,
  amount_usd numeric(14,2) not null,
  balance_after_usd numeric(14,2) not null check (balance_after_usd >= 0),
  reference text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wfilemanager_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.wfilemanager_customer_accounts(id) on delete cascade,
  topup_reference text not null unique,
  status text not null default 'pending' check (status in ('pending','payment_pending','paid','credited','failed','cancelled')),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  amount_xaf integer not null check (amount_xaf > 0),
  currency text not null default 'USD',
  provider_currency text not null default 'XAF',
  exchange_rate numeric(14,4) not null check (exchange_rate > 0),
  provider text not null default 'camerpay',
  provider_reference text,
  provider_payment_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  status_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  credited_at timestamptz,
  wallet_transaction_id uuid references public.wfilemanager_wallet_transactions(id) on delete set null,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wfilemanager_wallet_topups_customer_created_idx
  on public.wfilemanager_wallet_topups(customer_id, created_at desc);
create index if not exists wfilemanager_wallet_transactions_customer_created_idx
  on public.wfilemanager_wallet_transactions(customer_id, created_at desc);
create index if not exists wfilemanager_instances_billing_customer_idx
  on public.wfilemanager_instances(billing_customer_id, paid_until);

alter table public.wfilemanager_wallet_transactions enable row level security;
alter table public.wfilemanager_wallet_topups enable row level security;
revoke all on public.wfilemanager_wallet_transactions from anon, authenticated;
revoke all on public.wfilemanager_wallet_topups from anon, authenticated;

create or replace function public.wfilemanager_wallet_credit(
  p_customer_id uuid,
  p_amount_usd numeric,
  p_transaction_type text,
  p_reference text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, balance_usd numeric, already_applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.wfilemanager_wallet_transactions%rowtype;
  v_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_id uuid;
begin
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'invalid_credit_amount'; end if;

  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.balance_after_usd, true;
    return;
  end if;

  select a.balance_usd into v_balance
  from public.wfilemanager_customer_accounts a
  where a.id = p_customer_id and a.status = 'active'
  for update;
  if not found then raise exception 'customer_not_found'; end if;

  v_new_balance := round(v_balance + p_amount_usd, 2);
  update public.wfilemanager_customer_accounts a
  set balance_usd = v_new_balance, updated_at = now()
  where a.id = p_customer_id;

  insert into public.wfilemanager_wallet_transactions(
    customer_id, transaction_type, amount_usd, balance_after_usd, reference, idempotency_key, metadata
  ) values (
    p_customer_id, p_transaction_type, round(p_amount_usd,2), v_new_balance,
    p_reference, p_idempotency_key, coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  return query select v_id, v_new_balance, false;
exception when unique_violation then
  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  return query select v_existing.id, v_existing.balance_after_usd, true;
end;
$$;

create or replace function public.wfilemanager_wallet_debit(
  p_customer_id uuid,
  p_amount_usd numeric,
  p_transaction_type text,
  p_reference text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, balance_usd numeric, already_applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.wfilemanager_wallet_transactions%rowtype;
  v_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_id uuid;
begin
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'invalid_debit_amount'; end if;

  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.balance_after_usd, true;
    return;
  end if;

  select a.balance_usd into v_balance
  from public.wfilemanager_customer_accounts a
  where a.id = p_customer_id and a.status = 'active'
  for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_balance < p_amount_usd then raise exception 'insufficient_balance'; end if;

  v_new_balance := round(v_balance - p_amount_usd, 2);
  update public.wfilemanager_customer_accounts a
  set balance_usd = v_new_balance, updated_at = now()
  where a.id = p_customer_id;

  insert into public.wfilemanager_wallet_transactions(
    customer_id, transaction_type, amount_usd, balance_after_usd, reference, idempotency_key, metadata
  ) values (
    p_customer_id, p_transaction_type, -round(p_amount_usd,2), v_new_balance,
    p_reference, p_idempotency_key, coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  return query select v_id, v_new_balance, false;
exception when unique_violation then
  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  return query select v_existing.id, v_existing.balance_after_usd, true;
end;
$$;

create or replace function public.wfilemanager_wallet_renew_instance(
  p_customer_id uuid,
  p_instance_key text,
  p_amount_usd numeric,
  p_period_days integer,
  p_transaction_type text,
  p_reference text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, balance_usd numeric, paid_until timestamptz, already_applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.wfilemanager_wallet_transactions%rowtype;
  v_instance public.wfilemanager_instances%rowtype;
  v_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_new_paid_until timestamptz;
  v_id uuid;
begin
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'invalid_debit_amount'; end if;
  if p_period_days is null or p_period_days <= 0 then raise exception 'invalid_period'; end if;

  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  if found then
    select i.paid_until into v_new_paid_until
    from public.wfilemanager_instances i
    where i.instance_key = p_instance_key;
    return query select v_existing.id, v_existing.balance_after_usd, v_new_paid_until, true;
    return;
  end if;

  select i.* into v_instance
  from public.wfilemanager_instances i
  where i.instance_key = p_instance_key
  for update;
  if not found then raise exception 'instance_not_found'; end if;
  if v_instance.billing_customer_id is distinct from p_customer_id then raise exception 'instance_not_owned'; end if;

  select a.balance_usd into v_balance
  from public.wfilemanager_customer_accounts a
  where a.id = p_customer_id and a.status = 'active'
  for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_balance < p_amount_usd then raise exception 'insufficient_balance'; end if;

  v_new_balance := round(v_balance - p_amount_usd, 2);
  v_new_paid_until := greatest(coalesce(v_instance.paid_until, now()), now()) + make_interval(days => p_period_days);

  update public.wfilemanager_customer_accounts a
  set balance_usd = v_new_balance, updated_at = now()
  where a.id = p_customer_id;

  update public.wfilemanager_instances i
  set paid_until = v_new_paid_until,
      subscription_status = 'active',
      data_status = 'active',
      status = 'active',
      past_due_at = null,
      suspended_at = null,
      delete_after_at = null,
      auto_renew_last_attempt_at = now(),
      auto_renew_last_error = null,
      updated_at = now()
  where i.id = v_instance.id;

  insert into public.wfilemanager_wallet_transactions(
    customer_id, transaction_type, amount_usd, balance_after_usd, reference, idempotency_key, metadata
  ) values (
    p_customer_id, p_transaction_type, -round(p_amount_usd,2), v_new_balance,
    p_reference, p_idempotency_key,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('instance_key', p_instance_key, 'paid_until', v_new_paid_until)
  ) returning id into v_id;

  return query select v_id, v_new_balance, v_new_paid_until, false;
exception when unique_violation then
  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  select i.paid_until into v_new_paid_until
  from public.wfilemanager_instances i
  where i.instance_key = p_instance_key;
  return query select v_existing.id, v_existing.balance_after_usd, v_new_paid_until, true;
end;
$$;

create or replace function public.wfilemanager_wallet_buy_licence(
  p_customer_id uuid,
  p_amount_usd numeric,
  p_period_days integer,
  p_storage_quota_bytes bigint,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_buyer_company text,
  p_buyer_country text,
  p_billing_address text,
  p_billing_city text,
  p_billing_postal_code text,
  p_exchange_rate numeric,
  p_idempotency_key text
)
returns table(transaction_id uuid, order_id uuid, order_reference text, licence_key text, balance_usd numeric, already_applied boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.wfilemanager_wallet_transactions%rowtype;
  v_existing_order public.wfilemanager_pro_orders%rowtype;
  v_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_transaction_id uuid;
  v_order_id uuid;
  v_token_id uuid;
  v_reference text;
  v_key text;
  v_now timestamptz := now();
begin
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'invalid_debit_amount'; end if;
  if p_period_days is null or p_period_days <= 0 then raise exception 'invalid_period'; end if;
  if p_storage_quota_bytes is null or p_storage_quota_bytes <= 0 then raise exception 'invalid_quota'; end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then raise exception 'invalid_exchange_rate'; end if;

  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  if found then
    select o.* into v_existing_order
    from public.wfilemanager_pro_orders o
    where o.order_reference = v_existing.metadata ->> 'order_reference'
    limit 1;
    return query select v_existing.id, v_existing_order.id, v_existing_order.order_reference,
      v_existing_order.license_key_plain, v_existing.balance_after_usd, true;
    return;
  end if;

  select a.balance_usd into v_balance
  from public.wfilemanager_customer_accounts a
  where a.id = p_customer_id and a.status = 'active'
  for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_balance < p_amount_usd then raise exception 'insufficient_balance'; end if;

  v_reference := 'WFM-LIC-WAL-' || to_char(v_now at time zone 'UTC', 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 16));
  v_key := 'WFM-LIC-' || upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 6)) || '-' ||
    upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 6)) || '-' ||
    upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 6)) || '-' ||
    upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 6));

  insert into public.wfilemanager_pro_activation_tokens(
    token_hash, status, period_days, storage_quota_bytes, customer_id, customer_email, order_reference, expires_at
  ) values (
    encode(digest(v_key, 'sha256'), 'hex'), 'available', p_period_days, p_storage_quota_bytes,
    p_customer_id, lower(p_buyer_email), v_reference, v_now + interval '30 days'
  ) returning id into v_token_id;

  insert into public.wfilemanager_pro_orders(
    order_reference, order_type, status, customer_id,
    buyer_name, buyer_email, buyer_phone, buyer_company, buyer_country,
    billing_address, billing_city, billing_postal_code,
    amount_usd, amount_xaf, currency, period_days, storage_quota_bytes,
    provider, activation_token_id, paid_at, license_key_plain, license_key_issued_at, automation_note
  ) values (
    v_reference, 'new_licence_key', 'paid', p_customer_id,
    p_buyer_name, lower(p_buyer_email), p_buyer_phone, nullif(p_buyer_company, ''), p_buyer_country,
    p_billing_address, nullif(p_billing_city, ''), nullif(p_billing_postal_code, ''),
    round(p_amount_usd, 2), greatest(1, round(p_amount_usd * p_exchange_rate)::integer), 'USD',
    p_period_days, p_storage_quota_bytes,
    'wallet', v_token_id, v_now, v_key, v_now, 'Paid from customer USD balance'
  ) returning id into v_order_id;

  v_new_balance := round(v_balance - p_amount_usd, 2);
  update public.wfilemanager_customer_accounts a
  set balance_usd = v_new_balance, updated_at = v_now
  where a.id = p_customer_id;

  insert into public.wfilemanager_wallet_transactions(
    customer_id, transaction_type, amount_usd, balance_after_usd, reference, idempotency_key, metadata
  ) values (
    p_customer_id, 'licence_purchase_debit', -round(p_amount_usd, 2), v_new_balance,
    v_reference, p_idempotency_key,
    jsonb_build_object('order_reference', v_reference, 'order_id', v_order_id, 'payment_method', 'wallet')
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_order_id, v_reference, v_key, v_new_balance, false;
exception when unique_violation then
  select wt.* into v_existing
  from public.wfilemanager_wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;
  select o.* into v_existing_order
  from public.wfilemanager_pro_orders o
  where o.order_reference = v_existing.metadata ->> 'order_reference'
  limit 1;
  return query select v_existing.id, v_existing_order.id, v_existing_order.order_reference,
    v_existing_order.license_key_plain, v_existing.balance_after_usd, true;
end;
$$;

create or replace function public.wfilemanager_link_token_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is null and new.order_reference is not null then
    select o.customer_id into new.customer_id
    from public.wfilemanager_pro_orders o
    where o.order_reference = new.order_reference;
  end if;
  return new;
end;
$$;

create or replace function public.wfilemanager_link_claimed_instance_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto_renew boolean := true;
begin
  if new.status = 'claimed' and new.claimed_by_instance_id is not null and new.customer_id is not null
     and (old.status is distinct from new.status or old.claimed_by_instance_id is distinct from new.claimed_by_instance_id or old.customer_id is distinct from new.customer_id) then
    select coalesce(a.auto_renew_default, true) into v_auto_renew
    from public.wfilemanager_customer_accounts a
    where a.id = new.customer_id;

    update public.wfilemanager_instances
    set billing_customer_id = new.customer_id,
        auto_renew = v_auto_renew,
        updated_at = now()
    where id = new.claimed_by_instance_id;
  end if;
  return new;
end;
$$;

drop trigger if exists wfilemanager_link_token_customer_trigger on public.wfilemanager_pro_activation_tokens;
create trigger wfilemanager_link_token_customer_trigger
before insert or update of order_reference, customer_id
on public.wfilemanager_pro_activation_tokens
for each row execute function public.wfilemanager_link_token_customer();

drop trigger if exists wfilemanager_link_claimed_instance_billing_trigger on public.wfilemanager_pro_activation_tokens;
create trigger wfilemanager_link_claimed_instance_billing_trigger
after update of status, claimed_by_instance_id, customer_id
on public.wfilemanager_pro_activation_tokens
for each row execute function public.wfilemanager_link_claimed_instance_billing();

revoke all on function public.wfilemanager_wallet_credit(uuid,numeric,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.wfilemanager_wallet_debit(uuid,numeric,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.wfilemanager_wallet_renew_instance(uuid,text,numeric,integer,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.wfilemanager_wallet_buy_licence(uuid,numeric,integer,bigint,text,text,text,text,text,text,text,text,numeric,text) from public, anon, authenticated;
revoke all on function public.wfilemanager_link_token_customer() from public, anon, authenticated;
revoke all on function public.wfilemanager_link_claimed_instance_billing() from public, anon, authenticated;

grant execute on function public.wfilemanager_wallet_credit(uuid,numeric,text,text,text,jsonb) to service_role;
grant execute on function public.wfilemanager_wallet_debit(uuid,numeric,text,text,text,jsonb) to service_role;
grant execute on function public.wfilemanager_wallet_renew_instance(uuid,text,numeric,integer,text,text,text,jsonb) to service_role;
grant execute on function public.wfilemanager_wallet_buy_licence(uuid,numeric,integer,bigint,text,text,text,text,text,text,text,text,numeric,text) to service_role;
grant execute on function public.wfilemanager_link_token_customer() to service_role;
grant execute on function public.wfilemanager_link_claimed_instance_billing() to service_role;

update public.wfilemanager_pro_activation_tokens t
set customer_id = o.customer_id,
    updated_at = now()
from public.wfilemanager_pro_orders o
where o.order_reference = t.order_reference
  and t.customer_id is null
  and o.customer_id is not null;

update public.wfilemanager_instances i
set billing_customer_id = t.customer_id,
    auto_renew = coalesce(a.auto_renew_default, true),
    updated_at = now()
from public.wfilemanager_pro_activation_tokens t
join public.wfilemanager_customer_accounts a on a.id = t.customer_id
where t.status = 'claimed'
  and t.claimed_by_instance_id = i.id
  and i.billing_customer_id is null;
