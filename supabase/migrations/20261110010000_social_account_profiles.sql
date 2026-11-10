-- Social Center account visuals.
--
-- Public-safe profile data synced from Meta every few hours so the Accounts
-- tab can show each Page/profile as it really looks: cover image, a link to
-- the live page, post count, and the latest posts as thumbnails. Facebook CDN
-- image URLs are signed and expire, which is why these are refreshed on a
-- schedule rather than stored once. No tokens here.
alter table public.social_accounts
  add column if not exists cover_image_url text,
  add column if not exists profile_url text,
  add column if not exists media_count integer,
  -- [{ id, image, url, caption, at, type }] newest first, at most 6.
  add column if not exists recent_media jsonb not null default '[]'::jsonb;
