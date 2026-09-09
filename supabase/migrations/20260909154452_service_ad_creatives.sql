-- One private, replaceable ad creative per service. The object path is stored
-- on the shared Catalog record; files stay private until an authenticated
-- admin asks the application for a short-lived signed URL.
begin;

alter table public.catalog_items
  add column ad_image_path text;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (scratch database) - skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'service-ad-creatives',
    'service-ad-creatives',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists service_ads_admin_read on storage.objects';
  execute 'drop policy if exists service_ads_admin_insert on storage.objects';
  execute 'drop policy if exists service_ads_admin_update on storage.objects';
  execute 'drop policy if exists service_ads_admin_delete on storage.objects';

  execute $p$
    create policy service_ads_admin_read on storage.objects
      for select to authenticated
      using (bucket_id = 'service-ad-creatives' and public.is_admin())
  $p$;
  execute $p$
    create policy service_ads_admin_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'service-ad-creatives' and public.can_manage_services())
  $p$;
  execute $p$
    create policy service_ads_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'service-ad-creatives' and public.can_manage_services())
      with check (bucket_id = 'service-ad-creatives' and public.can_manage_services())
  $p$;
  execute $p$
    create policy service_ads_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'service-ad-creatives' and public.can_manage_services())
  $p$;
end $$;

commit;
