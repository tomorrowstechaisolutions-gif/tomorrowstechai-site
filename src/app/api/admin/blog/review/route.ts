import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { recordAiUsageAsync } from "@/lib/ai/record";
import { normalize, SEO_TITLE_MAX, type EditableArticle } from "@/lib/blog/editor-model";
import { parseReview, type BlogReview } from "@/lib/blog/review";

/**
 * "Review with AI" in the Blog editor: an editorial second read before
 * publishing. It only suggests (claims that need a source, whether the summary
 * is clear, search titles); it never edits the article. The strict checks
 * (validate.ts) still decide what can be published.
 */

export const maxDuration = 120;

const MODEL = process.env.BLOG_REVIEW_MODEL || "claude-opus-5-5";
const MAX_BODY_CHARS = 120_000;

const SYSTEM = `You are the second editor for Field Notes, the blog of Tomorrow's Tech AI, an operations and AI consultancy run by a former construction and telecom program manager. Readers are owners and operators of construction, field-service and other operational businesses. The house standard: every factual claim a reader could check (numbers, dates, quotes, company actions, product capabilities, legal or financial facts) carries a citation to a listed source, written in the body as [^source-id].

Review the article you are given and report only what the author should look at. You suggest; the author decides. Do not rewrite the article.

Reply with one JSON object and nothing else, in exactly this shape:
{
  "claims": [{ "quote": "exact words copied from the body, at most 25 words", "why": "one sentence on why it needs a source or a softer wording" }],
  "summary": { "verdict": "clear" | "unclear" | "missing", "note": "one sentence", "suggestion": "a better summary of at most 240 characters, or null when the current one is clear" },
  "seoTitles": ["two or three search titles, each at most ${SEO_TITLE_MAX} characters, plain and specific, no clickbait"],
  "other": ["at most four short, specific notes: a confusing paragraph, a claim that contradicts a source, a missing definition. Empty array if none."]
}

Rules for "claims": list only checkable factual statements that have no [^...] citation in the same sentence. Skip the author's opinions, advice, and first-person experience; those don't need sources. Copy the quote exactly so the author can find it. At most 12; the most important first. Empty array if everything checkable is cited.
Write the notes plainly, like a sharp colleague, not a marketing tool.`;


export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Your admin session expired. Sign in again." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on this deployment." }, { status: 503 });
  }

  const input = (await req.json().catch(() => null)) as { article?: EditableArticle } | null;
  if (!input?.article || typeof input.article.body !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const a = normalize(input.article);
  if (a.body.trim().length < 200) {
    return NextResponse.json({ error: "Write a bit more first; the review needs at least a few paragraphs." }, { status: 400 });
  }
  if (a.body.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "This article is too long to review in one pass." }, { status: 400 });
  }

  const sources = (a.sources ?? []).map((s) => `- [^${s.id}] ${s.title} (${s.publisher}${s.url ? `, ${s.url}` : ""})`).join("\n") || "(no sources listed)";
  const user = `Title: ${a.title || "(none)"}
Summary: ${a.summary || "(none)"}
Section: ${a.category}

Sources listed:
${sources}

Body (Markdown):
${a.body}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const startedAt = Date.now();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    recordAiUsageAsync({
      slug: "content-generator",
      model: MODEL,
      status: "error",
      eventType: "run",
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "Provider call failed.",
      metadata: { surface: "blog-review" },
    });
    const status = err instanceof Anthropic.RateLimitError ? 429 : 502;
    return NextResponse.json(
      { error: status === 429 ? "The AI service is busy. Try again in a minute." : "The review is unavailable right now. Try again shortly." },
      { status }
    );
  }

  recordAiUsageAsync({
    slug: "content-generator",
    model: response.model ?? MODEL,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    latencyMs: Date.now() - startedAt,
    status: "success",
    eventType: "run",
    requestRef: response.id ?? null,
    metadata: { surface: "blog-review", stop_reason: response.stop_reason ?? null },
  });

  // The SDK pinned here predates the "refusal" stop reason in its types.
  if ((response.stop_reason as string) === "refusal") {
    return NextResponse.json({ error: "The model declined to review this article." }, { status: 422 });
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const review: BlogReview = { ...parseReview(text), model: response.model ?? MODEL };
    return NextResponse.json({ review });
  } catch {
    console.error("[blog-review] unparseable model output");
    return NextResponse.json({ error: "The review came back unreadable. Try again." }, { status: 502 });
  }
}
