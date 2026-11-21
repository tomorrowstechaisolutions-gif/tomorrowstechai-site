-- Catalog restructure: mid-range list prices, three care tiers, priced add-ons,
-- and eleven never-sold duplicates archived.
--
-- Data only: no table or column changes. Rows are matched by slug, so running
-- it twice gives the same result. Nothing is deleted.
--
-- The four website packages and Managed Hosting are also priced in code (the
-- ad pages, checkout, proposal templates and chatbot). Their numbers here
-- become the regular price; the site keeps charging the code price and shows
-- it as a launch price. See src/lib/catalog/launch.ts.
--
-- Existing clients are not touched: client_services keeps its own agreed price.

begin;

-- 1. Website packages: list prices (the code price stays the launch price).
update public.catalog_items set from_cents = 75000  where slug = 'website-starter';
update public.catalog_items set from_cents = 180000 where slug = 'website-classic';
update public.catalog_items set from_cents = 350000 where slug = 'website-professional';
update public.catalog_items set from_cents = 500000 where slug = 'website-ecommerce';
update public.catalog_items set from_cents = 750000, pricing_mode = 'starting_at' where slug = 'website-custom';

-- 2. AI packages: monthly price and setup fee.
update public.catalog_items set from_cents = 29900,  setup_fee_cents = 75000  where slug = 'ai-operator-starter';
update public.catalog_items set from_cents = 59900,  setup_fee_cents = 150000 where slug = 'ai-operator-growth';
update public.catalog_items set from_cents = 99900,  setup_fee_cents = 300000 where slug = 'ai-operator-operator';
update public.catalog_items set from_cents = 150000, setup_fee_cents = 300000, pricing_mode = 'starting_at' where slug = 'ai-operator-custom';

-- 3. Marketing packages.
update public.catalog_items set from_cents = 49900  where slug = 'audience-starter';
update public.catalog_items set from_cents = 89900  where slug = 'audience-growth';
update public.catalog_items set from_cents = 149900 where slug = 'audience-full-service';
update public.catalog_items set from_cents = 200000, pricing_mode = 'starting_at' where slug = 'audience-custom';

-- 4. Business systems: a "from" number instead of quote only.
update public.catalog_items
   set from_cents = 250000, pricing_mode = 'starting_at', billing_type = 'one_time', requires_quote = false
 where slug = 'run-your-business-custom';

-- 5. Website care: three tiers built from existing hosting items.
update public.catalog_items
   set name = 'Website Care Basic', from_cents = 7900, pricing_mode = 'fixed', public_enabled = true, catalog_category = 'hosting', position = 10
 where slug = 'managed-hosting';
update public.catalog_items
   set name = 'Website Care Plus', from_cents = 14900, pricing_mode = 'fixed', public_enabled = true, catalog_category = 'hosting', position = 20
 where slug = 'website-hosting';
update public.catalog_items
   set name = 'Website Care Pro', from_cents = 29900, pricing_mode = 'fixed', public_enabled = true, catalog_category = 'hosting', position = 30
 where slug = 'business-hosting';

-- 6. Add-ons shown to the public, each with a real price.
update public.catalog_items
   set from_cents = 39900, pricing_mode = 'fixed', billing_type = 'recurring', billing_interval = 'monthly', requires_quote = false, public_enabled = true
 where slug = 'seo';
update public.catalog_items
   set from_cents = 14900, pricing_mode = 'fixed', billing_type = 'recurring', billing_interval = 'monthly', requires_quote = false, public_enabled = true
 where slug = 'review-reputation-management';
update public.catalog_items
   set from_cents = 9900, setup_fee_cents = 25000, pricing_mode = 'fixed', billing_type = 'recurring', billing_interval = 'monthly', requires_quote = false, public_enabled = true
 where slug in ('missed-call-text-back', 'appointment-booking');
update public.catalog_items
   set from_cents = 50000, pricing_mode = 'starting_at', billing_type = 'recurring', billing_interval = 'monthly', requires_quote = false, public_enabled = true
 where slug = 'paid-advertising';
update public.catalog_items
   set from_cents = 75000, pricing_mode = 'starting_at', billing_type = 'one_time', requires_quote = false, public_enabled = true
 where slug = 'api-integration';
update public.catalog_items
   set from_cents = 45000, pricing_mode = 'starting_at', billing_type = 'one_time', requires_quote = false, public_enabled = true
 where slug = 'logo-design';
update public.catalog_items
   set from_cents = 25000, pricing_mode = 'fixed', billing_type = 'one_time', public_enabled = true, catalog_category = 'websites'
 where slug = 'extra-pages-copy';
update public.catalog_items
   set from_cents = 75000, pricing_mode = 'fixed', billing_type = 'one_time', public_enabled = true, catalog_category = 'branding'
 where slug = 'photo-video';

-- 7. Sold inside a tier or a custom system: hidden from the public, kept for proposals.
update public.catalog_items
   set public_enabled = false
 where slug in ('ai-chat-voice', 'workflow-automation', 'crm-pipeline-management', 'business-dashboard',
                'email-sms-marketing', 'ongoing-support', 'analytics-setup', 'website-revisions');

-- 8. Old duplicates that were never sold: archived the way the admin archives a package.
update public.catalog_items
   set status = 'retired', public_enabled = false, archived_at = now()
 where archived_at is null
   and slug in ('full-crm', 'ai-agents-assistants', 'ai-assistant-care', 'custom-automation', 'custom-applications',
                'e-commerce', 'advanced-dashboard', 'starter-hosting', 'pro-hosting', 'social-management', 'ad-management')
   and not exists (select 1 from public.client_services s where s.service_id = catalog_items.id)
   and not exists (select 1 from public.invoice_items i where i.service_id = catalog_items.id)
   and not exists (select 1 from public.proposal_items p where p.service_id = catalog_items.id);

commit;
