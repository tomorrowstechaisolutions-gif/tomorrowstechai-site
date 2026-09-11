alter table public.ai_solutions
  add column if not exists cover_image_url text;

comment on column public.ai_solutions.cover_image_url is
  'Canonical cover image URL for the solution. Local public paths are allowed; managed uploads may instead use cover_asset_id.';

update public.ai_solutions
set cover_image_url = '/ai-solutions/ai-ad-creative-studio-cover.png',
    updated_at = now()
where slug = 'ai-ad-creative-studio';
