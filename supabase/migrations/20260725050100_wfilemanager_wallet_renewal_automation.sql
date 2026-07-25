alter table public.wfilemanager_billing_reminders
  drop constraint if exists wfilemanager_billing_reminders_reminder_kind_check;

alter table public.wfilemanager_billing_reminders
  add constraint wfilemanager_billing_reminders_reminder_kind_check
  check (reminder_kind in (
    'renewal_14d',
    'renewal_7d',
    'renewal_1d',
    'past_due',
    'suspended',
    'auto_renew_insufficient',
    'auto_renew_success'
  ));

alter table public.wfilemanager_pro_orders
  drop constraint if exists wfilemanager_pro_orders_order_type_check;

alter table public.wfilemanager_pro_orders
  add constraint wfilemanager_pro_orders_order_type_check
  check (order_type in ('new_licence_key','renewal','renewal_pending','storage_upgrade'));

create or replace function public.wfilemanager_mark_direct_renewal_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provider = 'camerpay'
     and new.order_type = 'renewal'
     and new.status in ('pending','payment_pending') then
    new.order_type := 'renewal_pending';
  end if;

  if old.order_type = 'renewal_pending'
     and new.status = 'paid' then
    new.order_type := 'renewal';
  end if;

  return new;
end;
$$;

drop trigger if exists wfilemanager_mark_direct_renewal_pending_trigger on public.wfilemanager_pro_orders;
create trigger wfilemanager_mark_direct_renewal_pending_trigger
before insert or update of status, order_type, provider
on public.wfilemanager_pro_orders
for each row execute function public.wfilemanager_mark_direct_renewal_pending();

revoke all on function public.wfilemanager_mark_direct_renewal_pending() from public, anon, authenticated;
grant execute on function public.wfilemanager_mark_direct_renewal_pending() to service_role;

update public.wfilemanager_pro_orders
set order_type = 'renewal_pending', updated_at = now()
where provider = 'camerpay'
  and order_type = 'renewal'
  and status in ('pending','payment_pending');

comment on column public.wfilemanager_customer_accounts.balance_usd is
  'Prepaid customer account balance denominated in USD.';
comment on column public.wfilemanager_instances.auto_renew is
  'When true, the daily billing automation attempts a USD balance renewal about seven days before expiry.';
comment on table public.wfilemanager_wallet_topups is
  'CamerPay-funded top-up requests displayed and credited in USD.';
comment on table public.wfilemanager_wallet_transactions is
  'Immutable idempotent USD wallet ledger for credits and debits.';
