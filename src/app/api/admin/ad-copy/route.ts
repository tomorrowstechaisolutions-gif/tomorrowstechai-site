import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAdminUser } from "@/lib/supabase/server";
import { AD_LIMITS, CTA_LABELS } from "@/lib/campaign/ads";
import {
  CAMPAIGN_NAME,
  HOSTING_FROM,
  INCLUDED,
  NOT_INCLUDED,
  OFFER_PRICE,
} from "@/lib/campaign/config";

export const runtime = "nodejs";

/**
 * Turns a one-line brief into ad copy variants.
 *
 * Admin only — this spends API credit, so it is gated on the same
 * admin_users check as everything else in /admin, not merely on being
 * signed in.
 *
 * The model is given the real offer from config.ts rather than being left to
 * invent it, so it cannot quote a price we don't charge or promise something
 * the $399 package doesn't include.
 */

const SYSTEM = `You write Facebook and Instagram ad copy for Tomorrow's Tech AI, a Central Texas company that builds websites and business systems for small trade businesses — contractors, roofers, HVAC, plumbers, pool service, landscapers, automotive.

THE OFFER YOU ARE SELLING — do not change these numbers or invent others:
- $${OFFER_PRICE} one-time for the Business Launch package.
- Hosting and management from $${HOSTING_FROM}/month after launch. This must be disclosed in the primary text. Never hide it.
- Live in 7 to 14 days once we have the customer's content.
- The customer owns the site.

WHAT IS INCLUDED: ${INCLUDED.map((i) => i.title).join("; ")}.

WHAT IS NOT INCLUDED — never imply any of these come with $${OFFER_PRICE}: ${NOT_INCLUDED.join("; ")}.

VOICE:
Plain, direct, operator-to-operator. Short sentences. You are talking to someone who answers their own phone and is on a roof or under a sink for most of the day. No hype, no "unlock", no "revolutionise", no emoji, no exclamation marks, no fake urgency, no invented scarcity. Never claim specific earnings or results. Never use testimonials or numbers we haven't given you.

HARD FORMAT RULES:
- primary_text: the first ${AD_LIMITS.primary_text.truncatesAt} characters must carry the hook on their own, because everything after that is hidden behind "See more" on a phone. Aim for 400-700 characters total.
- headline: ${AD_LIMITS.headline.truncatesAt} characters or fewer. This is a hard constraint. Count them.
- description: ${AD_LIMITS.description.truncatesAt} characters or fewer.
- cta_label: exactly one of: ${CTA_LABELS.join(", ")}.

Return ONLY valid JSON, no prose, no markdown fence:
{"variants":[{"name":"short kebab-case ad name, 3-5 words","angle":"one line on what this version leads with","primary_text":"...","headline":"...","description":"...","cta_label":"...","image_direction":"one or two sentences describing the image this copy needs"}]}`;

export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

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

  const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 1500) : "";
  if (!brief) {
    return NextResponse.json(
      { error: "Tell it what the ad should say or who it's for." },
      { status: 400 }
    );
  }

  const count = Math.min(4, Math.max(1, Number(body.count) || 3));
  const audience = typeof body.audience === "string" ? body.audience.slice(0, 300) : "";
  const campaign = typeof body.campaign === "string" ? body.campaign.slice(0, 120) : CAMPAIGN_NAME;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2400,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Campaign: ${campaign}
${audience ? `Audience: ${audience}` : ""}

Brief: ${brief}

Write ${count} distinct variants. Each one should lead with a genuinely different angle — not the same ad reworded. Return the JSON object and nothing else.`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // The model is told not to fence its output, but strip one if it appears.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed: { variants?: unknown };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Ad copy: unparseable model output");
      return NextResponse.json(
        { error: "The generator returned something unreadable. Try the brief again." },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
      return NextResponse.json(
        { error: "No variants came back. Try a more specific brief." },
        { status: 502 }
      );
    }

    return NextResponse.json({ variants: parsed.variants.slice(0, 4) });
  } catch (err) {
    console.error("Ad copy generation failed:", err);
    return NextResponse.json(
      { error: "The generator is unavailable right now." },
      { status: 502 }
    );
  }
}
