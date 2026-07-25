alter table public.wfilemanager_billing_reminders
  add column if not exists attempt_count integer not null default 1,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz not null default now();

create index if not exists wfilemanager_billing_reminders_retry_idx
  on public.wfilemanager_billing_reminders(next_attempt_at)
  where email_error is not null;

create unique index if not exists wfilemanager_invoices_order_unique
  on public.wfilemanager_invoices(order_id)
  where order_id is not null and invoice_type in ('licence','renewal','storage');

create unique index if not exists wfilemanager_invoices_topup_unique
  on public.wfilemanager_invoices(topup_id)
  where topup_id is not null and invoice_type = 'topup';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wfilemanager-documents',
  'wfilemanager-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
