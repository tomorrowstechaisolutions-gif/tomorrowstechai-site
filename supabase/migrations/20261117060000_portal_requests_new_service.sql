-- Member portal Phase 4: members can ask for a service from the catalog.
-- Adds the "new_service" request type and an optional link to the catalog
-- item asked about, so a repeat click doesn't open a second request.

alter table public.portal_requests drop constraint if exists portal_requests_category_check;
alter table public.portal_requests
  add constraint portal_requests_category_check
  check (category = any (array['question', 'change', 'problem', 'billing', 'cancel', 'new_service']));

alter table public.portal_requests
  add column if not exists catalog_item_id uuid references public.catalog_items(id) on delete set null;

create index if not exists portal_requests_customer_item_idx
  on public.portal_requests (customer_id, catalog_item_id)
  where catalog_item_id is not null;
