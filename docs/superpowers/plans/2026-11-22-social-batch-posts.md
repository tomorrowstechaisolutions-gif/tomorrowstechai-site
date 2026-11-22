# Social Batch Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load a reviewed batch of social posts into Social Center as one scheduled post per day, give each a card image, and warn John before the queue runs out.

**Architecture:** A batch is a TypeScript module in `src/content/social/`, registered in an index. Pure functions in `src/lib/social/batch.ts` validate a batch and turn it into `social_posts` / `social_post_platforms` rows; a thin script inserts them. A public route renders each post's card as a JPEG from the registered batch, so the publisher can use a plain `media_url`. A daily cron counts the days of scheduled batch posts left and notifies John at fixed thresholds. The existing `social-publish` cron does the posting; nothing in the publisher changes.

**Tech Stack:** Next.js 16 (App Router, `next/og`), `sharp` (already in node_modules via Next), Supabase (`supabaseAdmin`), Vitest, `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-22-social-batch-posts-design.md`

## Global Constraints

- Channels: `linkedin`, `facebook`, `instagram` only. Never `x`.
- Destination accounts are the ones `src/lib/blog/social-draft.ts` already matches (`DESTINATIONS`). Export and reuse that list; do not copy the patterns.
- No database migration. Idempotency comes from a deterministic post id.
- Default posting time `11:30`, timezone `America/Chicago`.
- Posts are inserted with `status: "scheduled"`, `approval_type: "none"`, `approval_status: "not_required"`, `generated_by: "human"`, `assigned_to: "batch-loader"`, `campaign: "Daily: <batch name>"`.
- Card image: 1080 x 1350 JPEG, background `#020813`, accent `#26a8ff`, no emoji, no neon or robot imagery.
- Brand rules checked mechanically on every post text and card line: no emoji, no `!`.
- Alert thresholds: exactly 14, 7 and 1 days left.
- Do not commit. John has not asked for commits; leave changes in the working tree on a branch named `feat/social-batches`.

## Review Focus

1. A batch date falls on a daylight-saving change (2027-03-14, 2027-11-07): 11:30 Central must still convert to the right UTC instant. Test in Task 1.
2. The loader is run twice, or run again after John edited or canceled a loaded post in Social Center: nothing is duplicated and his edit is not overwritten. Test in Task 1 (id stability) and Task 3 (skip existing, any status).
3. One of the three accounts is disconnected at load time: the loader stops before writing anything and names the account, rather than loading posts that will fail daily. Test in Task 3.
4. A post's card URL is not live yet because the batch file has not been deployed: the loader refuses to apply. Test in Task 3.
5. A blog article autoposts on the same day as a batch post, or John schedules his own post: the runway count must only count batch posts (`campaign` starting `Daily: `). Test in Task 4.

---

### Task 1: Batch format, validation and row building

**Files:**
- Create: `src/lib/social/batch.ts`
- Create: `src/content/social/index.ts`
- Test: `src/lib/social/__tests__/batch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BatchPost = { id: string; date: string; text: string; link?: string; cardLine: string; image?: string; imageAlt?: string; time?: string };
  export type SocialBatch = { slug: string; name: string; time?: string; posts: BatchPost[] };
  export const BATCH_PLATFORMS = ["linkedin", "facebook", "instagram"] as const;
  export const DAILY_CAMPAIGN_PREFIX = "Daily: ";
  export function validateBatch(batch: SocialBatch): string[];            // error messages, empty when valid
  export function batchPostId(slug: string, postId: string): string;      // deterministic UUID
  export function scheduledAtUtc(date: string, time: string): string;     // ISO instant for that wall time in America/Chicago
  export function cardUrl(slug: string, postId: string): string;          // `${SITE_URL}/social-card/${slug}/${postId}.jpg`
  export function buildPostRow(batch: SocialBatch, post: BatchPost): Record<string, unknown>;
  ```
- `src/content/social/index.ts` produces `export const SOCIAL_BATCHES: Record<string, SocialBatch> = {};` and `export function getBatch(slug: string): SocialBatch | null`. It starts empty; batches are added when content is written.

- [ ] **Step 1: Write the failing tests** in `batch.test.ts`:

```ts
const post = (over: Partial<BatchPost> = {}): BatchPost => ({ id: "d01", date: "2026-12-01", text: "A crew showed up and the permit was not pulled.", cardLine: "The permit was not pulled.", ...over });
const batch = (posts: BatchPost[]): SocialBatch => ({ slug: "2026-12", name: "December 2026", posts });

it("accepts a valid batch", () => expect(validateBatch(batch([post()]))).toEqual([]));
it("rejects duplicate ids and duplicate dates", () => {
  const errs = validateBatch(batch([post(), post()]));
  expect(errs.some((e) => e.includes("d01"))).toBe(true);
  expect(errs.some((e) => e.includes("2026-12-01"))).toBe(true);
});
it("rejects bad slug, id, date and time", () => {
  expect(validateBatch({ ...batch([post()]), slug: "Dec 2026" }).length).toBeGreaterThan(0);
  expect(validateBatch(batch([post({ id: "Day 1" })])).length).toBeGreaterThan(0);
  expect(validateBatch(batch([post({ date: "2026-02-30" })])).length).toBeGreaterThan(0);
  expect(validateBatch(batch([post({ time: "25:00" })])).length).toBeGreaterThan(0);
});
it("rejects emoji and exclamation marks in text and card line", () => {
  expect(validateBatch(batch([post({ text: "Great news!" })])).length).toBe(1);
  expect(validateBatch(batch([post({ cardLine: "Ship it \u{1F680}" })])).length).toBe(1);
});
it("enforces length limits", () => {
  expect(validateBatch(batch([post({ text: "a".repeat(2201) })])).length).toBe(1);   // text + blank line + link must fit 2200
  expect(validateBatch(batch([post({ text: "a".repeat(2190), link: "https://www.tomorrowstechai.com/blog/x" })])).length).toBe(1);
  expect(validateBatch(batch([post({ cardLine: "a".repeat(111) })])).length).toBe(1);
});
it("requires alt text with a real image and an https or site-relative image path", () => {
  expect(validateBatch(batch([post({ image: "/social/site.jpg" })])).length).toBe(1);
  expect(validateBatch(batch([post({ image: "ftp://x/y.jpg", imageAlt: "x" })])).length).toBe(1);
});
it("gives a stable UUID per batch and post", () => {
  expect(batchPostId("2026-12", "d01")).toBe(batchPostId("2026-12", "d01"));
  expect(batchPostId("2026-12", "d01")).not.toBe(batchPostId("2026-12", "d02"));
  expect(batchPostId("2026-12", "d01")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
it("converts Central wall time to UTC across daylight saving", () => {
  expect(scheduledAtUtc("2026-12-01", "11:30")).toBe("2026-12-01T17:30:00.000Z"); // CST
  expect(scheduledAtUtc("2027-03-13", "11:30")).toBe("2027-03-13T17:30:00.000Z"); // day before spring forward
  expect(scheduledAtUtc("2027-03-14", "11:30")).toBe("2027-03-14T16:30:00.000Z"); // CDT
  expect(scheduledAtUtc("2027-11-07", "11:30")).toBe("2027-11-07T17:30:00.000Z"); // back to CST
});
it("builds a scheduled row with the card as media", () => {
  const row = buildPostRow(batch([post()]), post());
  expect(row).toMatchObject({
    id: batchPostId("2026-12", "d01"), status: "scheduled", scheduled_at: "2026-12-01T17:30:00.000Z",
    campaign: "Daily: December 2026", body: post().text, platform: "linkedin", media_type: "image",
    media_url: "https://www.tomorrowstechai.com/social-card/2026-12/d01.jpg",
    approval_type: "none", approval_status: "not_required", generated_by: "human", assigned_to: "batch-loader",
    timezone: "America/Chicago", customer_id: null, alt_text: "The permit was not pulled.",
  });
});
it("uses the real image and the batch time when given", () => {
  const p = post({ image: "/social/site.jpg", imageAlt: "Crew at a pole line", link: "https://www.tomorrowstechai.com/work" });
  const row = buildPostRow({ ...batch([p]), time: "09:00" }, p);
  expect(row.media_url).toBe("https://www.tomorrowstechai.com/social/site.jpg");
  expect(row.alt_text).toBe("Crew at a pole line");
  expect(row.link_url).toBe("https://www.tomorrowstechai.com/work");
  expect(row.scheduled_at).toBe("2026-12-01T15:00:00.000Z");
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/social/__tests__/batch.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/social/batch.ts` and the empty index.**
  - No `server-only` import: the script and the card route both use it.
  - `slug` and post `id` match `/^[a-z0-9][a-z0-9-]{0,39}$/`. `date` is a real `YYYY-MM-DD`. `time` is `HH:MM` 24-hour.
  - Emoji test: `/\p{Extended_Pictographic}/u`.
  - Length rule: `text.length + (link ? link.length + 2 : 0) <= 2200` (Instagram's caption limit; the publisher appends the link). `cardLine.length <= 110`. `text` and `cardLine` are required and non-blank.
  - `batchPostId`: UUID v5 built with `node:crypto` SHA-1 over a fixed namespace UUID constant plus `"social-batch:" + slug + "/" + postId`.
  - `scheduledAtUtc`: compute the offset for that date with `Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", ... })`; no date library.
  - `buildPostRow`: `title` is `` `Daily ${post.date}: ${post.cardLine}`.slice(0, 180) ``, `headline` is `cardLine`, `link_url` is `post.link ?? null`, `account_id` is left out (the loader sets it), time is `post.time ?? batch.time ?? "11:30"`. A site-relative `image` is made absolute with `SITE_URL` from `@/lib/blog/taxonomy`.

- [ ] **Step 4: Run the test again.** Expected: PASS.

---

### Task 2: Card image route

**Files:**
- Create: `src/lib/social/card.tsx`
- Create: `src/app/social-card/[batch]/[file]/route.ts`
- Test: `src/lib/social/__tests__/card.test.ts`

**Interfaces:**
- Consumes: `getBatch` (Task 1), `BatchPost`.
- Produces: `export async function renderCardJpeg(line: string): Promise<Buffer>` in `card.tsx`; `GET /social-card/<slug>/<postId>.jpg`.

- [ ] **Step 1: Write the failing test:**

```ts
it("renders a 1080x1350 JPEG", async () => {
  const buf = await renderCardJpeg("The permit was not pulled.");
  const meta = await sharp(buf).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1350);
  expect(buf.length).toBeLessThan(8 * 1024 * 1024);
});
it("renders the longest allowed line without throwing", async () => {
  await expect(renderCardJpeg("a ".repeat(55).trim())).resolves.toBeInstanceOf(Buffer);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/social/__tests__/card.test.ts`. Expected: FAIL, module not found. If `next/og` cannot run under Vitest's environment, add `// @vitest-environment node` at the top of the test file.

- [ ] **Step 3: Implement `renderCardJpeg`.** Render with `ImageResponse` from `next/og` at 1080 x 1350, then convert the PNG bytes to JPEG with `sharp(...).jpeg({ quality: 88 })`. Layout: background `#020813`; a thin `#26a8ff` rule at the top left; the line in white, weight 800, left-aligned, vertically centered, with 96px side padding; font size 84 for lines up to 50 characters, 68 up to 80, 56 above that; at the bottom left the wordmark text `TOMORROW'S TECH AI` with `AI` in `#26a8ff`, matching the lockup text in `src/lib/ad-studio/render.tsx`. Font family `Arial, sans-serif` as that file uses. No background image.

- [ ] **Step 4: Implement the route.** `export const runtime = "nodejs"`. Parse `file` as `<postId>.jpg`; 404 unless the batch exists, the post exists in it and the post has no `image` of its own. Respond `image/jpeg` with `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 5: Run the test.** Expected: PASS.

---

### Task 3: The loader

**Files:**
- Create: `src/lib/social/batch-load.ts`
- Create: `scripts/load-social-batch.mts`
- Modify: `src/lib/blog/social-draft.ts` (export `DESTINATIONS`; no behavior change)
- Test: `src/lib/social/__tests__/batch-load.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces; `DESTINATIONS` from `social-draft.ts`.
- Produces:
  ```ts
  export type LoadPlan = { toInsert: BatchPost[]; skipped: BatchPost[]; past: BatchPost[] };
  export type AccountPick = { ok: true; accounts: Record<"linkedin" | "facebook" | "instagram", string> } | { ok: false; problems: string[] };
  export function pickAccounts(rows: { id: string; platform: string; display_name: string | null; handle: string | null; connected: boolean; status: string; posting_enabled: boolean }[]): AccountPick;
  export function planLoad(batch: SocialBatch, existingIds: Set<string>, now: Date): LoadPlan;
  ```
- Script usage, same shape as `scripts/import-field-notes.mts`:
  `npx tsx --require ./scripts/shims/allow-server-only.cjs --env-file=.env.local scripts/load-social-batch.mts <slug>` (dry run), add `--apply` to write.

- [ ] **Step 1: Write the failing tests:**

```ts
it("picks the three brand accounts", () => {
  const r = pickAccounts([
    acct("a1", "linkedin", "John C. Hockinson"), acct("a2", "facebook", "Tomorrows Tech AI Solutions"),
    acct("a3", "instagram", "@tomorrowstechai"), acct("a4", "facebook", "Held App"), acct("a5", "x", "John Hockinson | Tomorrow's Tech AI"),
  ]);
  expect(r).toEqual({ ok: true, accounts: { linkedin: "a1", facebook: "a2", instagram: "a3" } });
});
it("names an account that is missing or cannot post", () => {
  const r = pickAccounts([acct("a1", "linkedin", "John C. Hockinson"), acct("a2", "facebook", "Tomorrows Tech AI Solutions", { posting_enabled: false })]);
  expect(r.ok).toBe(false);
  if (!r.ok) { expect(r.problems.join(" ")).toMatch(/facebook/i); expect(r.problems.join(" ")).toMatch(/instagram/i); }
});
it("skips posts already loaded and posts whose time has passed", () => {
  const b = batch([post({ id: "d01", date: "2026-12-01" }), post({ id: "d02", date: "2026-12-02" }), post({ id: "d03", date: "2026-12-03" })]);
  const plan = planLoad(b, new Set([batchPostId("2026-12", "d02")]), new Date("2026-12-01T18:00:00Z"));
  expect(plan.past.map((p) => p.id)).toEqual(["d01"]);
  expect(plan.skipped.map((p) => p.id)).toEqual(["d02"]);
  expect(plan.toInsert.map((p) => p.id)).toEqual(["d03"]);
});
```

`acct(id, platform, name, over?)` builds a connected, posting-enabled row with `display_name` and `handle` both set to `name`.

- [ ] **Step 2: Run** `npx vitest run src/lib/social/__tests__/batch-load.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `batch-load.ts`.** `pickAccounts` filters `DESTINATIONS` to `BATCH_PLATFORMS` and requires `connected && status === "connected" && posting_enabled` for each. `planLoad` treats a post as past when `scheduledAtUtc(...) <= now`.

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Write `scripts/load-social-batch.mts`.** In order, stopping with a non-zero exit and a plain message at the first failure:
  1. Look up the slug with `getBatch`; list available slugs if it is unknown.
  2. `validateBatch`; print every error.
  3. Read `social_accounts` for the three platforms and run `pickAccounts`.
  4. Read existing `social_posts` ids for this batch's ids, including soft-deleted and canceled rows (any existing row means "already loaded"; never update one).
  5. `planLoad`, then print one line per post: `would|skip|past  <date> <id> <first 60 chars>`.
  6. With `--apply` only: for every post to insert that uses a card, `fetch` its `cardUrl` and require HTTP 200 with an `image/jpeg` content type. If any fails, write nothing and say the batch file must be deployed first.
  7. Insert each post row (`buildPostRow` plus `account_id` set to the LinkedIn account), then its three `social_post_platforms` rows (`platform_status: "scheduled"`), then one `social_activity_events` row (`event_type: "post_scheduled"`, `actor: "batch-loader"`). If the platform insert fails, delete the post row just inserted and report it.
  8. Print totals: added, skipped, past.

- [ ] **Step 6: Dry-run check.** Add a temporary batch `zz-test` with two future-dated posts to the index, run the script without `--apply`, confirm it prints two `would` lines and writes nothing (`select count(*)` on `social_posts` where `campaign = 'Daily: zz-test'` is 0). Remove the temporary batch.

---

### Task 4: Runway alert

**Files:**
- Create: `src/lib/social/runway.ts`
- Create: `src/app/api/cron/social-runway/route.ts`
- Modify: `vercel.json` (add the cron), `src/lib/cron/names.ts` (add `"social-runway"`), `src/lib/notifications/names.ts` (add the key and a group)
- Test: `src/lib/social/__tests__/runway.test.ts`

**Interfaces:**
- Consumes: `DAILY_CAMPAIGN_PREFIX` (Task 1), `notifyOwner` from `@/lib/notifications/owner`, `withCronRun` from `@/lib/cron/run`.
- Produces:
  ```ts
  export const RUNWAY_THRESHOLDS = [14, 7, 1] as const;
  export function daysOfRunway(scheduledAt: string[], now: Date): number;   // whole Central calendar days from today to the last scheduled post; 0 when none are ahead
  export function runwayAlert(days: number): { threshold: number; summary: string } | null;
  export async function checkSocialRunway(now?: Date): Promise<{ daysLeft: number; lastDate: string | null; alerted: boolean }>;
  ```

- [ ] **Step 1: Write the failing tests:**

```ts
const now = new Date("2026-12-10T15:00:00Z"); // Dec 10, 9:00 AM Central
it("counts Central calendar days to the last scheduled post", () => {
  expect(daysOfRunway(["2026-12-11T17:30:00Z", "2026-12-24T17:30:00Z"], now)).toBe(14);
  expect(daysOfRunway(["2026-12-10T17:30:00Z"], now)).toBe(0);
  expect(daysOfRunway([], now)).toBe(0);
  expect(daysOfRunway(["2026-12-09T17:30:00Z"], now)).toBe(0); // already past
});
it("uses the Central date, not the UTC date", () => {
  // 03:00 UTC on Dec 11 is still Dec 10 in Central
  expect(daysOfRunway(["2026-12-11T17:30:00Z"], new Date("2026-12-11T03:00:00Z"))).toBe(1);
});
it("alerts only at 14, 7 and 1", () => {
  expect(runwayAlert(14)?.threshold).toBe(14);
  expect(runwayAlert(7)?.threshold).toBe(7);
  expect(runwayAlert(1)?.threshold).toBe(1);
  for (const d of [0, 2, 6, 8, 13, 15, 30]) expect(runwayAlert(d)).toBeNull();
});
it("says what is left in plain words", () => {
  expect(runwayAlert(14)?.summary).toBe("Daily social posts run out in 14 days. Time to build the next batch.");
  expect(runwayAlert(1)?.summary).toBe("The last daily social post goes out tomorrow. Nothing is scheduled after it.");
});
```

The 7-day summary follows the 14-day wording with `7`.

- [ ] **Step 2: Run** `npx vitest run src/lib/social/__tests__/runway.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `runway.ts`.** `checkSocialRunway` selects `scheduled_at` from `social_posts` where `status = 'scheduled'`, `deleted_at is null` and `campaign like 'Daily: %'`; that filter is what keeps blog autoposts and John's own posts out of the count. When `runwayAlert` returns something, call `notifyOwner("social.runway", summary, send, "/admin/marketing/social?tab=calendar")`. For `send`, send a short plain email to the owner the same way `src/app/api/contact/route.ts` does (Resend, same from and to addresses), subject equal to the summary.

- [ ] **Step 4: Register the notification.** In `names.ts` add `"social.runway"` to `NotificationKey`, add `"Marketing"` to the `group` union, and add the entry `{ key: "social.runway", group: "Marketing", label: "Daily social posts running low", when: "The scheduled daily posts have 14 days, 7 days or 1 day left." }`. Search for other uses of the group union (`grep -rn '"Clients"' src`) and add `"Marketing"` wherever groups are listed or ordered.

- [ ] **Step 5: Add the cron.** Route follows `src/app/api/cron/blog-publish/route.ts` exactly, with name `"social-runway"`. In `vercel.json` add `{ "path": "/api/cron/social-runway", "schedule": "10 14 * * *" }` (8:10 AM Central in winter). Add `"social-runway"` to `CRON_NAMES`.

- [ ] **Step 6: Run** `npx vitest run src/lib/social src/lib/cron src/lib/push`. Expected: PASS, including the existing cron and push tests.

---

### Task 5: Whole-change verification

- [ ] **Step 1:** `npx vitest run`. Expected: all pass.
- [ ] **Step 2:** `npx tsc --noEmit` and `npx eslint src scripts/load-social-batch.mts`. Expected: no errors.
- [ ] **Step 3:** `npm run build`. Expected: build succeeds and lists `/social-card/[batch]/[file]` and `/api/cron/social-runway`.
- [ ] **Step 4:** With a temporary `zz-test` batch in the index, start the dev server and open `/social-card/zz-test/d01.jpg`. Expected: a legible dark card with the line and the wordmark. Open `/social-card/zz-test/nope.jpg` and `/social-card/nope/d01.jpg`. Expected: 404. Remove the temporary batch.
- [ ] **Step 5:** Update `Y:\CommandCenter\status\ttai-website.md` per the repo's `CLAUDE.md`.

## Not in this plan

- Writing the first 30-day batch. That is a working session with John after this ships.
- Deploying. The batch file and this code must be merged and deployed before a real `--apply`.
- X, other brands' accounts, AI-written posts, per-channel text.
