begin;

-- ---------------------------------------------------------------------
-- Email Marketing — campaigns, audiences, sequences, templates and the
-- suppression rules that keep all of it legal.
--
-- Read the header of 0010_websites.sql and 20260910120000_apps.sql first.
-- Same discipline. The specific temptation here is to build a second CRM
-- inside the mailer, and this migration does not.
--
-- MARKETING EMAIL IS NOT TRANSACTIONAL EMAIL, and the two must not share a
-- table. A receipt, a password reset, a proposal link and an invoice go out
-- because somebody asked for them, they ignore marketing consent, and they
-- already work through lib/email/brand.ts + Resend. NOTHING in this module
-- touches that path. What lives here is the other kind: newsletters,
-- promotions, nurture, outreach — the mail a person has a legal right to
-- refuse. Mixing the two would put "your invoice is ready" inside an open
-- rate and, far worse, would eventually let a suppression rule silently
-- swallow somebody's receipt.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   leads       — the CONTACT, and already the consent record of record:
--                 email_consent, consent_text, consent_at, unsubscribed_at,
--                 do_not_contact. This module READS those and never invents
--                 a parallel opinion about whether someone opted in.
--   customers   — the CLIENT. Campaigns point at one; contacts are not
--                 copied out of it.
--   catalog_items / client_services — the SERVICE the client bought, so a
--                 send allowance can be read from what they are paying for.
--   brand_profiles / content_assets / content_items — Content Studio. A
--                 campaign REFERENCES a brand profile and can be created
--                 from a content item; it does not store a second copy of a
--                 logo, a palette or a piece of copy.
--   tasks       — the WORK. tasks gains email_campaign_id and
--                 email_sequence_id, not a parallel to-do system.
--   integration_credentials — the server-only token vault. Resend's key
--                 stays in the environment; NO PROVIDER SECRET IS STORED IN
--                 THIS MODULE AT ALL.
--   lead_events / lead_followups — the existing per-lead timeline and the
--                 24h/72h follow-up cron. Untouched.
--
-- NOT created, on purpose:
--   email_contacts / email_subscribers — that is `leads`, `customers`, and
--                 for genuinely external lists, email_audience_members.
--                 A third contact table would be the thing that eventually
--                 disagrees with the CRM about who unsubscribed.
--   email_campaign_stats_daily / stored counters — every counter on every
--                 screen is aggregated from email_campaign_recipients and
--                 email_events at read time. A stored open rate is a number
--                 that was true once, and it drifts the first time a webhook
--                 is replayed. (There IS an email_campaign_stats VIEW at the
--                 end of this file — a view computes on every read, so it
--                 cannot drift; what is refused here is a stored TABLE.)
--   email_unsubscribe_tokens — the existing HMAC scheme in
--                 lib/campaign/unsubscribe.ts already does this with no
--                 stored state. Extended, not replaced.
--   email_provider_keys — no. Ever.
-- ---------------------------------------------------------------------

-- ── email_sending_domains ────────────────────────────────────────────
-- Which domain we are allowed to send from, and what DNS actually says.
--
-- EVERY AUTHENTICATION COLUMN DEFAULTS TO 'unknown' AND STAYS THERE until
-- something really checked. §35 of the brief is emphatic and so is this
-- table: there is no 'verified' default anywhere in it. A green SPF badge
-- that nobody earned is how mail silently starts landing in spam.
create table if not exists public.email_sending_domains (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null,
  provider        text not null default 'resend' check (provider in (
                    'resend', 'ses', 'postmark', 'sendgrid', 'smtp', 'other')),

  from_email      text,
  from_name       text,
  reply_to        text,

  -- What DNS says, when something looked. Never assumed.
  spf_status      text not null default 'unknown' check (spf_status    in ('verified','pending','failed','unknown')),
  dkim_status     text not null default 'unknown' check (dkim_status   in ('verified','pending','failed','unknown')),
  dmarc_status    text not null default 'unknown' check (dmarc_status  in ('configured','pending','missing','unknown')),
  -- What the provider says about the domain itself.
  provider_status text not null default 'unknown' check (provider_status in (
                    'connected','not_connected','error','unknown')),
  provider_domain_id text,
  last_error      text,

  -- Guard rails, not measurements. Null means "no limit configured".
  daily_send_limit integer check (daily_send_limit is null or daily_send_limit > 0),

  last_checked_at timestamptz,
  last_send_at    timestamptz,
  is_default      boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists email_sending_domains_domain_idx
  on public.email_sending_domains (lower(domain));
create unique index if not exists email_sending_domains_one_default_idx
  on public.email_sending_domains (is_default) where is_default;

-- ── email_suppressions ───────────────────────────────────────────────
-- THE SAFETY TABLE. Nothing in this module may send to an address in here.
--
-- Keyed on the EMAIL ADDRESS, deliberately, not on a lead id or a customer
-- id. The same human is routinely both a lead and a customer and may also
-- sit in an imported list; suppressing "lead 47" would leave two other rows
-- through, which is exactly the mistake that gets a sending domain burned.
-- One address, one global decision, checked on every send.
--
-- Rows are added and effectively never removed by the application: §26 says
-- resubscription must be explicit, so taking somebody OFF this list is a
-- deliberate human act, not a side effect of an import.
create table if not exists public.email_suppressions (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  reason          text not null check (reason in (
                    'unsubscribed', 'hard_bounce', 'complaint',
                    'manual', 'invalid', 'do_not_contact')),
  -- Which send caused it, when we know.
  source_campaign_id uuid,
  source_sequence_id uuid,
  lead_id         uuid references public.leads(id)     on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,
  note            text,
  suppressed_at   timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- One decision per address. An address already suppressed for a complaint
-- does not need a second row when it later hard-bounces.
create unique index if not exists email_suppressions_email_idx
  on public.email_suppressions (lower(email));
create index if not exists email_suppressions_reason_idx
  on public.email_suppressions (reason, suppressed_at desc);

-- ── email_audiences ──────────────────────────────────────────────────
-- A saved answer to "who are we sending to".
--
-- A DYNAMIC segment stores FILTERS and is resolved against leads/customers
-- at send time, so it is never stale. A STATIC or IMPORTED list stores its
-- members in email_audience_members. Both are here because both are real:
-- "every lead tagged pool, right now" and "the 1,024 addresses from the
-- trade show" are different objects and pretending otherwise means either
-- freezing a segment or re-importing a CSV every week.
create table if not exists public.email_audiences (
  id              uuid primary key default gen_random_uuid(),
  -- Null means this is Tomorrow's Tech AI's own audience, which is the
  -- common case and a real one.
  customer_id     uuid references public.customers(id) on delete set null,

  name            text not null,
  description     text,
  audience_type   text not null default 'dynamic_segment' check (audience_type in (
                    'dynamic_segment', 'static_list', 'imported_list', 'crm_segment')),
  -- Which table a dynamic segment is resolved against.
  source          text not null default 'leads' check (source in (
                    'leads', 'customers', 'members')),
  -- The filter definition for a dynamic segment. Interpreted by
  -- lib/email-marketing/audience.ts, which allowlists every key it reads —
  -- this is never turned into SQL by string concatenation.
  filters         jsonb not null default '{}'::jsonb,

  -- Cached only so the list screen does not resolve every segment on every
  -- page load. Always shown WITH its timestamp, never as a live number.
  cached_size     integer check (cached_size is null or cached_size >= 0),
  cached_at       timestamptz,

  owner           text,
  created_by      text,
  is_archived     boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists email_audiences_name_idx
  on public.email_audiences (coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists email_audiences_client_idx
  on public.email_audiences (customer_id) where customer_id is not null;
create index if not exists email_audiences_active_idx
  on public.email_audiences (audience_type) where is_archived = false;

-- ── email_audience_members ───────────────────────────────────────────
-- The rows of a static or imported list, and ONLY those.
--
-- A dynamic segment has no rows here — it is resolved from leads/customers
-- at send time. lead_id and customer_id are filled in when an imported
-- address matches somebody we already know, so the CRM stays the source of
-- truth for their name and their consent, and this row is just membership.
create table if not exists public.email_audience_members (
  id              uuid primary key default gen_random_uuid(),
  audience_id     uuid not null references public.email_audiences(id) on delete cascade,

  email           text not null,
  first_name      text,
  last_name       text,
  company         text,

  -- Filled when the address matches a record we already hold.
  lead_id         uuid references public.leads(id)     on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,

  -- Membership state. Whether they may actually be EMAILED is decided by
  -- email_suppressions and by leads.email_consent — never by this column
  -- alone, so a stale list cannot re-enable somebody who opted out.
  subscribed      boolean not null default true,
  tags            text[] not null default '{}',
  metadata        jsonb not null default '{}'::jsonb,
  source          text,
  added_at        timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists email_audience_members_unique_idx
  on public.email_audience_members (audience_id, lower(email));
create index if not exists email_audience_members_email_idx
  on public.email_audience_members (lower(email));
create index if not exists email_audience_members_lead_idx
  on public.email_audience_members (lead_id) where lead_id is not null;

-- ── email_templates ──────────────────────────────────────────────────
-- Reusable branded email bodies.
--
-- `blocks` is the same structured block array a campaign holds, rendered by
-- lib/email-marketing/render.ts through the EXISTING lib/email/brand.ts
-- builders. There is no second email design system here, and no raw HTML
-- soup: a block is a typed object, which is what makes personalization
-- tokens and the pre-send checks possible at all.
create table if not exists public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete set null,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,

  name            text not null,
  description     text,
  category        text not null default 'other' check (category in (
                    'welcome', 'newsletter', 'promotion', 'sales_followup',
                    'appointment', 'proposal_followup', 're_engagement',
                    'client_update', 'product_launch', 'event', 'other')),

  subject         text,
  preview_text    text,
  blocks          jsonb not null default '[]'::jsonb,
  tone            text not null default 'default' check (tone in ('default', 'success', 'alert')),

  status          text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by      text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists email_templates_name_idx
  on public.email_templates (coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists email_templates_category_idx
  on public.email_templates (category) where is_archived = false;

-- ── email_campaigns ──────────────────────────────────────────────────
-- One marketing send.
--
-- No counters live on this row. Sent, delivered, opens, clicks, bounces and
-- unsubscribes are all aggregated from email_campaign_recipients and
-- email_events every time they are read. That is slightly more work per page
-- and it is the only way the numbers cannot drift when a webhook is
-- redelivered — which Resend will do.
create table if not exists public.email_campaigns (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete set null,

  name            text not null,
  internal_name   text,
  slug            text not null,
  description     text,
  campaign_type   text not null default 'newsletter' check (campaign_type in (
                    'newsletter', 'promotion', 'sales_outreach', 'lead_nurture',
                    'announcement', 'event', 'product_launch', 'follow_up',
                    're_engagement', 'custom')),

  status          text not null default 'draft' check (status in (
                    'draft', 'waiting_approval', 'approved', 'scheduled',
                    'sending', 'sent', 'paused', 'failed', 'archived')),

  -- ── The message ─────────────────────────────────────────────────
  subject         text,
  preview_text    text,
  from_name       text,
  from_email      text,
  reply_to        text,
  blocks          jsonb not null default '[]'::jsonb,
  tone            text not null default 'default' check (tone in ('default', 'success', 'alert')),

  audience_id     uuid references public.email_audiences(id)  on delete set null,
  template_id     uuid references public.email_templates(id)  on delete set null,
  brand_profile_id uuid references public.brand_profiles(id)  on delete set null,
  sending_domain_id uuid references public.email_sending_domains(id) on delete set null,
  -- Where the copy came from, when Content Studio made it.
  content_item_id uuid references public.content_items(id) on delete set null,

  -- ── What it belongs to ──────────────────────────────────────────
  service_id        uuid references public.catalog_items(id)   on delete set null,
  client_service_id uuid references public.client_services(id) on delete set null,
  job_id            uuid references public.jobs(id)            on delete set null,

  owner           text,
  created_by      text,

  -- ── Approval (§19) ──────────────────────────────────────────────
  -- A campaign that requires approval CANNOT reach 'scheduled' or 'sending'
  -- without it. That is enforced by a trigger in part 3, not by the UI,
  -- because the UI is not the only thing that writes this row.
  approval_mode   text not null default 'none' check (approval_mode in (
                    'none', 'internal', 'client')),
  approval_status text not null default 'not_required' check (approval_status in (
                    'not_required', 'waiting', 'approved', 'changes_requested', 'rejected')),
  approved_by     text,
  approved_at     timestamptz,
  approval_notes  text,

  -- ── Scheduling (§18) ────────────────────────────────────────────
  -- The instant is stored in UTC; the timezone is kept beside it so the
  -- screen can say "9:00 AM Central" rather than re-deriving it from the
  -- reader's browser and showing a different time to two people.
  scheduled_at    timestamptz,
  timezone        text not null default 'America/Chicago',
  started_sending_at timestamptz,
  sent_at         timestamptz,
  failed_at       timestamptz,
  failure_reason  text,

  provider        text not null default 'resend',
  tags            text[] not null default '{}',
  notes           text,

  is_archived     boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A campaign that says it was sent has to say when.
  check ((status = 'sent') = (sent_at is not null)),
  -- A scheduled campaign has to say when it goes.
  check (status <> 'scheduled' or scheduled_at is not null),
  -- A failed campaign has to say why.
  check (status <> 'failed' or failure_reason is not null)
);

create unique index if not exists email_campaigns_slug_idx
  on public.email_campaigns (lower(slug));
create index if not exists email_campaigns_status_idx
  on public.email_campaigns (status) where is_archived = false;
create index if not exists email_campaigns_client_idx
  on public.email_campaigns (customer_id) where customer_id is not null;
-- The cron that sends due campaigns reads exactly this.
create index if not exists email_campaigns_due_idx
  on public.email_campaigns (scheduled_at) where status = 'scheduled';
create index if not exists email_campaigns_recent_idx
  on public.email_campaigns (updated_at desc);

-- Email Marketing, part 2 of 3: the send list, provider events, sequences,
-- and the links onto tables that already exist.

-- ── email_campaign_recipients ────────────────────────────────────────
-- The send list, MATERIALISED at the moment a campaign starts sending.
--
-- Why materialise rather than resolve the audience again at send time: a
-- dynamic segment moves. If it were re-resolved per batch, a retry after a
-- partial failure would mail a different set of people, and nobody could
-- answer "who did this campaign actually go to" a week later. Freezing the
-- list is what makes the campaign auditable.
--
-- SKIPPED ROWS ARE WRITTEN, NOT DROPPED. Somebody suppressed, unsubscribed
-- or hard-bounced still gets a row here with status 'skipped' and a
-- skip_reason. That is the difference between "we did not email them" and
-- "we cannot tell you whether we emailed them", and it is the record that
-- proves the suppression rules ran.
create table if not exists public.email_campaign_recipients (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.email_campaigns(id) on delete cascade,

  email           text not null,
  first_name      text,
  last_name       text,
  company         text,

  lead_id         uuid references public.leads(id)     on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,
  audience_member_id uuid references public.email_audience_members(id) on delete set null,

  status          text not null default 'pending' check (status in (
                    'pending', 'sending', 'sent', 'delivered',
                    'bounced', 'complained', 'failed', 'skipped')),
  -- Why this address was not mailed. Required when skipped, forbidden
  -- otherwise, so "skipped" can never be a state without an explanation.
  skip_reason     text check (skip_reason in (
                    'suppressed', 'unsubscribed', 'hard_bounce', 'complaint',
                    'no_consent', 'do_not_contact', 'invalid_email', 'duplicate')),

  provider_message_id text,
  error           text,

  sent_at         timestamptz,
  delivered_at    timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      integer not null default 0 check (open_count >= 0),
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count     integer not null default 0 check (click_count >= 0),
  bounced_at      timestamptz,
  bounce_type     text check (bounce_type is null or bounce_type in ('hard', 'soft', 'unknown')),
  complained_at   timestamptz,
  unsubscribed_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check ((status = 'skipped') = (skip_reason is not null))
);

-- One address gets one row per campaign. This is what makes a retry safe:
-- re-running the build is an upsert, not a second copy of the list.
create unique index if not exists email_campaign_recipients_unique_idx
  on public.email_campaign_recipients (campaign_id, lower(email));
create index if not exists email_campaign_recipients_status_idx
  on public.email_campaign_recipients (campaign_id, status);
-- The webhook looks a recipient up by the provider's message id. Unique, so
-- two events for one message cannot land on two rows.
create unique index if not exists email_campaign_recipients_message_idx
  on public.email_campaign_recipients (provider_message_id)
  where provider_message_id is not null;
create index if not exists email_campaign_recipients_email_idx
  on public.email_campaign_recipients (lower(email));

-- ── email_events ─────────────────────────────────────────────────────
-- Raw provider events, appended and never updated.
--
-- IDEMPOTENCY IS THE WHOLE POINT (§34). Resend redelivers webhooks. Without
-- a unique key, a redelivery inflates the open rate, and an inflated open
-- rate is worse than no open rate because it looks like a measurement.
-- `idempotency_key` is derived deterministically from the provider, the
-- event type, the message id and the event timestamp, so the same event
-- delivered five times inserts once and the other four conflict away.
create table if not exists public.email_events (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references public.email_campaigns(id) on delete cascade,
  recipient_id    uuid references public.email_campaign_recipients(id) on delete cascade,
  sequence_enrollment_id uuid,

  provider        text not null default 'resend',
  provider_message_id text,
  idempotency_key text not null,

  event_type      text not null check (event_type in (
                    'sent', 'delivered', 'opened', 'clicked', 'bounced',
                    'complained', 'unsubscribed', 'failed', 'delivery_delayed')),
  occurred_at     timestamptz not null default now(),
  -- Which link, for a click.
  url             text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create unique index if not exists email_events_idempotency_idx
  on public.email_events (idempotency_key);
create index if not exists email_events_campaign_idx
  on public.email_events (campaign_id, occurred_at desc);
create index if not exists email_events_recipient_idx
  on public.email_events (recipient_id, event_type);
create index if not exists email_events_type_idx
  on public.email_events (event_type, occurred_at desc);
-- The Top Clicked Links table reads this.
create index if not exists email_events_click_url_idx
  on public.email_events (campaign_id, url) where event_type = 'clicked';

-- ── email_sequences ──────────────────────────────────────────────────
-- A multi-step automated flow.
--
-- The enrollment TRIGGER names an event the business already emits — a lead
-- created, a proposal sent, a pipeline stage changed. It does not define a
-- new event system (§22): the automation side calls into this module, and
-- this column records which of those calls this sequence listens for.
create table if not exists public.email_sequences (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete set null,

  name            text not null,
  description     text,
  goal            text,
  status          text not null default 'draft' check (status in (
                    'draft', 'active', 'paused', 'archived')),

  audience_id     uuid references public.email_audiences(id) on delete set null,
  enrollment_trigger text not null default 'manual' check (enrollment_trigger in (
                    'manual', 'lead_created', 'form_submitted', 'lead_tagged',
                    'pipeline_stage_changed', 'proposal_sent', 'proposal_not_accepted',
                    'meeting_completed', 'client_onboarded', 'audience_imported')),
  enrollment_filters jsonb not null default '{}'::jsonb,

  -- Exit rules (§23). Every one of these defaults to ON except the manual
  -- ones, because continuing to nurture somebody who already replied, booked
  -- or bought is the single most damaging thing an automated sequence does.
  exit_on_reply        boolean not null default true,
  exit_on_meeting      boolean not null default true,
  exit_on_proposal_accepted boolean not null default true,
  exit_on_conversion   boolean not null default true,

  sending_domain_id uuid references public.email_sending_domains(id) on delete set null,
  from_name       text,
  from_email      text,
  reply_to        text,

  owner           text,
  created_by      text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists email_sequences_name_idx
  on public.email_sequences (coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists email_sequences_active_idx
  on public.email_sequences (status) where is_archived = false;

-- ── email_sequence_steps ─────────────────────────────────────────────
create table if not exists public.email_sequence_steps (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.email_sequences(id) on delete cascade,
  step_number     integer not null check (step_number > 0),
  name            text,

  -- Delay FROM THE PREVIOUS STEP, not from enrollment. Stored as an amount
  -- plus a unit so the form can say "2 days" and the screen can print it
  -- back the same way, rather than showing somebody 2880 minutes.
  delay_amount    integer not null default 0 check (delay_amount >= 0),
  delay_unit      text not null default 'days' check (delay_unit in (
                    'minutes', 'hours', 'days', 'weeks')),

  template_id     uuid references public.email_templates(id) on delete set null,
  subject         text,
  preview_text    text,
  blocks          jsonb not null default '[]'::jsonb,

  -- Whether this step runs for a given enrollment.
  condition_type  text not null default 'always' check (condition_type in (
                    'always', 'opened_previous', 'clicked_previous',
                    'not_opened_previous', 'not_clicked_previous',
                    'lead_stage', 'has_tag')),
  condition_value text,

  status          text not null default 'active' check (status in ('draft', 'active', 'paused')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A conditional step has to say what it is conditional on.
  check (condition_type in ('always', 'opened_previous', 'clicked_previous',
                            'not_opened_previous', 'not_clicked_previous')
         or condition_value is not null)
);

create unique index if not exists email_sequence_steps_order_idx
  on public.email_sequence_steps (sequence_id, step_number);

-- ── email_sequence_enrollments ───────────────────────────────────────
-- One person's progress through one sequence.
--
-- `next_send_at` is what the cron reads, and it is the only clock: a step's
-- delay is applied when the previous step SENDS, not when the person was
-- enrolled, so a paused sequence resumes correctly instead of firing four
-- overdue emails at once.
create table if not exists public.email_sequence_enrollments (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.email_sequences(id) on delete cascade,

  email           text not null,
  first_name      text,
  last_name       text,
  company         text,
  lead_id         uuid references public.leads(id)     on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,

  status          text not null default 'active' check (status in (
                    'active', 'paused', 'completed', 'exited', 'failed')),
  current_step    integer not null default 0 check (current_step >= 0),
  next_send_at    timestamptz,

  enrolled_at     timestamptz not null default now(),
  enrolled_by     text,
  last_sent_at    timestamptz,
  completed_at    timestamptz,
  exited_at       timestamptz,
  exit_reason     text check (exit_reason is null or exit_reason in (
                    'replied', 'meeting_booked', 'proposal_accepted', 'converted',
                    'unsubscribed', 'hard_bounce', 'complaint', 'manual',
                    'goal_completed', 'suppressed', 'sequence_archived')),
  error           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Somebody who left has to say why, and somebody who is still going
  -- must not carry a stale exit reason.
  check ((status = 'exited') = (exit_reason is not null and exited_at is not null))
);

create unique index if not exists email_sequence_enrollments_unique_idx
  on public.email_sequence_enrollments (sequence_id, lower(email));
-- What the sequence cron reads.
create index if not exists email_sequence_enrollments_due_idx
  on public.email_sequence_enrollments (next_send_at)
  where status = 'active' and next_send_at is not null;
create index if not exists email_sequence_enrollments_email_idx
  on public.email_sequence_enrollments (lower(email));
create index if not exists email_sequence_enrollments_lead_idx
  on public.email_sequence_enrollments (lead_id) where lead_id is not null;

-- Deferred FKs: email_suppressions and email_events reference things
-- declared after them, so the constraints are added now that all the tables
-- exist. Both are on delete set null — losing a campaign must never erase
-- the fact that somebody unsubscribed.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_suppressions_source_campaign_fkey') then
    alter table public.email_suppressions
      add constraint email_suppressions_source_campaign_fkey
      foreign key (source_campaign_id) references public.email_campaigns(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_suppressions_source_sequence_fkey') then
    alter table public.email_suppressions
      add constraint email_suppressions_source_sequence_fkey
      foreign key (source_sequence_id) references public.email_sequences(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_events_enrollment_fkey') then
    alter table public.email_events
      add constraint email_events_enrollment_fkey
      foreign key (sequence_enrollment_id) references public.email_sequence_enrollments(id) on delete cascade;
  end if;
end $$;

-- ── email_campaign_events ────────────────────────────────────────────
-- The campaign's own audit trail, in the same shape as app_events,
-- software_events, job_events and service_events, so the Activity Center's
-- existing union can read it without a new abstraction.
create table if not exists public.email_campaign_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns(id) on delete cascade,
  sequence_id uuid references public.email_sequences(id) on delete cascade,
  audience_id uuid references public.email_audiences(id) on delete cascade,
  kind        text not null default 'note' check (kind in (
                'created', 'updated', 'approval_requested', 'approved',
                'changes_requested', 'rejected', 'scheduled', 'unscheduled',
                'sending', 'sent', 'failed', 'paused', 'resumed', 'archived',
                'test_sent', 'audience_changed', 'audience_imported',
                'template_updated', 'sequence_created', 'sequence_paused',
                'enrolled', 'bounce_threshold', 'provider_changed',
                'domain_health_changed', 'note')),
  body        text not null,
  actor       text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  -- An event has to be about something.
  check (campaign_id is not null or sequence_id is not null or audience_id is not null)
);

create index if not exists email_campaign_events_campaign_idx
  on public.email_campaign_events (campaign_id, created_at desc) where campaign_id is not null;
create index if not exists email_campaign_events_sequence_idx
  on public.email_campaign_events (sequence_id, created_at desc) where sequence_id is not null;
create index if not exists email_campaign_events_recent_idx
  on public.email_campaign_events (created_at desc);

-- ── The links onto tables that already exist ─────────────────────────
-- Columns, not parallel systems. All nullable, so nothing changes today.

-- Work on a campaign is a task (§41), with everything the Tasks board
-- already gives it: status, priority, assignee, due date, templates.
alter table public.tasks
  add column if not exists email_campaign_id uuid references public.email_campaigns(id) on delete set null;
alter table public.tasks
  add column if not exists email_sequence_id uuid references public.email_sequences(id) on delete set null;
create index if not exists tasks_email_campaign_idx on public.tasks (email_campaign_id) where email_campaign_id is not null;
create index if not exists tasks_email_sequence_idx on public.tasks (email_sequence_id) where email_sequence_id is not null;

-- A campaign can be attributed a conversion and therefore revenue (§32).
-- Nullable, because most invoices have nothing to do with a campaign, and
-- the Revenue panel says which basis it used rather than implying every
-- dollar came from email.
alter table public.invoices
  add column if not exists email_campaign_id uuid references public.email_campaigns(id) on delete set null;
create index if not exists invoices_email_campaign_idx on public.invoices (email_campaign_id) where email_campaign_id is not null;

-- Which campaign a lead arrived from, when it was an email that produced
-- them. `leads.campaign` is free text from ad platforms and stays as it is.
alter table public.leads
  add column if not exists email_campaign_id uuid references public.email_campaigns(id) on delete set null;
create index if not exists leads_email_campaign_idx on public.leads (email_campaign_id) where email_campaign_id is not null;

-- A scheduled campaign can appear on the Calendar (§40).
alter table public.calendar_events
  add column if not exists email_campaign_id uuid references public.email_campaigns(id) on delete set null;
create index if not exists calendar_events_email_campaign_idx
  on public.calendar_events (email_campaign_id) where email_campaign_id is not null;

-- Content Studio produced the copy; the campaign that used it points back,
-- so a piece of content can show where it was sent (§38).
alter table public.content_items
  add column if not exists email_campaign_id uuid references public.email_campaigns(id) on delete set null;
create index if not exists content_items_email_campaign_idx
  on public.content_items (email_campaign_id) where email_campaign_id is not null;

-- Email Marketing, part 3 of 3: the rules that live in the database because
-- the UI is not the only thing that writes these rows.

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'email_sending_domains', 'email_audiences', 'email_audience_members',
    'email_templates', 'email_campaigns', 'email_campaign_recipients',
    'email_sequences', 'email_sequence_steps', 'email_sequence_enrollments'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ── The approval gate ────────────────────────────────────────────────
-- §19: a campaign that requires approval must not be able to reach a
-- sending state without it.
--
-- This is a TRIGGER and not a UI check on purpose. The composer is not the
-- only thing that writes this row — the scheduler cron does, an action does,
-- and one day an automation will. A rule enforced in one of four callers is
-- not a rule. Refusing here means the unapproved campaign cannot go out even
-- if every screen above it has a bug.
--
-- It also keeps approval_status honest in the other direction: changing the
-- mode to 'none' clears a stale 'waiting', and turning approval on for a
-- draft puts it into 'waiting' rather than leaving it 'not_required'.
create or replace function public.email_campaigns_guard_approval()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Keep approval_status consistent with approval_mode.
  if new.approval_mode = 'none' then
    if new.approval_status <> 'not_required' then
      new.approval_status := 'not_required';
      new.approved_by := null;
      new.approved_at := null;
    end if;
  elsif new.approval_status = 'not_required' then
    new.approval_status := 'waiting';
  end if;

  -- Approval must carry a name and a time; withdrawing it must clear both.
  if new.approval_status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
  else
    new.approved_at := null;
    new.approved_by := null;
  end if;

  -- THE GATE. Editing an already-sent campaign's metadata is still allowed;
  -- what is refused is MOVING a campaign into a sending state unapproved.
  if new.status in ('scheduled', 'sending', 'sent')
     and new.approval_mode <> 'none'
     and new.approval_status <> 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception
      'This campaign needs % approval before it can be scheduled or sent. Its approval is currently: %.',
      new.approval_mode, new.approval_status
      using errcode = 'check_violation';
  end if;

  -- Dates that must agree with the status.
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  elsif new.status <> 'sent' then
    new.sent_at := null;
  end if;

  if new.status <> 'failed' then
    new.failure_reason := null;
    new.failed_at := null;
  elsif new.failed_at is null then
    new.failed_at := now();
  end if;

  -- Archive flag and status are two ways of saying one thing. Same posture
  -- as apps and software: status decides, unless a caller moved the flag.
  if tg_op = 'INSERT' then
    if new.status = 'archived' or new.is_archived then
      new.status := 'archived';
      new.is_archived := true;
      new.archived_at := coalesce(new.archived_at, now());
    else
      new.is_archived := false;
      new.archived_at := null;
    end if;
  else
    if new.is_archived is distinct from old.is_archived then
      if new.is_archived then
        new.status := 'archived';
      elsif new.status = 'archived' then
        -- Un-archived without being told what it became. Draft is the only
        -- honest resting state: it is back, and it is not going anywhere.
        new.status := 'draft';
      end if;
    else
      new.is_archived := (new.status = 'archived');
    end if;
    new.archived_at := case when new.is_archived
      then coalesce(old.archived_at, new.archived_at, now()) else null end;
  end if;

  return new;
end $$;

drop trigger if exists email_campaigns_approval_guard on public.email_campaigns;
create trigger email_campaigns_approval_guard
  before insert or update on public.email_campaigns
  for each row execute function public.email_campaigns_guard_approval();

-- ── Provider events drive everything downstream ──────────────────────
-- One AFTER INSERT on email_events does three jobs, and doing them here
-- rather than in the webhook handler is what makes them safe:
--
--   1. It updates the recipient's state and counters.
--   2. It adds an unsubscribe, complaint or HARD bounce to the global
--      suppression list, so the next campaign cannot mail them.
--   3. It exits any live sequence enrollment for that address.
--
-- IDEMPOTENCY comes free. email_events has a unique idempotency_key, so a
-- redelivered webhook never reaches this function a second time — which
-- means open_count cannot be inflated by Resend retrying, and that is the
-- single most likely way these numbers would otherwise become fiction.
--
-- A soft bounce does NOT suppress. Mailbox full on Tuesday is not consent
-- withdrawn, and treating it as permanent quietly destroys a list.
create or replace function public.email_events_apply()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_email text;
  target_lead  uuid;
  target_customer uuid;
  suppress_reason text;
begin
  if new.recipient_id is not null then
    select r.email, r.lead_id, r.customer_id
      into target_email, target_lead, target_customer
      from public.email_campaign_recipients r
     where r.id = new.recipient_id;
  end if;

  -- ── 1. Recipient state ──────────────────────────────────────────
  if new.recipient_id is not null then
    if new.event_type = 'sent' then
      update public.email_campaign_recipients
         set status = case when status in ('pending','sending') then 'sent' else status end,
             sent_at = coalesce(sent_at, new.occurred_at)
       where id = new.recipient_id;

    elsif new.event_type = 'delivered' then
      -- Never downgrade a terminal state: a delivered event arriving after
      -- a bounce is provider noise, not a correction.
      update public.email_campaign_recipients
         set status = case when status in ('pending','sending','sent') then 'delivered' else status end,
             delivered_at = coalesce(delivered_at, new.occurred_at)
       where id = new.recipient_id;

    elsif new.event_type = 'opened' then
      update public.email_campaign_recipients
         set open_count = open_count + 1,
             first_opened_at = coalesce(first_opened_at, new.occurred_at),
             last_opened_at = greatest(coalesce(last_opened_at, new.occurred_at), new.occurred_at),
             -- An open proves delivery even when the delivered event never
             -- arrived, which happens.
             status = case when status in ('pending','sending','sent') then 'delivered' else status end,
             delivered_at = coalesce(delivered_at, new.occurred_at)
       where id = new.recipient_id;

    elsif new.event_type = 'clicked' then
      update public.email_campaign_recipients
         set click_count = click_count + 1,
             first_clicked_at = coalesce(first_clicked_at, new.occurred_at),
             last_clicked_at = greatest(coalesce(last_clicked_at, new.occurred_at), new.occurred_at),
             status = case when status in ('pending','sending','sent') then 'delivered' else status end,
             delivered_at = coalesce(delivered_at, new.occurred_at)
       where id = new.recipient_id;

    elsif new.event_type = 'bounced' then
      update public.email_campaign_recipients
         set status = 'bounced',
             bounced_at = coalesce(bounced_at, new.occurred_at),
             bounce_type = coalesce(
               nullif(new.metadata->>'bounce_type', ''),
               bounce_type,
               'unknown')
       where id = new.recipient_id;

    elsif new.event_type = 'complained' then
      update public.email_campaign_recipients
         set status = 'complained',
             complained_at = coalesce(complained_at, new.occurred_at)
       where id = new.recipient_id;

    elsif new.event_type = 'unsubscribed' then
      update public.email_campaign_recipients
         set unsubscribed_at = coalesce(unsubscribed_at, new.occurred_at)
       where id = new.recipient_id;

    elsif new.event_type = 'failed' then
      update public.email_campaign_recipients
         set status = 'failed',
             error = coalesce(nullif(new.metadata->>'reason', ''), error, 'Provider reported a failure.')
       where id = new.recipient_id;
    end if;
  end if;

  -- ── 2. Suppression ──────────────────────────────────────────────
  suppress_reason := case
    when new.event_type = 'unsubscribed' then 'unsubscribed'
    when new.event_type = 'complained'   then 'complaint'
    when new.event_type = 'bounced'
     and coalesce(new.metadata->>'bounce_type', 'unknown') = 'hard' then 'hard_bounce'
    else null
  end;

  if suppress_reason is not null and target_email is not null then
    insert into public.email_suppressions
      (email, reason, source_campaign_id, lead_id, customer_id, note, suppressed_at)
    values (
      lower(target_email), suppress_reason, new.campaign_id, target_lead, target_customer,
      'Added automatically from a provider ' || new.event_type || ' event.', new.occurred_at)
    on conflict do nothing;

    -- The CRM is the consent record of record, so it is told too. This
    -- mirrors exactly what /api/unsubscribe already does by hand.
    if target_lead is not null then
      update public.leads
         set unsubscribed_at = coalesce(unsubscribed_at, new.occurred_at),
             email_consent = false,
             do_not_contact = case when suppress_reason = 'unsubscribed' then true else do_not_contact end
       where id = target_lead;
    end if;

    -- ── 3. Stop every live sequence for that address ──────────────
    -- Continuing to nurture somebody who just unsubscribed or reported the
    -- last message as spam is the worst thing this system could do.
    update public.email_sequence_enrollments
       set status = 'exited',
           exited_at = new.occurred_at,
           exit_reason = case
             when suppress_reason = 'unsubscribed' then 'unsubscribed'
             when suppress_reason = 'complaint'    then 'complaint'
             else 'hard_bounce' end,
           next_send_at = null
     where lower(email) = lower(target_email)
       and status = 'active';
  end if;

  return null;
end $$;

drop trigger if exists email_events_apply_trigger on public.email_events;
create trigger email_events_apply_trigger
  after insert on public.email_events
  for each row execute function public.email_events_apply();

-- ── A suppressed address leaves every sequence ───────────────────────
-- Suppression can also be added by hand or by an import, not only by a
-- provider event, and it has to have the same consequence either way.
create or replace function public.email_suppressions_apply()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.email_sequence_enrollments
     set status = 'exited',
         exited_at = coalesce(new.suppressed_at, now()),
         exit_reason = 'suppressed',
         next_send_at = null
   where lower(email) = lower(new.email)
     and status = 'active';

  update public.email_audience_members
     set subscribed = false
   where lower(email) = lower(new.email);

  return null;
end $$;

drop trigger if exists email_suppressions_apply_trigger on public.email_suppressions;
create trigger email_suppressions_apply_trigger
  after insert on public.email_suppressions
  for each row execute function public.email_suppressions_apply();

-- ── Sequence enrollment bookkeeping ──────────────────────────────────
create or replace function public.email_sequence_enrollments_sync()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.next_send_at := null;
  elsif new.status = 'exited' then
    new.exited_at := coalesce(new.exited_at, now());
    new.exit_reason := coalesce(new.exit_reason, 'manual');
    new.next_send_at := null;
  else
    new.exited_at := null;
    new.exit_reason := null;
    if new.status <> 'completed' then new.completed_at := null; end if;
  end if;

  -- A paused or failed enrollment must not keep a due time, or the cron
  -- will pick it up the moment somebody changes the status back.
  if new.status in ('paused', 'failed') then
    new.next_send_at := null;
  end if;

  return new;
end $$;

drop trigger if exists email_sequence_enrollments_sync_trigger on public.email_sequence_enrollments;
create trigger email_sequence_enrollments_sync_trigger
  before insert or update on public.email_sequence_enrollments
  for each row execute function public.email_sequence_enrollments_sync();

-- ── Archiving a sequence stops it ────────────────────────────────────
create or replace function public.email_sequences_sync_archive()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'archived' or new.is_archived then
    new.status := 'archived';
    new.is_archived := true;
  else
    new.is_archived := (new.status = 'archived');
  end if;
  return new;
end $$;

drop trigger if exists email_sequences_archive_sync on public.email_sequences;
create trigger email_sequences_archive_sync
  before insert or update on public.email_sequences
  for each row execute function public.email_sequences_sync_archive();

create or replace function public.email_sequences_halt_enrollments()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    update public.email_sequence_enrollments
       set status = 'exited', exited_at = now(), exit_reason = 'sequence_archived', next_send_at = null
     where sequence_id = new.id and status = 'active';
  end if;
  return null;
end $$;

drop trigger if exists email_sequences_halt_trigger on public.email_sequences;
create trigger email_sequences_halt_trigger
  after update on public.email_sequences
  for each row execute function public.email_sequences_halt_enrollments();

-- ── RLS — same deny-by-default posture as every other table here ─────
do $$
declare t text;
begin
  foreach t in array array[
    'email_sending_domains', 'email_suppressions', 'email_audiences',
    'email_audience_members', 'email_templates', 'email_campaigns',
    'email_campaign_recipients', 'email_events', 'email_sequences',
    'email_sequence_steps', 'email_sequence_enrollments',
    'email_campaign_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      t || '_admin_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      t || '_admin_delete', t);

    -- The browser's anon role gets nothing. The unsubscribe route and the
    -- provider webhook run server-side with the service role.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── email_campaign_stats ─────────────────────────────────────────────
-- Per-campaign counters, aggregated in the DATABASE.
--
-- §47 says the dashboard must not load every recipient and must not
-- recalculate in the browser. This view is how: the board reads ONE row per
-- campaign instead of eighteen thousand recipient rows, and the numbers are
-- computed from the same source every time so they cannot drift the way a
-- stored counter does.
--
-- `security_invoker` so the view runs as the caller and the RLS policies on
-- email_campaign_recipients still apply. A view that quietly bypasses RLS is
-- worse than no view.
--
-- Note what is NOT here: open RATE and click RATE. A rate is a division, and
-- dividing by zero sends should produce "no data", not "0%". The application
-- does that division through rate(), which returns null rather than lying.
create or replace view public.email_campaign_stats
with (security_invoker = true) as
select
  c.id as campaign_id,
  count(r.id) filter (where r.status <> 'skipped')                                as targeted,
  count(r.id) filter (where r.status = 'skipped')                                 as skipped,
  count(r.id) filter (where r.status in ('sent','delivered','bounced','complained')) as sent,
  count(r.id) filter (where r.status = 'delivered')                               as delivered,
  count(r.id) filter (where r.status = 'bounced')                                 as bounced,
  count(r.id) filter (where r.status = 'complained')                              as complained,
  count(r.id) filter (where r.status = 'failed')                                  as failed,
  count(r.id) filter (where r.status = 'pending')                                 as pending,
  count(r.id) filter (where r.first_opened_at is not null)                        as unique_opens,
  coalesce(sum(r.open_count), 0)                                                  as total_opens,
  count(r.id) filter (where r.first_clicked_at is not null)                       as unique_clicks,
  coalesce(sum(r.click_count), 0)                                                 as total_clicks,
  count(r.id) filter (where r.unsubscribed_at is not null)                        as unsubscribes,
  max(r.sent_at)                                                                  as last_sent_at
from public.email_campaigns c
left join public.email_campaign_recipients r on r.campaign_id = c.id
group by c.id;

revoke all on public.email_campaign_stats from anon;
grant select on public.email_campaign_stats to authenticated;

commit;
