# Portfolio App Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tomorrowstechai.com admin center shows live business numbers, health and recent activity for Held and Storyborn, pulled hourly from one read-only endpoint on each product.

**Architecture:** Each product exposes `GET /api/portfolio/report` behind a dedicated bearer key and returns a `ttai.app-report/v1` JSON snapshot. The admin center validates it, stores the latest report, a daily rollup, events and health rows in its existing `apps` module, and renders a portfolio strip plus a Business tab. Money numbers are computed by each product from its own Stripe account.

**Tech Stack:** Next.js 16 App Router, TypeScript. Admin center: Supabase (`@supabase/supabase-js`, SQL migrations), Stripe via fetch. Storyborn: Supabase, `stripe` 23, vitest 5, zod 4. Held: pnpm monorepo, Neon + Drizzle, `stripe` 17, Auth.js.

**Spec:** `docs/superpowers/specs/2026-11-18-portfolio-app-reports-design.md` (this repo). Read it before any task.

**Repos:**

| Part | Repo | Branch |
|---|---|---|
| A | `C:\Users\hocki\Documents\03 - Projects\tomorrowstechai-site` | `feat/portfolio-app-reports` off `main` |
| B | `C:\Users\hocki\Documents\03 - Projects\storyforgeai - app` | `feat/portfolio-report` off `main` |
| C | `C:\Users\hocki\held` (`apps/web`) | `feat/portfolio-report` off `main` |

Each part ships on its own. A works against a fixture before B or C exist. The admin center working tree has unrelated uncommitted files: stage only the files a task names, never `git add -A`.

## Global Constraints

- Contract name is exactly `ttai.app-report/v1`; path is exactly `/api/portfolio/report`.
- Every `metrics` key is always present. `null` means "not measured". Nothing in any repo may turn `null` into `0`, and nothing may estimate money from list prices.
- `paid_total` counts only Stripe status `active`. `trialing` and `past_due` are separate and never in `mrr_cents`. `mrr_cents` is after discounts, normalised to monthly, integer cents.
- No names, emails or customer-typed text in `events`. `summary` is at most 140 characters and product-written.
- Product-side key env var: `TTAI_REPORT_KEY`. Admin-center-side: `HELD_REPORT_KEY`, `STORYBORN_REPORT_KEY`. Never `CRON_SECRET`. Keys never enter a database or the repo. Compare with `timingSafeEqual`.
- Fresh = last successful pull within 3 hours. A failed or malformed pull stores nothing and leaves the last good report showing as stale.
- Health words are exactly `healthy`, `warning`, `critical`, `unknown`.
- Event kinds are exactly `signup`, `upgrade`, `downgrade`, `cancel`, `payment_failed`, `feedback`.
- Retention: `app_reports` 30 days, report-sourced `app_health_checks` 30 days, `app_report_events` 180 days.
- Daily rollup `day` is the calendar date of the pull in `America/Chicago`.
- Admin center copy: plain words, no shaming on failure ("Couldn't reach Held's report. Check that HELD_REPORT_KEY is set in Vercel, then Pull now."). Held listed first wherever products are listed.
- Admin center has no test runner today; Task A1 adds vitest for pure-logic tests only. No UI tests.

## Review Focus

1. **The product answers 200 with a sign-in page, or redirects.** (Held's session proxy redirects unknown machine routes to `/sign-in`.) Expect: nothing stored, error says the endpoint answered with a page instead of a report. Pinned in A3 (`redirect: "manual"`, content-type check) and C2 (proxy exemption test).
2. **A metric arrives as a string, negative, fractional or `NaN`; a required key is missing; `contract` is `v2`.** Expect: whole report rejected with a message naming the field. Pinned in A1.
3. **Subscriptions that are yearly, multi-quantity, discounted, non-USD, or more than one page (100+).** Expect: correct monthly cents; non-USD excluded; all pages read. Pinned in B1 and C1.
4. **An event `url` pointing at another host or using `javascript:`; a 5,000-character `summary`; the same event id on every pull.** Expect: shown as text not a link; truncated to 140; stored once. Pinned in A1 (truncate), A3 (dedupe), A6 (`safeEventUrl`).
5. **The cron stops, or one product is down for a day.** Expect: strip sums only fresh, live, USD reports and says "1 of 2 apps reporting"; the tab shows the last good numbers with their age; the trend has a gap, not a carried-forward day. Pinned in A5 (`rollup`) and A3 (no write on failure).

---

# Part A — Admin center

### Task A1: Contract types and validator

**Files:**
- Create: `src/lib/apps/report-contract.ts`
- Create: `src/lib/apps/__tests__/report-contract.test.ts`
- Create: `src/lib/apps/__fixtures__/report.held.json` (the spec's example payload with realistic non-zero numbers, two health entries, three events)
- Create: `vitest.config.ts` (node environment, `@` alias to `src`)
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)

**Interfaces:**
- Produces:

```ts
export const REPORT_CONTRACT = "ttai.app-report/v1";
export const METRIC_KEYS = [
  "users_total","users_new_24h","users_new_7d","users_new_30d","active_7d","active_30d",
  "paid_total","trialing","past_due","canceling","mrr_cents","collected_30d_cents",
  "feedback_open","ai_cost_30d_cents",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type ReportMetrics = Record<MetricKey, number | null>;
export type ReportExtra = { key: string; label: string; value: number; unit: "count" | "cents" | "percent" };
export type ReportHealth = { key: string; label: string; status: "healthy"|"warning"|"critical"|"unknown"; message: string | null; checked_at: string };
export type ReportEventKind = "signup"|"upgrade"|"downgrade"|"cancel"|"payment_failed"|"feedback";
export type ReportEvent = { id: string; kind: ReportEventKind; at: string; summary: string; plan: string | null; amount_cents: number | null; url: string | null };
export type AppReport = { contract: typeof REPORT_CONTRACT; app: string; generated_at: string; livemode: boolean; currency: string; metrics: ReportMetrics; extra: ReportExtra[]; health: ReportHealth[]; events: ReportEvent[] };
export function parseReport(input: unknown): { ok: true; report: AppReport } | { ok: false; error: string };
```

- [ ] **Step 1: Install vitest and add the config and script.** Run `npm i -D vitest`, then `npm test`. Expected: "No test files found".

- [ ] **Step 2: Write the failing tests**

```ts
import fixture from "../__fixtures__/report.held.json";
import { parseReport, METRIC_KEYS } from "../report-contract";

const clone = () => structuredClone(fixture) as Record<string, any>;

test("accepts the fixture", () => {
  const r = parseReport(fixture);
  expect(r.ok).toBe(true);
});
test("keeps null metrics as null", () => {
  const p = clone(); p.metrics.active_7d = null;
  const r = parseReport(p);
  expect(r.ok && r.report.metrics.active_7d).toBeNull();
});
test.each([
  ["wrong contract", (p: any) => { p.contract = "ttai.app-report/v2"; }, "contract"],
  ["missing metric key", (p: any) => { delete p.metrics.mrr_cents; }, "mrr_cents"],
  ["string metric", (p: any) => { p.metrics.users_total = "12"; }, "users_total"],
  ["negative metric", (p: any) => { p.metrics.paid_total = -1; }, "paid_total"],
  ["fractional metric", (p: any) => { p.metrics.mrr_cents = 9.5; }, "mrr_cents"],
  ["bad health word", (p: any) => { p.health[0].status = "ok"; }, "health"],
  ["bad event kind", (p: any) => { p.events[0].kind = "refund"; }, "events"],
  ["bad date", (p: any) => { p.generated_at = "yesterday"; }, "generated_at"],
  ["not an object", () => null, "report"],
])("rejects %s", (_name, mutate, field) => {
  const p = clone(); const out = mutate(p);
  const r = parseReport(out === null ? "<html>" : p);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(field);
});
test("truncates summary to 140 and caps events at 50", () => {
  const p = clone();
  p.events = Array.from({ length: 80 }, (_, i) => ({ ...p.events[0], id: `e${i}`, summary: "x".repeat(5000) }));
  const r = parseReport(p);
  expect(r.ok && r.report.events.length).toBe(50);
  expect(r.ok && r.report.events[0].summary.length).toBe(140);
});
test("drops unknown top-level and metric keys instead of failing", () => {
  const p = clone(); p.future_field = 1; p.metrics.future_metric = 5;
  const r = parseReport(p);
  expect(r.ok).toBe(true);
  if (r.ok) expect(Object.keys(r.report.metrics).sort()).toEqual([...METRIC_KEYS].sort());
});
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, module not found.

- [ ] **Step 4: Implement `parseReport` in `src/lib/apps/report-contract.ts`.** Hand-written checks, no new dependency. Metrics must be `null` or a non-negative safe integer. Dates must parse with `Date.parse`. `extra`, `health`, `events` default to `[]` when absent; `extra` capped at 30, `health` at 30. Strings trimmed; `label`/`key` capped at 80, `message` at 300. The error names the first failing field.

- [ ] **Step 5: Run `npm test`.** Expected: PASS.

- [ ] **Step 6: Commit** — `git add package.json package-lock.json vitest.config.ts src/lib/apps/report-contract.ts src/lib/apps/__tests__ src/lib/apps/__fixtures__` then `git commit -m "feat(apps): app-report v1 contract and validator"`.

### Task A2: Migration

**Files:**
- Create: `supabase/migrations/20261118060000_app_reports.sql`
- Modify: `src/lib/apps/types.ts` (add `"report"` to `IntegrationProvider`, `INTEGRATION_LABELS` → `"Business report"`, and first in `INTEGRATION_ORDER`)

**Interfaces:**
- Produces tables (all RLS on, same four `is_admin()` policies and `revoke all … from anon` as the loop at the end of `20260910120000_apps.sql`):
  - `app_reports(id uuid pk, app_id uuid fk apps on delete cascade, pulled_at timestamptz not null default now(), generated_at timestamptz not null, contract text not null, livemode boolean not null, currency text not null, payload jsonb not null)`; index `(app_id, pulled_at desc)`.
  - `app_metrics_daily(app_id uuid fk, day date, <one nullable bigint column per METRIC_KEYS entry, same names>, extra jsonb not null default '[]', livemode boolean not null, currency text not null, updated_at timestamptz not null default now(), primary key (app_id, day))`.
  - `app_report_events(id uuid pk, app_id uuid fk, external_id text not null, kind text not null check (kind in (<the six kinds>)), occurred_at timestamptz not null, summary text not null, plan text, amount_cents bigint, url text, created_at timestamptz not null default now(), unique (app_id, external_id))`; index `(app_id, occurred_at desc)`.
- `app_integrations_provider_check` dropped and re-added with `'report'` appended to the existing list.
- Seeds, each `on conflict do nothing` (apps on `lower(slug)`): app `held` ("Held", internal, web_mobile, live) with production environment `https://myheldapp.com`; app `storyborn` ("Storyborn", internal, web, live) with production environment `https://storyborn.app`; one `app_integrations` row per app with `provider 'report'`, `environment 'production'`, `status 'not_configured'`, `metadata {"endpoint_url": "<env url>/api/portfolio/report", "key_env": "HELD_REPORT_KEY" | "STORYBORN_REPORT_KEY"}`.

- [ ] **Step 1: Write the migration** inside `begin; … commit;`, idempotent (`if not exists`, `drop constraint if exists`), with a header comment in the house style of `20260910120000_apps.sql` stating that this is the rollup and Users summary that file deferred.
- [ ] **Step 2: Apply it to a Supabase branch (not production) and verify.** Run in SQL: `select slug from apps where slug in ('held','storyborn'); select provider, status, metadata->>'key_env' from app_integrations where provider='report';` Expected: two rows each. Run the migration a second time. Expected: no error, still two rows each.
- [ ] **Step 3: Update `types.ts`; run `npx tsc --noEmit`.** Expected: clean (the `Record<IntegrationProvider, string>` forces the label).
- [ ] **Step 4: Commit** — `feat(apps): tables for product reports, seed Held and Storyborn`.

Applying to production is John's call at ship time, not part of this task.

### Task A3: Pull and store

**Files:**
- Create: `src/lib/apps/report.ts` (`import "server-only"`)
- Create: `src/lib/apps/report-writes.ts` (pure, no imports from supabase)
- Create: `src/lib/apps/__tests__/report-writes.test.ts`

**Interfaces:**
- Consumes: `parseReport`, `AppReport`, `METRIC_KEYS` (A1); tables (A2); `supabaseAdmin()` from `@/lib/supabase/admin`; `safeMessage` from `./providers`.
- Produces:

```ts
// report-writes.ts
export function chicagoDay(at: Date): string;                         // "2026-11-18"
export function classifyResponse(status: number, contentType: string | null): string | null; // null = ok, else plain-words error
export function planWrites(appId: string, report: AppReport, pulledAt: Date): {
  reportRow: Record<string, unknown>;
  dailyRow: Record<string, unknown>;      // keyed (app_id, day)
  eventRows: Record<string, unknown>[];   // one per event, external_id = event.id
  healthRows: Record<string, unknown>[];  // check_type "integration", target = "report:" + entry.key
};
// report.ts
export type PullResult = { ok: true; appId: string; events: number } | { ok: false; appId: string; error: string };
export async function pullAppReport(appId: string): Promise<PullResult>;
export async function pullAllAppReports(): Promise<PullResult[]>;
export async function pruneReports(): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

```ts
test("chicagoDay uses Central time, not UTC", () => {
  expect(chicagoDay(new Date("2026-11-19T03:30:00Z"))).toBe("2026-11-18");
});
test.each([
  [200, "application/json; charset=utf-8", null],
  [200, "text/html", "page"],
  [307, null, "redirect"],
  [401, "application/json", "key"],
  [503, "application/json", "not set up"],
  [500, "text/plain", "500"],
])("classifyResponse %i %s", (status, type, needle) => {
  const out = classifyResponse(status, type);
  if (needle === null) expect(out).toBeNull(); else expect(out).toContain(needle);
});
test("planWrites keeps null metrics null and maps every metric key", () => {
  const w = planWrites("app-1", report({ active_7d: null }), new Date("2026-11-18T15:00:00Z"));
  expect(w.dailyRow.active_7d).toBeNull();
  for (const k of METRIC_KEYS) expect(k in w.dailyRow).toBe(true);
  expect(w.dailyRow.day).toBe("2026-11-18");
});
test("planWrites prefixes health targets and carries event ids", () => {
  const w = planWrites("app-1", report(), new Date());
  expect(w.healthRows.every((h) => String(h.target).startsWith("report:"))).toBe(true);
  expect(w.eventRows.map((e) => e.external_id)).toEqual(report().events.map((e) => e.id));
});
```

(`report(overrides)` is a local helper that parses the A1 fixture and overrides metrics.)

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `report-writes.ts`.** `chicagoDay` via `Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" })`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `report.ts`.**
  - `pullAppReport`: load the app's `report` integration row; read `metadata.endpoint_url` and `metadata.key_env`; if `process.env[key_env]` is unset, set the row to `not_configured` with error "`<key_env>` is not set in Vercel." and return. Fetch with `Authorization: Bearer`, `Accept: application/json`, `cache: "no-store"`, `redirect: "manual"`, `AbortSignal.timeout(20_000)`. Run `classifyResponse`, then `parseReport`. Also reject when `report.app` differs from the app's slug.
  - On any failure: update the integration row to `needs_attention` with `error` (through `safeMessage`) and `last_checked_at`, write nothing else, return `{ ok: false }`. Never throw.
  - On success: insert `reportRow`; upsert `dailyRow` on `(app_id, day)`; upsert `eventRows` on `(app_id, external_id)` with `ignoreDuplicates`; insert `healthRows`; set the integration row `connected`, `error null`, `last_checked_at now`.
  - `pullAllAppReports`: every non-archived app with a `report` integration row, in parallel with `Promise.allSettled`, Held first in the returned order.
  - `pruneReports`: delete by the retention windows in Global Constraints; health rows only where `target like 'report:%'`.
- [ ] **Step 6: `npx tsc --noEmit` and `npm run lint`.** Expected: clean.
- [ ] **Step 7: Commit** — `feat(apps): pull and store product reports`.

### Task A4: Cron and "Pull now"

**Files:**
- Create: `src/app/api/cron/app-reports/route.ts`
- Modify: `vercel.json` (add `{ "path": "/api/cron/app-reports", "schedule": "12 * * * *" }`)
- Create: `src/app/admin/app-report-actions.ts`

**Interfaces:**
- Consumes: `pullAllAppReports`, `pullAppReport`, `pruneReports` (A3).
- Produces: `export async function pullAppReportNow(appId: string): Promise<{ ok: boolean; error?: string }>` (server action; checks the admin session the same way the other `src/app/admin/*-actions.ts` files do, then `revalidatePath("/admin/apps")` and the app's detail path).

- [ ] **Step 1: Write the route**, copying the `authorized()` helper and shape of `src/app/api/cron/app-health/route.ts`. `maxDuration = 60`. Response: `{ pulled: [{ app, ok, error? }] }`. Prune after pulling; a prune failure is logged, not returned as 500.
- [ ] **Step 2: Verify locally.** `npm run dev`, then `curl -i localhost:3000/api/cron/app-reports` → 401. With `-H "Authorization: Bearer $CRON_SECRET"` → 200 and both apps reported as `ok: false` with the "is not set in Vercel" error (no keys yet). Confirm no row appeared in `app_reports`.
- [ ] **Step 3: Write the server action.**
- [ ] **Step 4: Commit** — `feat(apps): hourly report pull and Pull now action`.

### Task A5: Portfolio strip and list columns

**Files:**
- Create: `src/lib/apps/report-queries.ts`
- Create: `src/lib/apps/report-rollup.ts` (pure)
- Create: `src/lib/apps/__tests__/report-rollup.test.ts`
- Create: `src/components/admin/cc/apps/PortfolioStrip.tsx`
- Modify: `src/app/admin/(shell)/apps/page.tsx`

**Interfaces:**
- Produces:

```ts
// report-rollup.ts
export const FRESH_MS = 3 * 60 * 60 * 1000;
export type LatestReport = { appId: string; slug: string; name: string; pulledAt: string; livemode: boolean; currency: string; metrics: ReportMetrics };
export function isFresh(pulledAt: string, now: Date): boolean;
export function rollup(reports: LatestReport[], connectedApps: number, now: Date): {
  mrrCents: number | null; paid: number | null; users: number | null; new24h: number | null;
  reporting: number; of: number;
};
// report-queries.ts
export async function loadLatestReports(sb: SupabaseClient): Promise<LatestReport[]>;   // newest row per app, Held first
export async function loadReportIntegrations(sb: SupabaseClient): Promise<{ appId: string; slug: string; name: string; status: IntegrationStatus; error: string | null; lastCheckedAt: string | null; keyEnv: string | null }[]>;
```

- [ ] **Step 1: Write the failing tests**

```ts
const now = new Date("2026-11-18T18:00:00Z");
const r = (o: Partial<LatestReport> & { m?: Partial<ReportMetrics> }): LatestReport => ({ /* fresh, live, usd, all metrics 0, then overrides */ });

test("sums fresh live USD reports", () => {
  const out = rollup([r({ m: { mrr_cents: 1500, paid_total: 2, users_total: 10, users_new_24h: 1 } }),
                      r({ m: { mrr_cents: 3900, paid_total: 1, users_total: 40, users_new_24h: 0 } })], 2, now);
  expect(out).toEqual({ mrrCents: 5400, paid: 3, users: 50, new24h: 1, reporting: 2, of: 2 });
});
test("leaves out stale, test-mode and non-USD reports", () => {
  const out = rollup([r({ m: { mrr_cents: 1500 } }),
                      r({ pulledAt: "2026-11-18T14:59:00Z", m: { mrr_cents: 9999 } }),
                      r({ livemode: false, m: { mrr_cents: 9999 } }),
                      r({ currency: "eur", m: { mrr_cents: 9999 } })], 4, now);
  expect(out.mrrCents).toBe(1500);
  expect(out.reporting).toBe(1);
  expect(out.of).toBe(4);
});
test("a total is null when no counted report measures it", () => {
  const out = rollup([r({ m: { mrr_cents: null } })], 1, now);
  expect(out.mrrCents).toBeNull();
});
test("null in one app does not zero the other", () => {
  const out = rollup([r({ m: { mrr_cents: null } }), r({ m: { mrr_cents: 700 } })], 2, now);
  expect(out.mrrCents).toBe(700);
});
test("no reports at all", () => {
  expect(rollup([], 0, now)).toEqual({ mrrCents: null, paid: null, users: null, new24h: null, reporting: 0, of: 0 });
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `report-rollup.ts`, then `report-queries.ts`.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Build `PortfolioStrip`** (server component, existing `cc-` classes and tile components already used on `/admin/apps`): four tiles — MRR, Paid subscribers, Users, New in 24h — and one line "N of M apps reporting · pulled Xm ago". A `null` total renders "Not measured", never `$0`. When `of` is 0, the strip is not rendered.
- [ ] **Step 6: Wire into `apps/page.tsx`:** strip above the board; each app row with a report gains Users / Paid / MRR and the report age, with a "stale" marker when not fresh and a "test" badge when `livemode` is false. Rows without a report show nothing extra.
- [ ] **Step 7: Verify in the browser.** Insert the A1 fixture as an `app_reports` row for `held` on the Supabase branch (SQL), load `/admin/apps`, check the strip and row at desktop and 375px width. Set `pulled_at` 4 hours back and reload: the row shows stale and the strip drops it.
- [ ] **Step 8: Commit** — `feat(apps): portfolio strip and report columns on Apps`.

### Task A6: Business tab

**Files:**
- Modify: `src/app/admin/(shell)/apps/[id]/page.tsx` (add `"Business"` to `TABS` directly after `"Overview"`; load branch)
- Create: `src/components/admin/cc/apps/BusinessTab.tsx`
- Create: `src/components/admin/cc/apps/PullNowButton.tsx` (client; calls `pullAppReportNow`, shows pending and the returned error)
- Modify: `src/lib/apps/report-queries.ts`
- Modify: `src/lib/apps/report-rollup.ts`, `src/lib/apps/__tests__/report-rollup.test.ts`

**Interfaces:**
- Consumes: `pullAppReportNow` (A4), `isFresh` (A5).
- Produces:

```ts
// report-rollup.ts
export function safeEventUrl(url: string | null, allowedHosts: string[]): string | null;
// report-queries.ts
export async function loadBusiness(sb: SupabaseClient, appId: string): Promise<{
  integration: { status: IntegrationStatus; error: string | null; lastCheckedAt: string | null; endpointUrl: string | null; keyEnv: string | null } | null;
  report: (AppReport & { pulledAt: string }) | null;
  events: { id: string; kind: ReportEventKind; occurredAt: string; summary: string; plan: string | null; amountCents: number | null; url: string | null }[]; // newest 50 from app_report_events
  daily: { day: string; users_total: number | null; mrr_cents: number | null }[]; // last 30 days, ascending, gaps left as gaps
  allowedHosts: string[]; // hosts of app_domains + production environment url
}>;
```

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
  ["https://myheldapp.com/admin/accounts/abc", ["myheldapp.com"], "https://myheldapp.com/admin/accounts/abc"],
  ["https://www.myheldapp.com/x", ["myheldapp.com"], null],
  ["http://myheldapp.com/x", ["myheldapp.com"], null],
  ["javascript:alert(1)", ["myheldapp.com"], null],
  ["https://evil.example/myheldapp.com", ["myheldapp.com"], null],
  ["not a url", ["myheldapp.com"], null],
  [null, ["myheldapp.com"], null],
])("safeEventUrl %s", (url, hosts, expected) => {
  expect(safeEventUrl(url, hosts)).toBe(expected);
});
```

- [ ] **Step 2: Run, see FAIL; implement `safeEventUrl` (exact host match, `https:` only); run, see PASS.**
- [ ] **Step 3: Implement `loadBusiness`.**
- [ ] **Step 4: Build `BusinessTab`** with these states, in the page's existing design system:
  - No integration row or `not_configured`: the module's existing "not connected" empty state, with the three setup steps (add the endpoint in the product, set `TTAI_REPORT_KEY` there, set `<keyEnv>` here) and the endpoint URL.
  - `needs_attention` with no report yet: the error in plain words plus `PullNowButton`.
  - Report present: header line (pulled age, "stale" when not fresh, "test" badge, `PullNowButton`); if the last pull failed, a calm notice above the tiles with the error and "showing the last good report".
  - Tiles for every metric, grouped People (users, new 24h/7d/30d, active 7d/30d), Money (MRR, paid, trialing, past due, canceling, collected 30d), Operations (open feedback, AI cost 30d). `null` renders "Not measured". Cents render as currency.
  - `extra` as a compact definition list.
  - Health list using the page's existing health pill styles.
  - Activity feed: kind label, relative time, summary, plan, amount; the row links out only when `safeEventUrl` returns a URL (`rel="noopener noreferrer"`, new tab).
  - Trend: users and MRR over 30 days, rendered only when `daily` has at least two days; missing days are gaps.
- [ ] **Step 5: Verify in the browser** against the fixture row: `/admin/apps/<held id>?tab=business` at desktop and 375px, in each of the four states (delete the report row / set integration status by SQL on the branch to reach them). Click Pull now with no key set: the button shows the "not set in Vercel" message and the page does not error.
- [ ] **Step 6: Commit** — `feat(apps): Business tab with metrics, health and activity`.

### Task A7: Integrations page cards

**Files:**
- Modify: `src/lib/integrations/status.ts`

**Interfaces:**
- Consumes: `loadReportIntegrations` (A5).

- [ ] **Step 1: Add `"Products"` to the `Category` union and one card per app** inside `loadIntegrations()`, wrapped in the file's `safe()` like its neighbours: `key: "report-<slug>"`, `name: "<App> business report"`, `purpose: "Users, subscribers, MRR and activity pulled hourly from <App>."`, `envs: [keyEnv]`, `manage: /admin/apps/<id>?tab=business`. State mapping: `connected` → `connected`; `needs_attention` → `attention` with the stored error as `detail`; `not_configured` with the env var set → `keys_set`; otherwise `not_set_up`. `lastActivity` = `lastCheckedAt`. Held's card first.
- [ ] **Step 2: Render the new category** wherever `src/app/admin/(shell)/system/integrations/page.tsx` orders categories, placed first.
- [ ] **Step 3: Verify in the browser:** `/admin/system/integrations` shows two "not set up" cards under Products.
- [ ] **Step 4: `npm test && npx tsc --noEmit && npm run lint && npm run build`.** Expected: all clean.
- [ ] **Step 5: Commit** — `feat(system): product report cards on Integrations`.

---

# Part B — Storyborn

Run from `C:\Users\hocki\Documents\03 - Projects\storyforgeai - app`. Tests live in `tests/`, run with `npm test`; `npm run check` must pass before each commit.

### Task B1: Money numbers from Stripe

**Files:**
- Create: `src/lib/billing/money.ts`
- Create: `tests/money.test.ts`
- Modify: `src/app/admin/revenue/page.tsx` (use `collected30dCents`; delete the local `collected30d`)

**Interfaces:**
- Consumes: `stripe()`, `isBillingConfigured()` from `src/lib/billing/service.ts`.
- Produces:

```ts
export type SubLike = {
  status: string; cancel_at_period_end: boolean; currency: string;
  items: { unit_amount: number | null; quantity: number; interval: "day"|"week"|"month"|"year"; interval_count: number }[];
  coupons: { percent_off: number | null; amount_off: number | null; duration: "once"|"repeating"|"forever" }[];
};
export type MoneyMetrics = { paid_total: number; trialing: number; past_due: number; canceling: number; mrr_cents: number };
export function summarizeSubscriptions(subs: SubLike[], currency?: string): MoneyMetrics;  // pure; currency defaults "usd"
export async function loadMoney(): Promise<(MoneyMetrics & { collected_30d_cents: number }) | null>; // null when Stripe is not configured or errors
export async function collected30dCents(): Promise<{ grossCents: number; refundedCents: number; count: number } | null>;
```

MRR rule (the signature does not determine it):

```
per subscription with status "active" and currency == currency:
  monthly = Σ items (unit_amount ?? 0) × quantity × factor
     factor: month → 1/interval_count; year → 1/(12×interval_count);
             week → 52/(12×interval_count); day → 365/(12×interval_count)
  for each coupon with duration "forever" or "repeating":
     percent_off → monthly ×= (1 − percent_off/100)
     amount_off  → monthly −= amount_off
  monthly = max(0, monthly)
mrr_cents = Math.round(Σ monthly)
canceling = active subs with cancel_at_period_end
```

- [ ] **Step 1: Write the failing tests**

```ts
const sub = (o: Partial<SubLike> = {}): SubLike => ({ status: "active", cancel_at_period_end: false, currency: "usd",
  items: [{ unit_amount: 1900, quantity: 1, interval: "month", interval_count: 1 }], coupons: [], ...o });

test("monthly plan", () => expect(summarizeSubscriptions([sub()]).mrr_cents).toBe(1900));
test("yearly plan is divided by 12", () =>
  expect(summarizeSubscriptions([sub({ items: [{ unit_amount: 12000, quantity: 1, interval: "year", interval_count: 1 }] })]).mrr_cents).toBe(1000));
test("quantity and multiple items", () =>
  expect(summarizeSubscriptions([sub({ items: [
    { unit_amount: 999, quantity: 1, interval: "month", interval_count: 1 },
    { unit_amount: 200, quantity: 3, interval: "month", interval_count: 1 }] })]).mrr_cents).toBe(1599));
test("percent coupon, rounded once at the end", () =>
  expect(summarizeSubscriptions([sub({ items: [{ unit_amount: 1599, quantity: 1, interval: "month", interval_count: 1 }],
    coupons: [{ percent_off: 50, amount_off: null, duration: "forever" }] })]).mrr_cents).toBe(800));
test("once coupons are ignored; amount_off never goes below zero", () => {
  expect(summarizeSubscriptions([sub({ coupons: [{ percent_off: 100, amount_off: null, duration: "once" }] })]).mrr_cents).toBe(1900);
  expect(summarizeSubscriptions([sub({ coupons: [{ percent_off: null, amount_off: 5000, duration: "repeating" }] })]).mrr_cents).toBe(0);
});
test("trialing and past_due are counted but are not revenue", () => {
  const out = summarizeSubscriptions([sub(), sub({ status: "trialing" }), sub({ status: "past_due" }), sub({ status: "canceled" })]);
  expect(out).toEqual({ paid_total: 1, trialing: 1, past_due: 1, canceling: 0, mrr_cents: 1900 });
});
test("canceling counts active subs set to end", () =>
  expect(summarizeSubscriptions([sub({ cancel_at_period_end: true })]).canceling).toBe(1));
test("other currencies are left out entirely", () =>
  expect(summarizeSubscriptions([sub({ currency: "eur" })])).toEqual({ paid_total: 0, trialing: 0, past_due: 0, canceling: 0, mrr_cents: 0 }));
test("empty", () => expect(summarizeSubscriptions([]).mrr_cents).toBe(0));
```

- [ ] **Step 2: Run `npm test -- money`.** Expected: FAIL.
- [ ] **Step 3: Implement `summarizeSubscriptions`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Implement `loadMoney` and `collected30dCents`.** `loadMoney` iterates `stripe().subscriptions.list({ status: "all", limit: 100, expand: ["data.discounts"] })` with the SDK's async iterator (all pages), maps each to `SubLike` (coupons from the expanded `discounts`; a missing `recurring` on a price skips that item), and returns `null` on any thrown error after logging the message. `collected30dCents` is the page's existing logic returning integer cents.
- [ ] **Step 6: Point the revenue page at `collected30dCents`** (divide by 100 at the render). `npm run check`. Expected: clean; load `/admin/revenue` locally and confirm the collected figure still renders.
- [ ] **Step 7: Commit** — `feat(billing): Stripe-sourced money metrics`.

### Task B2: Report endpoint

**Files:**
- Create: `src/lib/portfolio/report.ts`
- Create: `src/app/api/portfolio/report/route.ts`
- Create: `tests/portfolio-report.test.ts`
- Modify: the env example / env docs file the repo already keeps (add `TTAI_REPORT_KEY`), and `docs/` — add `docs/37-portfolio-report.md` (what the endpoint returns, who calls it, how to rotate the key)

**Interfaces:**
- Consumes: `loadMoney` (B1); `createAdminClient()` from `@/lib/supabase/admin`; RPCs `admin_overview`, `admin_daily`; `site.url`.
- Produces:

```ts
// src/lib/portfolio/report.ts
export function authorizedReportRequest(header: string | null, key: string | undefined): "ok" | "unauthorized" | "unconfigured";
export function buildReport(input: {
  now: Date; livemode: boolean; origin: string;
  overview: Record<string, number>;          // admin_overview payload
  usersNew24h: number;
  money: (MoneyMetrics & { collected_30d_cents: number }) | null;
  lastStripeEventAt: string | null;
  signups: { id: string; created_at: string }[];
  stripeEvents: { id: string; type: string; created: number; plan: string | null; amount_cents: number | null; userId: string | null }[];
}): AppReportPayload;   // exactly the ttai.app-report/v1 shape, app: "storyborn"
export async function loadReport(now?: Date): Promise<AppReportPayload>;
```

Mapping decisions:
- `feedback_open: null` (no feedback table). `ai_cost_30d_cents = Math.round(overview.ai_cost_30d × 100)`. `active_7d/30d` from overview. All five money keys and `collected_30d_cents` are `null` when `money` is `null`.
- `extra`: `books_total` "Books", `exports_30d` "Exports (30d)", `submissions_30d` "Publisher submissions (30d)", `grants_active` "Comped plans".
- `health`: `stripe_webhooks` — healthy when the newest `stripe_events` row is under 7 days old or there are zero paid subscriptions; warning otherwise; `unknown` when money is `null`. `ai_jobs` — warning when `jobs_failed_7d > 0`. `emails` — warning when `emails_failed_7d > 0`. Messages state the count or age.
- `events`: newest 50 of signups (`id "signup:<user id>"`, summary "New signup") merged with Stripe events mapped: `customer.subscription.created` → `upgrade` "New <plan label> subscription"; `customer.subscription.updated` where the price moved up/down → `upgrade`/`downgrade`, where `cancel_at_period_end` turned true → `cancel` "Set to cancel"; other updates skipped; `customer.subscription.deleted` → `cancel` "Subscription ended"; `invoice.payment_failed` → `payment_failed` "Payment failed". `url` = `<origin>/admin/users/<user id>` when the user id is known, else `null`. Stripe events read with `stripe().events.list({ types: [...], created: { gte: now − 30 days }, limit: 100 })`, first page only.
- `livemode` = whether `STRIPE_SECRET_KEY` starts with `sk_live_`.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
  ["Bearer k", "k", "ok"], ["Bearer nope", "k", "unauthorized"], [null, "k", "unauthorized"],
  ["Bearer k", undefined, "unconfigured"], ["Bearer ", "", "unconfigured"],
])("authorizedReportRequest %s", (h, k, out) => expect(authorizedReportRequest(h, k)).toBe(out));

test("money is null, never zero, when Stripe is unavailable", () => {
  const r = buildReport(input({ money: null }));
  for (const k of ["paid_total","trialing","past_due","canceling","mrr_cents","collected_30d_cents"] as const)
    expect(r.metrics[k]).toBeNull();
  expect(r.health.find((h) => h.key === "stripe_webhooks")?.status).toBe("unknown");
});
test("has every metric key and the contract name", () => {
  const r = buildReport(input());
  expect(r.contract).toBe("ttai.app-report/v1");
  expect(Object.keys(r.metrics).sort()).toEqual([/* the 14 keys, sorted */]);
  expect(r.metrics.feedback_open).toBeNull();
});
test("ai cost converts dollars to cents", () =>
  expect(buildReport(input({ overview: { ...base, ai_cost_30d: 12.345 } })).metrics.ai_cost_30d_cents).toBe(1235));
test("events carry no email and at most 50, newest first", () => {
  const r = buildReport(input({ signups: Array.from({ length: 80 }, (_, i) => ({ id: `u${i}`, created_at: new Date(2026, 10, 1, i).toISOString() })) }));
  expect(r.events.length).toBe(50);
  expect(JSON.stringify(r.events)).not.toContain("@");
  expect(Date.parse(r.events[0].at)).toBeGreaterThan(Date.parse(r.events[49].at));
});
test("event urls stay on the product origin", () => {
  const r = buildReport(input({ origin: "https://storyborn.app" }));
  for (const e of r.events) if (e.url) expect(new URL(e.url).host).toBe("storyborn.app");
});
```

- [ ] **Step 2: Run, see FAIL. Implement `authorizedReportRequest` (`timingSafeEqual` on equal-length buffers) and `buildReport`. Run, see PASS.**
- [ ] **Step 3: Implement `loadReport`** (gathers the inputs in parallel; `usersNew24h` from `admin_daily(1)` or a direct service-role count on `profiles.created_at`, whichever matches how `users_total` is counted) **and the route:** `runtime "nodejs"`, `dynamic "force-dynamic"`, `maxDuration 30`; 503 `{ error: "TTAI_REPORT_KEY is not configured." }`, 401 `{ error: "Unauthorized" }`, else 200 with `Cache-Control: no-store`. A thrown error returns 500 `{ error: "Report failed." }` and logs the message; no stack or SQL in the body.
- [ ] **Step 4: Verify locally.** `npm run dev`; `curl -i localhost:3000/api/portfolio/report` → 401 (or 503 with no key). With the key → 200; pipe the body through the admin center's validator: from the admin center repo run `node -e` / a vitest one-off that calls `parseReport` on the saved body. Expected: `ok: true`.
- [ ] **Step 5: `npm run check`.** Expected: clean.
- [ ] **Step 6: Commit** — `feat(portfolio): read-only report endpoint for the TTAI admin center`.

---

# Part C — Held

Run from `C:\Users\hocki\held`. This repo must be added to the session first. Before Task C1, read `apps/web/lib/admin/__tests__/pulseState.test.ts` and run that file the way it is meant to be run (its imports show the runner); use the same runner and file layout for the tests below.

### Task C1: Money numbers from Stripe, shown in Held's admin

**Files:**
- Create: `apps/web/lib/billing/money.ts`
- Create: `apps/web/lib/billing/__tests__/money.test.ts`
- Modify: `apps/web/app/admin/beta/page.tsx` (add Paid households, MRR, Trialing, Past due cards; "Not measured" when `loadMoney()` is `null`)

**Interfaces:**
- Consumes: `getStripe()` from `apps/web/lib/billing/stripe.ts`.
- Produces: the same `SubLike`, `MoneyMetrics`, `summarizeSubscriptions`, `loadMoney`, `collected30dCents` as Task B1, with the same MRR rule. (Two small copies on purpose: the products share no package.)

- [ ] **Step 1: Write the failing tests** — the nine tests from Task B1 Step 1, with the first fixture price changed to Held's shape (`unit_amount: 999` family plan; the "quantity and multiple items" test already models family + 3 extra seats = 1599).
- [ ] **Step 2: Run, see FAIL. Implement `summarizeSubscriptions`. Run, see PASS.**
- [ ] **Step 3: Implement `loadMoney` and `collected30dCents`.** `stripe` 17 with the pinned API version exposes a single `discount` and a `discounts` array of ids: list with `expand: ["data.discounts"]` and fall back to `discount?.coupon` when `discounts` is empty. `loadMoney` catches the "STRIPE_SECRET_KEY is not set" throw and returns `null`.
- [ ] **Step 4: Add the four cards** to the beta dashboard in its existing card style.
- [ ] **Step 5: Verify:** `pnpm typecheck && pnpm lint`; load `/admin/beta` locally and confirm the cards render (numbers, or "Not measured" with no key).
- [ ] **Step 6: Commit** — `feat(billing): Stripe-sourced paid and MRR numbers in admin`.

### Task C2: Report endpoint

**Files:**
- Create: `apps/web/lib/portfolio/report.ts`
- Create: `apps/web/lib/portfolio/__tests__/report.test.ts`
- Create: `apps/web/app/api/portfolio/report/route.ts`
- Modify: `apps/web/proxy.ts` (add `pathname === "/api/portfolio/report"` to the machine-route block, and its caller to that block's comment)
- Modify: `apps/web/__tests__/proxy-static.test.ts` or a sibling test (see Step 1)
- Modify: `.env.example` (add `TTAI_REPORT_KEY`), `HELD.md` (one short section: what the endpoint returns, who calls it, key rotation)

**Interfaces:**
- Consumes: `loadMoney` (C1); `loadPulse`, `PulseSignal` from `apps/web/lib/admin/pulse.ts`; `db` and schema from `@held/db`.
- Produces: `authorizedReportRequest` and `buildReport` with the same signatures as Task B2, `app: "held"`, and this input in place of Storyborn's `overview`:

```ts
counts: { usersTotal: number; usersNew24h: number; usersNew7d: number; usersNew30d: number;
          households: number; calendarsConnected: number; promoHouseholds: number;
          feedbackOpen: number; aiCost30dCents: number };
pulse: PulseSignal[];
signups: { id: string; createdAt: Date }[];
feedback: { id: string; type: string; createdAt: Date }[];
stripeEvents: /* same as B2 */;
```

Mapping decisions:
- `active_7d` and `active_30d`: `null`. Held has no honest per-user activity signal today; do not derive one from sessions.
- `users_*` exclude soft-deleted users (`deletedAt is null`), as the beta dashboard does.
- `feedback_open` = `feedback_items.status = 'new'`. `ai_cost_30d_cents` = sum of `ai_runs.cost_cents` over 30 days.
- `extra`: Households, Calendars connected, Promo households (`plan = 'trialing'` with a row in `user_promo_redemptions` for a member).
- `health`: one entry per pulse signal — `key` the signal's id, `label` its name, status mapped from the pulse state (its "ok" → `healthy`, its warning state → `warning`, its failing state → `critical`, anything else → `unknown`), `message` its human line. Read `pulseState.ts` for the exact state names.
- `events`: signups ("New signup", `url` `<origin>/admin/people`), feedback (`kind "feedback"`, summary `"New feedback: <type>"`, never the message, `url` `<origin>/admin/beta/feedback`), and Stripe events mapped as in B2 with `url` `<origin>/admin/accounts`. Origin is `https://myheldapp.com` in production (use the app's existing base-URL helper).

- [ ] **Step 1: Write the failing tests** — the B2 tests adapted to this input, plus:

```ts
test("active users are reported as not measured", () => {
  const r = buildReport(input());
  expect(r.metrics.active_7d).toBeNull();
  expect(r.metrics.active_30d).toBeNull();
});
test("feedback events never include the message text", () => {
  const r = buildReport(input({ feedback: [{ id: "f1", type: "bug", createdAt: new Date() }] }));
  expect(r.events.find((e) => e.id === "feedback:f1")?.summary).toBe("New feedback: bug");
});
test("every pulse signal becomes a health entry with a valid word", () => {
  const r = buildReport(input({ pulse: samplePulse }));
  expect(r.health.length).toBe(samplePulse.length);
  for (const h of r.health) expect(["healthy","warning","critical","unknown"]).toContain(h.status);
});
```

And a proxy test alongside the existing `proxy-static.test.ts`, in its style: the source of `proxy.ts` lets `/api/portfolio/report` through without a session.

- [ ] **Step 2: Run, see FAIL. Implement `authorizedReportRequest`, `buildReport`, the `proxy.ts` exemption. Run, see PASS.**
- [ ] **Step 3: Implement `loadReport` and the route** with the same status codes, headers and error bodies as Task B2 Step 3 (`runtime "nodejs"`, `maxDuration 30`).
- [ ] **Step 4: Verify locally.** `pnpm dev`; `curl -i localhost:3000/api/portfolio/report` → **401 JSON, not a 307 to `/sign-in`**. With the key → 200; validate the body with the admin center's `parseReport` as in B2 Step 4. Expected: `ok: true`.
- [ ] **Step 5: Check the Stripe webhook prerequisite.** Read the `stripe_webhooks` health entry in the real response and the latest row in `stripe_webhook_events`. If it is not healthy, do not fix it here: record what you saw for John (the money numbers do not depend on it, but in-app paid access does).
- [ ] **Step 6: `pnpm typecheck && pnpm lint`.** Expected: clean.
- [ ] **Step 7: Commit** — `feat(portfolio): read-only report endpoint for the TTAI admin center`.

---

# Ship (John's steps, with Claude confirming each)

### Task S1: Keys, deploy, first real pull

- [ ] **Step 1: John generates two keys** (one per product), e.g. `openssl rand -base64 48` twice.
- [ ] **Step 2: John sets them in Vercel:** `TTAI_REPORT_KEY` in the Storyborn project and in the Held project (each its own value); `STORYBORN_REPORT_KEY` and `HELD_REPORT_KEY` in the admin center project (matching values). Production only.
- [ ] **Step 3: Merge and deploy each repo; apply migration `20261118060000_app_reports.sql` to the admin center's production database.** Each of these needs John's go-ahead at the time.
- [ ] **Step 4: In the admin center, open Held → Business → Pull now, then Storyborn.** Expected: tiles fill, health list shows, Integrations page shows both Products cards connected.
- [ ] **Step 5: Cross-check one number per product against its own Stripe dashboard** (active subscriptions and MRR). They must match.
- [ ] **Step 6: Wait for the next hourly cron and confirm `pulled Xm ago` resets.**
- [ ] **Step 7: Update `Y:\CommandCenter\status\ttai-website.md`** per this repo's CLAUDE.md.
