alter table public.wfilemanager_pro_orders
  add column if not exists license_key_plain text,
  add column if not exists license_key_issued_at timestamptz;

comment on column public.wfilemanager_pro_orders.license_key_plain is 'Plain licence key shown only through the authenticated customer dashboard. Existing activation token hashes remain authoritative for setup validation.';
comment on column public.wfilemanager_pro_orders.license_key_issued_at is 'Timestamp when the licence key was generated for this order.';

update public.wfilemanager_pro_orders o
set customer_id = c.id
from public.wfilemanager_customer_accounts c
where o.customer_id is null
  and lower(o.buyer_email) = lower(c.email);

create index if not exists wfilemanager_pro_orders_license_key_idx
  on public.wfilemanager_pro_orders(license_key_issued_at)
  where license_key_plain is not null;
