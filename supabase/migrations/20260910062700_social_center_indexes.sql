begin;

create index if not exists social_posts_account_idx on public.social_posts (account_id);
create index if not exists social_posts_service_assignment_idx on public.social_posts (service_assignment_id);
create index if not exists social_posts_content_item_idx on public.social_posts (content_item_id);
create index if not exists social_posts_media_asset_idx on public.social_posts (media_asset_id);
create index if not exists social_post_platforms_account_idx on public.social_post_platforms (social_account_id);
create index if not exists social_publish_attempts_post_idx on public.social_publish_attempts (post_id, attempt_number desc);
create index if not exists social_publish_attempts_account_idx on public.social_publish_attempts (social_account_id);
create index if not exists social_analytics_post_idx on public.social_analytics_snapshots (post_id) where post_id is not null;
create index if not exists social_engagement_account_idx on public.social_engagement_items (social_account_id);
create index if not exists social_engagement_customer_idx on public.social_engagement_items (customer_id);
create index if not exists social_automation_customer_idx on public.social_automation_settings (customer_id);
create index if not exists social_activity_customer_idx on public.social_activity_events (customer_id);
create index if not exists social_activity_account_idx on public.social_activity_events (account_id);
create index if not exists social_activity_post_idx on public.social_activity_events (post_id);

commit;
