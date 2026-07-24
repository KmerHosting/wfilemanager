create or replace function public.wfilemanager_refresh_storage_usage(target_instance_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  table_name text;
  bytes bigint := 0;
  total bigint := 0;
begin
  select coalesce(sum(octet_length(to_jsonb(t)::text)), 0)::bigint
    into bytes
  from (select * from public.wfilemanager_instances where id = target_instance_id) t;
  total := total + coalesce(bytes, 0);

  foreach table_name in array array[
    'wfilemanager_users',
    'wfilemanager_roles',
    'wfilemanager_sessions',
    'wfilemanager_path_rules',
    'wfilemanager_settings',
    'wfilemanager_audit_logs',
    'wfilemanager_notifications',
    'wfilemanager_root_reset_tokens',
    'wfilemanager_instance_credentials',
    'wfilemanager_backup_snapshots'
  ] loop
    execute format('select coalesce(sum(octet_length(to_jsonb(t)::text)), 0)::bigint from public.%I t where t.instance_id = $1', table_name)
      using target_instance_id
      into bytes;
    total := total + coalesce(bytes, 0);
  end loop;

  select coalesce(sum(octet_length(to_jsonb(t)::text)), 0)::bigint
    into bytes
  from (
    select id, status, period_days, storage_quota_bytes, customer_email, order_reference, instance_key, claimed_by_instance_id, claimed_at, expires_at, created_at, updated_at
    from public.wfilemanager_pro_activation_tokens
    where claimed_by_instance_id = target_instance_id
  ) t;
  total := total + coalesce(bytes, 0);

  update public.wfilemanager_instances
  set storage_used_bytes = total,
      updated_at = now()
  where id = target_instance_id
    and service_plan = 'pro';

  return total;
end;
$$;

revoke all on function public.wfilemanager_refresh_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.wfilemanager_refresh_storage_usage(uuid) to service_role;
