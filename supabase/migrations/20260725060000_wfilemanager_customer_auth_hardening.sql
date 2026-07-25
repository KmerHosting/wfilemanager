alter table public.wfilemanager_customer_accounts
  add column if not exists password_iterations integer,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_expires_at timestamptz,
  add column if not exists password_reset_token_hash text,
  add column if not exists password_reset_expires_at timestamptz,
  add column if not exists password_changed_at timestamptz;

update public.wfilemanager_customer_accounts
set password_iterations = 150000
where password_iterations is null;

alter table public.wfilemanager_customer_accounts
  alter column password_iterations set default 210000,
  alter column password_iterations set not null;

create unique index if not exists wfilemanager_customer_accounts_email_lower_key
  on public.wfilemanager_customer_accounts(lower(email));

alter table public.wfilemanager_customer_sessions
  add column if not exists ip_address text,
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists wfilemanager_customer_sessions_customer_active_idx
  on public.wfilemanager_customer_sessions(customer_id, expires_at desc)
  where revoked_at is null;
