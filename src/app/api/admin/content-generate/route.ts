import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { brandSystemPrompt, getBrand } from "@/lib/content/brand";
import { FORMAT_BY_KEY, FORMATS } from "@/lib/content/formats";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Turns a brief into platform-specific drafts.
 *
 * Three things make this different from a chat box:
 *
 *  1. It writes in ONE brand's voice, loaded from brand_profiles before the
 *     model is called. The model never chooses the brand and never sees
 *     another brand's guidance.
 *  2. It returns STRUCTURED output — one row per format, with the fields
 *     that format actually needs — and every row is written to content_items
 *     as a DRAFT. Nothing lands anywhere it could be published from.
 *  3. It spends API credit, so it is gated on the admin_users check, not
 *     merely on being signed in.
 *
 * Nothing here publishes, schedules or sends. The most it can do is create a
 * draft with status 'draft'; going further is a human pressing approve.
 */

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_FORMATS = 6;

export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on this deployment." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 2000) : "";
  if (!brief) {
    return NextResponse.json({ error: "Say what the content should be about." }, { status: 400 });
  }

  const requested: string[] = Array.isArray(body.formats)
    ? body.formats.filter((f: unknown): f is string => typeof f === "string")
    : [];
  const formats = (requested.length > 0 ? requested : ["facebook_post", "linkedin_post", "instagram_caption"])
    .map((k) => FORMAT_BY_KEY[k])
    .filter(Boolean)
    .slice(0, MAX_FORMATS);

  if (formats.length === 0) {
    return NextResponse.json({ error: "Pick at least one format." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const brand = await getBrand(supabase, typeof body.brandId === "string" ? body.brandId : null);
  if (!brand) {
    return NextResponse.json(
      { error: "No brand profile is set up. Add one before generating content." },
      { status: 400 }
    );
  }

  const goal = typeof body.goal === "string" ? body.goal.slice(0, 40) : "";
  const audience = typeof body.audience === "string" ? body.audience.slice(0, 200) : "";
  const tone = typeof body.tone === "string" ? body.tone.slice(0, 60) : "";
  const campaign = typeof body.campaign === "string" ? body.campaign.slice(0, 120) : "";
  const service = typeof body.service === "string" ? body.service.slice(0, 120) : "";

  const formatSpec = formats
    .map(
      (f) =>
        `- key "${f.key}" (${f.label}): ${f.guidance}${
          f.hashtags ? " Include 3-6 relevant hashtags, lowercase, no spaces." : " No hashtags."
        }`
    )
    .join("\n");

  const system = `${brandSystemPrompt(brand)}

You are producing content drafts for review. A person reads everything you write before any of it is published, so write finished copy rather than options with brackets in them.

FORMATS YOU MUST PRODUCE, one object each, in this order:
${formatSpec}

Return ONLY valid JSON, no prose, no markdown fence:
{"drafts":[{"format":"<the key above>","title":"short internal name, 3-7 words","body":"the finished copy","hashtags":["tag"],"cta":"the call to action in a few words, or empty string"}]}`;

  const user = [
    `Brief: ${brief}`,
    goal ? `Goal: ${goal.replace(/_/g, " ")}` : "",
    audience ? `Audience: ${audience}` : "",
    tone ? `Tone: ${tone}` : "",
    service ? `Service being promoted: ${service}` : "",
    campaign ? `Campaign: ${campaign}` : "",
    "",
    `Write one draft per format listed. Each must be written for its own platform, not the same text reworded. Return the JSON object and nothing else.`,
  ]
    .filter(Boolean)
    .join("\n");

  let drafts: { format: string; title: string; body: string; hashtags?: string[]; cta?: string }[];

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    const parsed = JSON.parse(cleaned) as { drafts?: unknown };
    if (!Array.isArray(parsed.drafts) || parsed.drafts.length === 0) {
      return NextResponse.json(
        { error: "Nothing came back. Try a more specific brief." },
        { status: 502 }
      );
    }
    drafts = parsed.drafts as typeof drafts;
  } catch (err) {
    // Distinguish "the model wrote prose" from "the API is down" — they need
    // different things from the person reading the message.
    if (err instanceof SyntaxError) {
      console.error("[content-generate] unparseable model output");
      return NextResponse.json(
        { error: "The generator returned something unreadable. Try the brief again." },
        { status: 502 }
      );
    }
    console.error("[content-generate]", err);
    return NextResponse.json({ error: "The generator is unavailable right now." }, { status: 502 });
  }

  // ── Write them down as drafts ──────────────────────────────────────
  const rows = drafts
    .map((d) => {
      const spec = FORMAT_BY_KEY[d.format] ?? formats[0];
      const bodyText = typeof d.body === "string" ? d.body.trim() : "";
      if (!bodyText) return null;
      return {
        brand_profile_id: brand.id,
        title: (typeof d.title === "string" && d.title.trim()) || `${spec.label} draft`,
        body: bodyText,
        content_type: spec.contentType,
        platform: spec.platform,
        status: "draft" as const,
        goal: goal || null,
        audience: audience || null,
        tone: tone || null,
        campaign: campaign || null,
        service: service || null,
        hashtags: Array.isArray(d.hashtags)
          ? d.hashtags.filter((h): h is string => typeof h === "string").slice(0, 10)
          : [],
        cta: typeof d.cta === "string" && d.cta.trim() ? d.cta.trim().slice(0, 200) : null,
        ai_generated: true,
        ai_model: MODEL,
        ai_prompt: brief,
        owner: session.admin.email,
        source_content_id:
          typeof body.sourceContentId === "string" && body.sourceContentId ? body.sourceContentId : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return NextResponse.json({ error: "The drafts came back empty." }, { status: 502 });
  }

  const { data, error } = await supabase.from("content_items").insert(rows).select("id, title, platform, content_type, body");

  if (error) {
    console.error("[content-generate] save failed:", error.message);
    return NextResponse.json(
      { error: "The drafts were written but could not be saved." },
      { status: 500 }
    );
  }

  return NextResponse.json({ drafts: data, model: MODEL, brand: brand.name });
}

/** The formats a client can ask for, so the UI never invents a key. */
export async function GET() {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  return NextResponse.json({
    formats: FORMATS.map((f) => ({ key: f.key, label: f.label })),
  });
}
