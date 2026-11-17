-- Social Center: allow X (Twitter) as a platform and an OAuth provider.

alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check
  check (platform = any (array['facebook','instagram','linkedin','x','tiktok','youtube','google_business']));

alter table public.social_posts drop constraint if exists social_posts_platform_check;
alter table public.social_posts add constraint social_posts_platform_check
  check (platform = any (array['facebook','instagram','linkedin','x','tiktok','youtube','google_business']));

alter table public.social_post_platforms drop constraint if exists social_post_platforms_platform_check;
alter table public.social_post_platforms add constraint social_post_platforms_platform_check
  check (platform = any (array['facebook','instagram','linkedin','x','tiktok','youtube','google_business']));

alter table public.social_account_tokens drop constraint if exists social_account_tokens_provider_check;
alter table public.social_account_tokens add constraint social_account_tokens_provider_check
  check (provider = any (array['meta','linkedin','x']));
