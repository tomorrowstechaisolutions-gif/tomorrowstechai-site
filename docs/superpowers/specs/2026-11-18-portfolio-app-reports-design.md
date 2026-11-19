# Portfolio app reports — design

Date: 2026-11-18
Status: awaiting John's approval

## Intent

John runs several products (Held, Storyborn, more coming). Each has its own
admin, its own database and its own Stripe account. He wants the
tomorrowstechai.com admin center to be the one place that shows how every
product is doing, so he stops opening three admins to answer "how are we
doing today?"

## Goals

- One screen in the admin center showing, per product: users, new signups,
  active users, paid subscribers, MRR, past-due, open feedback, AI cost, and
  whether the product's own pipelines are healthy.
- A portfolio rollup across products (total MRR, total users, new today).
- A recent-activity feed per product: signup, upgrade, cancellation, payment
  failed.
- History, so trends can be charted later.
- Adding the next product (REI Ops, Commercial RE AI) means implementing one
  endpoint in that product and adding one row in the admin center.

## Non-goals

- Copying customer records (names, emails) into the admin center. Person-level
  detail stays in each product's own admin, one click away.
- Controlling a product from the admin center (refunds, comps, bans). Read-only.
- Real-time push. Hourly pull is enough for v1.
- Replacing each product's own admin console.
- Reading a product's database or Stripe account directly from the admin center.

## Anti-goals

- A number that looks real but is not. Anything a product cannot measure is
  sent as `null` and shown as "not measured", never as 0. A stale report is
  shown as stale with its age. This matches the rule already written into the
  apps module ("missing data is never rendered as healthy").
- Personal data leaking into the admin center through the activity feed.

## Constraints found in the code

- Admin center (this repo): Next 16, Supabase, Vercel. It already has the
  `apps` portfolio tables (`supabase/migrations/20260910120000_apps.sql`),
  `/admin/apps` and `/admin/apps/[id]`, the `app-health` cron, and a
  bearer-key pull pattern in `src/lib/partners/client.ts` + `sync.ts`. The apps
  migration explicitly defers two things to this work: a Users summary "read
  through an integration when one is connected", and a daily rollup table
  "added with the sync job that fills it".
- Storyborn (`storyforgeai - app`): Next 16, Supabase, Vercel. Its admin
  already computes everything through SQL functions (`admin_overview`,
  `admin_daily`, `admin_ai_costs`) and `collected30d()` in
  `src/app/admin/revenue/page.tsx`. No machine API exists; crons use
  `Bearer CRON_SECRET`.
- Held (`C:\Users\hocki\held`, pnpm monorepo, `apps/web`): Next 16, Neon +
  Drizzle, Auth.js, Vercel. Admin has counts but no MRR or paid-subscriber
  number. Subscription state is mirrored on `households` (`plan`,
  `extra_seats`). `apps/web/proxy.ts` must exempt any new machine route.
  `lib/admin/pulse.ts` records that Stripe had delivered zero webhooks as of
  2026-10-26 (endpoint returned 401).
- Three separate Stripe accounts. No Connect.

## Approaches considered

1. **Report endpoint, pulled on a schedule (chosen).** Each product exposes one
   read-only, key-protected endpoint returning a standard JSON snapshot. The
   admin center pulls hourly, stores history, renders. Each product owns the
   meaning of its numbers; a schema change in a product cannot silently break
   the admin center; the admin center holds only a narrow read key. Cost:
   numbers are as fresh as the last pull.
2. **Direct database access.** Fastest start, but couples the admin center to
   each product's tables and puts customer-database credentials in a third
   place. Rejected.
3. **Push events.** Real-time, but a missed event drifts forever with nothing
   to correct it. Deferred; can be layered on later for a few instant alerts.

John picked 1, with totals plus an activity feed rather than full records.

## The contract: `ttai.app-report/v1`

`GET {product}/api/portfolio/report`
Header: `Authorization: Bearer <key>` (compared with `timingSafeEqual`).
401 on a bad or missing key; 503 with `{ error }` if the product is not
configured. Always `Cache-Control: no-store`.

```json
{
  "contract": "ttai.app-report/v1",
  "app": "held",
  "generated_at": "2026-11-18T15:00:02Z",
  "livemode": true,
  "currency": "usd",
  "metrics": {
    "users_total": 0,
    "users_new_24h": 0,
    "users_new_7d": 0,
    "users_new_30d": 0,
    "active_7d": null,
    "active_30d": null,
    "paid_total": 0,
    "trialing": null,
    "past_due": null,
    "canceling": null,
    "mrr_cents": 0,
    "collected_30d_cents": null,
    "feedback_open": null,
    "ai_cost_30d_cents": null
  },
  "extra": [
    { "key": "households", "label": "Households", "value": 0, "unit": "count" }
  ],
  "health": [
    { "key": "stripe_webhooks", "label": "Stripe webhooks",
      "status": "healthy", "message": "Last event 2h ago",
      "checked_at": "2026-11-18T15:00:02Z" }
  ],
  "events": [
    { "id": "sub_evt_123", "kind": "upgrade", "at": "2026-11-18T14:12:00Z",
      "summary": "New Family plan", "plan": "family",
      "amount_cents": 999, "url": "https://myheldapp.com/admin/accounts/abc" }
  ]
}
```

Rules:

- Every `metrics` key is always present. `null` means "this product does not
  measure this". The admin center never turns null into 0.
- `extra` is for product-specific numbers (Held: households, calendars
  connected; Storyborn: books, exports, submissions). `unit` is `count`,
  `cents` or `percent`.
- `health.status` uses the apps module's four words: `healthy`, `warning`,
  `critical`, `unknown`.
- `events`: the most recent 50, newest first. `kind` is one of `signup`,
  `upgrade`, `downgrade`, `cancel`, `payment_failed`, `feedback`. `id` is
  stable and unique within the product. **No names, emails or free text typed
  by a customer.** `summary` is product-written and generic; `url` deep-links
  to the product's own admin, where the person is visible behind that
  product's login.
- Additive changes keep `v1`. A breaking change becomes `v2` at a new path.

### What the money numbers mean (same in every product)

Both products mirror only the *current* subscription state, and both mirrors
blur trials into paid (Held maps Stripe `trialing` to `plan='family'`;
Storyborn's `paid_plus`/`paid_pro` include trialing and past-due). So the
money numbers come from each product's own Stripe account, read live by that
product when it builds the report:

- `paid_total`: subscriptions with Stripe status `active`.
- `trialing`, `past_due`: subscriptions in those Stripe statuses. Not counted
  as paid, not counted in MRR.
- `canceling`: active subscriptions with `cancel_at_period_end`.
- `mrr_cents`: sum over `active` subscriptions of their items' amounts,
  normalised to monthly, **after discounts/coupons**.
- `collected_30d_cents`: paid invoices minus refunds, last 30 days.
- If Stripe cannot be reached, these are `null`. They are never estimated
  from list prices.

People counts (`users_*`, `active_*`) come from the product's database.
Free/comped access (Held promo households, Storyborn `plan_grants`) is
reported in `extra`, never as paid.

### Where events come from

Neither product keeps a subscription history table, and v1 does not add one.

- `signup`: from the product's users table (`id` = `signup:<user id>`).
- `upgrade`, `downgrade`, `cancel`, `payment_failed`: from the product's
  Stripe events API (`customer.subscription.created/updated/deleted`,
  `invoice.payment_failed`), last 30 days. `id` = the Stripe event id, which
  is stable.
- `feedback` (Held only): from `feedback_items`, `id` = `feedback:<id>`,
  summary is the feedback type, never the message text.

## Admin center (this repo)

**Data** (one new migration):

- `app_integrations.provider` gains `'report'`. One row per app, environment
  `production`; `metadata` holds `{ endpoint_url, key_env }`. The key itself
  stays in a Vercel env var named by `key_env` (same rule as
  `partner_connections.api_key_env`). `status`, `last_checked_at`, `error`
  record each pull.
- `app_reports`: `app_id`, `pulled_at`, `generated_at`, `contract`, `payload
  jsonb`. Latest row per app is what the screens read. Keep 30 days, pruned
  by the cron.
- `app_metrics_daily`: `app_id`, `day`, one column per `metrics` key, `extra
  jsonb`. Upserted on every pull, so the last pull of the day wins. This is
  the rollup the apps migration deferred. Kept indefinitely.
- `app_report_events`: `app_id`, `external_id`, `kind`, `occurred_at`, `summary`,
  `plan`, `amount_cents`, `url`. Unique on `(app_id, external_id)` so repeat
  pulls are free.
- `health` entries stay inside the stored report payload and are shown from
  there. They are not written to `app_health_checks` (changed after code
  review: the health score keeps only the newest row per check type, so
  reported rows would overwrite the system's own integration check).
- RLS: same admin-only posture as the other `app_*` tables.
- The migration seeds, if absent: `apps` rows with slugs `held` and
  `storyborn` (internal ownership, live), a production environment for each
  (myheldapp.com, storyborn.app), and a `report` integration row for each with
  status `not_configured`. Nothing has to be clicked together by hand.
- `IntegrationProvider` and `INTEGRATION_LABELS` in `src/lib/apps` gain
  `report`.

**Behaviour rules:**

- A failed or malformed pull stores nothing. The last good report keeps
  showing, marked stale with its age, and the integration row records the
  error. `app_metrics_daily` is written only from a good pull; a day with no
  good pull stays a gap in the trend, never carried forward.
- "Fresh" means pulled successfully within 3 hours, everywhere, including the
  portfolio strip.
- A report with `livemode: false` is badged "test" and left out of portfolio
  totals. A non-USD report is shown on its own and left out of the USD sum.
- Report health entries are shown in the health list but do **not** open
  `app_incidents` in v1. The existing `app-health` per-app integration check
  will still flag a `report` row in `needs_attention`, which is wanted.
- Retention, pruned by the cron: report-sourced `app_health_checks` 30 days,
  `app_report_events` 180 days, `app_reports` 30 days.
- An activity `url` is rendered as a link only if it is `https` and its host
  matches one of the app's `app_domains` / production environment URL;
  otherwise it is shown as plain text.

**Code:**

- `src/lib/apps/report.ts`: fetch with bearer key and 20s timeout, validate
  the payload shape strictly (reject and record an error rather than store a
  malformed report), write the four tables, update the integration row.
  Never throws to the page; returns `{ ok, error }` like `providers.ts`.
- `src/app/api/cron/app-reports/route.ts`: `Bearer CRON_SECRET`, pulls every
  app with a `report` integration. Hourly in `vercel.json`.
- Server action "Pull now" on the app detail page.

**Screens:**

- `/admin/apps`: a portfolio strip on top (total MRR, total paid, total users,
  new in 24h, summed only across apps with a fresh report, and saying how
  many apps that is). App rows gain users / paid / MRR / report age. Held
  sorts first.
- `/admin/apps/[id]`: a Business tab — metric tiles, the `extra` numbers,
  health list, activity feed with deep links, 30-day trend for users and MRR
  once there are at least two days of data. Not connected → the existing
  "not connected" empty state with setup steps.
- `/admin/system/integrations`: one card per app report (connected / attention
  / not set up, last pull time), via `loadIntegrations()`.
- A report older than 3 hours shows as stale; a failed pull shows the error
  in plain words with what to try.

## Storyborn

- `src/app/api/portfolio/report/route.ts`, guarded by `TTAI_REPORT_KEY`
  (a new, dedicated env var; not `CRON_SECRET`).
- People counts from `admin_overview` / `admin_daily` through the
  service-role client (`users_new_24h` needs a small added count). Money
  numbers from Stripe per the definitions above, in a shared function in
  `src/lib/billing`; the existing `collected30d()` logic moves there so the
  route and the revenue page share it. `ai_cost_30d` is USD numeric and is
  converted to cents.
- `extra`: books, exports, publisher submissions, plan grants.
- `health`: Stripe webhook recency (`stripe_events`), cron recency where
  recorded.
- `events`: from `profiles.created_at` and `subscriptions` changes;
  `feedback` is omitted (no feedback table).

## Held

- `apps/web/app/api/portfolio/report/route.ts`, guarded by `TTAI_REPORT_KEY`;
  add the path to the `apps/web/proxy.ts` exemptions.
- Metrics from Drizzle counts already used in `app/admin/beta/page.tsx`,
  moved into a shared `lib/admin/report.ts`.
- **New: paid and MRR**, read from Held's Stripe account per the definitions
  above (so trials and promo discounts are not counted as revenue, and the
  number does not depend on the webhook mirror). Promo/free households
  (`plan = 'trialing'` with a promo redemption) go in `extra`.
- `feedback_open` from `feedback_items`; `ai_cost_30d_cents` from `ai_runs`.
- `health`: reuse `lib/admin/pulse.ts` results, including Stripe webhook
  delivery.
- **Prerequisite check:** confirm Held's Stripe webhook is delivering before
  trusting `paid_total`. If it is still failing, the report says so in
  `health` and the fix is tracked as its own piece of work.
- The Held admin should also show the new paid/MRR numbers, since it has none
  today (small addition, same shared function).

## Keys

One dedicated secret per product, generated by John, set in two places:
`TTAI_REPORT_KEY` in the product's Vercel project, and `HELD_REPORT_KEY` /
`STORYBORN_REPORT_KEY` in the admin center's Vercel project. Rotating a key
touches only that product. Keys never enter a database or the repo.

## Build order

1. Admin center: migration, `report.ts`, cron, screens, tested against a
   fixture payload.
2. Storyborn endpoint (thin wrapper; proves the contract against real data).
3. Held endpoint (needs the MRR work and the webhook check; needs
   `C:\Users\hocki\held` added to the session).

Held is the priority product, but Storyborn goes first because its numbers
already exist, so the contract gets proven end to end in the shortest time.
(Claude's call.)

## Left to the builder

- Exact tile layout on the Business tab, within the existing admin design
  system.
- How `active_7d` / `active_30d` are measured in Held; `null` if there is no
  honest signal.
- Retry/backoff details in the cron.
- Test shape: contract validator unit tests; one route test per product for
  401 and a good response.

## Calls Claude made (not decided by John)

- Activity feed carries no names or emails, only a deep link.
- Hourly pull; 3-hour staleness threshold.
- Dedicated report key per product instead of reusing `CRON_SECRET`.
- Path `/api/portfolio/report` and contract name `ttai.app-report/v1`.
- 30-day retention for raw reports; daily rollups kept indefinitely.
- Storyborn before Held in the build order.
- Money numbers are read live from each product's Stripe account, counting
  only `active` subscriptions after discounts; trials and past-due are shown
  separately and are not revenue.
- Subscription events come from Stripe's events API (30-day window) rather
  than a new history table in each product.
- Report health entries do not open incidents in v1.
- Retention windows (30 / 180 days) and the link-safety rule for activity
  URLs.
- Storyborn's slug is `storyborn`; the migration seeds both apps.
