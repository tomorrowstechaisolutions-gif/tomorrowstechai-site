/**
 * Load a batch of daily social posts into Social Center as scheduled posts.
 *
 *   npx tsx --require ./scripts/shims/allow-server-only.cjs --env-file=.env.local scripts/load-social-batch.mts <slug>           (dry run)
 *   npx tsx --require ./scripts/shims/allow-server-only.cjs --env-file=.env.local scripts/load-social-batch.mts <slug> --apply   (writes)
 *
 * The batch is a file in src/content/social/, listed in its index. Deploy the
 * site before --apply: the card images are served by the live site, and the
 * loader checks each one is there before it writes anything.
 *
 * Only ever inserts. A post already in the database is skipped whatever state
 * it is in, so running this twice adds nothing, and a post John edited,
 * canceled or deleted in Social Center is never written to again. The
 * social-publish cron sends each post at its time.
 */
import { createClient } from "@supabase/supabase-js";
import { SOCIAL_BATCHES, getBatch } from "../src/content/social/index";
import { BATCH_ACTOR, BATCH_PLATFORMS, batchPostId, buildPostRow, validateBatch, type BatchPost } from "../src/lib/social/batch";
import { pickAccounts, planLoad, splitExisting, type AccountRow } from "../src/lib/social/batch-load";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const slug = args.find((a) => !a.startsWith("--"));

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const batch = slug ? getBatch(slug) : null;
if (!batch) {
  const known = Object.keys(SOCIAL_BATCHES);
  stop(`${slug ? `No batch called "${slug}".` : "Give the batch slug."} ${known.length ? `Batches: ${known.join(", ")}` : "No batches are listed in src/content/social/index.ts yet."}`);
}

const problems = validateBatch(batch);
if (problems.length) stop(`The batch has ${problems.length} problem(s). Fix them first:\n${problems.map((p) => `  - ${p}`).join("\n")}`);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) stop("Database settings are missing. Run with --env-file=.env.local.");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: accountRows, error: accountErr } = await db
  .from("social_accounts")
  .select("id, platform, display_name, handle, connected, status, posting_enabled, external_id")
  .in("platform", [...BATCH_PLATFORMS]);
if (accountErr) stop(`Cannot read the connected accounts: ${accountErr.message}`);
const picked = pickAccounts((accountRows ?? []) as AccountRow[]);
if (!picked.ok) stop(`Not loading: every channel has to be able to post.\n${picked.problems.map((p) => `  - ${p}`).join("\n")}`);

// Deleted and canceled posts count as loaded too, so no deleted_at filter.
const ids = batch.posts.map((p) => batchPostId(batch.slug, p.id));
const { data: existing, error: existingErr } = await db.from("social_posts").select("id, social_post_platforms(id)").in("id", ids);
if (existingErr) stop(`Cannot read the existing posts: ${existingErr.message}`);
const { loaded, incomplete } = splitExisting(
  (existing ?? []).map((r: { id: string; social_post_platforms: unknown }) => ({ id: r.id, platforms: Array.isArray(r.social_post_platforms) ? r.social_post_platforms.length : 0 }))
);
if (incomplete.length) console.log(`${incomplete.length} post(s) were left half-loaded by an earlier run (no channels attached). ${apply ? "Removing and loading them again." : "--apply will remove and load them again."}`);

const plan = planLoad(batch, loaded, new Date());
const line = (word: string, p: BatchPost) => console.log(`${word.padEnd(6)} ${p.date} ${p.id.padEnd(6)} ${p.text.replace(/\s+/g, " ").slice(0, 60)}`);
for (const p of batch.posts) {
  if (plan.skipped.includes(p)) line("skip", p);
  else if (plan.past.includes(p)) line("past", p);
  else line(apply ? "add" : "would", p);
}
const totals = `${plan.toInsert.length} to add, ${plan.skipped.length} already loaded, ${plan.past.length} left out because their time has passed`;

if (!apply) {
  console.log(`\nDry run for "${batch.name}": ${totals}. Re-run with --apply to write.`);
  process.exit(0);
}

// The publisher hands each platform the image's URL. A card only exists once
// the site is deployed with this batch, and a photo under /public the same.
// Check every one now; otherwise the post would fail on the day.
const missing: string[] = [];
for (const p of plan.toInsert) {
  const url = String(buildPostRow(batch, p).media_url);
  try {
    const res = await fetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) missing.push(`${p.id}: ${url} answered ${res.status}`);
    else if (!type.startsWith("image/")) missing.push(`${p.id}: ${url} is not an image (${type || "no type"})`);
  } catch (cause) {
    missing.push(`${p.id}: ${url} could not be reached (${cause instanceof Error ? cause.message : "unknown error"})`);
  }
}
if (missing.length) stop(`Not loading: ${missing.length} image(s) are not live. Deploy the site with this batch first.\n${missing.map((m) => `  - ${m}`).join("\n")}`);

if (incomplete.length) {
  const { error: cleanErr } = await db.from("social_posts").delete().in("id", incomplete);
  if (cleanErr) stop(`Could not remove the half-loaded post(s): ${cleanErr.message}`);
}

let added = 0;
for (const p of plan.toInsert) {
  const row = { ...buildPostRow(batch, p), account_id: picked.accounts.linkedin };
  const { error } = await db.from("social_posts").insert(row);
  if (error) {
    console.error(`FAILED ${p.id}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  const { error: platErr } = await db.from("social_post_platforms").insert(
    BATCH_PLATFORMS.map((platform) => ({ post_id: row.id, social_account_id: picked.accounts[platform], platform, platform_status: "scheduled" }))
  );
  if (platErr) {
    // A post with no destinations would sit scheduled and never send. Take it back out.
    await db.from("social_posts").delete().eq("id", row.id);
    console.error(`FAILED ${p.id}: ${platErr.message} (the post was removed again)`);
    process.exitCode = 1;
    continue;
  }
  await db.from("social_activity_events").insert({
    event_type: "post_scheduled",
    actor: BATCH_ACTOR,
    detail: `Loaded from batch "${batch.name}" for ${p.date}`.slice(0, 500),
    post_id: row.id,
    platform: BATCH_PLATFORMS.join(","),
  });
  added++;
}
console.log(`\nLoaded ${added} of ${plan.toInsert.length} post(s) for "${batch.name}". ${plan.skipped.length} were already loaded, ${plan.past.length} left out because their time has passed.`);
