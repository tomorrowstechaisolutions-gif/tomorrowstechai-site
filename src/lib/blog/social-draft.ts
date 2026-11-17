import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "./taxonomy";
import type { ArticleRecord } from "./types";
import { publishDueSocialPosts } from "@/lib/social/publisher";

/**
 * "Publish to Social": when a Field Notes article goes live, a DRAFT post is
 * created in Social Center with the title, summary, link and hero image.
 * Nothing is published. John reviews, edits and sends it from Social Center
 * (propose, never act).
 *
 * One draft per article: an existing (non-deleted) post linking to the article
 * means it was already proposed, so going live again (republish, schedule
 * firing) does not pile up duplicates.
 *
 * Auto-post (John's choice, 2026-11-17): Field Notes articles are reviewed
 * before they're scheduled, so with the Social Center automation
 * "blog_autopost" switched on, the post goes out at once on every connected,
 * publishing-enabled account instead of waiting as a draft. Switched off, or
 * with no account able to post, it stays a draft for approval.
 */

export const BLOG_AUTOPOST_KEY = "blog_autopost";

async function autopostEnabled(db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from("social_automation_settings")
    .select("enabled")
    .eq("automation_key", BLOG_AUTOPOST_KEY)
    .is("customer_id", null)
    .maybeSingle();
  return Boolean(data?.enabled);
}

/** Tomorrow's Tech AI's own accounts, matched by display name or handle. */
const DESTINATIONS: { platform: "linkedin" | "facebook" | "instagram"; match: RegExp; needsImage?: boolean }[] = [
  { platform: "linkedin", match: /^john c\.? hockinson/i },
  { platform: "facebook", match: /^tomorrows tech ai solutions$/i },
  { platform: "instagram", match: /^@?tomorrowstechai$/i, needsImage: true },
];

export const SOCIAL_CAMPAIGN = "Field Notes";

export function articleUrl(slug: string) {
  return `${SITE_URL}/blog/${slug}`;
}

function absolute(src: string) {
  return /^https?:\/\//i.test(src) ? src : `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}

const ACRONYMS = new Set(["ai", "mcp", "pmo", "crm", "erp", "gpu", "llm", "ems", "p6", "rei", "saas", "it"]);

function hashtag(tag: string) {
  const words = tag.replace(/^#/, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  return `#${words.map((w) => (/^[A-Z0-9]+$/.test(w) || ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join("")}`;
}

/** The suggested caption. Plain, in John's voice, meant to be edited. */
export function socialCaption(a: Pick<ArticleRecord, "title" | "summary" | "slug" | "tags">) {
  const link = `${articleUrl(a.slug)}?utm_source=social&utm_medium=organic&utm_campaign=field-notes`;
  const tags = (a.tags ?? []).map(hashtag).filter(Boolean).slice(0, 3).join(" ");
  return [a.title.trim(), a.summary.trim(), `Read it on Field Notes: ${link}`, tags].filter(Boolean).join("\n\n");
}

export type SocialDraftResult =
  | { state: "created"; postId: string; platforms: string[] }
  | { state: "posted"; postId: string; platforms: string[]; published: number; failed: number; errors: string[] }
  | { state: "exists"; postId: string }
  | { state: "failed"; message: string };

export async function createArticleSocialDraft(
  db: SupabaseClient,
  a: Pick<ArticleRecord, "title" | "summary" | "slug" | "tags" | "hero">,
  actor: string
): Promise<SocialDraftResult> {
  try {
    const base = articleUrl(a.slug);
    const { data: existing, error: findErr } = await db
      .from("social_posts")
      .select("id, link_url")
      .is("deleted_at", null)
      .like("link_url", `${base}%`)
      .limit(5);
    if (findErr) return { state: "failed", message: findErr.message };
    // `like` also matches a longer slug that starts with this one; compare exactly.
    const same = (existing ?? []).find((p) => (p.link_url ?? "").split(/[?#]/)[0] === base);
    if (same) return { state: "exists", postId: same.id };

    const { data: accounts } = await db
      .from("social_accounts")
      .select("id, platform, display_name, handle, connected, status, posting_enabled")
      .in("platform", DESTINATIONS.map((d) => d.platform));

    const image = a.hero?.src ? absolute(a.hero.src) : null;
    const candidates = DESTINATIONS.filter((d) => !d.needsImage || image).map((d) => {
      const account = (accounts ?? []).find(
        (x) => x.platform === d.platform && (d.match.test(x.display_name ?? "") || d.match.test(x.handle ?? ""))
      );
      const ready = Boolean(account?.connected && account.status === "connected" && account.posting_enabled);
      return { platform: d.platform, accountId: account?.id ?? null, ready };
    });
    // Auto-post only to accounts that can actually publish; otherwise propose a draft.
    const live = candidates.filter((t) => t.ready);
    const autopost = live.length > 0 && (await autopostEnabled(db));
    const targets = autopost ? live : candidates;

    const caption = socialCaption(a);
    const { data: post, error } = await db
      .from("social_posts")
      .insert({
        customer_id: null,
        account_id: targets[0]?.accountId ?? null,
        platform: targets[0]?.platform ?? "linkedin",
        title: `Field Notes: ${a.title}`.slice(0, 180),
        body: caption,
        headline: a.title.slice(0, 300),
        description: a.summary.slice(0, 2000) || null,
        link_url: `${base}?utm_source=social&utm_medium=organic&utm_campaign=field-notes`,
        cta: "Read the article",
        media_url: image,
        media_type: image ? "image" : "none",
        alt_text: a.hero?.alt?.slice(0, 1000) || null,
        status: autopost ? "scheduled" : "draft",
        scheduled_at: autopost ? new Date().toISOString() : null,
        approval_type: "none",
        approval_status: "not_required",
        timezone: "America/Chicago",
        assigned_to: actor,
        campaign: SOCIAL_CAMPAIGN,
        generated_by: "human",
      })
      .select("id")
      .single();
    if (error || !post) return { state: "failed", message: error?.message ?? "The draft could not be saved." };

    const { error: platErr } = await db.from("social_post_platforms").insert(
      targets.map((t) => ({ post_id: post.id, social_account_id: t.accountId, platform: t.platform, platform_status: autopost ? "scheduled" : "draft" }))
    );
    if (platErr) return { state: "failed", message: platErr.message };

    await db.from("social_activity_events").insert({
      event_type: autopost ? "post_scheduled" : "post_created",
      actor,
      detail: (autopost ? `Auto-posted from Field Notes article "${a.title}"` : `Draft from Field Notes article "${a.title}"`).slice(0, 500),
      post_id: post.id,
      platform: targets.map((t) => t.platform).join(","),
    });
    const platforms = targets.map((t) => t.platform);
    if (!autopost) return { state: "created", postId: post.id, platforms };

    // Publish now rather than waiting for the next social-publish run (which
    // still picks it up if this attempt can't run).
    try {
      const r = await publishDueSocialPosts(10, { postId: post.id });
      return { state: "posted", postId: post.id, platforms, published: r.published, failed: r.failed, errors: r.errors };
    } catch (cause) {
      return { state: "posted", postId: post.id, platforms, published: 0, failed: 0, errors: [cause instanceof Error ? cause.message : "Publish deferred to the next run"] };
    }
  } catch (cause) {
    return { state: "failed", message: cause instanceof Error ? cause.message : "Unknown error" };
  }
}

export function socialPostHref(postId: string) {
  return `/admin/marketing/social?tab=queue&post=${postId}`;
}
