-- Brand Assets governance layer.
-- Extends the Content Studio brand_profiles/content_assets foundation instead
-- of introducing a second client, brand, or file-storage system.

alter table public.brand_profiles
  add column if not exists internal_name text,
  add column if not exists brand_type text not null default 'internal',
  add column if not exists status text not null default 'active',
  add column if not exists industry text,
  add column if not exists tagline text,
  add column if not exists ownership text not null default 'internal',
  add column if not exists short_description text,
  add column if not exists long_description text,
  add column if not exists mission text,
  add column if not exists vision text,
  add column if not exists core_message text,
  add column if not exists ideal_customer text,
  add column if not exists core_services text[] not null default '{}',
  add column if not exists differentiators text[] not null default '{}',
  add column if not exists primary_cta text,
  add column if not exists secondary_cta text,
  add column if not exists tone_guidance text,
  add column if not exists phrases_to_avoid text[] not null default '{}',
  add column if not exists claims_requiring_approval text[] not null default '{}',
  add column if not exists secondary_color text,
  add column if not exists background_color text,
  add column if not exists primary_font text,
  add column if not exists archived_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_profiles_brand_type_check') then
    alter table public.brand_profiles add constraint brand_profiles_brand_type_check
      check (brand_type in ('internal','client','white_label','product','sub_brand'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_profiles_status_check') then
    alter table public.brand_profiles add constraint brand_profiles_status_check
      check (status in ('active','draft','needs_review','incomplete','paused','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_profiles_ownership_check') then
    alter table public.brand_profiles add constraint brand_profiles_ownership_check
      check (ownership in ('internal','client_owned','joint','white_label'));
  end if;
end $$;

alter table public.content_assets
  add column if not exists category text,
  add column if not exists role text,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_notes text,
  add column if not exists archived_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_assets_approval_status_check') then
    alter table public.content_assets add constraint content_assets_approval_status_check
      check (approval_status in ('draft','waiting_review','approved','changes_requested','rejected'));
  end if;
end $$;

create table if not exists public.brand_colors (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  name text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null default 'custom' check (role in ('primary','secondary','accent','background','surface','text','muted_text','success','warning','error','custom')),
  usage_notes text,
  display_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_typography (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  font_name text not null,
  weight text,
  style text,
  role text not null default 'body' check (role in ('h1','h2','h3','body','caption','button','quote','accent','fallback')),
  fallback_stack text,
  usage_notes text,
  display_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_templates (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  asset_id uuid references public.content_assets(id) on delete set null,
  name text not null,
  template_type text not null default 'custom',
  width integer,
  height integer,
  status text not null default 'draft' check (status in ('draft','waiting_review','approved','changes_requested','rejected','archived')),
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_guidelines (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  section text not null,
  content text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id, section)
);

create table if not exists public.brand_asset_usage (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.content_assets(id) on delete cascade,
  channel text not null check (channel in ('content_studio','social_center','email_marketing','ad_studio','websites','proposals','apps','other')),
  reference_table text,
  reference_id uuid,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz not null default now()
);

create table if not exists public.brand_activity (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  asset_id uuid references public.content_assets(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- Existing assets were already available to Content/Social before this
-- workflow existed. Grandfather them as approved; only new uploads enter the
-- review queue.
update public.content_assets set approval_status = 'approved' where approval_status = 'draft';

update public.brand_profiles
set brand_type = 'client', ownership = 'client_owned'
where customer_id is not null and brand_type = 'internal';

insert into public.brand_colors (brand_profile_id, name, hex, role, display_order)
select b.id,
       case when c.ordinality = 1 then 'Primary' when c.ordinality = 2 then 'Secondary' else 'Brand Color ' || c.ordinality end,
       upper(c.hex),
       case when c.ordinality = 1 then 'primary' when c.ordinality = 2 then 'secondary' else 'custom' end,
       c.ordinality::integer
from public.brand_profiles b
cross join lateral unnest(b.colors) with ordinality as c(hex, ordinality)
where c.hex ~ '^#[0-9A-Fa-f]{6}$'
  and not exists (select 1 from public.brand_colors x where x.brand_profile_id = b.id);

create index if not exists brand_colors_brand_idx on public.brand_colors (brand_profile_id, display_order) where not is_archived;
create index if not exists brand_typography_brand_idx on public.brand_typography (brand_profile_id, display_order) where not is_archived;
create index if not exists brand_templates_brand_idx on public.brand_templates (brand_profile_id, updated_at desc) where status <> 'archived';
create index if not exists brand_guidelines_brand_idx on public.brand_guidelines (brand_profile_id, display_order);
create index if not exists brand_asset_usage_asset_idx on public.brand_asset_usage (asset_id, used_at desc);
create index if not exists brand_activity_brand_idx on public.brand_activity (brand_profile_id, created_at desc);
create index if not exists content_assets_approval_idx on public.content_assets (approval_status, created_at desc) where not is_archived;

do $$
declare t text;
begin
  foreach t in array array['brand_colors','brand_typography','brand_templates','brand_guidelines','brand_asset_usage','brand_activity'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    if t not in ('brand_asset_usage','brand_activity') then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- New public-schema tables are explicitly opted into the Data API. RLS above
-- still decides which rows an authenticated caller can access.
grant select, insert, update, delete on table
  public.brand_colors,
  public.brand_typography,
  public.brand_templates,
  public.brand_guidelines,
  public.brand_asset_usage,
  public.brand_activity
to authenticated;
