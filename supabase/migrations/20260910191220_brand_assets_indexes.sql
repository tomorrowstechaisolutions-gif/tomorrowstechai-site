-- Cover relationship columns used by Brand Assets and its downstream email
-- consumers. These keep FK checks and brand-scoped lookups from degrading as
-- the asset library grows.
create index if not exists brand_activity_actor_idx on public.brand_activity (actor_id) where actor_id is not null;
create index if not exists brand_activity_asset_idx on public.brand_activity (asset_id) where asset_id is not null;
create index if not exists brand_asset_usage_user_idx on public.brand_asset_usage (used_by) where used_by is not null;
create index if not exists brand_templates_asset_idx on public.brand_templates (asset_id) where asset_id is not null;
create index if not exists content_assets_approved_by_idx on public.content_assets (approved_by) where approved_by is not null;
create index if not exists content_assets_customer_idx on public.content_assets (customer_id) where customer_id is not null;
create index if not exists brand_profiles_customer_idx on public.brand_profiles (customer_id) where customer_id is not null;
create index if not exists brand_profiles_logo_idx on public.brand_profiles (logo_asset_id) where logo_asset_id is not null;
create index if not exists email_campaigns_brand_idx on public.email_campaigns (brand_profile_id) where brand_profile_id is not null;
create index if not exists email_templates_brand_idx on public.email_templates (brand_profile_id) where brand_profile_id is not null;
