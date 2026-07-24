create table if not exists public.wfilemanager_pro_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'payment_pending', 'paid', 'activation_sent', 'email_failed', 'failed', 'cancelled')),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  buyer_company text,
  buyer_country text not null,
  billing_address text not null,
  billing_city text,
  billing_postal_code text,
  amount_usd numeric(10,2) not null default 50.00,
  amount_xaf integer not null,
  currency text not null default 'XAF',
  period_days integer not null default 365 check (period_days > 0),
  storage_quota_bytes bigint not null default 104857600 check (storage_quota_bytes > 0),
  provider text not null default 'camerpay',
  provider_reference text,
  provider_payment_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  webhook_payload jsonb not null default '{}'::jsonb,
  activation_token_id uuid references public.wfilemanager_pro_activation_tokens(id) on delete set null,
  paid_at timestamptz,
  token_email_sent_at timestamptz,
  token_email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wfilemanager_pro_orders_buyer_email_idx
  on public.wfilemanager_pro_orders (lower(buyer_email));

create index if not exists wfilemanager_pro_orders_status_idx
  on public.wfilemanager_pro_orders (status);

create index if not exists wfilemanager_pro_orders_provider_reference_idx
  on public.wfilemanager_pro_orders (provider_reference)
  where provider_reference is not null;

alter table public.wfilemanager_pro_orders enable row level security;

comment on table public.wfilemanager_pro_orders is 'wFileManager Pro purchase orders created by the public website. Rows are written only by Supabase Edge Functions using the service role.';
comment on column public.wfilemanager_pro_orders.order_reference is 'Public billing/order reference sent to CamerPay as merchant_invoice_id.';
comment on column public.wfilemanager_pro_orders.activation_token_id is 'One-time Pro activation token created after confirmed payment and emailed to the buyer.';

create or replace function public.wfilemanager_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wfilemanager_pro_orders_set_updated_at on public.wfilemanager_pro_orders;
create trigger wfilemanager_pro_orders_set_updated_at
before update on public.wfilemanager_pro_orders
for each row execute function public.wfilemanager_set_updated_at();
