import { NextResponse } from "next/server";
import { anthropic, CLAUDE_FAST, effort } from "@/lib/ai/claude";
import { recordAiUsageAsync } from "@/lib/ai/record";
import { brainPrompt, FALLBACK_SAY, readDecision, WORDS_LIMIT, type Decision } from "@/lib/guide/brain";
import { loadGuideOffers } from "@/lib/guide/offers";
import { guideStep } from "@/lib/guide/script";
import { clientIp, dailyBudget, envCap, rateLimitDurable } from "@/lib/rate-limit";

/**
 * A visitor typed something in the guide instead of tapping an answer. A
 * small model decides which of the script's own moves fits (see
 * lib/guide/brain). This is the only part of the guide that costs anything
 * per use, so it is capped twice: per visitor, and per day for the whole site.
 * When either cap is hit, or the model fails, she asks them to tap an option.
 */

const SOLUTION_SLUG = "website-chat";
const PER_VISITOR = 15;
const DEFAULT_DAILY_CAP = 300;

const fallback = (why: string): NextResponse => NextResponse.json({ decision: { kind: "say", text: FALLBACK_SAY } satisfies Decision, limited: why });

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { step?: unknown; words?: unknown } | null;
    const step = guideStep(typeof body?.step === "string" ? body.step.slice(0, 60) : "");
    const words = typeof body?.words === "string" ? body.words.trim().slice(0, WORDS_LIMIT) : "";
    if (!step || step.kind === "line" || words.length < 2) return NextResponse.json({ error: "Nothing to answer." }, { status: 400 });

    const visitor = await rateLimitDurable(`guide-ask:${clientIp(request)}`, { max: PER_VISITOR, windowMs: 60 * 60 * 1000 });
    if (!visitor.ok) return fallback("visitor");
    if (!process.env.ANTHROPIC_API_KEY) return fallback("not-configured");
    const budget = await dailyBudget("guide", envCap("GUIDE_DAILY_CAP", DEFAULT_DAILY_CAP));
    if (!budget.ok) return fallback("daily");

    const startedAt = Date.now();
    try {
      const response = await anthropic().messages.create({
        model: CLAUDE_FAST,
        // Room for the model's own thinking plus one short JSON line.
        max_tokens: 1024,
        ...effort("low"),
        system: brainPrompt(step, await loadGuideOffers()),
        messages: [{ role: "user", content: words }],
      });
      const block = response.content.find((b) => b.type === "text");
      const decision = readDecision(block && block.type === "text" ? block.text : "", step);
      recordAiUsageAsync({
        slug: SOLUTION_SLUG,
        model: response.model ?? CLAUDE_FAST,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        latencyMs: Date.now() - startedAt,
        status: "success",
        source: "client",
        requestRef: response.id ?? null,
        metadata: { surface: "site-guide", step: step.id, decision: decision.kind, stop_reason: response.stop_reason ?? null },
      });
      return NextResponse.json({ decision });
    } catch (providerError) {
      recordAiUsageAsync({
        slug: SOLUTION_SLUG,
        model: CLAUDE_FAST,
        status: "error",
        source: "client",
        latencyMs: Date.now() - startedAt,
        error: providerError instanceof Error ? providerError.message : "Provider call failed.",
        metadata: { surface: "site-guide", step: step.id },
      });
      return fallback("error");
    }
  } catch (err) {
    console.error("[guide] ask failed:", err instanceof Error ? err.message : err);
    return fallback("error");
  }
}
