-- AI Ad Creative Studio. Extends the existing catalog, Brand Kit and Content
-- Studio rather than creating a second source of truth.

alter table public.content_assets
  add column if not exists format text,
  add column if not exists generation_provider text,
  add column if not exists generation_model text,
  add column if not exists generation_prompt text,
  add column if not exists generation_cost_micro_usd bigint,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists source_fingerprint text,
  add column if not exists template_key text,
  add column if not exists creative_brief jsonb not null default '{}'::jsonb,
  add column if not exists generated_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists generated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_assets_generation_cost_check') then
    alter table public.content_assets add constraint content_assets_generation_cost_check
      check (generation_cost_micro_usd is null or generation_cost_micro_usd >= 0);
  end if;
end $$;

alter table public.brand_templates
  add column if not exists template_key text,
  add column if not exists prompt_guidance text,
  add column if not exists is_system boolean not null default false;

create unique index if not exists brand_templates_key_idx
  on public.brand_templates (brand_profile_id, template_key)
  where template_key is not null and status <> 'archived';

create table if not exists public.ad_campaign_sets (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  name text not null,
  mode text not null default 'quick' check (mode in ('quick','variations','campaign','catalog')),
  status text not null default 'queued' check (status in ('queued','generating','completed','partial','failed','cancelled')),
  filters jsonb not null default '{}'::jsonb,
  total_jobs integer not null default 0 check (total_jobs >= 0),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  failed_jobs integer not null default 0 check (failed_jobs >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.ad_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_set_id uuid references public.ad_campaign_sets(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  mode text not null default 'quick' check (mode in ('quick','variations','campaign','catalog')),
  status text not null default 'queued' check (status in ('queued','generating','completed','failed','cancelled')),
  format text not null check (format in ('square','portrait','story','landscape','website')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  template_key text not null,
  creative_brief jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  source_fingerprint text not null,
  generation_provider text,
  generation_model text,
  generation_prompt text,
  asset_id uuid references public.content_assets(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  estimated_cost_micro_usd bigint check (estimated_cost_micro_usd is null or estimated_cost_micro_usd >= 0),
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_asset_relations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.content_assets(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  relationship_type text not null default 'ad' check (relationship_type in ('primary','gallery','ad','campaign','social','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, catalog_item_id, relationship_type)
);

create unique index if not exists creative_asset_one_primary_idx
  on public.creative_asset_relations (catalog_item_id)
  where relationship_type = 'primary';
create index if not exists creative_asset_relations_asset_idx on public.creative_asset_relations (asset_id);
create index if not exists ad_generation_jobs_queue_idx on public.ad_generation_jobs (status, created_at);
create index if not exists ad_generation_jobs_catalog_idx on public.ad_generation_jobs (catalog_item_id, created_at desc);
create index if not exists ad_campaign_sets_created_idx on public.ad_campaign_sets (created_at desc);
create index if not exists content_assets_generation_idx on public.content_assets (generated_at desc)
  where asset_type = 'ad' and not is_archived;

drop trigger if exists ad_generation_jobs_touch on public.ad_generation_jobs;
create trigger ad_generation_jobs_touch before update on public.ad_generation_jobs
  for each row execute function public.touch_updated_at();

alter table public.ad_campaign_sets enable row level security;
alter table public.ad_generation_jobs enable row level security;
alter table public.creative_asset_relations enable row level security;

do $$ declare t text; begin
  foreach t in array array['ad_campaign_sets','ad_generation_jobs','creative_asset_relations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

revoke all on public.ad_campaign_sets, public.ad_generation_jobs, public.creative_asset_relations from anon;
grant select, insert, update, delete on public.ad_campaign_sets, public.ad_generation_jobs, public.creative_asset_relations to authenticated;
grant select, insert, update, delete on public.content_assets, public.brand_templates to authenticated;

with default_brand as (
  select id from public.brand_profiles where is_default order by updated_at desc limit 1
), templates(template_key, name, prompt_guidance) as (values
  ('premium-product','Premium Product Showcase','Premium product photography, luminous blue rim light, polished device or service hero, generous negative space.'),
  ('feature-breakdown','Feature Breakdown','Clear central hero with supporting feature zones and disciplined visual hierarchy.'),
  ('price-focus','Price Focus','Premium offer hero with strong price area and restrained supporting imagery.'),
  ('problem-solution','Problem → Solution','Visual contrast from operational friction to calm, connected business results.'),
  ('dashboard-showcase','Dashboard Showcase','High-end desktop and mobile dashboard presentation with realistic depth and reflections.'),
  ('service-spotlight','Service Spotlight','Single service hero with relevant professional environment and strong focal subject.'),
  ('package-comparison','Package Comparison','Coordinated product family composition suitable for comparing multiple tiers.'),
  ('ai-technology','AI Technology','Approachable intelligent automation imagery, electric blue energy, premium and credible.'),
  ('lead-generation','Lead Generation','Customer acquisition and growth visual with connected touchpoints and upward momentum.'),
  ('campaign-promotion','Campaign Promotion','Bold promotional composition with a crisp hero and reserved copy/CTA regions.')
)
insert into public.brand_templates (brand_profile_id, template_key, name, template_type, prompt_guidance, status, is_system)
select default_brand.id, templates.template_key, templates.name, 'ad_creative', templates.prompt_guidance, 'approved', true
from default_brand cross join templates
on conflict (brand_profile_id, template_key) where template_key is not null and status <> 'archived'
do update set name = excluded.name, prompt_guidance = excluded.prompt_guidance, updated_at = now();

insert into public.brand_guidelines (brand_profile_id, section, content, display_order)
select id, 'AI ad creative direction',
  'Near-black navy foundation; electric blue accents; crisp white typography; premium cinematic lighting; one dominant product, device, or service hero; disciplined left-to-right hierarchy; exact catalog copy is overlaid programmatically; logo in the upper-left; CTA and price in stable lower zones; no invented UI text, prices, logos, or claims; maintain generous spacing and clear mobile readability.',
  35
from public.brand_profiles where is_default
on conflict (brand_profile_id, section) do update set content = excluded.content, updated_at = now();
