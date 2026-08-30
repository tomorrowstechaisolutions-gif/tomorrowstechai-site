import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { buildAdvisorContext } from "@/lib/dashboard/advisor-context";
import { rateLimit } from "@/lib/rate-limit";
import { AI_ACTION_KINDS, type AiActionKind } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * The AI Business Advisor.
 *
 * Three rules, and they are the whole design:
 *
 *  1. The model reads the business from a snapshot this route builds on the
 *     server. Nothing about the business comes from the request body — a
 *     caller can pick the question, never the facts.
 *
 *  2. The model cannot do anything. If it wants something done it writes a
 *     row into ai_actions with status 'proposed'. Sending an email, publishing
 *     a post, changing a campaign or spending money all wait for a named human
 *     to approve, and the database refuses an approved row with no reviewer.
 *
 *  3. It answers from the snapshot or it says it cannot. The snapshot states
 *     plainly which figures do not exist yet, and the prompt below forbids
 *     filling those gaps in.
 */

const MODEL = "claude-sonnet-4-5-20250929";

const SYSTEM = `You are the business advisor inside the Tomorrow's Tech AI admin. You are talking to John, who owns and runs the company.

Tomorrow's Tech AI builds websites, web and mobile apps, AI solutions, business automation, CRMs, dashboards, business operating systems, ecommerce, customer and employee portals, logos and branding, hosting and site management, social media management, marketing, ad creative, SEO, analytics, custom software, technology consulting, hardware solutions, and industry-specific SaaS. It is a small operation, so your advice has to be something one person can act on this week.

HOW TO ANSWER
- Lead with the answer. He is busy and reads the first sentence.
- Be specific and quantitative, and cite the numbers you used from the snapshot.
- Keep it short: three to six sentences, or a short list. No preamble, no restating the question.
- Plain, direct, operator-to-operator. No hype, no emoji, no exclamation marks.
- Give one clear recommendation rather than three balanced options, and say what it costs or risks.

WHAT YOU MAY NOT DO
- Never invent a number. The snapshot marks what is not measured; if answering needs a figure that is not there, say which one is missing and what would have to be connected to get it.
- Never quote website visitor or page-view counts unless the snapshot says server-side analytics is connected.
- Never quote social follower, reach or engagement figures for a platform the snapshot does not list as connected.
- Do not use lead names, emails or phone numbers. Refer to a lead by its business.
- Small samples are not trends. If a conclusion rests on fewer than five data points, say so.
- Do not claim to have done anything. You cannot send, publish, change or spend. You can only propose.

PROPOSING ACTIONS
If a concrete action would clearly help, propose it. Each proposal is reviewed and approved by John before anything happens — say so implicitly by proposing rather than promising.
Valid kinds: ${AI_ACTION_KINDS.join(", ")}.
Risk is "high" for anything that spends money, contacts a customer, publishes publicly or deletes; "medium" for changing records; "low" for creating an internal task.
Propose at most three, and only when they follow from the snapshot. Most questions need none.

Return ONLY valid JSON, no prose outside it, no markdown fence:
{"answer":"...","actions":[{"kind":"...","title":"short imperative","summary":"one or two sentences on exactly what would be done","risk":"low|medium|high","rationale":"the number from the snapshot that justifies it"}]}
If you have no actions to propose, return an empty array.`;

type Proposal = {
  kind: string;
  title: string;
  summary?: string;
  risk?: string;
  rationale?: string;
};

export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // Per-admin, not per-IP: this spends API credit and the caller is known.
  const limit = rateLimit(`advisor:${session.user.id}`, {
    max: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: `That's a lot of questions. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` },
      { status: 429 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set on this deployment, so the advisor is switched off. Everything else on the dashboard still works.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const question =
    body && typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";

  if (!question) {
    return NextResponse.json({ error: "Ask it something." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  try {
    // Built here, from the database, under this admin's own RLS.
    const context = await buildAdvisorContext(supabase);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<business_snapshot>\n${context.snapshot}\n</business_snapshot>\n\nQuestion: ${question}\n\nAnswer from the snapshot only. Return the JSON object and nothing else.`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed: { answer?: unknown; actions?: unknown };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // The model wrote prose instead of JSON. That is still a usable answer —
      // show it rather than losing the whole request to a formatting slip.
      return NextResponse.json({ answer: cleaned, actions: [], model: MODEL });
    }

    const answer = typeof parsed.answer === "string" ? parsed.answer : cleaned;
    const raw = Array.isArray(parsed.actions) ? (parsed.actions as Proposal[]) : [];

    const proposals = raw
      .filter((a) => a && typeof a.title === "string" && typeof a.kind === "string")
      .slice(0, 3)
      .map((a) => ({
        kind: (AI_ACTION_KINDS as readonly string[]).includes(a.kind)
          ? (a.kind as AiActionKind)
          : ("other" as AiActionKind),
        title: a.title.slice(0, 200),
        summary: typeof a.summary === "string" ? a.summary.slice(0, 1000) : null,
        risk: ["low", "medium", "high"].includes(a.risk ?? "") ? a.risk! : "medium",
        rationale: typeof a.rationale === "string" ? a.rationale.slice(0, 1000) : null,
      }));

    if (proposals.length > 0) {
      // status defaults to 'proposed'. Nothing downstream reads this queue and
      // acts on it; the admin does.
      const { error } = await supabase.from("ai_actions").insert(
        proposals.map((p) => ({
          kind: p.kind,
          title: p.title,
          summary: p.summary,
          risk: p.risk,
          rationale: p.rationale,
          proposed_by: "ai",
          model: MODEL,
          payload: { question },
        }))
      );
      if (error) console.error("advisor: could not queue proposals:", error.message);
    }

    return NextResponse.json({
      answer,
      actions: proposals,
      model: MODEL,
      asOf: context.asOf,
    });
  } catch (err) {
    console.error("Advisor failed:", err);
    return NextResponse.json(
      { error: "The advisor is unavailable right now." },
      { status: 502 }
    );
  }
}
