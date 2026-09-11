insert into public.catalog_items (
  name, slug, sku, category, catalog_category, service_type, offer_kind,
  description, short_description, status, active, billing, billing_type,
  pricing_mode, from_cents, setup_fee_cents, taxable, position,
  catalog_enabled, proposal_enabled, intake_enabled, internal_sales_enabled,
  public_enabled, manual_invoice_enabled, featured, requires_quote,
  requires_approval, discount_eligible, custom_pricing_allowed,
  image_url, image_alt, icon_key, cta_label, cta_route, public_route,
  meta_title, meta_description, frontend_locations, notes
)
values (
  'AI Ad Creative Studio', 'ai-ad-creative-studio', 'TTAI-AI-AD-STUDIO',
  'marketing', 'ai', 'AI Solution', 'service',
  'AI-powered creative production for turning real services, packages, and custom offers into polished, on-brand image advertisements across major digital formats.',
  'Create polished, on-brand image ads from your real services and packages in seconds.',
  'active', true, 'one_time', 'custom_quote', 'custom_quote', 0, 0, false, 390,
  true, true, true, true, true, true, true, true, true, true, true,
  '/ai-solutions/ai-ad-creative-studio-cover.png',
  'Tomorrow''s Tech AI Ad Creative Studio creating professional ads in multiple formats',
  'sparkles', 'Build My Ad System',
  '/contact?service=ai-ad-creative-studio',
  '/services/ai-ad-creative-studio',
  'AI Ad Creative Studio | Tomorrow''s Tech AI',
  'Turn services, packages, and offers into polished, on-brand image ads with AI, catalog-backed copy, reusable templates, approvals, and multi-format exports.',
  array['/services', '/services/ai-ad-creative-studio', '/contact', '/admin/services', '/admin/ai-solutions', '/admin/marketing/ads'],
  'First fully built service. Pricing remains custom until delivery scope, generation allowance, and support terms are approved.'
)
on conflict (slug) where slug is not null do update set
  name = excluded.name,
  sku = excluded.sku,
  category = excluded.category,
  catalog_category = excluded.catalog_category,
  service_type = excluded.service_type,
  offer_kind = excluded.offer_kind,
  description = excluded.description,
  short_description = excluded.short_description,
  status = excluded.status,
  active = excluded.active,
  billing_type = excluded.billing_type,
  pricing_mode = excluded.pricing_mode,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  icon_key = excluded.icon_key,
  cta_label = excluded.cta_label,
  cta_route = excluded.cta_route,
  public_route = excluded.public_route,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  frontend_locations = excluded.frontend_locations,
  catalog_enabled = excluded.catalog_enabled,
  proposal_enabled = excluded.proposal_enabled,
  intake_enabled = excluded.intake_enabled,
  internal_sales_enabled = excluded.internal_sales_enabled,
  public_enabled = excluded.public_enabled,
  manual_invoice_enabled = excluded.manual_invoice_enabled,
  featured = excluded.featured,
  requires_quote = excluded.requires_quote,
  requires_approval = excluded.requires_approval,
  notes = excluded.notes,
  updated_at = now();

update public.ai_solutions
set service_id = (
      select id from public.catalog_items where slug = 'ai-ad-creative-studio'
    ),
    cover_image_url = '/ai-solutions/ai-ad-creative-studio-cover.png',
    updated_at = now()
where slug = 'ai-ad-creative-studio';

insert into public.service_inclusions
  (service_id, name, description, frequency, is_included, is_optional_addon, client_facing_description, sort_order)
select service.id, item.name, item.description, 'as_needed', true, false, item.description, item.sort_order
from public.catalog_items service
cross join (values
  ('Catalog-backed creative briefs', 'Uses the approved service or package name, description, price, features, and call to action instead of invented offer details.', 10),
  ('Tomorrow''s Tech brand system', 'Applies the approved logo, colors, typography direction, and visual style consistently.', 20),
  ('Five production formats', 'Creates square, portrait, story, landscape, and website hero versions for the selected offer.', 30),
  ('Reusable creative templates', 'Supports repeatable premium layouts without rebuilding each advertisement from scratch.', 40),
  ('Review and approval workflow', 'Keeps generated drafts separate from approved assets and preserves generation history.', 50),
  ('Downloadable image assets', 'Exports approved work as PNG, WebP, or JPEG for use across digital channels.', 60)
) as item(name, description, sort_order)
where service.slug = 'ai-ad-creative-studio'
  and not exists (
    select 1 from public.service_inclusions existing
    where existing.service_id = service.id and existing.name = item.name
  );

insert into public.service_deliverables
  (service_id, name, description, frequency, client_facing_description, sort_order, automation_key)
select service.id, item.name, item.description, 'as_needed', item.description, item.sort_order, item.automation_key
from public.catalog_items service
cross join (values
  ('Configured Ad Creative Studio', 'A working, branded creative workspace connected to the approved catalog and brand profile.', 10, 'configure_ad_studio'),
  ('Approved template set', 'Reusable layouts and prompting guidance aligned to the business and its offers.', 20, 'approve_ad_templates'),
  ('Creative asset library', 'A searchable record of drafts, approvals, downloads, source snapshots, and generation costs.', 30, 'initialize_ad_asset_library'),
  ('Launch verification', 'A complete test from catalog selection through generation, approval, download, and official-image assignment.', 40, 'verify_ad_studio_launch')
) as item(name, description, sort_order, automation_key)
where service.slug = 'ai-ad-creative-studio'
  and not exists (
    select 1 from public.service_deliverables existing
    where existing.service_id = service.id and existing.name = item.name
  );

insert into public.service_automation_settings
  (service_id, create_project, due_date_offset_days, notify_admin)
select id, true, 14, true
from public.catalog_items
where slug = 'ai-ad-creative-studio'
on conflict (service_id) do update set
  create_project = excluded.create_project,
  due_date_offset_days = excluded.due_date_offset_days,
  notify_admin = excluded.notify_admin;
