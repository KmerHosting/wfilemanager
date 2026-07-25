create table if not exists public.wfilemanager_customer_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  full_name text not null,
  phone text,
  company text,
  country text,
  billing_address text,
  billing_city text,
  billing_postal_code text,
  status text not null default 'active' check (status in ('active','disabled','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.wfilemanager_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.wfilemanager_customer_accounts(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

alter table public.wfilemanager_pro_orders
  add column if not exists customer_id uuid references public.wfilemanager_customer_accounts(id) on delete set null;

create index if not exists wfilemanager_customer_sessions_customer_idx
  on public.wfilemanager_customer_sessions(customer_id);
create index if not exists wfilemanager_customer_sessions_valid_idx
  on public.wfilemanager_customer_sessions(token_hash, expires_at)
  where revoked_at is null;
create index if not exists wfilemanager_pro_orders_customer_idx
  on public.wfilemanager_pro_orders(customer_id, created_at desc);

alter table public.wfilemanager_customer_accounts enable row level security;
alter table public.wfilemanager_customer_sessions enable row level security;

revoke all on table public.wfilemanager_customer_accounts from anon, authenticated;
revoke all on table public.wfilemanager_customer_sessions from anon, authenticated;
