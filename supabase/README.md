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
