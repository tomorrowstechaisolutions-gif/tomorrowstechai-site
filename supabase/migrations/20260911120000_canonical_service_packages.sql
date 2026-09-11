-- Canonical public offer catalog.
-- catalog_items remains the stable identity used by proposals, invoices, jobs,
-- subscriptions, and service operations. Packages are explicitly distinguished
-- from individual services without moving or deleting existing records.
begin;

alter table public.catalog_items
  add column if not exists offer_kind text not null default 'service',
  add column if not exists slug text,
  add column if not exists catalog_category text not null default 'other',
  add column if not exists subtitle text,
  add column if not exists short_description text,
  add column if not exists image_url text,
  add column if not exists image_path text,
  add column if not exists image_alt text,
  add column if not exists icon_key text,
  add column if not exists pricing_mode text not null default 'fixed',
  add column if not exists badge text,
  add column if not exists most_popular boolean not null default false,
  add column if not exists cta_label text,
  add column if not exists cta_route text,
  add column if not exists public_route text,
  add column if not exists meta_title text,
  add column if not exists meta_description text,
  add column if not exists frontend_locations text[] not null default '{}',
  add column if not exists archived_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='catalog_items_offer_kind_check') then
    alter table public.catalog_items add constraint catalog_items_offer_kind_check check(offer_kind in ('service','package'));
  end if;
  if not exists (select 1 from pg_constraint where conname='catalog_items_pricing_mode_check') then
    alter table public.catalog_items add constraint catalog_items_pricing_mode_check check(pricing_mode in ('fixed','starting_at','custom_quote','free'));
  end if;
  if not exists (select 1 from pg_constraint where conname='catalog_items_slug_format_check') then
    alter table public.catalog_items add constraint catalog_items_slug_format_check check(slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
  if not exists (select 1 from pg_constraint where conname='catalog_items_image_url_check') then
    alter table public.catalog_items add constraint catalog_items_image_url_check check(image_url is null or image_url ~ '^(https?://|/)');
  end if;
end $$;

-- Preserve every existing row and derive a stable slug. The id suffix only
-- participates when old names normalize to the same slug.
update public.catalog_items c set slug = candidate.slug
from (
  select id,
    regexp_replace(regexp_replace(lower(name),'[^a-z0-9]+','-','g'),'(^-|-$)','','g') ||
    case when count(*) over(partition by regexp_replace(regexp_replace(lower(name),'[^a-z0-9]+','-','g'),'(^-|-$)','','g')) > 1
      then '-' || left(id::text,8) else '' end as slug
  from public.catalog_items where slug is null
) candidate where candidate.id=c.id;
create unique index if not exists catalog_items_slug_unique on public.catalog_items(slug) where slug is not null;
create index if not exists catalog_items_offer_directory on public.catalog_items(offer_kind,status,public_enabled,catalog_category,position);

alter table public.service_package_relationships
  add column if not exists included boolean not null default true,
  add column if not exists feature_label text,
  add column if not exists feature_description text,
  add column if not exists sort_order integer not null default 0;
create index if not exists service_package_relationships_order on public.service_package_relationships(package_id,sort_order,id);

create or replace function public.save_package(p_id uuid,p_data jsonb,p_relationships jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare current_row public.catalog_items; result_id uuid; rel jsonb;
begin
  if not public.can_manage_services() then raise exception 'Not authorized'; end if;
  if p_id is null then
    insert into public.catalog_items(name,slug,offer_kind,status) values(p_data->>'name',p_data->>'slug','package','draft') returning * into current_row;
  else
    select * into current_row from public.catalog_items where id=p_id and offer_kind='package' for update;
    if not found then raise exception 'Package not found'; end if;
    if p_expected is null or current_row.updated_at<>p_expected then raise exception 'Package changed; reload before saving' using errcode='40001'; end if;
  end if;
  result_id:=current_row.id;
  current_row:=jsonb_populate_record(current_row,p_data);
  update public.catalog_items set name=current_row.name,slug=current_row.slug,catalog_category=current_row.catalog_category,
    category=current_row.category,subtitle=current_row.subtitle,short_description=current_row.short_description,description=current_row.description,
    image_url=current_row.image_url,image_alt=current_row.image_alt,icon_key=current_row.icon_key,pricing_mode=current_row.pricing_mode,
    from_cents=current_row.from_cents,setup_fee_cents=current_row.setup_fee_cents,billing_type=current_row.billing_type,
    billing_interval=current_row.billing_interval,interval_months=current_row.interval_months,badge=current_row.badge,
    most_popular=current_row.most_popular,featured=current_row.featured,status=current_row.status,active=current_row.status='active',
    position=current_row.position,cta_label=current_row.cta_label,cta_route=current_row.cta_route,public_route=current_row.public_route,
    meta_title=current_row.meta_title,meta_description=current_row.meta_description,frontend_locations=current_row.frontend_locations,
    catalog_enabled=current_row.catalog_enabled,proposal_enabled=current_row.proposal_enabled,intake_enabled=current_row.intake_enabled,
    internal_sales_enabled=current_row.internal_sales_enabled,public_enabled=current_row.public_enabled,manual_invoice_enabled=current_row.manual_invoice_enabled,
    requires_quote=current_row.requires_quote where id=result_id;
  delete from public.service_package_relationships where package_id=result_id;
  for rel in select value from jsonb_array_elements(coalesce(p_relationships,'[]'::jsonb)) loop
    insert into public.service_package_relationships(package_id,service_id,relationship_type,included,feature_label,feature_description,sort_order)
    values(result_id,(rel->>'service_id')::uuid,'included',coalesce((rel->>'included')::boolean,true),nullif(rel->>'feature_label',''),nullif(rel->>'feature_description',''),coalesce((rel->>'sort_order')::integer,0));
  end loop;
  return result_id;
end $$;
revoke all on function public.save_package(uuid,jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.save_package(uuid,jsonb,jsonb,timestamptz) to authenticated,service_role;

create or replace function public.validate_service_package() returns trigger language plpgsql security invoker set search_path=public as $$
declare service_kind text; package_kind text;
begin
  perform pg_advisory_xact_lock(74291);
  select offer_kind into service_kind from public.catalog_items where id=new.service_id;
  select offer_kind into package_kind from public.catalog_items where id=new.package_id;
  if service_kind <> 'service' or package_kind <> 'package' then
    raise exception 'Packages may contain individual services only';
  end if;
  if exists(with recursive parents(id) as (
    select new.package_id union select r.package_id from public.service_package_relationships r join parents p on r.service_id=p.id where r.id<>new.id
  ) select 1 from parents where id=new.service_id) then raise exception 'Package relationships cannot form a cycle'; end if;
  return new;
end $$;

-- Normalize records that are unmistakably package offers already in Catalog.
update public.catalog_items set offer_kind='package'
where lower(name) in (
  'starter website','classic business website','professional business website','e-commerce website',
  'ai starter','ai growth','ai operator','custom growth system','grow your audience starter',
  'grow your audience growth','grow your audience full service','custom ai business operator',
  'custom business system','website hosting & management','logo studio diy','custom built website'
);
update public.catalog_items set slug=case lower(name)
  when 'starter website' then 'website-starter' when 'classic business website' then 'website-classic'
  when 'professional business website' then 'website-professional' when 'e-commerce website' then 'website-ecommerce'
  when 'ai starter' then 'ai-operator-starter' when 'ai growth' then 'ai-operator-growth'
  when 'ai operator' then 'ai-operator-operator' when 'custom growth system' then 'audience-custom'
  when 'grow your audience starter' then 'audience-starter' when 'grow your audience growth' then 'audience-growth'
  when 'grow your audience full service' then 'audience-full-service' when 'custom ai business operator' then 'ai-operator-custom'
  when 'custom business system' then 'run-your-business-custom' when 'website hosting & management' then 'website-hosting'
  when 'logo studio diy' then 'logo-studio-diy' when 'custom built website' then 'website-custom' else slug end
where offer_kind='package';

-- Individual services observed across the current public offer pages. ON
-- CONFLICT keeps admin-authored production data authoritative on replays.
insert into public.catalog_items(name,slug,offer_kind,catalog_category,category,short_description,description,service_type,status,billing_type,pricing_mode,from_cents,position,catalog_enabled,proposal_enabled,intake_enabled,internal_sales_enabled,public_enabled,manual_invoice_enabled) values
 ('Website Design','website-design','service','websites','development','Responsive visual design for business websites.','Responsive visual design for business websites.','Website','active','custom_quote','custom_quote',0,100,true,true,true,true,true,true),
 ('Website Development','website-development','service','websites','development','Production website build, deployment and launch.','Production website build, deployment and launch.','Website','active','custom_quote','custom_quote',0,110,true,true,true,true,true,true),
 ('Search Engine Optimization','seo','service','websites','marketing','Technical and on-page search optimization.','Technical and on-page search optimization.','SEO','active','custom_quote','custom_quote',0,120,true,true,true,true,true,true),
 ('Lead Form Setup','lead-form-setup','service','websites','crm','Lead and quote forms connected to the business workflow.','Lead and quote forms connected to the business workflow.','Website','active','custom_quote','custom_quote',0,130,true,true,true,true,true,true),
 ('Analytics Setup','analytics-setup','service','websites','dashboard','Analytics, Search Console and conversion tracking.','Analytics, Search Console and conversion tracking.','Website','active','custom_quote','custom_quote',0,140,true,true,true,true,true,true),
 ('E-Commerce Setup','ecommerce-setup','service','websites','ecommerce','Catalog, cart, checkout, payment, shipping and tax setup.','Catalog, cart, checkout, payment, shipping and tax setup.','Website','active','custom_quote','custom_quote',0,150,true,true,true,true,true,true),
 ('CRM & Pipeline Management','crm-pipeline-management','service','business-systems','crm','Customer records, pipeline stages and opportunity tracking.','Customer records, pipeline stages and opportunity tracking.','Software','active','custom_quote','custom_quote',0,200,true,true,true,true,true,true),
 ('Scheduling & Calendar','scheduling-calendar','service','business-systems','custom_app','Scheduling, appointments and calendar workflows.','Scheduling, appointments and calendar workflows.','Software','active','custom_quote','custom_quote',0,210,true,true,true,true,true,true),
 ('Business Dashboard','business-dashboard','service','business-systems','dashboard','A real-time command center for business activity.','A real-time command center for business activity.','Software','active','custom_quote','custom_quote',0,220,true,true,true,true,true,true),
 ('Project Management','project-management','service','business-systems','custom_app','Projects, tasks, progress and delivery coordination.','Projects, tasks, progress and delivery coordination.','Software','active','custom_quote','custom_quote',0,230,true,true,true,true,true,true),
 ('Workflow Automation','workflow-automation','service','automation','ai_automation','Connected workflows that reduce repetitive manual work.','Connected workflows that reduce repetitive manual work.','Custom','active','custom_quote','custom_quote',0,300,true,true,true,true,true,true),
 ('API Integration','api-integration','service','integrations','development','Secure connections between business systems and data.','Secure connections between business systems and data.','Custom','active','custom_quote','custom_quote',0,310,true,true,true,true,true,true),
 ('AI Chat & Voice','ai-chat-voice','service','ai','ai_automation','AI-assisted web chat, text and voice response.','AI-assisted web chat, text and voice response.','AI Solution','active','custom_quote','custom_quote',0,400,true,true,true,true,true,true),
 ('Lead Capture & Follow-Up','lead-capture-follow-up','service','ai','ai_automation','Capture, qualify and follow up with leads automatically.','Capture, qualify and follow up with leads automatically.','AI Solution','active','custom_quote','custom_quote',0,410,true,true,true,true,true,true),
 ('Appointment Booking','appointment-booking','service','ai','ai_automation','Automated appointment scheduling and confirmations.','Automated appointment scheduling and confirmations.','AI Solution','active','custom_quote','custom_quote',0,420,true,true,true,true,true,true),
 ('Review & Reputation Management','review-reputation-management','service','marketing','social','Review requests, monitoring and reputation workflows.','Review requests, monitoring and reputation workflows.','Marketing','active','custom_quote','custom_quote',0,500,true,true,true,true,true,true),
 ('Social Media Management','social-media-management','service','marketing','social','Managed social publishing and channel activity.','Managed social publishing and channel activity.','Social Media','active','custom_quote','custom_quote',0,510,true,true,true,true,true,true),
 ('Content Creation','content-creation','service','marketing','marketing','Professional posts, captions and campaign creative.','Professional posts, captions and campaign creative.','Marketing','active','custom_quote','custom_quote',0,520,true,true,true,true,true,true),
 ('Campaign Management','campaign-management','service','marketing','marketing','Campaign planning, launch and ongoing management.','Campaign planning, launch and ongoing management.','Marketing','active','custom_quote','custom_quote',0,530,true,true,true,true,true,true),
 ('Lead Generation','lead-generation','service','marketing','marketing','Campaigns and systems designed to generate qualified leads.','Campaigns and systems designed to generate qualified leads.','Marketing','active','custom_quote','custom_quote',0,540,true,true,true,true,true,true),
 ('Email & SMS Marketing','email-sms-marketing','service','marketing','marketing','Permission-based email and SMS campaign workflows.','Permission-based email and SMS campaign workflows.','Marketing','active','custom_quote','custom_quote',0,550,true,true,true,true,true,true),
 ('Managed Hosting','managed-hosting','service','hosting','hosting','Secure hosting, SSL, backups and platform maintenance.','Secure hosting, SSL, backups and platform maintenance.','Hosting','active','recurring','fixed',2900,600,true,true,true,true,true,true),
 ('Ongoing Support','ongoing-support','service','support','other','Human support and ongoing system care.','Human support and ongoing system care.','Consulting','active','custom_quote','custom_quote',0,610,true,true,true,true,true,true),
 ('Logo Design','logo-design','service','branding','development','Logo creation and brand mark development.','Logo creation and brand mark development.','Logo / Branding','active','custom_quote','custom_quote',0,700,true,true,true,true,true,true)
on conflict(slug) where slug is not null do nothing;

insert into public.catalog_items(name,slug,offer_kind,catalog_category,category,short_description,description,service_type,status,billing_type,pricing_mode,from_cents,position,catalog_enabled,proposal_enabled,intake_enabled,internal_sales_enabled,public_enabled,manual_invoice_enabled) values
 ('Mobile Responsive Design','mobile-responsive-design','service','websites','development','Responsive behavior across phones, tablets and desktops.','Responsive behavior across phones, tablets and desktops.','Website','active','custom_quote','custom_quote',0,151,true,true,true,true,true,true),
 ('Domain, SSL & Deployment','domain-ssl-deployment','service','websites','hosting','Domain connection, SSL and production deployment.','Domain connection, SSL and production deployment.','Hosting','active','custom_quote','custom_quote',0,152,true,true,true,true,true,true),
 ('Website Revisions','website-revisions','service','websites','development','Structured design and content revision rounds.','Structured design and content revision rounds.','Website','active','custom_quote','custom_quote',0,153,true,true,true,true,true,true),
 ('Maps & Social Integration','maps-social-integration','service','websites','development','Business maps and social profile integrations.','Business maps and social profile integrations.','Website','active','custom_quote','custom_quote',0,154,true,true,true,true,true,true),
 ('Testimonials & Reviews Section','testimonials-reviews-section','service','websites','development','Customer proof and testimonial display.','Customer proof and testimonial display.','Website','active','custom_quote','custom_quote',0,155,true,true,true,true,true,true),
 ('Content Management System','content-management-system','service','websites','development','Editable content management where appropriate.','Editable content management where appropriate.','Website','active','custom_quote','custom_quote',0,156,true,true,true,true,true,true),
 ('Conversion-Focused Layout','conversion-focused-layout','service','websites','marketing','Page structure designed around inquiry and conversion.','Page structure designed around inquiry and conversion.','Website','active','custom_quote','custom_quote',0,157,true,true,true,true,true,true),
 ('Custom Graphics & Image Treatment','custom-graphics-image-treatment','service','websites','development','Custom graphics and professional image treatment.','Custom graphics and professional image treatment.','Website','active','custom_quote','custom_quote',0,158,true,true,true,true,true,true),
 ('Blog & News Capability','blog-news-capability','service','websites','development','Editable blog or news publishing.','Editable blog or news publishing.','Website','active','custom_quote','custom_quote',0,159,true,true,true,true,true,true),
 ('Email Notification Automation','email-notification-automation','service','automation','ai_automation','Automated operational email notifications.','Automated operational email notifications.','Custom','active','custom_quote','custom_quote',0,320,true,true,true,true,true,true),
 ('Advanced Galleries','advanced-galleries','service','websites','development','Rich image and project galleries.','Rich image and project galleries.','Website','active','custom_quote','custom_quote',0,160,true,true,true,true,true,true),
 ('Product Catalog Setup','product-catalog-setup','service','websites','ecommerce','Product entry, categories and store search.','Product entry, categories and store search.','Website','active','custom_quote','custom_quote',0,161,true,true,true,true,true,true),
 ('Payment, Shipping & Tax Setup','payment-shipping-tax','service','websites','ecommerce','Checkout payments, shipping and tax configuration.','Checkout payments, shipping and tax configuration.','Website','active','custom_quote','custom_quote',0,162,true,true,true,true,true,true),
 ('Customer Store Accounts','customer-store-accounts','service','websites','ecommerce','Customer accounts, order history and notifications.','Customer accounts, order history and notifications.','Website','active','custom_quote','custom_quote',0,163,true,true,true,true,true,true),
 ('Missed-Call Text Back','missed-call-text-back','service','ai','ai_automation','Immediate automated response to missed calls.','Immediate automated response to missed calls.','AI Solution','active','custom_quote','custom_quote',0,430,true,true,true,true,true,true),
 ('Estimate Follow-Up','estimate-follow-up','service','ai','ai_automation','Automated follow-up for open estimates and quotes.','Automated follow-up for open estimates and quotes.','AI Solution','active','custom_quote','custom_quote',0,431,true,true,true,true,true,true),
 ('Customer Reminders','customer-reminders','service','ai','ai_automation','Automated reminders that reduce missed appointments.','Automated reminders that reduce missed appointments.','AI Solution','active','custom_quote','custom_quote',0,432,true,true,true,true,true,true),
 ('AI Email Responses','ai-email-responses','service','ai','ai_automation','On-brand assisted customer email responses.','On-brand assisted customer email responses.','AI Solution','active','custom_quote','custom_quote',0,433,true,true,true,true,true,true),
 ('Marketing Strategy','marketing-strategy','service','marketing','marketing','Ongoing campaign and audience strategy.','Ongoing campaign and audience strategy.','Marketing','active','custom_quote','custom_quote',0,560,true,true,true,true,true,true),
 ('Community Monitoring','community-monitoring','service','marketing','social','Comment and message monitoring across active channels.','Comment and message monitoring across active channels.','Social Media','active','custom_quote','custom_quote',0,561,true,true,true,true,true,true),
 ('Paid Advertising','paid-advertising','service','marketing','marketing','Managed advertising across paid channels.','Managed advertising across paid channels.','Marketing','active','custom_quote','custom_quote',0,562,true,true,true,true,true,true)
on conflict(slug) where slug is not null do nothing;

-- Current production packages, preserving the codebase's complete offer copy.
insert into public.catalog_items(name,slug,offer_kind,catalog_category,category,subtitle,short_description,description,service_type,status,billing_type,billing_interval,pricing_mode,from_cents,setup_fee_cents,badge,most_popular,featured,position,cta_label,cta_route,public_route,frontend_locations,catalog_enabled,proposal_enabled,intake_enabled,internal_sales_enabled,public_enabled,manual_invoice_enabled) values
 ('Starter Website','website-starter','package','websites','launch_package','Get online fast','Get online fast, at the lowest price we offer.','Professional starter website package.','Website','active','one_time','monthly','fixed',14900,0,null,false,false,10,'See the $149 package','/website-intake?package=website-starter','/services',array['/services','/website-intake'],true,true,true,true,true,true),
 ('Classic Business Website','website-classic','package','websites','launch_package','Professional, polished, ready to launch','A complete five-page business website.','Professional business website package.','Website','active','one_time','monthly','fixed',39900,0,'Most Popular',true,true,20,'See the $399 package','/website-intake?package=website-classic','/services',array['/services','/website-intake'],true,true,true,true,true,true),
 ('Professional Business Website','website-professional','package','websites','launch_package','Built to generate and organize business','Premium website, lead capture and analytics package.','Professional website and growth foundation.','Website','active','one_time','monthly','fixed',69900,0,null,false,false,30,'See the $699 package','/website-intake?package=website-professional','/services',array['/services','/website-intake'],true,true,true,true,true,true),
 ('E-Commerce Website','website-ecommerce','package','websites','ecommerce','Launch your online store and start selling','E-commerce website with catalog, checkout and operations setup.','Complete e-commerce website package.','Website','active','one_time','monthly','fixed',99900,0,null,false,false,40,'See the $999 package','/website-intake?package=website-ecommerce','/services',array['/services','/website-intake'],true,true,true,true,true,true),
 ('AI Starter','ai-operator-starter','package','ai','ai_automation','Focused AI foundation','A focused foundation for capturing and following up with new leads.','AI Business Operator starter package.','AI Solution','active','recurring','monthly','fixed',19900,29900,null,false,false,100,'Get Started','/get-started?plan=ai-operator-starter','/services/ai-business-operator',array['/services/ai-business-operator','/get-started'],true,true,true,true,true,true),
 ('AI Growth','ai-operator-growth','package','ai','ai_automation','Automate leads and grow','Everything needed to capture, follow up and grow.','AI Business Operator growth package.','AI Solution','active','recurring','monthly','fixed',39900,74900,'Most Popular',true,true,110,'Get Started','/get-started?plan=ai-operator-growth','/services/ai-business-operator',array['/services/ai-business-operator','/get-started'],true,true,true,true,true,true),
 ('AI Operator','ai-operator-operator','package','ai','ai_automation','Advanced managed operations','Advanced automation and managed operations for a growing service business.','Advanced AI Business Operator package.','AI Solution','active','recurring','monthly','fixed',69900,149900,null,false,false,120,'Get Started','/get-started?plan=ai-operator-operator','/services/ai-business-operator',array['/services/ai-business-operator','/get-started'],true,true,true,true,true,true),
 ('Custom AI Business Operator','ai-operator-custom','package','ai','ai_automation','Designed around your workflows','A custom operating system designed around your workflows and integrations.','Custom AI Business Operator package.','AI Solution','active','recurring','monthly','starting_at',99900,250000,null,false,false,130,'Let''s Talk','/get-started?plan=ai-operator-custom','/services/ai-business-operator',array['/services/ai-business-operator','/get-started'],true,true,true,true,true,true),
 ('Grow Your Audience Starter','audience-starter','package','marketing','marketing','Stay Active','Managed social presence for a growing business.','Grow Your Audience starter package.','Marketing','active','recurring','monthly','fixed',19900,0,null,false,false,200,'Get Started','/contact?service=grow-your-audience&plan=audience-starter','/services/grow-your-audience',array['/services/grow-your-audience','/contact'],true,true,true,true,true,true),
 ('Grow Your Audience Growth','audience-growth','package','marketing','marketing','Build Your Audience','Campaigns, lead generation and audience growth.','Grow Your Audience growth package.','Marketing','active','recurring','monthly','fixed',39900,0,'Most Popular',true,true,210,'Grow My Business','/contact?service=grow-your-audience&plan=audience-growth','/services/grow-your-audience',array['/services/grow-your-audience','/contact'],true,true,true,true,true,true),
 ('Grow Your Audience Full Service','audience-full-service','package','marketing','marketing','We Run Your Marketing','Full-service content, campaigns and reputation management.','Grow Your Audience full-service package.','Marketing','active','recurring','monthly','fixed',69900,0,null,false,false,220,'Run My Marketing','/contact?service=grow-your-audience&plan=audience-full-service','/services/grow-your-audience',array['/services/grow-your-audience','/contact'],true,true,true,true,true,true),
 ('Custom Growth System','audience-custom','package','marketing','marketing','For Serious Growth','A custom multi-channel growth system.','Custom Grow Your Audience system.','Marketing','active','recurring','monthly','starting_at',99900,0,null,false,false,230,'Build My Custom Plan','/contact?service=grow-your-audience&plan=audience-custom','/services/grow-your-audience',array['/services/grow-your-audience','/contact'],true,true,true,true,true,true),
 ('Custom Business System','run-your-business-custom','package','business-systems','custom_app','Your business, your system','A complete operating platform built around your business.','Custom CRM, scheduling, projects, orders, documents, analytics and AI.','Software','active','custom_quote','custom','custom_quote',0,0,null,false,true,300,'Build My System','/contact?service=run-your-business&plan=run-your-business-custom','/services/run-your-business',array['/services/run-your-business','/services','/contact'],true,true,true,true,true,true),
 ('Website Hosting & Management','website-hosting','package','hosting','hosting','Fast, secure hosting','Hosting, SSL, backups and security updates.','Managed website hosting package.','Hosting','active','recurring','monthly','fixed',2900,0,null,false,false,400,'Contact Us','/contact?service=hosting&plan=website-hosting','/services',array['/services','/contact'],true,true,true,true,true,true),
 ('Logo Studio DIY','logo-studio-diy','package','branding','development','Create a professional logo','DIY logo creation package.','Logo Studio DIY package.','Logo / Branding','active','one_time','monthly','fixed',3900,0,null,false,false,500,'Create My Logo','/logo-studio','/logo-studio',array['/logo-studio'],true,true,true,true,true,true),
 ('Custom Built Website','website-custom','package','websites','development','Original design and content','A custom website designed and written around your business.','Custom-built website package.','Website','active','one_time','monthly','starting_at',150000,0,null,false,false,50,'Start a Custom Website','/website-intake?package=website-custom','/services',array['/services','/website-intake'],true,true,true,true,true,true)
on conflict(slug) where slug is not null do nothing;

-- Package feature labels are intentionally package-specific. This maps them
-- to stable individual services without weakening the underlying service name.
with links(package_slug,service_slug,label,description,sort_order) as (values
 ('website-starter','website-design','Professional starter layout',null,10),('website-starter','website-development','Up to 3 pages — Home, Services, Contact',null,20),('website-starter','mobile-responsive-design','Mobile responsive design',null,30),('website-starter','lead-form-setup','Contact / lead form',null,40),('website-starter','seo','Basic SEO setup',null,50),('website-starter','domain-ssl-deployment','Domain connection, SSL and deployment',null,60),('website-starter','website-revisions','1 revision round',null,70),
 ('website-classic','website-design','More customized design and layouts',null,10),('website-classic','website-development','Up to 5 custom pages',null,20),('website-classic','mobile-responsive-design','Mobile responsive design',null,30),('website-classic','lead-form-setup','Enhanced contact forms',null,40),('website-classic','seo','Basic SEO setup',null,50),('website-classic','maps-social-integration','Social media and Google Maps integration',null,60),('website-classic','testimonials-reviews-section','Testimonials / reviews section',null,70),('website-classic','analytics-setup','Basic analytics setup',null,80),('website-classic','content-management-system','CMS access where applicable',null,90),('website-classic','conversion-focused-layout','Conversion-focused layout',null,100),('website-classic','website-revisions','2 revision rounds and launch support',null,110),
 ('website-professional','website-design','Premium custom design',null,10),('website-professional','website-development','Up to 10 custom pages',null,20),('website-professional','mobile-responsive-design','Mobile responsive design',null,30),('website-professional','custom-graphics-image-treatment','Custom graphics and image treatment',null,40),('website-professional','lead-form-setup','Multiple lead and quote forms',null,50),('website-professional','crm-pipeline-management','Lead capture workflow and CRM-ready integration',null,60),('website-professional','appointment-booking','Appointment / inquiry workflow',null,70),('website-professional','blog-news-capability','Blog / news capability',null,80),('website-professional','analytics-setup','Analytics, Search Console and conversion tracking',null,90),('website-professional','seo','Enhanced SEO',null,100),('website-professional','email-notification-automation','Email notification automation',null,110),('website-professional','advanced-galleries','Advanced galleries',null,120),('website-professional','website-revisions','3 revision rounds',null,130),('website-professional','ongoing-support','30 days of launch support',null,140),
 ('website-ecommerce','website-design','Mobile responsive store',null,10),('website-ecommerce','website-development','Up to 8–10 informational pages',null,20),('website-ecommerce','ecommerce-setup','Full custom e-commerce website',null,30),('website-ecommerce','product-catalog-setup','Catalog, categories and search; up to 20 products entered',null,40),('website-ecommerce','payment-shipping-tax','Shopping cart, secure checkout, payment, shipping and tax',null,50),('website-ecommerce','customer-store-accounts','Customer accounts, order history and notifications',null,60),('website-ecommerce','maps-social-integration','Social media integration',null,70),('website-ecommerce','seo','Basic SEO',null,80),('website-ecommerce','analytics-setup','Store analytics',null,90),('website-ecommerce','website-revisions','3 revision rounds and launch support',null,100),
 ('website-custom','website-design','Original custom visual design',null,10),('website-custom','website-development','Custom website development',null,20),('website-custom','lead-form-setup','Conversion-focused forms',null,30),('website-custom','seo','Search-ready foundation',null,40),('website-custom','analytics-setup','Analytics and conversion tracking',null,50),
 ('ai-operator-starter','ai-chat-voice','AI chat',null,10),('ai-operator-starter','missed-call-text-back','Missed-call text back',null,20),('ai-operator-starter','lead-capture-follow-up','Lead capture and basic follow-up',null,30),('ai-operator-starter','website-development','Professional website included when applicable',null,40),
 ('ai-operator-growth','ai-chat-voice','AI chat & missed-call text back',null,10),('ai-operator-growth','lead-capture-follow-up','Lead capture & follow-up',null,20),('ai-operator-growth','crm-pipeline-management','CRM & pipeline management',null,30),('ai-operator-growth','appointment-booking','Appointment booking',null,40),('ai-operator-growth','review-reputation-management','Review requests',null,50),('ai-operator-growth','social-media-management','Social media posting',null,60),
 ('ai-operator-operator','ai-chat-voice','Everything in AI Growth',null,10),('ai-operator-operator','workflow-automation','Advanced automation',null,20),('ai-operator-operator','estimate-follow-up','Estimate follow-up',null,30),('ai-operator-operator','customer-reminders','Customer reminders',null,40),('ai-operator-operator','ai-email-responses','AI email responses',null,50),('ai-operator-operator','business-dashboard','Expanded reporting',null,60),('ai-operator-operator','ongoing-support','Priority support',null,70),
 ('ai-operator-custom','workflow-automation','Custom workflow design',null,10),('ai-operator-custom','api-integration','Custom integrations and API connections',null,20),('ai-operator-custom','business-dashboard','Advanced reporting',null,30),('ai-operator-custom','ai-chat-voice','Scalable AI architecture',null,40),('ai-operator-custom','ongoing-support','Dedicated support',null,50),
 ('audience-starter','social-media-management','2 social platforms',null,10),('audience-starter','content-creation','8 posts per month with custom graphics, captions and hashtags',null,20),('audience-starter','campaign-management','Content scheduling',null,30),('audience-starter','analytics-setup','Monthly analytics and basic dashboard',null,40),('audience-starter','marketing-strategy','Monthly review',null,50),
 ('audience-growth','social-media-management','Management for up to 3 social platforms',null,10),('audience-growth','content-creation','16 posts per month',null,20),('audience-growth','campaign-management','Campaign creation',null,30),('audience-growth','lead-generation','Lead generation',null,40),('audience-growth','review-reputation-management','Reputation monitoring',null,50),('audience-growth','analytics-setup','Analytics dashboard and monthly strategy',null,60),
 ('audience-full-service','social-media-management','Up to 5 platforms',null,10),('audience-full-service','content-creation','24 posts per month',null,20),('audience-full-service','campaign-management','Campaign management',null,30),('audience-full-service','lead-generation','Lead generation',null,40),('audience-full-service','review-reputation-management','Review and reputation management',null,50),('audience-full-service','community-monitoring','Comment and message monitoring',null,60),('audience-full-service','workflow-automation','Advanced automation',null,70),('audience-full-service','marketing-strategy','Ongoing strategy',null,80),('audience-full-service','ongoing-support','Ongoing support',null,90),
 ('audience-custom','paid-advertising','Paid advertising across Facebook, Instagram and Google',null,10),('audience-custom','website-development','Landing pages',null,20),('audience-custom','crm-pipeline-management','CRM integration',null,30),('audience-custom','email-sms-marketing','Email and SMS campaigns',null,40),('audience-custom','workflow-automation','Advanced AI automation',null,50),('audience-custom','social-media-management','Multiple locations and higher content volume',null,60),('audience-custom','marketing-strategy','Custom strategy',null,70),('audience-custom','ongoing-support','Custom support',null,80),
 ('run-your-business-custom','crm-pipeline-management','CRM, customers and pipeline',null,10),('run-your-business-custom','scheduling-calendar','Scheduling and calendar',null,20),('run-your-business-custom','project-management','Projects, tasks and progress',null,30),('run-your-business-custom','business-dashboard','Dashboard and real-time analytics',null,40),('run-your-business-custom','workflow-automation','Workflow automation',null,50),('run-your-business-custom','api-integration','Custom integrations',null,60),
 ('website-hosting','managed-hosting','Hosting, SSL, backups and security updates',null,10),('logo-studio-diy','logo-design','DIY logo creation',null,10)
)
insert into public.service_package_relationships(package_id,service_id,relationship_type,included,feature_label,feature_description,sort_order)
select p.id,s.id,'included',true,l.label,l.description,l.sort_order from links l
join public.catalog_items p on p.slug=l.package_slug join public.catalog_items s on s.slug=l.service_slug
on conflict(service_id,package_id) do update set included=excluded.included,feature_label=excluded.feature_label,feature_description=excluded.feature_description,sort_order=excluded.sort_order;

-- Packages are managed separately and never appear in operational Services.
create or replace view public.service_directory with (security_invoker=true) as
select
  c.id,c.name,c.category,c.description,c.billing,c.from_cents,c.active,c.position,c.notes,c.created_at,c.updated_at,
  c.sku,c.service_type,c.status,c.billing_type,c.billing_interval,c.interval_months,c.setup_fee_cents,c.taxable,
  c.catalog_enabled,c.proposal_enabled,c.intake_enabled,c.internal_sales_enabled,c.public_enabled,c.manual_invoice_enabled,
  c.featured,c.requires_quote,c.requires_approval,c.discount_eligible,
  k.internal_cost_cents,k.recurring_cost_cents,
  case
    when c.billing_type='recurring' and a.mrr_cents > 0 and costs.effective_cost_cents is not null then 100.0*(a.mrr_cents-costs.effective_cost_cents*a.monthly_cost_units)/a.mrr_cents
    when c.billing_type='recurring' and c.from_cents > 0 and costs.effective_cost_cents is not null then 100.0*(c.from_cents-costs.effective_cost_cents)/c.from_cents
    when c.billing_type<>'recurring' and c.from_cents > 0 and not c.requires_quote and costs.effective_cost_cents is not null then 100.0*(c.from_cents-costs.effective_cost_cents)/c.from_cents end margin,
  coalesce(a.active_clients,0) active_clients,coalesce(a.subscriptions,0) subscriptions,coalesce(a.mrr_cents,0) mrr_cents,
  coalesce(r.revenue_cents,0) revenue_cents,coalesce(r.sales_count,0) sales_count,
  c.discount_rules,c.custom_pricing_allowed,c.minimum_contract_months,c.trial_days,c.renewal_settings,c.margin_threshold_pct,c.ad_image_path,
  k.software_cost_cents,k.ai_api_cost_cents,k.hosting_cost_cents,k.contractor_cost_cents,k.labor_hours,k.labor_hourly_rate_cents,
  k.ad_platform_cost_cents,k.other_cost_cents,k.notes cost_notes,costs.component_cost_cents,costs.effective_cost_cents,
  case when c.billing_type='recurring' and costs.effective_cost_cents is not null then round(costs.effective_cost_cents*a.monthly_cost_units)::bigint else costs.effective_cost_cents end calculated_internal_cost_cents,
  case when c.billing_type='recurring' and a.mrr_cents>0 and costs.effective_cost_cents is not null then round(a.mrr_cents-costs.effective_cost_cents*a.monthly_cost_units)::bigint when c.billing_type<>'recurring' and not c.requires_quote and costs.effective_cost_cents is not null then c.from_cents-costs.effective_cost_cents end gross_profit_cents,
  case when costs.effective_cost_cents is null then 'missing_cost' when c.status='active' and c.from_cents=0 and not c.requires_quote then 'needs_attention' when c.status='active' and coalesce(a.active_clients,0)=0 then 'no_clients' when c.from_cents>0 and (case when c.billing_type='recurring' and a.mrr_cents>0 then 100.0*(a.mrr_cents-costs.effective_cost_cents*a.monthly_cost_units)/a.mrr_cents else 100.0*(c.from_cents-costs.effective_cost_cents)/c.from_cents end)<c.margin_threshold_pct then 'low_margin' else 'healthy' end health,
  c.slug,c.catalog_category,c.short_description,c.image_url,c.image_path,c.image_alt,c.icon_key,c.public_route,c.meta_title,c.meta_description,c.frontend_locations
from public.catalog_items c
left join public.service_costs k on k.service_id=c.id
left join lateral (select count(distinct customer_id) filter(where status='active') active_clients,count(*) filter(where status='active' and billing_type='recurring') subscriptions,coalesce(sum(sale_price_cents::numeric/interval_months) filter(where status='active' and billing_type='recurring'),0) mrr_cents,coalesce(sum(1.0/interval_months) filter(where status='active' and billing_type='recurring'),0) monthly_cost_units from public.client_services a where a.service_id=c.id) a on true
left join lateral (select sum(amount_cents) revenue_cents,count(distinct invoice_id) sales_count from public.service_sales r where r.service_id=c.id) r on true
cross join lateral (select case when k.software_cost_cents is not null or k.ai_api_cost_cents is not null or k.hosting_cost_cents is not null or k.contractor_cost_cents is not null or k.labor_hours is not null or k.labor_hourly_rate_cents is not null or k.ad_platform_cost_cents is not null or k.other_cost_cents is not null then coalesce(k.software_cost_cents,0)+coalesce(k.ai_api_cost_cents,0)+coalesce(k.hosting_cost_cents,0)+coalesce(k.contractor_cost_cents,0)+round(coalesce(k.labor_hours,0)*coalesce(k.labor_hourly_rate_cents,0))::integer+coalesce(k.ad_platform_cost_cents,0)+coalesce(k.other_cost_cents,0) end component_cost_cents,case when c.billing_type='recurring' then coalesce(k.recurring_cost_cents,case when k.software_cost_cents is not null or k.ai_api_cost_cents is not null or k.hosting_cost_cents is not null or k.contractor_cost_cents is not null or k.labor_hours is not null or k.labor_hourly_rate_cents is not null or k.ad_platform_cost_cents is not null or k.other_cost_cents is not null then coalesce(k.software_cost_cents,0)+coalesce(k.ai_api_cost_cents,0)+coalesce(k.hosting_cost_cents,0)+coalesce(k.contractor_cost_cents,0)+round(coalesce(k.labor_hours,0)*coalesce(k.labor_hourly_rate_cents,0))::integer+coalesce(k.ad_platform_cost_cents,0)+coalesce(k.other_cost_cents,0) end) else coalesce(k.internal_cost_cents,case when k.software_cost_cents is not null or k.ai_api_cost_cents is not null or k.hosting_cost_cents is not null or k.contractor_cost_cents is not null or k.labor_hours is not null or k.labor_hourly_rate_cents is not null or k.ad_platform_cost_cents is not null or k.other_cost_cents is not null then coalesce(k.software_cost_cents,0)+coalesce(k.ai_api_cost_cents,0)+coalesce(k.hosting_cost_cents,0)+coalesce(k.contractor_cost_cents,0)+round(coalesce(k.labor_hours,0)*coalesce(k.labor_hourly_rate_cents,0))::integer+coalesce(k.ad_platform_cost_cents,0)+coalesce(k.other_cost_cents,0) end) end effective_cost_cents) costs
where c.offer_kind='service';

commit;
