import { BATCH_PLATFORMS, batchPostId, postScheduledAt, type BatchPlatform, type BatchPost, type SocialBatch } from "./batch";
import { DESTINATIONS } from "./destinations";

/**
 * The decisions the batch loader makes, kept apart from the database calls so
 * they can be tested: which accounts a batch posts to, and which of its posts
 * still need loading. scripts/load-social-batch.mts does the reading and writing.
 */

export type AccountRow = {
  id: string;
  platform: string;
  display_name: string | null;
  handle: string | null;
  connected: boolean;
  status: string;
  posting_enabled: boolean;
  /** The platform's own id for the account. Without it nothing can be posted. */
  external_id: string | null;
};

const canPost = (r: AccountRow) => Boolean(r.connected && r.status === "connected" && r.posting_enabled && r.external_id);

export type AccountPick =
  | { ok: true; accounts: Record<BatchPlatform, string> }
  | { ok: false; problems: string[] };

/**
 * The brand's LinkedIn, Facebook and Instagram accounts. All three must be
 * connected and able to post, or the batch is not loaded at all: a month of
 * posts quietly failing on one channel is worse than stopping to reconnect it.
 */
export function pickAccounts(rows: AccountRow[]): AccountPick {
  const accounts: Partial<Record<BatchPlatform, string>> = {};
  const problems: string[] = [];
  for (const platform of BATCH_PLATFORMS) {
    const dest = DESTINATIONS.find((d) => d.platform === platform);
    const matches = dest ? rows.filter((r) => r.platform === platform && (dest.match.test(r.display_name ?? "") || dest.match.test(r.handle ?? ""))) : [];
    // An old, expired connection can sit beside the live one under the same name.
    const found = matches.find(canPost) ?? matches[0];
    if (!found) problems.push(`No ${platform} account for Tomorrow's Tech AI is connected in Social Center.`);
    else if (!canPost(found)) {
      problems.push(`The ${platform} account "${found.display_name ?? found.handle ?? found.id}" cannot post right now. Reconnect it or switch posting on in Social Center.`);
    } else accounts[platform] = found.id;
  }
  return problems.length ? { ok: false, problems } : { ok: true, accounts: accounts as Record<BatchPlatform, string> };
}

export type LoadPlan = {
  /** Not in the database yet and still to come. */
  toInsert: BatchPost[];
  /** Already in the database, in any state. Never touched again. */
  skipped: BatchPost[];
  /** Not loaded, and its time has already gone by. Left out. */
  past: BatchPost[];
};

/**
 * `existingIds` holds the id of every post from this batch already in the
 * database, including ones John edited, canceled or deleted in Social Center.
 * Those are his now, so the loader never writes to them again.
 */
export function planLoad(batch: SocialBatch, existingIds: Set<string>, now: Date): LoadPlan {
  const plan: LoadPlan = { toInsert: [], skipped: [], past: [] };
  for (const post of batch.posts) {
    if (existingIds.has(batchPostId(batch.slug, post.id))) plan.skipped.push(post);
    else if (new Date(postScheduledAt(batch, post)).getTime() <= now.getTime()) plan.past.push(post);
    else plan.toInsert.push(post);
  }
  return plan;
}

/**
 * Sorts the batch's posts already in the database. A post with no
 * destinations was cut off halfway through loading (the loader writes the
 * post, then its destinations): it would sit scheduled and never send, so the
 * loader removes it and loads it again.
 */
export function splitExisting(rows: { id: string; platforms: number }[]): { loaded: Set<string>; incomplete: string[] } {
  return {
    loaded: new Set(rows.filter((r) => r.platforms > 0).map((r) => r.id)),
    incomplete: rows.filter((r) => r.platforms === 0).map((r) => r.id),
  };
}
