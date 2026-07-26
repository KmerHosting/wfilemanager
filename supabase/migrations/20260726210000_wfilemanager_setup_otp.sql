create table if not exists public.wfilemanager_setup_otp_challenges (
  instance_key text primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  verified_at timestamptz,
  consumed_at timestamptz,
  request_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wfilemanager_setup_otp_expiry_idx
  on public.wfilemanager_setup_otp_challenges(expires_at);

alter table public.wfilemanager_setup_otp_challenges enable row level security;
revoke all on table public.wfilemanager_setup_otp_challenges from anon, authenticated;

comment on table public.wfilemanager_setup_otp_challenges is
  'Short-lived, single-use email OTP challenges for Pro instance setup; service role only.';
