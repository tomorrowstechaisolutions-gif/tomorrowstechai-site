-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Pre-contract delivery and founding-client economics.
--
-- A real project can begin before a proposal is signed or an invoice is paid.
-- That is an exception, not revenue. These fields preserve the difference
-- between what was agreed, what was delivered, and what has actually been
-- collected. Cory / The Key Konnect is the first truthful backfill.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.jobs
  add column if not exists engagement_status text not null default 'contracted',
  add column if not exists pricing_model text not null default 'standard',
  add column if not exists recurring_value_cents integer not null default 0,
  add column if not exists estimated_market_value_cents integer,
  add column if not exists estimated_hours numeric(7,2),
  add column if not exists actual_hours numeric(7,2),
  add column if not exists payment_timing text,
  add column if not exists pricing_note text,
  add column if not exists scope_baseline text,
  add column if not exists scope_expansion text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_engagement_status_check') then
    alter table public.jobs add constraint jobs_engagement_status_check check (
      engagement_status in ('pre_contract', 'contracted', 'awaiting_payment', 'paid', 'cancelled')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_pricing_model_check') then
    alter table public.jobs add constraint jobs_pricing_model_check check (
      pricing_model in ('standard', 'custom', 'founding_client', 'portfolio', 'discounted', 'pro_bono')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_recurring_value_check') then
    alter table public.jobs add constraint jobs_recurring_value_check check (recurring_value_cents >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_market_value_check') then
    alter table public.jobs add constraint jobs_market_value_check check (
      estimated_market_value_cents is null or estimated_market_value_cents >= 0
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_hours_check') then
    alter table public.jobs add constraint jobs_hours_check check (
      (estimated_hours is null or estimated_hours >= 0) and
      (actual_hours is null or actual_hours >= 0)
    );
  end if;
end $$;

create index if not exists jobs_engagement_status_idx
  on public.jobs (engagement_status) where engagement_status <> 'paid';

-- This workflow is intentionally broader than a brochure site. It is the
-- reusable blueprint for a website plus business-operating backend.
insert into public.task_templates (key, name, description, package_key)
values (
  'founding_custom_platform',
  'Founding custom business platform',
  'A custom public website, commerce/media experiences, operational admin, CRM, QA, launch and handoff.',
  'founding_custom_platform'
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  package_key = excluded.package_key,
  active = true;

insert into public.task_template_items
  (template_id, sort_order, phase, type, priority, offset_days, estimated_hours, title, description)
select t.id, v.sort_order, v.phase, v.type, v.priority, v.offset_days,
       v.estimated_hours, v.title, v.description
from public.task_templates t
cross join (values
  ( 1, 'Intake',  'client_intake', 'high',     0,  0.5::numeric, 'Record discovery, price and payment timing', 'Write down the agreed scope, exceptions and when money becomes due.'),
  ( 2, 'Intake',  'design',        'high',     0,  1.0::numeric, 'Collect and approve brand assets', 'Logos, colors, photography and media files.'),
  ( 3, 'Intake',  'content',       'high',     0,  0.5::numeric, 'Collect business content and inventory fields', 'Contact details, vehicle data, merchandise and music metadata.'),
  ( 4, 'Intake',  'domain',        'high',     1,  0.5::numeric, 'Confirm domain ownership and launch access', 'Record registrar access without storing passwords in task notes.'),
  ( 5, 'Build',   'design',        'high',     1,  2.0::numeric, 'Design the public experience', 'Responsive visual system and navigation.'),
  ( 6, 'Build',   'website',       'high',     1,  3.0::numeric, 'Build core website pages', 'Home, inventory, finance, shop, music, about and contact.'),
  ( 7, 'Build',   'development',   'high',     1,  2.0::numeric, 'Build inventory search and vehicle details', 'Customer-facing vehicle catalog and detail routes.'),
  ( 8, 'Build',   'ecommerce',     'high',     1,  1.5::numeric, 'Build merchandise storefront and cart', 'Products, variants and cart experience; payment processing is scoped separately.'),
  ( 9, 'Build',   'content',       'medium',   1,  1.0::numeric, 'Build music and media experience', 'Audio playback, track presentation and artist content.'),
  (10, 'Build',   'development',   'high',     1,  1.5::numeric, 'Build secure admin access', 'Private routes and authenticated admin shell.'),
  (11, 'Build',   'crm',           'high',     1,  2.0::numeric, 'Build starter CRM and lead inbox', 'Capture and manage customer inquiries.'),
  (12, 'Build',   'development',   'high',     1,  1.5::numeric, 'Build vehicle inventory administration', 'Create, edit, publish and archive stock.'),
  (13, 'Build',   'development',   'medium',   1,  1.0::numeric, 'Build mobile VIN intake', 'Phone-friendly scanning and inventory entry workflow.'),
  (14, 'Build',   'development',   'high',     1,  2.0::numeric, 'Wire database, storage and access policies', 'Production schema, media storage and row-level security.'),
  (15, 'Build',   'development',   'high',     1,  1.0::numeric, 'Configure lead and finance forms', 'Persist submissions and make them visible in admin.'),
  (16, 'Build',   'content',       'medium',   1,  0.5::numeric, 'Connect social profiles and calls to action', null),
  (17, 'QA',      'quality',       'high',     2,  1.0::numeric, 'Run production build, lint and type checks', null),
  (18, 'QA',      'quality',       'high',     2,  1.0::numeric, 'Verify core routes and admin access', 'Public pages, protected pages and database-backed screens.'),
  (19, 'Review',  'website',       'critical', 2,  1.0::numeric, 'Client walkthrough and written scope confirmation', 'Acceptance is collected before launch; payment may be due after approval.'),
  (20, 'Review',  'website',       'high',     3,  2.0::numeric, 'Apply the included revision round', null),
  (21, 'QA',      'quality',       'high',     3,  1.0::numeric, 'Complete mobile and desktop visual QA', 'Check every route at phone, tablet and desktop sizes.'),
  (22, 'QA',      'quality',       'high',     3,  1.0::numeric, 'Test leads, finance, inventory and media end to end', 'Submit real test records and verify they arrive.'),
  (23, 'Launch',  'seo',           'medium',   4,  1.0::numeric, 'Finish SEO, legal and launch metadata', 'Metadata, sitemap, robots, privacy and terms.'),
  (24, 'Content', 'content',       'high',     4,  2.0::numeric, 'Load approved live inventory and merchandise', 'Client supplies final stock and product data.'),
  (25, 'Review',  'ecommerce',     'high',     4,  0.5::numeric, 'Confirm commerce checkout scope', 'Do not imply live payment processing until gateway, tax, shipping and fulfillment are agreed.'),
  (26, 'Review',  'development',   'medium',   4,  1.0::numeric, 'Price authorized multi-lot inventory feeds', 'A paid change order requiring written authorization and supported partner access.'),
  (27, 'Launch',  'domain',        'critical', 5,  1.0::numeric, 'Connect the approved .com and verify DNS', null),
  (28, 'Launch',  'launch',        'critical', 5,  1.0::numeric, 'Launch production and verify SSL', null),
  (29, 'Launch',  'quality',       'high',     5,  1.0::numeric, 'Run post-launch verification', 'Forms, auth, inventory, shop, music, analytics and mobile.'),
  (30, 'Billing', 'billing',       'critical', 5,  0.5::numeric, 'Invoice the approved build', 'Invoice only after the agreed final review and .com launch milestone.'),
  (31, 'Billing', 'hosting',       'high',     5,  0.5::numeric, 'Activate recurring hosting', 'Start the agreed monthly hosting only when the production site is live.'),
  (32, 'Handoff', 'support',       'high',     6,  1.0::numeric, 'Train the client on inventory, CRM and content', null),
  (33, 'Handoff', 'internal',      'medium',   7,  0.5::numeric, 'Close project and book the 30-day check-in', 'Confirm payment, hosting, access, backup and support ownership.')
) as v(sort_order, phase, type, priority, offset_days, estimated_hours, title, description)
where t.key = 'founding_custom_platform'
  and not exists (select 1 from public.task_template_items i where i.template_id = t.id);

-- ── The Key Konnect: first pre-contract / founding-client backfill ─────────
do $$
declare
  v_job_id uuid := 'c0722f45-6b5d-4f87-92a1-9cd72ae3f101';
  v_lead_id uuid := 'd7bf8f73-9e01-4e46-979f-0de0541b9c45';
  v_proposal_id uuid := '09ed4d35-736c-4031-9fe6-de4c1aff0768';
  v_owner text;
begin
  if not exists (select 1 from public.leads where id = v_lead_id)
     or not exists (select 1 from public.proposals where id = v_proposal_id) then
    raise notice 'The Key Konnect seed skipped: live lead/proposal not present in this database.';
    return;
  end if;

  select coalesce(p.owner, a.email, 'John') into v_owner
  from public.proposals p
  left join lateral (select email from public.admin_users order by created_at limit 1) a on true
  where p.id = v_proposal_id;

  update public.proposals set
    payment_mode = 'invoice_later',
    deposit_amount_cents = 0,
    package_key = 'founding_custom_platform',
    package_name = 'Founding Client Custom Automotive Platform',
    summary = 'Acceptance documents the agreed scope. No payment is due at signature. The $399 build is invoiced after final review, approval and production .com launch; $29/month hosting begins when the live site launches.',
    hosting_note = '$29/month begins when the approved production website is live on the client domain.',
    notes_internal = concat_ws(E'\n\n', nullif(notes_internal, ''),
      'FOUNDING-CLIENT EXCEPTION — Agreed $399 build + $29/month hosting. Work began before signature/payment. Track as pre-contract delivery, not revenue. Original expectation: 4–5 pages. Expanded delivery includes seven public routes, inventory/search, finance intake, merchandise storefront/cart, music/media, authenticated admin, inventory tools, starter CRM and mobile VIN intake. Estimated replacement value: $27,000; observed build effort: about 19.5 hours. Multi-lot automated feeds and live commerce checkout remain separately scoped until authorized.')
  where id = v_proposal_id;

  insert into public.jobs (
    id, lead_id, title, business_name, stage, package, project_type,
    value_cents, recurring_value_cents, estimated_market_value_cents,
    estimated_hours, actual_hours, engagement_status, pricing_model,
    payment_timing, pricing_note, scope_baseline, scope_expansion,
    owner, next_milestone, promised_days, due_at, started_at, site_url, notes
  ) values (
    v_job_id, v_lead_id, 'The Key Konnect automotive business platform',
    'The Key Konnect', 'Review', 'founding_custom_platform', 'custom_software',
    39900, 2900, 2700000, 60, 19.5, 'pre_contract', 'founding_client',
    'No payment due at proposal acceptance. Invoice $399 after final review, approval and .com launch; begin $29/month hosting at production launch.',
    'First real paying portfolio build. The agreed price is intentionally below the estimated replacement value and must not be treated as the future price for this scope.',
    '4–5 page custom website for $399 plus $29/month hosting.',
    'Seven public routes plus inventory/search, finance intake, merchandise storefront/cart, music/media, authenticated admin, inventory management, starter CRM, messages and mobile VIN intake.',
    v_owner, 'Walk Cory through staging, record written approval, then connect the .com.',
    14, '2026-09-08T22:00:00Z', '2026-09-01T06:23:00Z',
    'https://corywiththekeys.vercel.app',
    'Pre-contract project opened to reflect work already performed. Not signed, not paid and not revenue. Client assets (logo and song) were received and used. Production domain cutover remains pending.'
  ) on conflict (id) do update set
    lead_id = excluded.lead_id,
    title = excluded.title,
    business_name = excluded.business_name,
    stage = excluded.stage,
    package = excluded.package,
    project_type = excluded.project_type,
    value_cents = excluded.value_cents,
    recurring_value_cents = excluded.recurring_value_cents,
    estimated_market_value_cents = excluded.estimated_market_value_cents,
    estimated_hours = excluded.estimated_hours,
    actual_hours = excluded.actual_hours,
    engagement_status = excluded.engagement_status,
    pricing_model = excluded.pricing_model,
    payment_timing = excluded.payment_timing,
    pricing_note = excluded.pricing_note,
    scope_baseline = excluded.scope_baseline,
    scope_expansion = excluded.scope_expansion,
    owner = excluded.owner,
    next_milestone = excluded.next_milestone,
    due_at = excluded.due_at,
    site_url = excluded.site_url,
    notes = excluded.notes
  where public.jobs.engagement_status = 'pre_contract';

  update public.proposals set job_id = v_job_id where id = v_proposal_id;

  update public.deals set
    stage = 'proposal', value_cents = 39900, billing = 'one_time', probability = 75,
    expected_close = '2026-09-08',
    next_action = 'Review staging with Cory, secure written acceptance, then schedule .com cutover.',
    next_action_at = '2026-09-03T15:00:00Z',
    notes = concat_ws(E'\n\n', nullif(notes, ''),
      'Founding-client price: $399 build + $29/month hosting. Pre-contract delivery exists; no revenue is booked until payment.'),
    updated_at = now()
  where id = (select deal_id from public.proposals where id = v_proposal_id)
    and stage not in ('won', 'lost');

  if not exists (select 1 from public.job_events where job_id = v_job_id and body like 'Founding-client project reconciled%') then
    insert into public.job_events (job_id, kind, body, to_stage, actor)
    values (v_job_id, 'system',
      'Founding-client project reconciled from the live lead, proposal and completed build. Agreement value is $399 plus $29/month; estimated replacement value is tracked separately. No payment or revenue was recorded.',
      'Review', v_owner);
  end if;

  if not exists (select 1 from public.proposal_events where proposal_id = v_proposal_id and body like 'Payment timing corrected%') then
    insert into public.proposal_events (proposal_id, event_type, body, actor, metadata)
    values (v_proposal_id, 'note',
      'Payment timing corrected: acceptance documents scope; $399 is invoiced after approval and production .com launch. Pre-contract project linked without recording a sale.',
      v_owner, jsonb_build_object('job_id', v_job_id, 'pricing_model', 'founding_client'));
  end if;

  -- The compact project checklist and the schedulable Tasks board are both
  -- populated because they answer different questions in the admin.
  if not exists (select 1 from public.job_tasks where job_id = v_job_id) then
    insert into public.job_tasks (job_id, stage, label, position, done, done_at)
    select v_job_id, v.stage, v.label, v.position, v.done,
           case when v.done then '2026-09-02T09:19:00Z'::timestamptz else null end
    from (values
      ( 1, 'Intake',  'Record the verbal scope, $399 build and $29/month hosting', true),
      ( 2, 'Content', 'Receive and integrate Cory''s logos and music', true),
      ( 3, 'Build',   'Build the seven-page public website', true),
      ( 4, 'Build',   'Build inventory, finance, shop/cart and music experiences', true),
      ( 5, 'Build',   'Build authenticated admin, inventory tools, CRM and VIN intake', true),
      ( 6, 'Review',  'Send staging link and conduct client walkthrough', false),
      ( 7, 'Review',  'Record written acceptance of scope and payment timing', false),
      ( 8, 'Review',  'Apply the included revision round', false),
      ( 9, 'Launch',  'Connect thekeykonnect.com and verify DNS/SSL', false),
      (10, 'Launch',  'Run post-launch forms, auth, inventory and mobile checks', false),
      (11, 'Handoff', 'Invoice $399 after approval and production launch', false),
      (12, 'Handoff', 'Activate $29/month hosting and train Cory', false),
      (13, 'Handoff', 'Book the 30-day check-in and request a review', false)
    ) as v(position, stage, label, done);
  end if;

  if not exists (select 1 from public.tasks where job_id = v_job_id and template_key = 'founding_custom_platform') then
    insert into public.tasks (
      title, notes, kind, type, status, priority, due_at, start_date,
      estimated_hours, actual_hours, sort_order, owner, created_by,
      lead_id, job_id, proposal_id, template_key, tags, source
    )
    select i.title,
      concat_ws(E'\n\n', i.description, 'Founding custom business platform · ' || i.phase),
      'task', i.type,
      case
        when i.sort_order <= 18 then 'completed'
        when i.sort_order = 19 then 'in_progress'
        when i.sort_order in (24, 25, 29) then 'waiting'
        when i.sort_order = 26 then 'backlog'
        else 'not_started'
      end,
      i.priority,
      ('2026-09-01 17:00:00-05'::timestamptz + make_interval(days => i.offset_days)),
      '2026-09-01'::date,
      i.estimated_hours,
      case when i.sort_order <= 18 then greatest(0.25, coalesce(i.estimated_hours, 0.5) * 0.55) else null end,
      i.sort_order, v_owner, v_owner, v_lead_id, v_job_id, v_proposal_id,
      'founding_custom_platform', array['the-key-konnect', 'founding-client'], 'system'
    from public.task_template_items i
    join public.task_templates t on t.id = i.template_id
    where t.key = 'founding_custom_platform'
    order by i.sort_order;

    update public.tasks set
      blocked_reason = case
        when sort_order = 24 then 'Waiting for Cory''s approved live inventory and merchandise data.'
        when sort_order = 25 then 'Current build has a storefront and cart; payment gateway, tax, shipping and fulfillment must be agreed before checkout is promised.'
        when sort_order = 29 then 'Waiting for written client approval before production launch.'
        else blocked_reason
      end
    where job_id = v_job_id and template_key = 'founding_custom_platform';

    insert into public.task_events (task_id, event_type, body, actor, metadata)
    select id, 'generated',
      case when status = 'completed'
        then 'Backfilled as completed from the verified build audit.'
        else 'Backfilled from the founding-client delivery workflow.' end,
      v_owner, jsonb_build_object('job_id', v_job_id, 'backfill', true)
    from public.tasks
    where job_id = v_job_id and template_key = 'founding_custom_platform';
  end if;
end $$;
