create index if not exists ad_campaign_sets_brand_idx on public.ad_campaign_sets (brand_profile_id);
create index if not exists ad_campaign_sets_creator_idx on public.ad_campaign_sets (created_by);
create index if not exists ad_generation_jobs_campaign_idx on public.ad_generation_jobs (campaign_set_id);
create index if not exists ad_generation_jobs_brand_idx on public.ad_generation_jobs (brand_profile_id);
create index if not exists ad_generation_jobs_asset_idx on public.ad_generation_jobs (asset_id) where asset_id is not null;
create index if not exists ad_generation_jobs_creator_idx on public.ad_generation_jobs (created_by);
create index if not exists creative_asset_relations_creator_idx on public.creative_asset_relations (created_by);
create index if not exists content_assets_generated_by_idx on public.content_assets (generated_by_user_id) where generated_by_user_id is not null;
