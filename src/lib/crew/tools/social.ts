import "server-only";
import { getArticle, getListedArticles } from "@/lib/blog/repository";
import { createArticleSocialDraft } from "@/lib/blog/social-draft";
import { publishDueSocialPosts } from "@/lib/social/publisher";
import { act, GOAL_FIELDS, read, refuse, str, type CrewTool } from "./core";

/**
 * The social desk's tools. Posting goes through the publisher the site
 * already has, so connected accounts, image rules and the "skip an account
 * that keeps failing" rule all apply to the crew without a second copy.
 */

/** The channels an article post can go to. Only the ones the playbook names are used, and each is checked against its daily cap. */
const CHANNELS = ["linkedin", "facebook", "instagram", "x"];

export const listRecentArticles: CrewTool = {
  name: "list_recent_articles",
  description: "List the ten most recent published Field Notes articles and whether each already has a social post.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  station: "library",
  async run(ctx) {
    const articles = (await getListedArticles()).slice(0, 10);
    const { data: posts } = await ctx.sb.from("social_posts").select("link_url, status");
    const posted = new Set((posts ?? []).map((p) => String(p.link_url ?? "")));
    const text = articles.length
      ? articles.map((a) => `${a.slug} | ${a.publishedAt} | ${a.title} | ${[...posted].some((u) => u.includes(`/blog/${a.slug}`)) ? "already posted" : "NOT posted yet"}`).join("\n")
      : "There are no published articles.";
    return read(ctx, this.name, this.station, `checked recent articles (${articles.length})`, text);
  },
};

export const publishArticlePost: CrewTool = {
  name: "publish_article_post",
  description: "Publish a social post for one published article to the connected channels. The caption is written from the article by the existing publisher. Use it only for an article that is not posted yet.",
  input_schema: {
    type: "object",
    properties: { slug: { type: "string", description: "The article's slug, from list_recent_articles." }, ...GOAL_FIELDS },
    required: ["slug", "goal_id", "expectation"],
    additionalProperties: false,
  },
  kind: "act",
  station: "social",
  async run(ctx, input) {
    const slug = str(input, "slug", 200);
    const article = await getArticle(slug);
    if (!article) return { ok: false, text: "No published article has that slug." };

    // John chose the channels when he set the playbook. Post there and nowhere else.
    const chosen = [...new Set((ctx.business.playbook?.channels ?? []).map((c) => c.trim().toLowerCase()).map((c) => (c === "twitter" ? "x" : c)))].filter((c) => CHANNELS.includes(c));
    if (!chosen.length) {
      const reason = "The playbook names no social channel, so nothing is posted. John can add one by telling Tess.";
      await refuse(ctx, this.name, { station: this.station, refusedSummary: `did not post "${article.title}"` }, "blocked", reason);
      return { ok: false, text: reason };
    }

    let channels: string[] = chosen;
    return act(
      ctx,
      this.name,
      input,
      {
        action: {},
        channels: chosen,
        station: this.station,
        summary: `published a post for "${article.title}"`,
        refusedSummary: `did not post "${article.title}"`,
        // The chosen channels while in flight; the ones actually posted to afterwards.
        get payload() { return { slug, channels }; },
      },
      async () => {
        let result = await createArticleSocialDraft(ctx.sb, article, "tess", { platforms: chosen });
        if (result.state === "exists") return { ok: false, text: "That article already has a social post." };
        if (result.state === "failed") return { ok: false, text: `The post was not created: ${result.message}` };
        if (result.state === "created") {
          // Auto-posting is off for the site, so the publisher left a draft.
          // The crew is allowed to post: schedule it for now and publish.
          const now = new Date().toISOString();
          await ctx.sb.from("social_posts").update({ status: "scheduled", scheduled_at: now }).eq("id", result.postId);
          await ctx.sb.from("social_post_platforms").update({ platform_status: "scheduled" }).eq("post_id", result.postId);
          const r = await publishDueSocialPosts(10, { postId: result.postId });
          result = { state: "posted", postId: result.postId, platforms: result.platforms, published: r.published, failed: r.failed, errors: r.errors };
        }
        channels = result.platforms;
        if (result.published === 0) return { ok: false, text: `Nothing was published. ${result.errors.join(" ")}`.trim() };
        return { ok: true, text: `Published to ${result.published} of ${result.platforms.length} channels (${result.platforms.join(", ")}).${result.failed ? ` Failed: ${result.errors.join(" ")}` : ""}` };
      }
    );
  },
};
