# Database

Supabase project `nttvnklbevixtqrbtfru` (us-east-2). Every migration in
`migrations/` has been applied to it; the files are the record of what the
schema is, and each one carries its reasoning in its header.

Money is **integer cents** everywhere. Every table is RLS deny-by-default with
admin-only policies through `public.is_admin()`, and PostgREST grants are
revoked from `anon` — an unauthenticated caller gets "permission denied"
rather than a convincing empty list.

| # | File | What it added |
|---|------|---------------|
| 0001 | `0001_business_launch.sql` | The campaign CRM: `leads`, `lead_events`, `lead_followups`, `appointments`, `campaign_spend`, `customers`, `revenue_events`, `admin_users`. |
| 0002 | `0002_campaign_spend_upsert_key.sql` | Made `campaign_spend`'s four breakdown columns `not null default ''` so PostgREST's `ON CONFLICT` has plain columns to target. |
| 0003 | `0003_ad_creatives.sql` | `ad_creatives` — the ad library behind Ad Studio. |
| 0004 | `0004_invoices_and_jobs.sql` | `invoices`, `jobs`, `job_tasks`, `job_events` — taking the money and delivering the work. |
| 0005 | `0005_revenue_external_id.sql` | `revenue_events.external_id`, unique, so a Stripe webhook replay updates instead of booking twice. |
| 0006 | `0006_catalog_and_upsells.sql` | `catalog_items`, and the upsell columns on `invoices`. |
| 0007 | `0007_command_center.sql` | The Business Command Center — see below. |
| 0008 | `0008_client_record.sql` | The client record — see below. |
| 0009 | `0009_seo.sql` | SEO Command Center — see below. |
| 0010 | `0010_websites.sql` | The website portfolio — see below. |
| 0011 | `0011_content_studio.sql` | Content Studio, brands and the asset library — see below. |
| 0012 | `0012_hosting.sql` | Hosting: costs, incidents and plans — see below. |
| 0013 | `0013_crm.sql` | CRM: companies and deals — see below. |

## 0007 — Business Command Center

Applied 2026-08-30. Additive only: no column is dropped, no type changed, no
existing policy weakened.

**New tables**

| Table | Purpose |
|-------|---------|
| `tasks` | The Today card. One flat list — a callback, a project deadline and an invoice chase are worked the same way, so they live together. Optional FKs to lead / job / customer / invoice, all nullable. |
| `ai_insights` | Insights a **model** produced. Rule-based insights are recomputed per request in `src/lib/dashboard/insights.ts` and are deliberately *not* stored; only the ones that cost money to generate are. |
| `ai_actions` | The propose → review → approve queue. An AI writes a row here; it does not perform the act. A DB check constraint refuses an `approved` or `rejected` row with no `reviewed_by`, so no future route can approve on its own. |
| `social_accounts` | One row per connected profile. `connected` is the honest answer to "is this wired up?" — the dashboard shows a channel as live only when a row says so. **No access tokens are stored here**; secrets belong in env vars or Vault, not in a row a dashboard `select *`s. |
| `social_posts` | Drafts, scheduled posts and published posts. An AI-written post that goes out must reference the `ai_actions` row it was approved through. |
| `expenses` | Everything the business pays for **except ad spend**, which stays in `campaign_spend`. The finance panel adds the two; duplicating them here would double-count. |

**Changed**

`jobs` gains `project_type`, `value_cents`, `owner`, `next_milestone`, plus a
partial index on `due_at` for open jobs.

**Deliberately NOT created**

- `projects` — `jobs` already *is* the delivery record; it was widened instead
  of standing up a second table that would immediately drift out of sync.
- `clients` — `customers` covers it.
- `campaigns` — `campaign_spend` already keys by campaign name and
  `ad_creatives` carries the creative side.
- `activities` — the feed is a union over `lead_events`, `job_events`,
  `revenue_events` and `invoices`. A third copy would be a cache with no owner.
- `notifications` — alerts are derived live from the data. Storing an alert
  means storing one that has stopped being true.

**Verified before applying**: the whole 0001→0007 chain was run twice against a
scratch PostgreSQL 16 (idempotency), then checked for constraint behaviour
(an approved action with no reviewer is rejected; bad `project_type` rejected;
negative expense rejected; duplicate social account rejected) and for RLS as
`anon` (permission denied), as an authenticated non-admin (0 rows, insert
refused) and as an admin (rows, insert allowed).


## 0008 — Client record

Applied 2026-08-30. Additive only.

**Added to `customers`**

`city`, `state` (Top client locations), `business_type` (carried across from
the originating lead by the migration's own backfill), `owner`, `tags`,
`renews_at`, `renewal_amount_cents`, `notes_internal`. Two partial indexes:
renewals for active clients, and location.

**New table**

`client_satisfaction` — one row per time a client was actually asked.
`rating` 1-5, `occasion` (check-in / launch / support / renewal / ad hoc),
`recorded_by`, `recorded_at`. Appended, never updated: the Clients screen
averages each client's **most recent** rating, so one enthusiastic client
rated five times cannot outvote everyone else, and a rating from a year ago
does not keep voting in this month's average. Cascade-deletes with the client.

**Where the renewal date comes from**

`customer.subscription.created` and `.updated` in the Stripe webhook, via
`handleSubscriptionSynced`. It reads `current_period_end` off the subscription
(falling back to the subscription *item*, where Stripe moved it in the 2025 API
versions) rather than adding a month to the last payment — a trial, a pause or
a proration all move the real date. Only the subscription a customer row
already points at is synced, so a client's second subscription cannot overwrite
the first one's date, and another storefront on the same Stripe account matches
no row and writes nothing.

**NOT added, on purpose**

- `health_score` — derived per request in `src/lib/clients/health.ts` from
  unpaid invoices, projects past their date, subscription state, contact
  recency and the latest rating. A stored score is a number that was true once;
  this one cannot go stale, and every point it deducts is named on screen.
- `last_activity_at` — the timeline already unions the event tables. A
  denormalised copy would drift the first time a webhook wrote to one and not
  the other.

**Verified before applying**: 0001→0008 against a scratch PostgreSQL 16, twice
(idempotency), then constraint tests (rating bounds 1-5, invalid occasion,
negative renewal amount), the cascade delete, and RLS as `anon` (permission
denied).

## 0009 — SEO Command Center

Five tables, no changes to anything that already existed.

**New tables**

`seo_audit_runs` — one row per crawl. Written with `status='running'` *before*
the crawl starts, so a run that dies halfway leaves evidence rather than
silence. `pages_checked`, `issues_found`, `base_url` and `actor` are filled in
when it completes.

`seo_pages` — what one crawl found on one page: status code, response time,
title, description, canonical, og:image, heading counts, word count, JSON-LD
types, `noindex`, internal link count. Cascade-deletes with its run, so the
history prunes itself by deleting old runs.

`seo_issues` — one row per rule that fired, with `code`, `severity` and a
human `detail`. Also cascade-deletes with its run. The rule catalogue itself
(what each code means, why it matters, how to fix it) lives in
`src/lib/seo/rules.ts` and is **not** in the database: rule text changes far
more often than rule results, and a copy in both places drifts.

`seo_queries` — the Search Console cache, one row per day + query + page.
Unique on `(date, query, page)` so a re-sync updates rather than duplicates.
`source` distinguishes `search_console` from `manual`. The dashboard reads
only this table — it never makes a Google round trip while rendering.

`seo_competitors` — a watched domain. `visibility_pct`, `keyword_count`,
`traffic_est` and `stats_source` are all nullable and stay null until a
rank-tracking source fills them: a competitor with no data renders as
*watched, no data*, never as a competitor scoring zero. Unique on
`lower(domain)`.

**RLS**

All five are enabled with the same deny-by-default shape as every other table:
select/insert/update/delete for `authenticated` only when `public.is_admin()`.
PostgREST grants are revoked from `anon`.

**NOT added, on purpose**

- A stored SEO score. `healthScore()` derives it per request from the current
  run's issues, and the band with it. Same reasoning as client health: a
  stored score is a number that was true once.
- A `seo_recommendations` table. Recommendations are recomputed from the audit,
  the leads and the query cache on every render. The ones that survive review
  become rows in `ai_actions`, which already exists and already enforces
  propose → review → approve.

**Verified before applying**: 0001→0009 against a scratch PostgreSQL 16, twice
(idempotency), then the severity and status check constraints, the
`(date, query, page)` uniqueness, the cascade delete from `seo_audit_runs`
through `seo_pages` and `seo_issues`, and RLS as `anon` (permission denied).

## 0010 — The website portfolio

Four tables, and the interesting part is the eight that were **not** created.

**What already existed and is not duplicated**

`jobs` is the BUILD — it already carries `site_url`, `project_type`, `package`,
`stage`, `launched_at`, `value_cents`, `owner` and `next_milestone`. A site
under construction is a job and stays one. `customers` is the OWNER, with
`mrr_cents`, `stripe_subscription_id`, `renews_at` and `renewal_amount_cents`
already synced from Stripe. `leads.landing_page` is what ties a lead to a site.
`seo_*` is the audit.

So `websites` exists for the one thing `jobs` cannot express: **a site outlives
the project that built it, and one customer can own several.** It carries
identity and operational state and nothing another table already owns.

**New tables**

`websites` — customer_id and job_id both nullable and both `on delete set
null`: a site we took over from another agency has no build job, a site of our
own has no customer, and deleting either must not delete the site. The unique
index is on `lower(regexp_replace(domain, '^www\.', ''))`, so `Example.com`,
`example.com` and `www.example.com` are one website and the most likely way
this table gets dirty is closed off at the database.

`website_integrations` — one row per site per provider, and the honest answer
to "is this wired up?". **No row means not connected**, and nothing on the
website screens is allowed to imply a connection without one. `account_ref`
holds a display identifier only — a GA4 property id, a Vercel project name.
**No secrets**: tokens stay in environment variables on the server.

`website_deployments` — the abstraction layer for deployment history, shaped
deliberately like Vercel's own deployment object so connecting a token later is
a fetch loop and a column mapping rather than a redesign. Empty until then, and
the panel says "no deployment data" rather than inventing a build. The unique
index on `(provider, external_id)` is partial so rows entered by hand, with no
external id, are still allowed.

`website_renewals` — `customers.renews_at` answers "when does this client's
subscription bill?" and cannot answer "when does this domain expire?". A site
has domain, hosting, SSL and support renewals on different dates and sometimes
to different vendors. Subscription renewals are **not** copied here; the screen
unions the two sources.

**NOT created, on purpose**

- `website_analytics_daily` — nothing writes it. There is no GA4, Plausible or
  any analytics credential in this project. An empty daily-rollup table is a
  promise the system cannot keep; it arrives with the sync job that fills it.
- `website_pages` — `seo_pages` already records every page of a crawl, keyed by
  path. A second page table would drift from it the first time one was written
  and the other was not.
- `website_forms` / `website_form_submissions` — `leads` **is** the submission
  table, and already carries source, campaign, utm and landing_page. A form is
  identified by where it posted from.
- `website_maintenance` / `website_requests` — `tasks` already exists with
  `lead_id` and `job_id`. These become a `website_id` on tasks when the
  maintenance screen is built, not a parallel task system.
- `website_ai_recommendations` — `ai_actions` is the propose → review → approve
  queue for the whole business and already enforces it in a constraint.
- `monthly_revenue` on `websites` — derived from the client's subscription or
  the site's own hosting renewal. A stored copy is a number that was true once.

**Revenue, without double counting**

A customer's `mrr_cents` is the *customer's* subscription, not one site's. When
a client has two sites, attributing the same MRR to both would double the
portfolio total. So: a per-site hosting renewal wins where one exists; the
subscription is used only where the client owns exactly one site; otherwise the
row shows an em dash rather than a made-up split. The portfolio KPI counts each
paying customer once.

**Verified before applying**: 0001→0010 against a scratch PostgreSQL 16, twice
(idempotency), then the domain uniqueness (including the www and case
variants), every status/type/provider/environment/kind check constraint, the
partial unique index on deployments, the cascade from `websites` to all three
child tables, `on delete set null` from both `customers` and `jobs`, the
`updated_at` trigger, and RLS as `anon` (permission denied on all four).

## 0011 — Content Studio

Four tables and a private storage bucket. Again the interesting part is what
was refused.

**What already existed and is not duplicated**

`social_posts` is the **publish** record — account_id, scheduled_at,
published_at, external_id, external_url, error. It is what Social Center hands
to a platform API. Content Studio does not replace it: approved social content
*becomes* one, and `content_items.social_post_id` is the link. Two records
because they answer two different questions — "what did we write" and "what did
the platform do with it".

`ad_creatives` already holds ad copy, already with variants via `parent_id`.
Ads stay in Ad Studio. `ai_actions` is already the propose → review → approve
queue with a database constraint behind it, so there is no `content_approvals`.

A campaign is a **name string** across this database (`leads.campaign`,
`campaign_spend.campaign`, `social_posts.campaign`, `ad_creatives.campaign`).
Introducing a `campaigns` table now would orphan every one of those references,
so `content_items.campaign` is text too. That is a deliberate consistency
choice, not an oversight.

**New tables**

`brand_profiles` — whose voice a piece is written in. Tone, audience, writing
guidance, CTA style, preferred and prohibited phrases: all of it is prompt
material handed to the generator, so changing how a brand sounds is an edit to
a row rather than a code change. A partial unique index on `((is_default))
where is_default` enforces exactly one default. Every `content_items` row
carries `brand_profile_id` **not null** with `on delete restrict`, which is what
stops one brand's guidance ever writing another brand's content.

`content_assets` — the library. `storage_path` is the object key inside the
private bucket; **no public URL is stored**, because a stored link outlives
every permission check around it. Unique on `storage_path`.

`content_items` — one piece for any channel. The status list is deliberately
the same shape as `social_posts`, plus the two states that only exist before
publishing (`generating`, `archived`), so an approved item becomes a social post
without translating a status vocabulary. Two check constraints stop the calendar
lying: `scheduled` requires `scheduled_at`, `published` requires `published_at`.

`content_asset_links` — many-to-many, cascading from both sides.

**Repurposing is a self-reference, not a table.** `source_content_id` points a
Reel script at the blog it came from, so "what did this come from" and "what
came out of this" are the same query run two ways.

**Storage**

Bucket `brand-assets`, **private**, 50MB per file, with four RLS policies on
`storage.objects` gated on `bucket_id = 'brand-assets' and public.is_admin()`.
A public bucket would put every client logo and unreleased graphic on a
guessable URL with no auth in front of it. The app mints a signed URL that
expires in 300 seconds, and `/api/admin/assets` will only sign a path that
already exists as a row the caller can read — otherwise the route would be a
way to read the whole bucket.

Object keys are `<brand-id>/<uuid>.<ext>`. The uploaded file name is kept only
in `title` and never in the key: user-chosen names are exactly how a path
traversal gets into a bucket.

**NOT created, on purpose**

- `content_variants` — a variant IS a content_item with `source_content_id` set.
  A separate table would need every one of the same columns.
- `content_metrics` — nothing writes it. No analytics or social credential
  exists. Lead attribution already works through `leads.campaign` and
  `leads.utm_campaign`.
- `content_ai_scores` — derived per read in `src/lib/content/score.ts`, like
  client and SEO health. A content score is guidance rather than measurement, so
  freezing one is worse than freezing a metric.
- `content_reviews` — review notes live on the item. A review *thread* is a
  feature for more than one reviewer; there is one.

**Seeded**

One brand profile, Tomorrows Tech AI, with the voice and banned-phrase list
lifted from the ad-copy generator that already works — so the two speak with one
voice instead of two. Seeded rather than left as a first-run chore, because
content cannot be written without a voice to write it in.

**Verified before applying**: 0001→0011 against a scratch PostgreSQL 16, twice
(idempotency), then 25 assertions — the single-default constraint, slug
uniqueness, every status/type/platform/goal check, the scheduled- and
published-date constraints, `on delete restrict` from a brand in use, the
repurposing self-reference surviving deletion of its source, storage-path
uniqueness, link cascade, and RLS as `anon` (permission denied on all four).
The storage section is guarded by `to_regclass('storage.buckets')` so it skips
cleanly on a scratch database and was applied separately to Supabase.

## 0012 — Hosting

The shortest migration here, and deliberately so.

**There is no `hosting_accounts` table.** Migration 0010 already built the
record a hosting account needs, and calling it `websites` does not make it
less true:

| a hosting account needs | already exists as |
|---|---|
| client, domain, status, provider, owner | `websites` |
| the provider's project id | `website_integrations.account_ref` |
| deploy status and history | `website_deployments` |
| domain / SSL / support expiry | `website_renewals` |
| subscription, MRR, next billing | `customers`, `invoices` |

A `hosting_accounts` table would copy about ten of those columns and then
disagree with them the first time one was updated and the other was not. The
Hosting screen reads the same rows the Websites screen reads and asks
different questions of them.

**Three things really were missing.**

`websites.hosting_plan_id` — a single foreign key to `catalog_items`, which
already has a `hosting` category and is already where pricing lives. It simply
had no hosting rows and nothing pointed at them. A `hosting_plans` table would
have been `catalog_items` under another name, and then the Catalog screen and
the Hosting screen could disagree about what a plan costs.

`website_costs` — what a site costs us, so profitability is arithmetic rather
than a guess. `expenses` already exists but is company-wide: a Vercel bill with
no site attached. That is the right shape for accounting and the wrong shape
for "is this $29 client profitable". Both are true at once; this is the
per-site view and does not replace the ledger. Every row carries an `interval`,
because a $12 annual domain and $20/month of hosting are not comparable until
normalised, and the normalising belongs in one place. A cost that stops
applying is **ended** (`effective_to`), never deleted, so last quarter's margin
does not silently change when this year's bill does.

`website_incidents` — something went wrong with a site, and when. This is what
"Sites With Issues" reads and what a future uptime checker, SSL checker or
deploy webhook writes into. `source` separates `manual` from `monitor` rows, so
the screen can say which problems were actually detected versus merely logged.
A `resolved` incident must carry `resolved_at`, enforced by a constraint.

**Seeded**

Three hosting plans into `catalog_items` — Starter $29, Pro $49, Business $99 —
matching what the site and the ad campaign already promise ("hosting from
$29/month after launch"). The insert is guarded by name so re-running adds
nothing.

**NOT created, on purpose**

- `hosting_accounts`, `hosting_plans`, `hosting_integrations`,
  `hosting_deployments`, `hosting_renewals` — each already exists under a
  `website_` or `catalog_` name.
- `hosting_health_checks` / `hosting_usage` — nothing writes them. No uptime
  monitor, no usage API. Health is derived per read from the signals that do
  exist, reusing `src/lib/websites/health.ts`.
- `hosting_backups` — no backup system exists at all. The column reads "Not
  configured" rather than implying a backup nobody takes.
- `hosting_logs` — the events worth showing are already rows in
  `website_deployments`, `website_incidents` and `invoices`.

**Profitability, and what it refuses to do**

`src/lib/hosting/profit.ts` returns `grossCents` and `marginPct` as
`number | null`, null whenever the cost side is unknown, with an
`unknownReason` sentence the screen prints. A margin computed from costs nobody
entered is the number you would price against, so inventing one is worse than
leaving it blank. Stripe's fee is the single cost derived rather than recorded —
2.9% + 30¢, a published formula on money we know we collected — and it is
labelled an estimate everywhere it appears.

**Verified before applying**: 0001→0012 against a scratch PostgreSQL 16, twice
(idempotency), then 20 assertions — plan seeding and its guard against
duplication, `on delete set null` from a deleted plan, every category /
interval / kind / severity / source check, the non-negative amount, the
`effective_to >= effective_from` period check, the resolved-needs-a-time
constraint, cascade from `websites` to both new tables, and RLS as `anon`
(permission denied on both).

## 0013 — CRM: companies and deals

The chain this migration makes real:

```
Company → Contacts → Lead/Inquiry → Deals → Stage → Proposal → Won/Lost
```

**There is no `contacts` table.** A contact IS a lead, and a lead who bought is
also a customer — the same person at two points in their life. Adding a third
record for the same human is how a CRM ends up holding three spellings of one
phone number. The multi-contact model instead falls out of `company_id`:
**several leads pointing at one company are several contacts at one company.**
Nothing else was needed for it.

**What already existed and is not duplicated**

`leads` is the contact record (name, email, phone, business name, nine
statuses, score, owner, notes, last-contacted, next-follow-up, full
attribution). `lead_events` is the activity timeline — note, call, sms,
email_sent, form_submit, appointment, revenue, status_change. `lead_followups`
is the sequence engine. `customers` is a contact who bought. `tasks` already
carries `lead_id` and `customer_id`.

**companies**

`business_name` was a *string* on both `leads` and `customers`. That is fine
while every buyer is an owner-operator, and stops being fine the moment a
second person at the same firm gets in touch — the two are then unrelated rows
that happen to share some text.

Names are **not** unique (there is more than one "Austin Roofing"); domains
are, on `lower(regexp_replace(domain, '^www\.', ''))`, because one website is
one business. Both `leads.company_id` and `customers.company_id` are nullable
with `on delete set null`: losing the company must never lose the person.

**deals**

A lead's status is its stage, right up until the same client buys a second
thing. A website one year and a CRM the next are two sales to one company; a
single status field can only describe one of them, and moving it back to
"Proposal Sent" would erase the first.

So a deal is its own row, and the lead keeps its status — **the dashboard
pipeline still reads `leads.lead_status`, unchanged**. The deal stage list is
deliberately the same five `src/lib/dashboard/sales.ts` already uses, plus
negotiation and the two terminal states, so the two screens can never describe
the same funnel differently.

`billing` distinguishes one-off from recurring, because a $99/month deal and a
$99 deal are not the same size. `comparableCents()` in `src/lib/crm/stages.ts`
annualises recurring work before any total is taken, and the screen says so.

Two constraints stop the reports disagreeing with the stage column:
`stage = 'won'` requires `won_at`, `stage = 'lost'` requires `lost_at`.

**The proposal is an invoice**

`invoices` already carries `kind`, `amount_cents`, `checkout_url`, `sent_at`
and `paid_at`, and the Stripe webhook already moves it. So `invoices.deal_id`
was added rather than a `proposals` table existing to hold the same columns.

**The backfill**

Every `business_name` already in the system becomes a company, and the rows
that named it point at it. Matching is on the trimmed, case-folded name, so
`"Acme Roofing"` and `"acme roofing "` become one company rather than two.
Run now, while there is almost nothing to migrate; the same backfill against a
year of leads would be a project.

**Verified before applying**: 0001→0013 against a scratch PostgreSQL 16, twice
(idempotency), then 22 assertions on seeded data — the backfill folding a
duplicate spelling into one company, two leads ending up on that one company
(multi-contact), a lead with no business getting no company, domain uniqueness
including the www and case variants, two companies sharing a name, four deals
on one company (website / AI automation / app / hosting), the won- and
lost-need-a-date constraints, invalid stage and billing, negative value, an
invoice linking to a deal, `on delete set null` from company to both leads and
deals, and RLS as `anon` (permission denied on both).
