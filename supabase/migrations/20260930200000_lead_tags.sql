-- Lead tags — a light, additive label on the existing `leads` table.
--
-- Added for the Central Texas AI Business Modernization Initiative so its
-- business-interest and partner-inquiry submissions can be found and counted
-- even when the contact already existed (intake keeps the first-touch
-- `source`, so `source` alone would miss a returning contact). Same shape as
-- `customers.tags` and `companies.tags`. No new lead system, no new table.

alter table public.leads
  add column if not exists tags text[] not null default '{}';

create index if not exists leads_tags_gin on public.leads using gin (tags);

comment on column public.leads.tags is
  'Free-form labels, e.g. {"Central Texas AI","Partner Inquiry"}. Written by intake routes; filtered in /admin/leads.';
