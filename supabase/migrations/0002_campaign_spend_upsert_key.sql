-- 0002_campaign_spend_upsert_key.sql   (applied 2026-08-29)
--
-- PostgREST upsert needs a unique index over plain columns; the original
-- coalesce() expression index in 0001 can't be targeted by ON CONFLICT.
-- Empty string is the "not broken out" value for the four breakdown columns.

update public.campaign_spend
set adset = coalesce(adset, ''),
    ad = coalesce(ad, ''),
    placement = coalesce(placement, ''),
    device = coalesce(device, '');

alter table public.campaign_spend
  alter column adset     set default '',
  alter column ad        set default '',
  alter column placement set default '',
  alter column device    set default '';

alter table public.campaign_spend
  alter column adset     set not null,
  alter column ad        set not null,
  alter column placement set not null,
  alter column device    set not null;

drop index if exists public.campaign_spend_row_key;

create unique index if not exists campaign_spend_row_key
  on public.campaign_spend (date, campaign, adset, ad, placement, device);
