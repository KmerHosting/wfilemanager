-- Pro remote backup transfer policy: 20 GB/month, marginal overage tiers.
alter table public.wfilemanager_pro_subscription_config
  add column if not exists included_transfer_bytes bigint not null default 21474836480,
  add column if not exists transfer_tier_one_end_bytes bigint not null default 53687091200,
  add column if not exists transfer_tier_two_end_bytes bigint not null default 214748364800,
  add column if not exists transfer_tier_one_usd_per_gb numeric(10,2) not null default 1.00,
  add column if not exists transfer_tier_two_usd_per_gb numeric(10,2) not null default 0.75,
  add column if not exists transfer_tier_three_usd_per_gb numeric(10,2) not null default 0.25;

update public.wfilemanager_pro_subscription_config
set max_file_bytes = 5368709120,
    included_backup_traffic_bytes = 21474836480,
    included_transfer_bytes = 21474836480,
    transfer_tier_one_end_bytes = 53687091200,
    transfer_tier_two_end_bytes = 214748364800,
    transfer_tier_one_usd_per_gb = 1.00,
    transfer_tier_two_usd_per_gb = 0.75,
    transfer_tier_three_usd_per_gb = 0.25
where id = true;

alter table public.wfilemanager_instances
  alter column backup_traffic_quota_bytes set default 21474836480;

comment on column public.wfilemanager_pro_subscription_config.included_transfer_bytes
  is '20 GB monthly transfer traffic covering uploads and downloads.';
