import { createHash } from "node:crypto";
import { SITE_URL } from "@/lib/blog/taxonomy";

/**
 * Daily social posts, written a month or more at a time.
 *
 * John and Claude write a batch together and John reviews it once. The batch
 * is a file in src/content/social/. scripts/load-social-batch.mts turns it
 * into scheduled posts, and the social-publish cron sends one a day. Nothing
 * here writes a post: this file only checks a batch and shapes its rows.
 *
 * No "server-only" marker: the loader script and the card route both use it.
 */

export type BatchPost = {
  /** Stable within the batch, e.g. "d01". Never reuse or rename one that has been loaded. */
  id: string;
  /** The day it goes out, YYYY-MM-DD, in Central time. */
  date: string;
  /** The post itself. One text for all three channels. */
  text: string;
  /** Optional link. It goes at the end of the text on every channel (see buildPostRow). */
  link?: string;
  /** The line on the card image, and the image's alt text. */
  cardLine: string;
  /** A real photo to use instead of a card: https URL or a path under /public. */
  image?: string;
  /** Required with `image`. */
  imageAlt?: string;
  /** HH:MM Central, to override the batch's time for this post. */
  time?: string;
};

export type SocialBatch = {
  /** Short key used in ids and card URLs, e.g. "2026-12". */
  slug: string;
  /** Shown in Social Center as the campaign, e.g. "December 2026". */
  name: string;
  /** HH:MM Central for every post. Defaults to DEFAULT_TIME. */
  time?: string;
  posts: BatchPost[];
};

export const BATCH_PLATFORMS = ["linkedin", "facebook", "instagram"] as const;
export type BatchPlatform = (typeof BATCH_PLATFORMS)[number];

/** Every batch post's campaign starts with this, which is how the runway check finds them. */
export const DAILY_CAMPAIGN_PREFIX = "Daily: ";
export const DEFAULT_TIME = "11:30";
export const BATCH_TIMEZONE = "America/Chicago";
export const BATCH_ACTOR = "batch-loader";

/** Instagram's caption limit, the tightest of the three. The publisher adds the link after a blank line. */
const CAPTION_LIMIT = 2200;
const CARD_LINE_LIMIT = 110;

const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMOJI = /\p{Extended_Pictographic}/u;

function realDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** The brand rules a machine can check: no emoji, no exclamation marks. */
function voiceProblem(value: string): string | null {
  if (EMOJI.test(value)) return "has an emoji";
  if (value.includes("!")) return "has an exclamation mark";
  return null;
}

/** Everything wrong with a batch, in plain words. Empty when it can be loaded. */
export function validateBatch(batch: SocialBatch): string[] {
  const errors: string[] = [];
  if (!KEY.test(batch.slug)) errors.push(`Batch slug "${batch.slug}" must be lowercase letters, numbers and dashes.`);
  if (!batch.name?.trim()) errors.push("The batch needs a name.");
  if (batch.time !== undefined && !TIME.test(batch.time)) errors.push(`Batch time "${batch.time}" must be HH:MM.`);
  if (!batch.posts?.length) errors.push("The batch has no posts.");

  const ids = new Set<string>();
  const dates = new Set<string>();
  for (const p of batch.posts ?? []) {
    const at = `Post ${p.id} (${p.date})`;
    if (!KEY.test(p.id)) errors.push(`Post id "${p.id}" must be lowercase letters, numbers and dashes.`);
    else if (ids.has(p.id)) errors.push(`Post id ${p.id} is used more than once.`);
    ids.add(p.id);

    if (!realDate(p.date)) errors.push(`${at}: "${p.date}" is not a real date (YYYY-MM-DD).`);
    else if (dates.has(p.date)) errors.push(`Two posts are set for ${p.date}.`);
    dates.add(p.date);

    if (p.time !== undefined && !TIME.test(p.time)) errors.push(`${at}: time "${p.time}" must be HH:MM.`);

    const text = p.text ?? "";
    if (!text.trim()) errors.push(`${at}: the text is empty.`);
    else {
      const voice = voiceProblem(text);
      if (voice) errors.push(`${at}: the text ${voice}.`);
      const length = text.length + (p.link ? p.link.length + 2 : 0);
      if (length > CAPTION_LIMIT) errors.push(`${at}: the text${p.link ? " plus its link" : ""} is ${length} characters; the limit is ${CAPTION_LIMIT}.`);
    }

    const line = p.cardLine ?? "";
    if (!line.trim()) errors.push(`${at}: the card line is empty.`);
    else {
      const voice = voiceProblem(line);
      if (voice) errors.push(`${at}: the card line ${voice}.`);
      if (line.length > CARD_LINE_LIMIT) errors.push(`${at}: the card line is ${line.length} characters; the limit is ${CARD_LINE_LIMIT}.`);
    }

    if (p.link !== undefined && !/^https:\/\/\S+$/.test(p.link)) errors.push(`${at}: the link must start with https://.`);

    if (p.image !== undefined) {
      if (!/^https:\/\/\S+$/.test(p.image) && !/^\/[^/\s]\S*$/.test(p.image)) errors.push(`${at}: the image must be an https URL or a path starting with /.`);
      else if (!p.imageAlt?.trim()) errors.push(`${at}: a real image needs alt text (imageAlt).`);
    }
  }
  return errors;
}

/** Fixed namespace for batch post ids. Changing it would make every loaded post look new. */
const NAMESPACE = "6f1d2b3c-8a47-4e59-9c10-5d2e7a4b9f31";

/**
 * A version 5 UUID from the batch and post. The same post always gets the
 * same id, which is how loading a batch twice adds nothing the second time.
 */
export function batchPostId(slug: string, postId: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(`social-batch:${slug}/${postId}`).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Minutes Central time is behind UTC at this instant (360 in winter, 300 in summer). */
function centralOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BATCH_TIMEZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((at.getTime() - asIfUtc) / 60_000);
}

/** The instant a Central wall-clock time happens, as an ISO string. Handles daylight saving. */
export function scheduledAtUtc(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Guess with the offset at the wall time read as UTC, then correct once with
  // the offset at the guess. Two passes settle it on either side of a change.
  let at = wall + centralOffsetMinutes(new Date(wall)) * 60_000;
  at = wall + centralOffsetMinutes(new Date(at)) * 60_000;
  return new Date(at).toISOString();
}

/** Where a post's card image is served from. See src/app/social-card. */
export function cardUrl(slug: string, postId: string): string {
  return `${SITE_URL}/social-card/${slug}/${postId}.jpg`;
}

function absolute(src: string): string {
  return /^https:\/\//i.test(src) ? src : `${SITE_URL}${src}`;
}

/** When this post goes out, as an ISO instant. */
export function postScheduledAt(batch: SocialBatch, post: BatchPost): string {
  return scheduledAtUtc(post.date, post.time ?? batch.time ?? DEFAULT_TIME);
}

/**
 * The social_posts row for one batch post. `account_id` is left for the
 * loader, which knows the connected accounts.
 */
export function buildPostRow(batch: SocialBatch, post: BatchPost): Record<string, unknown> {
  return {
    id: batchPostId(batch.slug, post.id),
    customer_id: null,
    platform: BATCH_PLATFORMS[0],
    title: `Daily ${post.date}: ${post.cardLine}`.slice(0, 180),
    // Every batch post carries an image, and with an image attached LinkedIn
    // and Facebook ignore a separate link. So the link rides in the text,
    // where all three channels show it, and link_url stays empty so
    // Instagram does not add it a second time.
    body: post.link ? `${post.text}\n\n${post.link}` : post.text,
    headline: post.cardLine.slice(0, 300),
    link_url: null,
    media_url: post.image ? absolute(post.image) : cardUrl(batch.slug, post.id),
    media_type: "image",
    alt_text: (post.image ? post.imageAlt ?? "" : post.cardLine).slice(0, 1000),
    status: "scheduled",
    scheduled_at: postScheduledAt(batch, post),
    approval_type: "none",
    approval_status: "not_required",
    timezone: BATCH_TIMEZONE,
    assigned_to: BATCH_ACTOR,
    campaign: `${DAILY_CAMPAIGN_PREFIX}${batch.name}`,
    generated_by: "human",
  };
}
