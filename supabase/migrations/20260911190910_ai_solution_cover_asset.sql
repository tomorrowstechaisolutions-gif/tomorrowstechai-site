alter table public.ai_solutions
  add column if not exists cover_asset_id uuid references public.content_assets(id) on delete set null;

create index if not exists ai_solutions_cover_asset_idx
  on public.ai_solutions (cover_asset_id) where cover_asset_id is not null;

insert into public.ai_solutions (
  name, internal_name, slug, description, purpose, tags, solution_type, status,
  provider_key, model, deployment_target, deployment_url, source_path,
  prompt_editable, billing_type, created_by
)
select
  'AI Ad Creative Studio', 'Tomorrow''s Tech AI Ad Studio', 'ai-ad-creative-studio',
  'Creates professional multi-format image advertisements from live service and package catalog data, then routes them through review and approval.',
  'Turn canonical offers into accurate, on-brand campaign assets without rebuilding each ad by hand.',
  array['internal','marketing','ads','image-generation'], 'content_ai', 'active',
  'openai', 'gpt-image-2.5-sunburst', 'internal_admin', '/admin/marketing/ads',
  'src/app/api/admin/ad-studio/process/route.ts', false, 'none', 'system'
where not exists (select 1 from public.ai_solutions where lower(slug) = 'ai-ad-creative-studio');

update public.ai_solutions set
  name = 'AI Ad Creative Studio',
  internal_name = 'Tomorrow''s Tech AI Ad Studio',
  description = 'Creates professional multi-format image advertisements from live service and package catalog data, then routes them through review and approval.',
  purpose = 'Turn canonical offers into accurate, on-brand campaign assets without rebuilding each ad by hand.',
  tags = array['internal','marketing','ads','image-generation'],
  solution_type = 'content_ai', status = 'active', provider_key = 'openai',
  model = 'gpt-image-2.5-sunburst', deployment_target = 'internal_admin',
  deployment_url = '/admin/marketing/ads', source_path = 'src/app/api/admin/ad-studio/process/route.ts',
  prompt_editable = false, billing_type = 'none', is_archived = false, archived_at = null,
  updated_at = now()
where lower(slug) = 'ai-ad-creative-studio';
